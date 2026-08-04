# 🛍️ RubikChat Shopify AI Agent Integration

An end-to-end integration platform bridging **Shopify Merchant Stores** and **RubikChat AI Agent Infrastructure**. This platform enables seamless 1-click Shopify store authentication (OAuth 2.0), automated AI Agent creation, floating widget embedding, and automated Model Context Protocol (MCP) tool provisioning for live product recommendations, order tracking, and multi-item cart permalink checkouts.

---

## 🌟 System Architecture Overview

```mermaid
graph TD
    A[Shopify Store Merchant] -->|1. OAuth Install| B[Express Node.js Backend]
    B -->|2. Exchange Access Token| C[Prisma DB / Supabase]
    B -->|3. Register & Login Account| D[RubikChat Platform API]
    B -->|4. Create AI Agent| D
    B -->|5. Auto-Provision 2-Step MCP Collection| D
    D -->|6. Save Action Configs| E[RubikChat MCP Actions]
    E -->|7. Live Query Products / Orders / Cart| B
    B -->|8. Cart Permalinks & Order Data| A
```

---

## 🚀 Key Features

### 1. 🔐 Seamless Shopify OAuth 2.0 Integration
- Handshakes with Shopify OAuth using requested scopes (`read_products`, `write_products`, `read_orders`, `read_script_tags`, `write_script_tags`).
- Encrypts and securely stores merchant access tokens in PostgreSQL via Prisma ORM (`shopify_integrations`).
- Automatic session validation (`/api/verify-oauth-session`) and connection status health checks (`/api/status`).

### 2. 🤖 Automated AI Agent Creation
- Integrates directly with RubikChat authentication APIs (`/api/rubikchat/register`, `/api/rubikchat/login`).
- Creates a store-tailored AI chatbot (`/api/rubikchat/create-agent`) pre-configured with dynamic store instructions, greeting messages, temperature, and theme settings.

### 3. 🛠️ Automated 2-Step MCP Setup Service (`rubikchatMcpService.ts`)
- **Step 1: Collection Creation**: Provision an outer `shopify_actions` MCP API Collection on RubikChat with resilient ID extraction fallback handling both `{ api: { id } }` and `{ apis: [{ id }] }` response shapes.
- **Idempotency & Database Persistence**: Stores the generated `mcp_api_id` in PostgreSQL (`rubikchat_organizations.mcp_api_id`) to allow instant reuse without duplicate collection generation.
- **Step 2: Automated Action Config Provisioning**: Automatically registers 3 core actions:

| Action Name | Method & Endpoint | Description & Capabilities |
| :--- | :--- | :--- |
| **Get Shopify Products** | `POST /api/shopify/products` | Queries live product catalog via GraphQL. Maps top-level `title`, `price`, `id`, `status`, and unique `imageUrl` (`node.featuredImage.url`). Includes strict formatting instructions for LLM image rendering (`![title](image_url)`). |
| **Get Order Status and Details** | `POST /api/shopify/order-status` | Accepts `order_number` or customer `email`. Fetches live fulfillment status, tracking companies, tracking numbers, tracking URLs, and item summaries. |
| **Create Shopify Cart and Checkout URL** | `POST /api/shopify/cart` | Accepts multi-item cart arrays (`items: [{ product_name, quantity }]`). Resolves titles to variant IDs in batch via GraphQL and generates a consolidated 1-click cart permalink (`https://{shop}/cart/{variant_1}:{qty_1},{variant_2}:{qty_2}`). |

### 4. 🎨 React Frontend & Merchant Onboarding Dashboard (`rubikchat-frontend`)
- **Connect Flow**: Step-by-step onboarding for Shopify OAuth authorization and RubikChat registration.
- **Functions Dashboard (`FunctionsPage.tsx`)**: Controls widget embedding and agent connection state.
- **Completion View (`AgentSuccessPage.tsx`)**: Displays an active feature checklist showing Product Catalog Search, Order Status Tracking, and Multi-Item Checkout permalinks along with the active **MCP Collection ID** badge.

---

## 📁 Repository Directory Structure

```text
├── rubikchat-node-api/             # Express.js & TypeScript Backend Service
│   ├── index.ts                    # Main API server, OAuth routes, MCP endpoints
│   ├── rubikchatMcpService.ts      # Automated 2-Step MCP setup service module
│   ├── package.json                # Dependencies, Prisma scripts & startup commands
│   ├── tsconfig.json               # TypeScript compiler config
│   └── prisma/
│       └── schema.prisma           # Database models & PostgreSQL schema definition
│
├── rubikchat-frontend/             # React & Vite Frontend Application
│   ├── src/
│   │   ├── App.tsx                 # Core router, Connect page, OAuth callback handlers
│   │   ├── FunctionsPage.tsx       # Merchant functions control dashboard
│   │   ├── AgentSuccessPage.tsx    # Completion page detailing active MCP capabilities
│   │   └── main.tsx                # React entry point
│   ├── package.json                # Frontend scripts and UI dependencies
│   └── vite.config.ts              # Vite bundle configuration
│
└── rubikchat-agent-app/            # Shopify App CLI configuration files (CLI / Remix)
    └── shopify.app.toml            # App configuration & OAuth scopes definition
```

---

## 🗄️ Database Schema (`prisma/schema.prisma`)

### Core Models:
- **`shopify_integrations`**: Stores merchant `store_url`, `access_token`, `scope`, `status`, `rubik_agent_id`, `rubik_user_id`, and `rubik_organization_id`.
- **`rubikchat_organizations`**: Stores RubikChat credentials (`email`, `password`, `token`, `store_url`, `mcp_api_id`).
- **`rubikchat_agents`**: Maps organization relationships to created AI agent IDs.
- **`api_logs`**: Logs request/response payloads for auditing and debugging API execution.

---

## 🛠️ Environment Variables Configuration

### Backend (`rubikchat-node-api/.env`)
```env
PORT=3001
DATABASE_URL="postgresql://user:password@host:5432/postgres?pgbouncer=true"
DIRECT_URL="postgresql://user:password@host:5432/postgres"

SHOPIFY_API_KEY="your_shopify_api_key"
SHOPIFY_API_SECRET="your_shopify_api_secret"
SHOPIFY_SCOPES="read_products,write_products,read_orders,read_script_tags,write_script_tags"
HOST="https://your-backend-domain.up.railway.app"
FRONTEND_URL="https://your-frontend-domain.vercel.app"
```

### Frontend (`rubikchat-frontend/.env`)
```env
VITE_BACKEND_URL="https://your-backend-domain.up.railway.app"
```

---

## ⚡ Deployment & Startup Commands

### Backend Startup (`rubikchat-node-api`)
```bash
# Install dependencies
npm install

# Generate Prisma Client & Push Schema to Database
npx prisma generate
npx prisma db push

# Build & Start Express Server
npm run build
npm start
```

### Frontend Startup (`rubikchat-frontend`)
```bash
# Install dependencies
npm install

# Run Development Server
npm run dev

# Build Production Bundle
npm run build
```

---

## 🧪 Testing Endpoints & Verification

1. **Get Products API**:
   `GET /api/shopify/products?shop=your-store.myshopify.com`
2. **Order Status API**:
   `POST /api/shopify/order-status` `{ "shop": "your-store.myshopify.com", "order_number": "1001" }`
3. **Multi-Item Cart Permalink API**:
   `POST /api/shopify/cart` `{ "shop": "your-store.myshopify.com", "items": [{"product_name": "Snowboard 1", "quantity": 1}, {"product_name": "Snowboard 2", "quantity": 1}] }`
