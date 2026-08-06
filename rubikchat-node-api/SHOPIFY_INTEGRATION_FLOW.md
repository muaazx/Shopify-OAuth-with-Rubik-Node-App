# Shopify Integration & OAuth Handoff Architecture

This document details the architecture, UI flow, iframe handoff mechanisms, and configuration settings for the RubikChat Shopify Integration.

---

## 1. Architectural Overview & Services

### Railway Express Backend
- **Live Production Host**: `https://rubik-chat-lead-gen-node-server-backend-production-0f28.up.railway.app`
- **Container Port Binding**: `PORT=3000` inside the container.
- **Railway Networking Target Port**: Set to **Port 8080** (or Port 3000 aligned in Railway Settings -> Public Networking).
- **Database Model**: PostgreSQL accessed via Prisma (`prisma.shopify_integrations`).
  - Key fields tracked: `store_url`, `access_token`, `status`, `agent_created`.

### Vercel React Frontend
- **Live Application URL**: `https://shopify-o-auth-with-rubik-node-app.vercel.app`
- **Environment Variable**: `VITE_BACKEND_URL=https://rubik-chat-lead-gen-node-server-backend-production-0f28.up.railway.app`
- Handles merchant onboarding, account authorization, and agent setup.

### Shopify Partner App Configuration
- **App Handle**: `rubikchat-agent-app-1`
- **Client ID**: `313c24ef02b06cd1f27c138c25f6a4a2`
- **Application URL**: `https://rubik-chat-lead-gen-node-server-backend-production-0f28.up.railway.app`
- **Whitelisted Redirect URLs**:
  - `https://rubik-chat-lead-gen-node-server-backend-production-0f28.up.railway.app/api/auth/shopify/callback`
  - `https://rubik-chat-lead-gen-node-server-backend-production-0f28.up.railway.app/api/shopify/callback`
  - `https://rubik-chat-lead-gen-node-server-backend-production-0f28.up.railway.app/api/auth/shopify`
  - `https://shopify-o-auth-with-rubik-node-app.vercel.app/api/auth/shopify/callback`

---

## 2. Embedded Shopify Admin Iframe Behavior

### Root Route (`/`) Strategy
When a merchant clicks on the RubikChat app inside Shopify Admin, Shopify loads an embedded `<iframe>` pointing to `GET /?shop=...&host=...&embedded=1`.

To allow embedding inside Shopify Admin without browser frameblocking:
- The Express server dynamically sets the Content-Security-Policy header:
  `Content-Security-Policy: frame-ancestors https://admin.shopify.com https://*.myshopify.com;`
- Helmet CSP / frameguard is explicitly configured to permit framing from `admin.shopify.com` and `*.myshopify.com`.

### Unconnected State UI
If the store is not yet connected (`isConnected === false`), the Express backend renders a clean, styled HTML setup card inside the iframe:
- **Card Header**: Purple icon block + "RubikChat Setup" + "AI Agents for Customer Support & Sales".
- **Card Body**: "Action Required" heading + explanation text.
- **Connect Button**: "Connect with RubikChat".

### Top-Level Handoff (`_blank`)
To avoid framing restrictions and top-level OAuth navigation errors inside Shopify Admin:
- Clicking **"Connect with RubikChat"** executes:
  `window.open('https://shopify-o-auth-with-rubik-node-app.vercel.app/?shop=' + shop + '&host=' + host + '&embedded=0', '_blank');`
- This opens the full Vercel app in a **new browser tab** where the merchant can authorize permissions and create their AI agent without disturbing the Shopify Admin interface.
- Simultaneously, the button text updates to `"Connecting to RubikChat..."` and disables to prevent duplicate clicks.

### Background Status Polling
While the new tab is open, the embedded iframe runs a 3-second `setInterval` loop querying:
`GET /api/status?shop=...`

When the backend reports:
`{ shopifyConnected: true, rubikchatConnected: true }`
The iframe automatically stops polling and triggers `showConnected()`, updating the card in-place without page redirects.

### Connected State UI
Once connected, the card updates inside the iframe:
- **Status Badge**: `✅ Connected to RubikChat` (`#ecfdf5` green background).
- **Disconnect Button**: Outlined red button (`#ef4444`).
  - Clicking Disconnect prompts for confirmation.
  - Upon confirmation, button immediately updates to `"Disconnecting..."`, dims (`opacity: 0.7`), and disables.
  - Sends `POST /api/shopify/disconnect`.
  - On success, calls `window.location.reload()` to return to the unconnected setup state.
- **Footer Text**: `"Your store is live with RubikChat."`

---

## 3. Critical Configuration Files & Settings

### `shopify.app.toml` Structure
```toml
client_id = "313c24ef02b06cd1f27c138c25f6a4a2"
name = "rubikchat-agent-app"
handle = "rubikchat-agent-app-1"
application_url = "https://rubik-chat-lead-gen-node-server-backend-production-0f28.up.railway.app"
embedded = true

[auth]
redirect_urls = [
  "https://rubik-chat-lead-gen-node-server-backend-production-0f28.up.railway.app/api/auth/shopify/callback",
  "https://rubik-chat-lead-gen-node-server-backend-production-0f28.up.railway.app/api/shopify/callback",
  "https://rubik-chat-lead-gen-node-server-backend-production-0f28.up.railway.app/api/auth/shopify",
  "https://shopify-o-auth-with-rubik-node-app.vercel.app/api/auth/shopify/callback"
]
```

### Express Helmet / CSP Setup (`index.ts`)
```typescript
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        frameAncestors: ["'self'", "https://admin.shopify.com", "https://*.myshopify.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://*.myshopify.com", "https://admin.shopify.com"],
      },
    },
  })
);
```

---

## 4. Step-by-Step Recovery Checklist

If the integration ever fails or shows errors in the future, follow this checklist in order:

1. **Check Railway Backend Networking & Status**:
   - Verify Railway container status is Active and healthy.
   - Go to Railway Settings -> Networking and ensure Public Domain proxies to **Port 8080** (or Port 3000).
   - Test `https://rubik-chat-lead-gen-node-server-backend-production-0f28.up.railway.app` in browser — it should return standard Express response.

2. **Verify Shopify Partner App URLs**:
   - Open Shopify Dev Dashboard -> App Versions.
   - Confirm **App URL** is set to `https://rubik-chat-lead-gen-node-server-backend-production-0f28.up.railway.app`.
   - Confirm **Redirect URLs** include `/api/auth/shopify/callback` on Railway.
   - If changed in `shopify.app.toml`, release a new version with `npx shopify app deploy --allow-updates`.

3. **Check Vercel Frontend Environment Variables**:
   - In Vercel Project Settings -> Environment Variables, ensure `VITE_BACKEND_URL` is set to `https://rubik-chat-lead-gen-node-server-backend-production-0f28.up.railway.app`.

4. **Verify Database Connection**:
   - Confirm PostgreSQL URL in Railway variables is active.
   - Verify `prisma.shopify_integrations` table is accessible by hitting `/api/status?shop=your-store.myshopify.com`.
