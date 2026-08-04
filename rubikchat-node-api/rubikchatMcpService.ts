import axios from "axios";
import crypto from "crypto";

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

  // -------------------------------------------------------------
  // STEP 1: Create the outer MCP API Collection
  // -------------------------------------------------------------
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

  // Extract the created collection ID
  const mcpApiId = String(collectionResponse.data.apis[0].id);

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
        "CRITICAL ACTION: Used to fetch live product catalog, pricing, availability, and images directly from the Shopify store.",
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
