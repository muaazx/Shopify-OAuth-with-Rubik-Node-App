import axios from "axios";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const RUBIKCHAT_BASE_URL = "https://api-proxy-v1.rubikchat.com/api";

interface AutoMcpOptions {
  organizationSlug: string;
  authToken: string;
  storeUrl: string; // e.g. "rubikchat-test-store.myshopify.com"
  agentId?: string;
}

export async function setupShopifyMcpForAgent({
  organizationSlug,
  authToken,
  storeUrl,
  agentId,
}: AutoMcpOptions) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
  };

  let mcpApiId: string | null = null;

  // Check if mcp_api_id is already saved in database for this store
  try {
    const existingOrg = await prisma.rubikchat_organizations.findUnique({
      where: { store_url: storeUrl },
      select: { mcp_api_id: true },
    });
    if (existingOrg?.mcp_api_id) {
      mcpApiId = existingOrg.mcp_api_id;
      console.log(`ℹ️ [MCP AUTO-SETUP] Reusing existing mcp_api_id (${mcpApiId}) from database for store: ${storeUrl}`);
    }
  } catch (err: any) {
    console.warn(`⚠️ [MCP AUTO-SETUP] Failed to query mcp_api_id from database:`, err.message);
  }

  // -------------------------------------------------------------
  // STEP 1: Create the outer MCP API Collection (if not already existing)
  // -------------------------------------------------------------
  if (!mcpApiId) {
    const collectionResponse = await axios.post(
      `${RUBIKCHAT_BASE_URL}/organizations/${organizationSlug}/mcp-apis`,
      {
        name: "shopify_actions",
        description: "Automated Shopify Store Integration Actions",
        is_active: true,
        actions: [],
      },
      { headers }
    );

    // 🔍 SAFELY EXTRACT ID (Handles both 'api' object and 'apis' array responses)
    const mcpData = collectionResponse.data;
    mcpApiId = String(
      mcpData?.api?.id || mcpData?.apis?.[0]?.id || mcpData?.id
    );

    if (!mcpApiId || mcpApiId === "undefined") {
      throw new Error(`Failed to extract Collection ID. Response: ${JSON.stringify(mcpData)}`);
    }

    console.log(`✅ [MCP AUTO-SETUP] Collection created with ID: ${mcpApiId}`);

    // 💾 SAVE `mcp_api_id` TO DATABASE
    try {
      await prisma.rubikchat_organizations.update({
        where: { store_url: storeUrl },
        data: { mcp_api_id: mcpApiId },
      });
      console.log(`✅ [MCP AUTO-SETUP] Stored mcp_api_id (${mcpApiId}) in database for store: ${storeUrl}`);
    } catch (dbError: any) {
      console.warn("⚠️ Failed to store mcp_api_id in database:", dbError.message);
    }
  }

  // -------------------------------------------------------------
  // STEP 2: Build payloads for all 3 Actions
  // -------------------------------------------------------------
  const actionsPayloads = [
    // 1. Get Shopify Products
    {
      id: null,
      organization_mcp_api: mcpApiId,
      name: "Get Shopify Products",
      description:
        "CRITICAL ACTION: Call this tool when a user asks about available products, catalog items, pricing, or product variants/options (e.g., sizes, colors, denominations).\n" +
        "MANDATORY VARIANT RENDERING RULES:\n" +
        "1. Check `variants` Array: For every product returned, you MUST inspect the `variants` array inside the response payload.\n" +
        "2. List All Variants: If a product has multiple variants (e.g., Gift Card denominations like $10, $25, $50, $100 or T-Shirt Sizes/Colors), you MUST list EVERY single variant option along with its price in your response.\n" +
        "3. Never Output Only First Variant: Do NOT default to showing only the first item in the variants array if multiple variants exist.\n\n\n" +
        "RESPONSE FORMAT:\n" +
        "### **[Product Title]**\n\n\n" +
        "Available Variants / Options:\n" +
        "* [Variant Title 1] - [Price 1]\n" +
        "* [Variant Title 2] - [Price 2]\n" +
        "* [Variant Title 3] - [Price 3]",
      method: "POST",
      endpoint:
        "https://shopify-oauth-with-rubik-node-app-production.up.railway.app/api/shopify/products",
      headers: [{ key: "Content-Type", value: "application/json" }],
      body_template: { shop: "{shop}" },
      inputs_schema: [
        {
          id: crypto.randomUUID(),
          name: "shop",
          type: "string",
          description: "The myshopify store domain to query items from the store",
          isRequired: true,
          isNullable: false,
          default: storeUrl,
        },
      ],
      json_schema: {
        type: "object",
        properties: {
          shop: {
            description: "The myshopify store domain to query items from the store",
            type: "string",
            default: storeUrl,
          },
        },
        required: ["shop"],
      },
      response: {
        type: "object",
        properties: {
          products: {
            type: "array",
            items: {
              type: "object",
              required: ["title", "price", "image_url", "variants"],
              properties: {
                title: { type: "string" },
                price: { type: "string" },
                image_url: { type: "string" },
                variants: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "e.g., $10, $25, $50, $100" },
                      price: { type: "string" },
                      variant_id: { type: "string" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      memory_variables: [],
      response_rules: [],
    },

    // 2. Get Order Status and Details
    {
      id: null,
      organization_mcp_api: mcpApiId,
      name: "Get Order Status and Details",
      description:
        "CRITICAL ACTION: Used to look up order tracking, status, fulfillment state, and line items using an order number or customer email.",
      method: "POST",
      endpoint:
        "https://shopify-oauth-with-rubik-node-app-production.up.railway.app/api/shopify/order-status",
      headers: [{ key: "Content-Type", value: "application/json" }],
      body_template: { shop: "{shop}", order_number: "{order_number}" },
      inputs_schema: [
        {
          id: crypto.randomUUID(),
          name: "shop",
          type: "string",
          description: "The myshopify store domain",
          isRequired: true,
          isNullable: false,
          default: storeUrl,
        },
        {
          id: crypto.randomUUID(),
          name: "order_number",
          type: "string",
          description:
            "The order ID or order number requested by the customer (e.g. #1001 or 1001)",
          isRequired: true,
          isNullable: false,
          default: "",
        },
      ],
      json_schema: {
        type: "object",
        properties: {
          shop: {
            description: "The myshopify store domain",
            type: "string",
            default: storeUrl,
          },
          order_number: {
            description: "The order ID or order number requested by the customer",
            type: "string",
          },
        },
        required: ["shop", "order_number"],
      },
      memory_variables: [],
      response_rules: [],
    },

    // 3. Create Shopify Cart and Checkout URL
    {
      id: null,
      organization_mcp_api: mcpApiId,
      name: "Create Shopify Cart and Checkout URL",
      description:
        "CRITICAL ACTION: Used to generate a multi-item checkout permalink. You MUST pass ALL accumulated cart items in the `items` array.\nSTRICT VARIANT ID MANDATE (DO NOT USE PRODUCT IDs):\n1. Variant ID vs Product ID Rule: Shopify cart links strictly require the numeric Variant ID (e.g., 53226628579695), NEVER the parent Product ID (e.g., 15026211094895). Passing a Product ID causes a \"Link no longer exists\" error.\n2. Multi-Variant Products Check: Before generating a cart link for any product with options (e.g., Gift Cards with $10, $25, $50, $100 or apparel with Size/Color), you MUST:\n* Ask the user which specific variant option they want if they haven't specified.\n* Ensure the backend resolves the exact variant_id corresponding to that specific selected option.\n\nERROR & AVAILABILITY MANDATES:\n3. Out of Stock / Unavailable Items: If a requested variant is out of stock or unavailable, state: \"Sorry, [Product Name - Variant] is currently unavailable for purchase.\"\n4. Missing Products: If an item cannot be found in the store catalog, state: \"Sorry, we couldn't find [Product Name] in our store.\"\n5. Permalink Format: Construct the final link strictly using validated Variant IDs: [Checkout Here](https://{shop}/cart/{variant_id}:{qty},...).",
      method: "POST",
      endpoint:
        "https://shopify-oauth-with-rubik-node-app-production.up.railway.app/api/shopify/cart",
      headers: [{ key: "Content-Type", value: "application/json" }],
      body_template: { shop: "{shop}", items: "{items}" },
      inputs_schema: [
        {
          id: crypto.randomUUID(),
          name: "shop",
          type: "string",
          description: "The myshopify store domain",
          isRequired: true,
          isNullable: false,
          default: storeUrl,
        },
        {
          id: crypto.randomUUID(),
          name: "items",
          type: "array",
          description:
            "Array of objects containing all items in the cart session. Format: [{'product_name': 'Title', 'quantity': 1}]",
          isRequired: true,
          isNullable: false,
          default: "",
        },
      ],
      json_schema: {
        type: "object",
        properties: {
          shop: {
            description: "The myshopify store domain",
            type: "string",
            default: storeUrl,
          },
          items: {
            type: "array",
            description: "Array of objects containing all items in the cart session.",
            items: {
              type: "object",
              properties: {
                product_name: {
                  type: "string",
                  description: "Exact title of the product",
                },
                quantity: {
                  type: "number",
                  description: "Quantity to add (default 1)",
                },
              },
              required: ["product_name"],
            },
          },
        },
        required: ["shop", "items"],
      },
      memory_variables: [],
      response_rules: [],
    },
  ];

  // -------------------------------------------------------------
  // STEP 3: Execute Step 2 API sequentially for all 3 actions & collect Action IDs
  // -------------------------------------------------------------
  const createdActionIds: number[] = [];

  for (const actionPayload of actionsPayloads) {
    try {
      const response = await axios.post(
        `${RUBIKCHAT_BASE_URL}/save-mcp-api-configs`,
        actionPayload,
        { headers }
      );

      const rawActionId = response.data?.id || response.data?.data?.id || response.data?.action?.id;
      if (rawActionId !== undefined && rawActionId !== null) {
        const numId = Number(rawActionId);
        createdActionIds.push(numId);
        console.log(`✅ [MCP AUTO-SETUP] Created action "${actionPayload.name}" with ID: ${numId}`);
      } else {
        console.warn(`⚠️ [MCP AUTO-SETUP] Action "${actionPayload.name}" created but no ID in response:`, response.data);
      }
    } catch (actionErr: any) {
      console.error(`❌ [MCP AUTO-SETUP] Failed to create action "${actionPayload.name}":`, actionErr?.response?.data || actionErr.message);
    }
  }

  // -------------------------------------------------------------
  // STEP 4: Import / Link all 3 Action IDs to the Agent Chatbot
  // -------------------------------------------------------------
  let targetAgentId = agentId;
  if (!targetAgentId) {
    try {
      const org = await prisma.rubikchat_organizations.findUnique({
        where: { store_url: storeUrl },
        include: { agents: { orderBy: { created_at: 'desc' }, take: 1 } },
      });
      if (org?.agents?.[0]?.agent_id) {
        targetAgentId = org.agents[0].agent_id;
      }
    } catch (err: any) {
      console.warn("⚠️ [MCP AUTO-SETUP] Failed to query agent_id from database:", err.message);
    }
  }

  let importedResult = null;
  if (targetAgentId && createdActionIds.length > 0) {
    console.log(`🔗 [MCP AUTO-SETUP] Linking Action IDs [${createdActionIds.join(', ')}] to Agent ID (${targetAgentId})...`);
    try {
      const importResponse = await axios.post(
        `${RUBIKCHAT_BASE_URL}/chatbots/import-mcp-apis`,
        {
          chatbot_id: targetAgentId,
          mcp_api_ids: createdActionIds,
        },
        { headers }
      );
      importedResult = importResponse.data;
      console.log(`✅ [MCP AUTO-SETUP] Successfully imported actions to agent! Response:`, JSON.stringify(importResponse.data));

      try {
        await prisma.api_logs.create({
          data: {
            endpoint: '/chatbots/import-mcp-apis',
            method: 'POST',
            status: importResponse.status,
            request: JSON.stringify({ chatbot_id: targetAgentId, mcp_api_ids: createdActionIds }),
            response: JSON.stringify(importResponse.data),
          },
        });
      } catch (logErr) { /* ignore logging errors */ }
    } catch (importErr: any) {
      console.error(`❌ [MCP AUTO-SETUP] Failed to import actions to chatbot (${targetAgentId}):`, importErr?.response?.data || importErr.message);
    }
  } else {
    console.warn(`⚠️ [MCP AUTO-SETUP] Skipped action import: targetAgentId=${targetAgentId}, actionIdsCount=${createdActionIds.length}`);
  }

  return {
    success: true,
    mcpCollectionId: mcpApiId,
    actionIds: createdActionIds,
    importedResult,
  };
}
