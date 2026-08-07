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
        "CRITICAL ACTION: Call this tool whenever a user asks about available products, store catalog, pricing, or product variants/options (e.g., sizes, colors, gift card denominations).\n\n" +
        "MANDATORY VARIANT & DISPLAY RULES:\n\n" +
        "Inspect variants Array: For every product in the tool response, you MUST inspect the variants array.\n\n" +
        "Multi-Variant Products: If variants contains more than 1 item OR has custom option titles (e.g., \"$10\", \"$25\", \"Ice\", \"Dawn\", \"Small\", \"Red\"):\n" +
        "You MUST list EVERY single variant option along with its price in a bulleted list.\n" +
        "NEVER summarize, truncate, or display only the first variant.\n\n" +
        "Single-Variant Products: If the product has only 1 variant named \"Default Title\", simply display the base product price.\n\n" +
        "No Assumption Policy: Never say \"I don't have variant information\" if the variants array is present in the response data.\n\n" +
        "REQUIRED RESPONSE FORMAT:\n\n" +
        "[Product Title]\n" +
        "Price: [Base Price]\n" +
        "Available Options:\n" +
        "* [Variant Title 1] — [Price 1]\n" +
        "* [Variant Title 2] — [Price 2]\n" +
        "* [Variant Title 3] — [Price 3]",
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
        "CRITICAL ACTION: Call this tool to generate a Shopify cart checkout permalink.\n" +
        "VARIANT SELECTION MANDATES:\n" +
        "1. Pass Selected Variant: When adding products that have variants (e.g., Gift Cards with $10, $25, $50, $100), you MUST include the user's selected choice in `variant_title` (e.g. `\"$25\"`) OR `variant_id` (e.g. `\"53226628612463\"`).\n" +
        "2. Do NOT pass generic product names alone: Never call this tool with just `{\"product_name\": \"Gift Card\"}` if the user requested a specific denomination like $25 or $50.\n" +
        "3. Multiple Items: Combine all valid, selected items in the permalink URL structure: https://{shop}/cart/{variant_id_1}:{qty_1},{variant_id_2}:{qty_2}.",
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
            "Array of objects containing all items in the cart session. Format: [{'product_name': 'Title', 'variant_title': '$25', 'quantity': 1}]",
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
                variant_title: {
                  type: "string",
                  description: "The specific variant option title selected by the user (e.g., '$25', 'Medium', 'Red'). Required for multi-variant products.",
                },
                variant_id: {
                  type: "string",
                  description: "The numeric Shopify variant ID if already known (e.g., '53226628612463'). If provided, variant_title lookup is skipped.",
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
