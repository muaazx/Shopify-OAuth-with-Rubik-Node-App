import axios from "axios";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const RUBIKCHAT_BASE_URL = "https://api-proxy-v1.rubikchat.com/api";

interface AutoMcpOptions {
  organizationSlug: string;
  authToken: string;
  storeUrl: string; // e.g. "rubikchat-test-store.myshopify.com"
}

export async function setupShopifyMcpForAgent({
  organizationSlug,
  authToken,
  storeUrl,
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
        "CRITICAL ACTION: Call this tool when a user asks about available products, pricing, or catalog items. This endpoint returns an array of items containing 'title', 'price', and 'image_url'.\nSTRICT RESPONSE FORMATTING MANDATE:\nFor EVERY SINGLE PRODUCT returned, you MUST render all three components together in this exact Markdown structure:\n\n1. [product title]\nPrice: [price]\nMANDATORY RULES:\n\nTitle Required: Never omit the product title. It must appear as a bold heading above the image.\nImage Required: You MUST embed the image using Markdown syntax (![title](image_url)). Do not output raw image URLs as plain text or skip them.\nPrice Required: Always include the price directly below the image.\nNo Standalone Prices: Never list prices alone without their associated Title and Image.",
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
        "CRITICAL ACTION: Used to generate a multi-item checkout permalink. You MUST pass ALL accumulated cart items in the items array.",
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
  // STEP 3: Execute Step 2 API sequentially for all 3 actions
  // -------------------------------------------------------------
  for (const actionPayload of actionsPayloads) {
    await axios.post(
      `${RUBIKCHAT_BASE_URL}/save-mcp-api-configs`,
      actionPayload,
      { headers }
    );
  }

  return { success: true, mcpCollectionId: mcpApiId };
}
