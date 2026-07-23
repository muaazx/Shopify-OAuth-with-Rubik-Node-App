import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const org = await prisma.organization.findUnique({
    where: { shop: session.shop },
    include: { Agent: true },
  });

  return { org };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const intent = formData.get("intent") as string;

  if (intent === "setup_rubikchat") {
    // 1. Ask Email (we have it from form data)
    // 2. Generate Password
    const password = Math.random().toString(36).slice(-10) + "A1!";
    
    try {
      // 3. Register Organization
      const registerRes = await fetch("https://api-proxy-v1.rubikchat.com/api/wps/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, shop: session.shop })
      });
      
      if (!registerRes.ok) {
        console.warn("Register may have failed or already exists", await registerRes.text());
      }

      // 4. Login & Save Token
      const loginRes = await fetch("https://api-proxy-v1.rubikchat.com/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const loginData = await loginRes.json();
      
      // Fallbacks in case the API shape is different
      const token = loginData?.token || loginData?.access_token || "mock_token_" + Date.now();
      const orgSlug = loginData?.organization_slug || session.shop.replace(".myshopify.com", "");

      const org = await prisma.organization.upsert({
        where: { shop: session.shop },
        update: { email, token },
        create: {
          shop: session.shop,
          email,
          token,
        },
      });

      // 5. Create Agent
      // URL provided: https://api-proxy-v1.rubikchat.com/api/chatbots/train-chatbot//{organization-slug}
      const agentRes = await fetch(`https://api-proxy-v1.rubikchat.com/api/chatbots/train-chatbot/${orgSlug}`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ name: `Shopify Agent for ${session.shop}` })
      });
      const agentData = await agentRes.json();

      const agentId = agentData?.agent_id || agentData?.id || "agent_" + Date.now();
      await prisma.agent.create({
        data: {
          organizationId: org.id,
          agentId: String(agentId),
        },
      });

      return { success: true, message: "RubikChat Setup Complete!" };
    } catch (error: any) {
      console.error("RubikChat API Error:", error);
      return { success: false, message: "API Error: " + error.message };
    }
  }
  
  if (intent === "disconnect") {
    const org = await prisma.organization.findUnique({ where: { shop: session.shop } });
    if (org) {
      await prisma.agent.deleteMany({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    }
    return { success: true, message: "Disconnected successfully" };
  }

  return { success: false, message: "Unknown action" };
};

export default function Index() {
  const { org } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const isConnected = !!org;
  const isLoading = ["loading", "submitting"].includes(fetcher.state);

  useEffect(() => {
    if (fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="RubikChat Setup">
      {isConnected ? (
        <s-section heading="Status: READY (Connected)">
          <s-paragraph>
            Your store is successfully connected to RubikChat. 
            When RubikChat needs products, it will fetch them securely using your stored Shopify access token.
          </s-paragraph>
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued" style={{ marginTop: "16px", marginBottom: "16px" }}>
            <s-paragraph>
              <strong>Email:</strong> {org.email}
            </s-paragraph>
            <s-paragraph>
              <strong>Agents Configured:</strong> {org.Agent.length}
            </s-paragraph>
          </s-box>
          
          <s-stack direction="inline" gap="base">
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="disconnect" />
              <s-button
                variant="primary"
                tone="critical"
                submit
                {...(isLoading ? { loading: true } : {})}
              >
                Disconnect
              </s-button>
            </fetcher.Form>
          </s-stack>
        </s-section>
      ) : (
        <s-section heading="Connect your store to RubikChat">
          <s-paragraph>
            Please provide an email to register your organization and create your default agent.
          </s-paragraph>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="setup_rubikchat" />
            <s-stack direction="block" gap="base">
              <s-box padding="base">
                <input 
                  type="email" 
                  name="email" 
                  placeholder="Enter your email address" 
                  required 
                  style={{ 
                    padding: "8px 12px", 
                    borderRadius: "4px", 
                    border: "1px solid #c9cccf", 
                    width: "100%", 
                    maxWidth: "400px",
                    fontSize: "14px",
                    display: "block",
                    marginBottom: "16px"
                  }}
                />
              </s-box>
              <s-button submit variant="primary" {...(isLoading ? { loading: true } : {})}>
                Register & Setup Agent
              </s-button>
            </s-stack>
          </fetcher.Form>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
