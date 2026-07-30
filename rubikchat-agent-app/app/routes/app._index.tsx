import { useState, useEffect } from "react";
import { useLoaderData, useRevalidator, useFetcher } from "react-router";
import crypto from "crypto";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const shopifyIntegration = await prisma.shopify_integrations.findUnique({
      where: { store_url: shop },
    });

    const rubikchatIntegration = await prisma.rubikchat_organizations.findUnique({
      where: { store_url: shop },
    });

    const isShopifyConnected = shopifyIntegration?.access_token && shopifyIntegration.access_token !== "pending";

    return {
      shop,
      initialShop: shop,
      shopifyConnected: Boolean(isShopifyConnected),
      rubikchatConnected: Boolean(rubikchatIntegration),
      shopDetails: {
        store_name: shopifyIntegration?.store_name || null,
      }
    };
  } catch (error) {
    console.error("Direct status check failed:", error);
    return { 
      shop, 
      initialShop: "",
      shopifyConnected: false, 
      rubikchatConnected: false,
      shopDetails: null as { store_name: string | null } | null,
    };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const stateToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

  await prisma.shopify_integrations.upsert({
    where: { store_url: shop },
    update: {
      state_token: stateToken,
      token_expires_at: expiresAt,
    },
    create: {
      store_url: shop,
      access_token: "pending",
      status: "pending",
      state_token: stateToken,
      token_expires_at: expiresAt,
    },
  });

  const redirectUrl = `https://shopify-o-auth-with-rubik-node-app.vercel.app/onboarding?shop=${encodeURIComponent(shop)}&state_token=${stateToken}`;
  return { redirectUrl };
};

export default function Index() {
  const { shop, initialShop, shopifyConnected, rubikchatConnected, shopDetails } = useLoaderData<typeof loader>();
  
  const isFullyConnected = shopifyConnected && rubikchatConnected;
  const revalidator = useRevalidator();
  const fetcher = useFetcher<typeof action>();

  const [isDisconnecting, setIsDisconnecting] = useState(false);

  useEffect(() => {
    if (fetcher.data?.redirectUrl) {
      window.open(fetcher.data.redirectUrl, "_blank");
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (isFullyConnected) return;

    const checkStatus = () => {
      if (revalidator.state === "idle") {
        revalidator.revalidate();
      }
    };

    // 1. Listen for BroadcastChannel message from OAuth window/tab
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("rubikchat_oauth_channel");
      channel.onmessage = (event) => {
        if (event.data?.type === "RUBIKCHAT_CONNECTED") {
          checkStatus();
        }
      };
    } catch (e) {
      console.error("BroadcastChannel error:", e);
    }

    // 2. Listen for postMessage from popups
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "RUBIKCHAT_CONNECTED") {
        checkStatus();
      }
    };
    window.addEventListener("message", handleMessage);

    // 3. Fallback: Active Polling using remix revalidator every 3 seconds
    const interval = setInterval(checkStatus, 3000);

    // 4. Listen for focus / visibilitychange
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkStatus();
      }
    };

    const handleFocus = () => {
      checkStatus();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      if (channel) {
        channel.close();
      }
      clearInterval(interval);
      window.removeEventListener("message", handleMessage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isFullyConnected, revalidator]);

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect RubikChat from this shop? This will delete all integration configuration.')) {
      return;
    }
    
    setIsDisconnecting(true);
    try {
      const res = await fetch(`https://shopify-oauth-with-rubik-node-app-production.up.railway.app/api/shopify/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop }),
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        window.location.reload();
      } else {
        alert(data.error || 'Failed to disconnect');
      }
    } catch (err) {
      alert('Network error while disconnecting');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleConnectClick = () => {
    fetcher.submit({}, { method: "post" });
  };

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <ui-title-bar title="RubikChat Integration"></ui-title-bar>
      
      <div style={{ backgroundColor: "#fff", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", padding: "2rem", border: "1px solid #e1e3e5" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "8px", color: "#202223" }}>
            Welcome to RubikChat
          </h1>
          <p style={{ color: "#6d7175", fontSize: "16px" }}>
            Autonomous AI Agents for Customer Support, Sales, and Marketing.
          </p>
        </div>

        {isFullyConnected ? (
          <div style={{ backgroundColor: "#e3f1df", border: "1px solid #aee9d1", borderRadius: "8px", padding: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div style={{ backgroundColor: "#00a47c", color: "white", borderRadius: "50%", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>
                ✓
              </div>
              <div>
                <h2 style={{ fontSize: "16px", fontWeight: "600", color: "#202223", margin: "0 0 4px 0" }}>
                  Successfully Connected
                </h2>
                <p style={{ margin: "0", color: "#6d7175" }}>
                  Your store <strong>{shopDetails?.store_name || shop}</strong> is securely connected to RubikChat.
                </p>
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              style={{
                backgroundColor: "transparent",
                color: "#d93838",
                border: "none",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
                padding: "8px 12px",
                borderRadius: "4px",
                transition: "all 0.2s",
                marginLeft: "auto",
                opacity: isDisconnecting ? 0.5 : 1,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f7dcdb'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "2rem", backgroundColor: "#f4f6f8", borderRadius: "8px", border: "1px dashed #c9cccf" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#202223", marginBottom: "12px" }}>
              Action Required: Connect to RubikChat
            </h2>
            <p style={{ color: "#6d7175", marginBottom: "24px", maxWidth: "400px", margin: "0 auto 24px" }}>
              To enable your AI agents, you need to connect your Shopify store to your RubikChat account.
            </p>
            <button 
              onClick={handleConnectClick}
              style={{ 
                backgroundColor: "#2c6ecb", 
                color: "white", 
                border: "none", 
                padding: "10px 20px", 
                borderRadius: "4px", 
                fontSize: "15px", 
                fontWeight: "600", 
                cursor: "pointer",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
              }}
            >
              Connect with RubikChat
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  const parentHeaders = boundary.headers(headersArgs);
  return {
    ...parentHeaders,
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  };
};
