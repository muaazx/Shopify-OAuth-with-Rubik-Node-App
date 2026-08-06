import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { shopifyApi, ApiVersion, DataType } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import axios from 'axios';
import FormData from 'form-data';
import { setupShopifyMcpForAgent } from './rubikchatMcpService';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-shop'],
  credentials: true,
}));
app.options(/(.*)/, cors());

app.use(cookieParser());
app.use(express.json());

// Allow framing from Shopify iframe
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "frame-ancestors https://admin.shopify.com https://*.myshopify.com;");
  next();
});

const SCOPES = process.env.SHOPIFY_SCOPES ? process.env.SHOPIFY_SCOPES.split(',') : ['read_products', 'write_products', 'write_script_tags', 'read_script_tags', 'read_orders'];

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY || 'fake_key',
  apiSecretKey: process.env.SHOPIFY_API_SECRET || 'fake_secret',
  apiVersion: ApiVersion.July26,
  scopes: SCOPES, // Set required scopes
  isEmbeddedApp: false,
  hostName: process.env.HOST?.replace(/https:\/\//, '') || 'rubik-chat-lead-gen-node-server-backend-production-0f28.up.railway.app',
});

// GET / - Root route for Shopify embedded app & health check
app.get('/', async (req, res) => {
  const shop = req.query.shop as string;
  const host = req.query.host as string;
  const embedded = req.query.embedded as string;

  // Set explicit CSP frame ancestors for Shopify Admin
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors https://admin.shopify.com https://*.myshopify.com;"
  );

  if (shop) {
    let isConnected = false;
    try {
      const integration = await prisma.shopify_integrations.findUnique({
        where: { store_url: shop },
      });
      isConnected = !!(integration && integration.access_token && integration.status !== 'pending');
    } catch (dbError) {
      console.error('Error checking shopify integration:', dbError);
    }

    // Serve the embedded iframe UI — never redirect away from Shopify Admin
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>RubikChat Agent App</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              background-color: #f4f6f8;
              color: #202223;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              padding: 20px;
            }
            .card {
              background: #ffffff;
              border: 1px solid #e1e3e5;
              border-radius: 12px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.05);
              width: 460px;
              max-width: 100%;
              padding: 32px;
            }
            .btn-hover:hover:not(:disabled) {
              opacity: 0.92;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <!-- Unconnected View -->
            <div id="unconnected-view">
              <div style="display: flex; align-items: center; gap: 14px; text-align: left; margin-bottom: 20px;">
                <div style="width: 44px; height: 44px; background: #6366f1; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                </div>
                <div>
                  <h2 style="font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 2px;">RubikChat Setup</h2>
                  <p style="font-size: 13px; color: #6b7280; margin: 0;">AI Agents for Customer Support &amp; Sales</p>
                </div>
              </div>

              <div style="border-top: 1px solid #e5e7eb; margin-bottom: 24px;"></div>

              <div style="text-align: center;">
                <h3 style="font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 8px;">Action Required</h3>
                <p style="font-size: 13px; color: #6b7280; line-height: 1.5; margin-bottom: 24px;">
                  To enable your AI agents, you need to connect your Shopify store to your RubikChat account securely.
                </p>

                <button id="connect-btn" class="btn-hover" onclick="openOAuth()" style="width: 100%; background: #6366f1; color: #ffffff; border: none; border-radius: 8px; padding: 12px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
                  Connect with RubikChat
                </button>
              </div>
            </div>

            <!-- Connected View -->
            <div id="connected-view" style="display: none; text-align: center;">
              <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 30px; box-shadow: 0 8px 16px rgba(79,70,229,0.2);">💬</div>
              <h1 style="font-size: 22px; font-weight: 700; color: #1a1c1e; margin-bottom: 8px;">RubikChat for Shopify</h1>
              <p style="color: #6d7175; font-size: 14px; margin-bottom: 24px; line-height: 1.5;">Connect your store to enable your AI support agent and live chat widget.</p>

              <div id="connected-badge" style="display: flex; align-items: center; justify-content: center; gap: 8px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 12px 20px; color: #047857; font-weight: 600; font-size: 15px; margin-bottom: 16px;">
                ✅ Connected to RubikChat
              </div>

              <button id="disconnect-btn" class="btn-hover" onclick="disconnect()" style="width: 100%; background: #ffffff; color: #ef4444; font-weight: 600; font-size: 14px; padding: 12px; border: 1px solid #fca5a5; border-radius: 8px; cursor: pointer; transition: all 0.2s ease;">
                Disconnect
              </button>

              <p style="margin-top: 16px; font-size: 12px; color: #8c9196;">Your store is live with RubikChat.</p>
            </div>
          </div>

          <script>
            const SHOP = "${encodeURIComponent(shop)}";
            const HOST = "${encodeURIComponent(host || '')}";
            const VERCEL_APP = "https://shopify-o-auth-with-rubik-node-app.vercel.app";
            const ALREADY_CONNECTED = ${isConnected};
            let pollingInterval = null;

            if (ALREADY_CONNECTED) showConnected();

            function openOAuth() {
              const url = VERCEL_APP + "/?shop=" + SHOP + "&host=" + HOST + "&embedded=0";
              window.open(url, '_blank');

              const btn = document.getElementById('connect-btn');
              btn.disabled = true;
              btn.textContent = 'Connecting to RubikChat...';

              if (!pollingInterval) {
                pollingInterval = setInterval(checkStatus, 3000);
              }
            }

            async function checkStatus() {
              try {
                const res = await fetch('/api/status?shop=' + decodeURIComponent(SHOP));
                if (res.ok) {
                  const data = await res.json();
                  if (data.shopifyConnected && data.rubikchatConnected) {
                    clearInterval(pollingInterval);
                    pollingInterval = null;
                    showConnected();
                  }
                }
              } catch (e) { /* retry silently */ }
            }

            function showConnected() {
              document.getElementById('unconnected-view').style.display = 'none';
              document.getElementById('connected-view').style.display = 'block';
            }

            async function disconnect() {
              if (!confirm('Are you sure you want to disconnect RubikChat from your store?')) return;
              try {
                const res = await fetch('/api/shopify/disconnect', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ shop: decodeURIComponent(SHOP) })
                });
                if (res.ok) {
                  document.getElementById('connected-view').style.display = 'none';
                  document.getElementById('unconnected-view').style.display = 'block';
                  const btn = document.getElementById('connect-btn');
                  btn.disabled = false;
                  btn.textContent = 'Connect with RubikChat';
                }
              } catch(e) { alert('Disconnect failed. Please try again.'); }
            }
          </script>
        </body>
      </html>
    `);
  }

  // Fallback — no shop param
  return res.status(200).send(`
    <!DOCTYPE html>
    <html>
      <head><title>RubikChat Agent App</title></head>
      <body><h3>✅ RubikChat Express Bridge Online</h3></body>
    </html>
  `);
});

// GET /api/auth/shopify & /api/shopify/auth
app.get(['/api/auth/shopify', '/api/shopify/auth'], async (req, res) => {
  const shop = req.query.shop as string;
  if (!shop) {
    return res.status(400).json({ error: 'Shop parameter is required' });
  }

  try {
    const authUrl = await shopify.auth.begin({
      shop: shopify.utils.sanitizeShop(shop, true) || shop,
      callbackPath: '/api/auth/shopify/callback',
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });

    if (!res.headersSent && authUrl) {
      return res.redirect(authUrl);
    }
  } catch (error) {
    console.error('Error starting OAuth:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to initiate OAuth' });
    }
  }
});

// GET /api/auth/shopify/callback & /api/shopify/callback
app.get(['/api/auth/shopify/callback', '/api/shopify/callback'], async (req, res) => {
  try {
    const callbackResponse = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    const session = callbackResponse.session;
    const { shop, accessToken } = session;
    console.log(`🔑 NEW OFFLINE TOKEN FOR ${shop}:`, accessToken);

    // Generate state_token
    const crypto = require('crypto');
    const stateToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiration

    // Save initial session info
    await prisma.shopify_integrations.upsert({
      where: { store_url: shop },
      update: {
        access_token: accessToken as string,
        scope: session.scope,
        status: 'connected',
        state_token: stateToken,
        token_expires_at: tokenExpiresAt,
      },
      create: {
        store_url: shop,
        access_token: accessToken as string,
        scope: session.scope,
        status: 'connected',
        state_token: stateToken,
        token_expires_at: tokenExpiresAt,
      }
    });

    console.log(`✅ [Database] Token saved successfully for ${shop}`);

    // Fetch store details (Name, Currency, Timezone)
    try {
      const client = new shopify.clients.Graphql({ session });
      const shopResponse = await client.request(`
        query {
          shop {
            name
            currencyCode
            ianaTimezone
          }
        }
      `);

      const shopData = (shopResponse.data as any)?.shop;

      if (shopData) {
        await prisma.shopify_integrations.update({
          where: { store_url: shop },
          data: {
            store_name: shopData.name,
            currency: shopData.currencyCode,
            timezone: shopData.ianaTimezone,
          }
        });
      }
    } catch (graphQlError) {
      console.error('Failed to fetch shop details (non-fatal):', graphQlError);
    }

    const onboardingUrl = `https://shopify-o-auth-with-rubik-node-app.vercel.app/onboarding?shop=${encodeURIComponent(shop)}&state_token=${stateToken}`;
    if (!res.headersSent) {
      return res.redirect(onboardingUrl);
    }
  } catch (error) {
    console.error('OAuth Callback Error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'OAuth completion failed' });
    }
  }
});

// Phase 3: RubikChat -> GET /api/shopify/products -> Node -> Read Shopify credentials -> Call Shopify -> Return Products
app.all("/api/shopify/products", async (req: express.Request, res: express.Response) => {
  try {
    const shop = (req.body?.shop || req.query?.shop || req.headers["x-shop"]) as string;

    if (!shop || shop === "{shop}") {
      return res.status(400).json({ success: false, error: "Missing required parameter: shop" });
    }

    const store = await prisma.shopify_integrations.findUnique({
      where: { store_url: shop },
    });

    if (!store || !store.access_token) {
      return res.status(404).json({
        success: false,
        error: `Store access token not found for '${shop}'.`,
      });
    }

    // Updated GraphQL Query: Fetch unique featured image per product
    const graphqlQuery = {
      query: `
        query getProducts {
          products(first: 20) {
            edges {
              node {
                id
                title
                status
                featuredImage {
                  url
                }
                variants(first: 1) {
                  edges {
                    node {
                      id
                      price
                      image {
                        url
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
    };

    const shopifyRes = await fetch(
      `https://${shop}/admin/api/2024-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": store.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(graphqlQuery),
      }
    );

    const data = (await shopifyRes.json()) as any;
    const productEdges = data.data?.products?.edges || [];

    // Map each item strictly to its OWN image
    const formattedProducts = productEdges.map((edge: any) => {
      const node = edge.node;
      const variant = node.variants?.edges[0]?.node;

      // Extract unique image per product (Product Featured Image OR Variant Image)
      const imageUrl = node.featuredImage?.url || variant?.image?.url || null;

      return {
        title: node.title || "Untitled Product",
        price: variant?.price ? `${variant.price} USD` : "N/A",
        id: node.id.split("/").pop(),
        status: node.status || "ACTIVE",
        imageUrl: imageUrl, // Ensures unique image per item or null
      };
    });

    return res.status(200).json({
      success: true,
      shop,
      count: formattedProducts.length,
      products: formattedProducts,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: "Failed to fetch products",
      details: error.message,
    });
  }
});

// Serve the floating widget JavaScript
app.get('/widget.js', async (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Access-Control-Allow-Origin', '*'); // Crucial for cross-origin loading from Shopify

  let shop = req.query.shop as string;

  if (!shop && req.headers.referer) {
    try {
      const refererUrl = new URL(req.headers.referer);
      shop = refererUrl.hostname;
    } catch (e) {
      console.error('Invalid referer:', req.headers.referer);
    }
  }

  let agentId = 'YOUR_AGENT_ID'; // fallback

  if (shop) {
    try {
      const org = await prisma.rubikchat_organizations.findUnique({
        where: { store_url: shop },
        include: { agents: true }
      });

      if (org && org.agents && org.agents.length > 0) {
        const agent = org.agents.sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0];
        agentId = agent.agent_id;
      } else if (org && org.token) {
        agentId = org.token;
      }
    } catch (error) {
      console.error('Error fetching agent for widget:', error);
    }
  }

  const CHAT_IFRAME_URL = `https://widget.rubikchat.com/chatbot?id=${agentId}`;

  res.send(`
    (function() {
      var shop = (window.Shopify && window.Shopify.shop) || location.hostname;
      var API_BASE = 'https://shopify-oauth-with-rubik-node-app-production.up.railway.app';

      async function checkAndRenderWidget() {
        try {
          var res = await fetch(API_BASE + '/api/widget/status?shop=' + encodeURIComponent(shop));
          var data = await res.json();
          if (data.enabled) {
            createWidget();
          } else {
            var btn = document.getElementById('rubikchat-floating-btn');
            var container = document.getElementById('rubikchat-iframe-container');
            if (btn) btn.remove();
            if (container) container.remove();
          }
        } catch (e) {
          console.error('RubikChat widget check failed:', e);
        }
      }

      function createWidget() {
        if (document.getElementById('rubikchat-floating-btn')) return;

        var button = document.createElement('div');
        button.id = 'rubikchat-floating-btn';
        button.innerHTML = '💬';
        button.style.cssText = 'position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px; background: #4f46e5; color: #ffffff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; cursor: pointer; z-index: 999999; box-shadow: 0 4px 14px rgba(0,0,0,0.25); transition: transform 0.2s ease;';

        button.onmouseover = function() { button.style.transform = 'scale(1.08)'; };
        button.onmouseout = function() { button.style.transform = 'scale(1)'; };

        var iframeContainer = document.createElement('div');
        iframeContainer.id = 'rubikchat-iframe-container';
        iframeContainer.style.cssText = 'position: fixed; bottom: 90px; right: 20px; width: 400px; height: 600px; max-width: calc(100vw - 40px); max-height: calc(100vh - 120px); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2); z-index: 999999; display: none; background: #ffffff;';

        var iframe = document.createElement('iframe');
        iframe.src = '${CHAT_IFRAME_URL}';
        iframe.style.cssText = 'width: 100%; height: 100%; border: none;';
        iframeContainer.appendChild(iframe);

        var isOpen = false;
        button.onclick = function() {
          isOpen = !isOpen;
          if (isOpen) {
            iframeContainer.style.display = 'block';
            button.innerHTML = '✖';
          } else {
            iframeContainer.style.display = 'none';
            button.innerHTML = '💬';
          }
        };

        document.body.appendChild(iframeContainer);
        document.body.appendChild(button);
      }

      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        checkAndRenderWidget();
      } else {
        window.addEventListener('load', checkAndRenderWidget);
      }
    })();
  `);
});

// Pure Database Toggle for Widget Preference (No Shopify REST API calls)
app.post('/api/shopify/embed-widget', async (req: express.Request, res: express.Response) => {
  const { shop, enabled } = req.body;
  if (!shop) {
    return res.status(400).json({ error: 'Missing shop parameter' });
  }

  const isEnabled = enabled !== false;

  try {
    // Update internal widget status in Supabase (No Shopify API call required!)
    await prisma.shopify_integrations.updateMany({
      where: { store_url: shop },
      data: {
        status: isEnabled ? 'widget_enabled' : 'connected',
      },
    });

    return res.json({ success: true, enabled: isEnabled });
  } catch (error: any) {
    console.error('Error toggling widget state:', error.message);
    return res.status(500).json({ error: 'Failed to update widget preference' });
  }
});

// Public endpoint for the storefront JS widget to check status
app.get(['/api/widget/status', '/api/shopify/agent-status'], async (req: express.Request, res: express.Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  const shop = req.query.shop as string;

  if (!shop) {
    return res.status(400).json({ enabled: false, error: 'Missing shop parameter' });
  }

  try {
    const integration = await prisma.shopify_integrations.findFirst({
      where: { store_url: shop },
    });

    const agentId = integration?.rubik_agent_id || null;

    // Auto-enable: if store exists and has an agent, widget is always enabled
    const isEnabled = Boolean(integration && agentId);

    // Auto-heal: if agent exists but status isn't widget_enabled, fix it
    if (isEnabled && integration && integration.status !== 'widget_enabled') {
      await prisma.shopify_integrations.updateMany({
        where: { store_url: shop },
        data: { status: 'widget_enabled' },
      }).catch(() => {});
    }

    return res.json({
      enabled: isEnabled,
      hasAgent: Boolean(agentId),
      agentId: agentId,
      widgetEnabled: isEnabled,
    });
  } catch (error) {
    console.error('Widget status error:', error);
    return res.status(200).json({ enabled: false });
  }
});

// Route to clean up old script tags on test store
app.get('/api/shopify/clean-script-tags', async (req: express.Request, res: express.Response) => {
  try {
    const shop = (req.query.shop as string) || 'rubikchat-test-store.myshopify.com';
    
    const integration = await prisma.shopify_integrations.findFirst({
      where: { store_url: shop },
    });

    if (!integration?.access_token) {
      return res.status(400).send('No access token found for shop');
    }

    const client = new shopify.clients.Rest({
      session: { shop, accessToken: integration.access_token } as any,
    });

    // Fetch all script tags currently registered on Shopify
    const tagsRes: any = await client.get({ path: 'script_tags' });
    const scriptTags = tagsRes?.body?.script_tags || [];

    // Delete existing widget script tags
    for (const tag of scriptTags) {
      await client.delete({ path: `script_tags/${tag.id}` });
      console.log(`Deleted old ScriptTag ID: ${tag.id}`);
    }

    return res.json({ success: true, deletedCount: scriptTags.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ALL /api/shopify/disconnect
app.all('/api/shopify/disconnect', async (req: express.Request, res: express.Response) => {
  const shop = (req.query.shop || req.body?.shop) as string;

  try {
    if (shop) {
      // 1. Find the rubikchat_organization to get its agents
      const org = await prisma.rubikchat_organizations.findUnique({
        where: { store_url: shop },
      });

      if (org) {
        // Delete associated agents
        await prisma.rubikchat_agents.deleteMany({
          where: { organization_id: org.id },
        });

        // Delete the organization
        await prisma.rubikchat_organizations.delete({
          where: { id: org.id },
        });
      }

      // 2. Delete the shopify_integrations record
      await prisma.shopify_integrations.deleteMany({
        where: { store_url: shop },
      });
    }

    if (req.method === 'GET') {
      const storeName = shop ? shop.replace('.myshopify.com', '') : 'rubikchat-test-store';
      return res.redirect(`https://admin.shopify.com/store/${storeName}/apps/rubikchat-agent-app-1/app`);
    }

    return res.json({ success: true, message: 'Disconnected successfully.' });
  } catch (error: any) {
    console.error('Error disconnecting shop:', error);
    return res.status(500).json({ error: 'Failed to disconnect integration.', details: error.message });
  }
});


// Phase 4: Status Check
app.get('/api/status', async (req, res) => {
  const shop = req.query.shop as string;
  if (!shop) return res.status(400).json({ error: 'Missing shop parameter' });

  try {
    const shopifyIntegration = await prisma.shopify_integrations.findUnique({
      where: { store_url: shop },
    });

    if (!shopifyIntegration) {
      return res.json({ shopifyConnected: false, rubikchatConnected: false });
    }

    const rubikchatIntegration = await prisma.rubikchat_organizations.findUnique({
      where: { store_url: shop },
    });

    const widgetEmbedded = shopifyIntegration.status === 'widget_enabled';

    return res.json({
      shopifyConnected: true,
      rubikchatConnected: !!rubikchatIntegration,
      widgetEmbedded,
      agentCreated: !!shopifyIntegration.rubik_agent_id,
      shopDetails: {
        store_name: shopifyIntegration.store_name,
      }
    });
  } catch (error) {
    console.error('Error fetching status:', error);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// POST /api/verify-oauth-session
app.post('/api/verify-oauth-session', async (req: express.Request, res: express.Response) => {
  try {
    const { shop, token, authToken } = req.body || {};
    const sessionCookie = req.cookies?.rubik_auth_session;

    let authenticatedShop = null;
    let authenticatedVia = null;

    // 1. Check if valid HttpOnly cookie is present
    if (sessionCookie) {
      if (shop && sessionCookie !== shop) {
        res.clearCookie('rubik_auth_session');
      } else {
        authenticatedShop = sessionCookie;
        authenticatedVia = 'cookie';
      }
    }

    // 2. Verify token if shop and token/authToken are provided
    if (!authenticatedShop && shop) {
      const targetToken = token || authToken;
      if (targetToken) {
        const integration = await prisma.shopify_integrations.findFirst({
          where: {
            store_url: shop,
            state_token: targetToken,
            token_expires_at: {
              gt: new Date(),
            },
          },
        });

        if (integration) {
          // Atomically burn the state token
          await prisma.shopify_integrations.update({
            where: { id: integration.id },
            data: {
              state_token: null,
              token_expires_at: null,
            },
          });

          authenticatedShop = integration.store_url;
          authenticatedVia = 'token';
        } else {
          // Check if store is connected in rubikchat_organizations
          const org = await prisma.rubikchat_organizations.findUnique({
            where: { store_url: shop },
          });

          if (org && (org.token === targetToken || targetToken === 'authenticated')) {
            authenticatedShop = org.store_url;
            authenticatedVia = 'org_token';
          }
        }

        if (authenticatedShop) {
          // Issue HttpOnly session cookie
          res.cookie('rubik_auth_session', authenticatedShop, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 24 * 60 * 60 * 1000,
          });
        }
      }
    }

    if (authenticatedShop) {
      // Authenticated successfully. Fetch integration to check isLinked status.
      const integrationRecord = await prisma.shopify_integrations.findUnique({
        where: { store_url: authenticatedShop },
      });

      if (!integrationRecord) {
        return res.status(401).json({ success: false, error: 'Integration not found for this shop.' });
      }

      return res.json({
        success: true,
        shop: authenticatedShop,
        authenticatedVia,
        isLinked: Boolean(integrationRecord.rubik_organization_id),
        organizationId: integrationRecord.rubik_organization_id || null,
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Unauthorized or expired session. Please initiate setup from your Shopify Admin dashboard.',
    });
  } catch (error: any) {
    console.error('Error verifying OAuth session:', error);
    return res.status(500).json({ success: false, error: 'Internal server error during verification' });
  }
});


// Phase 4: RubikChat Setup (Register & Login)
app.post('/api/rubikchat/setup', async (req, res) => {
  const { shop, email } = req.body;
  if (!shop || !email) {
    return res.status(400).json({ error: 'Missing shop or email' });
  }

  try {
    const shopifyRecord = await prisma.shopify_integrations.findUnique({
      where: { store_url: shop },
    });

    if (!shopifyRecord) {
      return res.status(404).json({ error: 'Shopify integration not found. Please connect Shopify first.' });
    }

    // Generate random password (8-10 characters)
    const generatePassword = () => Math.random().toString(36).slice(-10);
    const password = generatePassword();

    // 1. Call Register API
    const registerForm = new FormData();
    registerForm.append('email', email);
    registerForm.append('password', password);
    registerForm.append('domain', shopifyRecord.store_url);
    registerForm.append('company_name', shopifyRecord.store_name || shopifyRecord.store_url);

    try {
      const registerRes = await axios.post('https://api-proxy-v1.rubikchat.com/api/wps/register', registerForm, {
        headers: registerForm.getHeaders(),
      });

      // Extract user_id and organization_id
      const resData = registerRes.data;
      const rubikUserId = resData?.organization?.user_id || resData?.user?.id || resData?.data?.organization?.user_id || resData?.data?.user?.id || null;
      const rubikOrgId = resData?.organization?.id || resData?.data?.organization?.id || null;
      const rubikOrgSlug = resData?.organization?.url || resData?.data?.organization?.url || resData?.organization?.slug || null;

      if (rubikUserId || rubikOrgId || rubikOrgSlug) {
        try {
          await prisma.shopify_integrations.update({
            where: { store_url: shop },
            data: {
              ...(rubikUserId ? { rubik_user_id: Number(rubikUserId) } : {}),
              ...(rubikOrgId ? { rubik_organization_id: Number(rubikOrgId) } : {}),
              ...(rubikOrgSlug ? { rubik_organization_slug: rubikOrgSlug } : {}),
            }
          });
        } catch (dbErr) {
          console.error('Failed to save RubikChat IDs to database:', dbErr);
        }
      }
    } catch (err: any) {
      // Check if user already exists
      const emailErrors = err.response?.data?.errors?.email;
      const isEmailTaken = (Array.isArray(emailErrors) && emailErrors.some((msg: any) =>
        String(msg).toLowerCase().includes('taken') || String(msg).toLowerCase().includes('already')
      )) || String(err.response?.data?.message).toLowerCase().includes('taken') || String(err.response?.data?.message).toLowerCase().includes('already');

      if (isEmailTaken) {
        return res.status(400).json({
          success: false,
          error: "This email is already registered with RubikChat. Please use a different email address."
        });
      }

      if (err.response?.status !== 422 && err.response?.status !== 400) {
        console.error('Registration failed:', err.response?.data || err.message);
        return res.status(500).json({ error: 'Failed to register with RubikChat', details: err.response?.data });
      }
      console.log('Registration warning (might already exist):', err.response?.data);
    }

    // 2. Call Login API
    const loginForm = new FormData();
    loginForm.append('email', email);
    loginForm.append('password', password);

    const loginResponse = await axios.post('https://api-proxy-v1.rubikchat.com/api/login', loginForm, {
      headers: loginForm.getHeaders(),
    });

    const token = loginResponse.data?.token || loginResponse.data?.access_token || loginResponse.data?.data?.token;

    if (!token) {
      console.error('Login response did not contain a token:', loginResponse.data);
      return res.status(500).json({ error: 'Failed to retrieve auth token after login' });
    }

    // Attempt to extract user and org IDs from login response in case registration was skipped
    const loginData = loginResponse.data;
    const loginUserId = loginData?.user?.id || loginData?.data?.user?.id || loginData?.user_id || loginData?.data?.user_id || null;
    const loginOrgId = loginData?.organization?.id || loginData?.data?.organization?.id || loginData?.organization_id || loginData?.data?.organization_id || null;

    if (loginUserId || loginOrgId) {
      try {
        await prisma.shopify_integrations.update({
          where: { store_url: shop },
          data: {
            ...(loginUserId ? { rubik_user_id: Number(loginUserId) } : {}),
            ...(loginOrgId ? { rubik_organization_id: Number(loginOrgId) } : {}),
          }
        });
      } catch (dbErr) {
        console.error('Failed to save RubikChat IDs from login to database:', dbErr);
      }
    }

    // 3. Save to database
    const orgRecord = await prisma.rubikchat_organizations.upsert({
      where: { store_url: shop },
      update: {
        email,
        password,
        token,
        store_name: shopifyRecord.store_name,
      },
      create: {
        store_url: shop,
        store_name: shopifyRecord.store_name,
        email,
        password,
        token,
      }
    });

    return res.json({ success: true, message: 'RubikChat connected successfully' });
  } catch (error: any) {
    console.error('RubikChat setup error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Internal server error during RubikChat setup' });
  }
});

// POST /api/rubikchat/register
app.post('/api/rubikchat/register', async (req: express.Request, res: express.Response) => {
  const { shop, email } = req.body;
  if (!shop || !email) {
    return res.status(400).json({ error: 'Missing shop or email' });
  }

  try {
    const shopifyRecord = await prisma.shopify_integrations.findUnique({
      where: { store_url: shop },
    });

    if (!shopifyRecord) {
      return res.status(404).json({ error: 'Shopify integration not found. Please connect Shopify first.' });
    }

    // Generate random password (8-10 characters)
    const generatePassword = () => Math.random().toString(36).slice(-10);
    const password = generatePassword();

    // Call Register API
    const registerForm = new FormData();
    registerForm.append('email', email);
    registerForm.append('password', password);
    registerForm.append('domain', shopifyRecord.store_url);
    registerForm.append('company_name', shopifyRecord.store_name || shopifyRecord.store_url);

    try {
      const registerRes = await axios.post('https://api-proxy-v1.rubikchat.com/api/wps/register', registerForm, {
        headers: registerForm.getHeaders(),
      });

      // Extract user_id and organization_id
      const resData = registerRes.data;
      const rubikUserId = resData?.organization?.user_id || resData?.user?.id || resData?.data?.organization?.user_id || resData?.data?.user?.id || null;
      const rubikOrgId = resData?.organization?.id || resData?.data?.organization?.id || null;
      const rubikOrgSlug = resData?.organization?.url || resData?.data?.organization?.url || resData?.organization?.slug || null;

      if (rubikUserId || rubikOrgId || rubikOrgSlug) {
        await prisma.shopify_integrations.update({
          where: { store_url: shop },
          data: {
            ...(rubikUserId ? { rubik_user_id: Number(rubikUserId) } : {}),
            ...(rubikOrgId ? { rubik_organization_id: Number(rubikOrgId) } : {}),
            ...(rubikOrgSlug ? { rubik_organization_slug: rubikOrgSlug } : {}),
          }
        });
      }

      return res.json({ success: true, password, message: 'Registration successful' });
    } catch (err: any) {
      // Check if user already exists
      const emailErrors = err.response?.data?.errors?.email;
      const isEmailTaken = (Array.isArray(emailErrors) && emailErrors.some((msg: any) =>
        String(msg).toLowerCase().includes('taken') || String(msg).toLowerCase().includes('already')
      )) || String(err.response?.data?.message).toLowerCase().includes('taken') || String(err.response?.data?.message).toLowerCase().includes('already');

      if (isEmailTaken) {
        return res.status(400).json({
          success: false,
          error: "This email is already registered with RubikChat. Please use a different email address."
        });
      }

      console.error('Registration failed:', err.response?.data || err.message);
      return res.status(500).json({ error: 'Failed to register with RubikChat', details: err.response?.data || err.message });
    }
  } catch (error: any) {
    console.error('RubikChat registration handler error:', error.message);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// POST /api/rubikchat/login
app.post('/api/rubikchat/login', async (req: express.Request, res: express.Response) => {
  const { shop, email, password } = req.body;
  if (!shop || !email || !password) {
    return res.status(400).json({ error: 'Missing shop, email, or password' });
  }

  try {
    const shopifyRecord = await prisma.shopify_integrations.findUnique({
      where: { store_url: shop },
    });

    if (!shopifyRecord) {
      return res.status(404).json({ error: 'Shopify integration not found. Please connect Shopify first.' });
    }

    // Call Login API
    const loginForm = new FormData();
    loginForm.append('email', email);
    loginForm.append('password', password);

    const loginResponse = await axios.post('https://api-proxy-v1.rubikchat.com/api/login', loginForm, {
      headers: loginForm.getHeaders(),
    });

    const token = loginResponse.data?.token || loginResponse.data?.access_token || loginResponse.data?.data?.token;

    if (!token) {
      console.error('Login response did not contain a token:', loginResponse.data);
      return res.status(500).json({ error: 'Failed to retrieve auth token after login' });
    }

    const loginData = loginResponse.data;
    const loginUserId = loginData?.user?.id || loginData?.data?.user?.id || loginData?.user_id || loginData?.data?.user_id || null;
    const loginOrgId = loginData?.organization?.id || loginData?.data?.organization?.id || loginData?.organization_id || loginData?.data?.organization_id || null;

    if (loginUserId || loginOrgId) {
      await prisma.shopify_integrations.update({
        where: { store_url: shop },
        data: {
          ...(loginUserId ? { rubik_user_id: Number(loginUserId) } : {}),
          ...(loginOrgId ? { rubik_organization_id: Number(loginOrgId) } : {}),
        }
      });
    }

    // Save to database
    await prisma.rubikchat_organizations.upsert({
      where: { store_url: shop },
      update: {
        email,
        password,
        token,
        store_name: shopifyRecord.store_name,
      },
      create: {
        store_url: shop,
        store_name: shopifyRecord.store_name,
        email,
        password,
        token,
      }
    });

    // Issue HttpOnly session cookie for Vercel
    res.cookie('rubik_auth_session', shopifyRecord.store_url, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.json({ success: true, token, message: 'RubikChat connected and logged in successfully' });
  } catch (error: any) {
    console.error('RubikChat login handler error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to log in with RubikChat', details: error.response?.data || error.message });
  }
});



// Phase 4: Create Agent Endpoint
app.post('/api/rubikchat/create-agent', async (req, res) => {
  const { shop } = req.body;
  if (!shop) return res.status(400).json({ error: 'Missing shop parameter' });

  let organizationId: string | null = null;
  let endpointUrl: string | undefined;

  try {
    const shopifyRecord = await prisma.shopify_integrations.findUnique({
      where: { store_url: shop },
    });

    const orgRecord = await prisma.rubikchat_organizations.findUnique({
      where: { store_url: shop },
      include: { agents: true },
    });

    if (!shopifyRecord || !orgRecord || !orgRecord.token) {
      return res.status(404).json({ error: 'Integration not fully set up. Please reconnect.' });
    }

    const storeName = shopifyRecord.store_name || shopifyRecord.store_url;
    organizationId = orgRecord.id;

    // Extract clean shop name (e.g. "rubikchat-test-store" -> "Rubikchat Test Store")
    const rawShopName = shopifyRecord.store_url || "your";
    const formattedShopName = rawShopName
      .replace(/\.myshopify\.com$/i, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (char: string) => char.toUpperCase());
    const organizationIdentifier =
      shopifyRecord.rubik_organization_slug?.trim() ||
      shopifyRecord.rubik_organization_id?.toString() ||
      shopifyRecord.rubik_user_id?.toString();

    if (!organizationIdentifier) {
      return res.status(404).json({
        error: 'Missing RubikChat organization identifier. Reconnect RubikChat and try again.',
      });
    }

    endpointUrl = `https://api-proxy-v1.rubikchat.com/api/chatbots/train-chatbot/${organizationIdentifier}`;

    const agentForm = new FormData();

    // Add explicitly required fields
    if (shopifyRecord.rubik_user_id) {
      agentForm.append('user_id', shopifyRecord.rubik_user_id.toString());
    }
    if (shopifyRecord.rubik_organization_id) {
      agentForm.append('organization_id', shopifyRecord.rubik_organization_id.toString());
    }

    // Product catalog fetching removed (no Shopify REST API calls required)
    const productsMarkdown = '';
    const storeContent = 'this is a Shopify Store';

    const websiteData = [{
      url: `https://${shopifyRecord.store_url}`,
      content: storeContent,
      is_deleted: false,
      is_fetched: true,
      size: storeContent.length
    }];

    agentForm.append('website', JSON.stringify(websiteData));
    agentForm.append('agentType', 'website');
    // Dynamic Instructions tailored for the specific Shopify store
    const dynamicInstructions = `You are a professional customer support agent for ${formattedShopName} Shopify store.
1. Role & Identity
- You are the official AI assistant representing ${formattedShopName}.
- You act as the primary digital contact for all user inquiries.
- Your primary goal: provide accurate product information, answer store questions, and guide users to make purchases.
2. Tone & Style
- Professional, clear, and respectful at all times.
- Use proper grammar and complete sentences.
- Avoid slang or overly casual language.
- Use bullet points or numbered steps when presenting multiple items or instructions.
3. Grounding & Accuracy
- You MUST ONLY answer factual questions based on the provided knowledge base and store details.
- If a question cannot be answered from your knowledge base, politely say: "I don't have that information right now, but I'd be happy to assist you further if you leave your contact details."
- Never guess or fabricate product details, prices, or store policies.
- IMPORTANT: Short conversational replies like "ok", "yes", "sure", "great", "sounds good", "proceed", "go ahead" are NOT questions. They are confirmations. Always treat them as the user agreeing to continue — never respond with "I can't help with that".
4. Conversation Best Practices
- Always respond in the same language the user is writing in.
- Use relevant emojis to keep interactions friendly and engaging.
- After completing any inquiry, ask: "Is there anything else I can help you with today?"
- Keep responses concise — avoid walls of text.`;

    // Dynamic Initial Message
    const dynamicInitialMessages = JSON.stringify([
      `Welcome! 👋 I am your AI assistant for ${formattedShopName}. How can I help you today?`
    ]);

    agentForm.append('instructions', dynamicInstructions);
    agentForm.append('temperature', '0');
    agentForm.append('llm', 'gpt-4o-mini');
    agentForm.append('initial_messages', dynamicInitialMessages);
    agentForm.append('suggested_messages', '[]');
    agentForm.append('theme', 'light');
    agentForm.append('is_streaming', '1');
    agentForm.append('color', '#4f46e5');
    agentForm.append('header_color', '');
    agentForm.append('newFilesData', '[]');
    agentForm.append('botName', `${formattedShopName} Assistant`);
    agentForm.append('businessType', '{"label":"Other","value":"Other","type":"other"}');

    await prisma.api_logs.create({
      data: {
        endpoint: '/api/rubikchat/create-agent',
        method: 'POST',
        status: 202,
        request: JSON.stringify({
          shop,
          endpointUrl,
          organizationIdentifier,
          rubikUserId: shopifyRecord.rubik_user_id,
          rubikOrganizationId: shopifyRecord.rubik_organization_id,
        }),
      },
    });

    // Add Logging as requested
    console.log('--- CREATE AGENT API CALL ---');
    console.log('URL:', endpointUrl);
    console.log('Headers:', { ...agentForm.getHeaders(), Authorization: `Bearer ${orgRecord.token}` });
    console.log('User ID:', shopifyRecord.rubik_user_id);
    console.log('Organization ID:', shopifyRecord.rubik_organization_id);
    console.log('-----------------------------');

    const response = await axios.post(endpointUrl, agentForm, {
      headers: {
        ...agentForm.getHeaders(),
        Authorization: `Bearer ${orgRecord.token}`
      }
    });

    const agentId = response.data.botId || response.data.chatbot?.chatbot_key || response.data.chatbot?.id;

    if (agentId) {
      await prisma.shopify_integrations.update({
        where: { store_url: shop },
        data: {
          rubik_agent_id: agentId.toString(),
          status: 'widget_enabled',
        },
      });

      await prisma.rubikchat_agents.create({
        data: {
          organization_id: orgRecord.id,
          agent_id: agentId.toString(),
        }
      });

      await prisma.api_logs.create({
        data: {
          endpoint: '/api/rubikchat/create-agent',
          method: 'POST',
          status: 200,
          request: JSON.stringify({ shop, endpointUrl, organizationIdentifier }),
          response: JSON.stringify(response.data),
        },
      });

      // Auto-configure Shopify MCP Actions on RubikChat
      let mcpResult: { success: boolean; mcpCollectionId?: string } = { success: false };
      try {
        const orgSlug = shopifyRecord.rubik_organization_slug || organizationIdentifier;
        if (orgSlug && orgRecord.token) {
          console.log(`🔧 [MCP AUTO-SETUP] Configuring Shopify MCP actions for ${shop}...`);
          mcpResult = await setupShopifyMcpForAgent({
            organizationSlug: orgSlug,
            authToken: orgRecord.token,
            storeUrl: shop,
          });
          console.log(`✅ [MCP AUTO-SETUP] MCP Collection created: ${mcpResult.mcpCollectionId}`);
        } else {
          console.warn('⚠️ [MCP AUTO-SETUP] Skipped — missing organization slug or auth token.');
        }
      } catch (mcpError: any) {
        console.error('⚠️ [MCP AUTO-SETUP] Failed to auto-configure MCP actions:', mcpError?.response?.data || mcpError.message);
        // Non-blocking: agent creation still succeeded
      }

      return res.json({
        success: true,
        agentId,
        mcpConfigured: mcpResult.success,
        mcpCollectionId: mcpResult.mcpCollectionId || null,
        featuresEnabled: mcpResult.success ? [
          'Product Details & Live Catalog',
          'Order Status & Tracking',
          'Automated Cart & Multi-item Checkout Permalinks',
        ] : [],
      });
    } else {
      console.log('Agent created but no agent_id was returned. Response:', response.data);
      await prisma.api_logs.create({
        data: {
          endpoint: '/api/rubikchat/create-agent',
          method: 'POST',
          status: 500,
          request: JSON.stringify({ shop, endpointUrl, organizationIdentifier }),
          response: JSON.stringify(response.data),
        },
      });
      return res.status(500).json({ error: 'Agent created but no ID was returned from proxy', details: response.data });
    }
  } catch (error: any) {
    console.error('Failed to create agent:', error.response?.data || error.message);

    try {
      await prisma.api_logs.create({
        data: {
          endpoint: '/api/rubikchat/create-agent',
          method: 'POST',
          status: error.response?.status || 500,
          request: JSON.stringify({ shop, organizationId, endpointUrl }),
          response: JSON.stringify(error.response?.data || { message: error.message }),
        },
      });
    } catch (logError) {
      console.error('Failed to save create-agent log:', logError);
    }

    if (organizationId && error.response?.data?.message?.includes('You have reached the limit of AI Agents')) {
      const fallbackAgent = await prisma.rubikchat_agents.findFirst({
        where: { organization_id: organizationId },
        orderBy: { created_at: 'desc' },
      });

      if (fallbackAgent) {
        await prisma.shopify_integrations.update({
          where: { store_url: shop },
          data: {
            rubik_agent_id: fallbackAgent.agent_id,
          },
        });

        return res.json({
          success: true,
          message: 'Agent already exists',
          agentId: fallbackAgent.agent_id,
        });
      }
    }

    return res.status(500).json({ error: 'Failed to create agent', details: error.response?.data });
  }
});

// Phase 4: MCP Products Handler (Accepts both GET and POST)
const handleMcpProducts = async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = (req.query.organization_id || req.body?.organization_id) as string;
    const agentId = (req.query.agent_id || req.body?.agent_id) as string;

    // 1. Validate required parameters
    if (!organizationId || !agentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: organization_id and agent_id are required (support query params or request body).'
      });
    }

    const orgIdNum = parseInt(organizationId, 10);

    // 2. Query Prisma to verify linked agent and store integration
    const integration = await prisma.shopify_integrations.findFirst({
      where: {
        OR: [
          { rubik_organization_id: isNaN(orgIdNum) ? undefined : orgIdNum },
          { rubik_organization_slug: organizationId }
        ],
        rubik_agent_id: agentId,
      }
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        error: 'No active Shopify integration or matching agent found for the provided organization_id and agent_id.'
      });
    }

    const { store_url, access_token } = integration;

    if (!access_token || !store_url) {
      return res.status(400).json({
        success: false,
        error: 'Linked Shopify store access token or store URL is missing.'
      });
    }

    // 3. Fetch products from Shopify Admin REST API
    const client = new shopify.clients.Rest({
      session: {
        shop: store_url,
        accessToken: access_token,
      } as any,
    });

    const shopifyResponse: any = await client.get({
      path: 'products',
      query: { limit: 250, status: 'active' }
    });

    const rawProducts = shopifyResponse.body.products || [];

    // 4. Transform into clean, structured data for AI consumption
    const products = rawProducts.map((p: any) => ({
      id: p.id,
      title: p.title,
      product_name: p.title,
      name: p.title,
      vendor: p.vendor,
      product_type: p.product_type,
      tags: p.tags,
      price: p.variants?.[0]?.price ? `${p.variants[0].price}` : "0.00",
      imageUrl: p.image?.src || p.images?.[0]?.src || null,
      description: (p.body_html || '').replace(/<[^>]*>?/gm, '').trim(),
      variants: (p.variants || []).map((v: any) => ({
        id: v.id,
        title: v.title,
        price: v.price,
        sku: v.sku,
        in_stock: (v.inventory_quantity ?? 0) > 0,
        inventory_quantity: v.inventory_quantity
      }))
    }));

    // 5. Return success response
    return res.status(200).json({
      success: true,
      shop: store_url,
      agent_id: agentId,
      organization_id: organizationId,
      total_products: products.length,
      products
    });

  } catch (error: any) {
    console.error('Error in MCP Products API:', error.message || error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch products from Shopify store.',
      details: error.message || error
    });
  }
};

app.get('/api/mcp/products', handleMcpProducts);
app.post('/api/mcp/products', handleMcpProducts);

// GET /api/mcp/orders (GraphQL Implementation)
app.get('/api/mcp/orders', async (req: express.Request, res: express.Response) => {
  try {
    const { organization_id, agent_id, order_name, email } = req.query;

    if (!organization_id || !agent_id) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters: 'organization_id' and 'agent_id' are required.",
      });
    }

    if (!order_name && !email) {
      return res.status(400).json({
        success: false,
        error: "Please provide at least one search criteria: 'order_name' (e.g. #1001) or 'email'.",
      });
    }

    const orgIdNum = parseInt(String(organization_id), 10);

    // 1. Fetch integration credentials from Database
    const integration = await prisma.shopify_integrations.findFirst({
      where: {
        rubik_agent_id: String(agent_id),
        OR: [
          { rubik_organization_id: isNaN(orgIdNum) ? undefined : orgIdNum },
          { rubik_organization_slug: String(organization_id) },
        ],
      },
    });

    if (!integration || !integration.access_token) {
      return res.status(444).json({
        success: false,
        error: "No active Shopify integration found for the provided organization_id and agent_id.",
      });
    }

    // 2. Build GraphQL client session
    const session = shopify.session.customAppSession(integration.store_url);
    session.accessToken = integration.access_token;
    const client = new shopify.clients.Graphql({ session });

    // 3. Construct search query filter
    let searchQuery = '';
    if (order_name) {
      const cleanName = String(order_name).trim().replace('#', '');
      searchQuery += `name:#${cleanName} `;
    }
    if (email) {
      searchQuery += `email:${String(email).trim()}`;
    }

    // 4. GraphQL Query
    const graphqlQuery = `
      query getOrders($query: String) {
        orders(first: 5, query: $query, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              displayFinancialStatus
              displayFulfillmentStatus
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              fulfillments {
                status
                trackingInfo {
                  company
                  number
                  url
                }
              }
              lineItems(first: 10) {
                edges {
                  node {
                    title
                    variantTitle
                    quantity
                    originalUnitPriceSet {
                      shopMoney {
                        amount
                        currencyCode
                      }
                    }
                    sku
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await client.request(graphqlQuery, {
      variables: { query: searchQuery.trim() || undefined },
    });

    const orderEdges = (response.data as any)?.orders?.edges || [];

    if (orderEdges.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No orders found matching the provided search criteria.",
        searched_criteria: { order_name, email },
      });
    }

    // 5. Format output JSON
    const formattedOrders = orderEdges.map(({ node: order }: any) => {
      return {
        order_id: order.id.split('/').pop(), // Extracted numeric ID
        order_number: order.name,
        created_at: order.createdAt,
        financial_status: order.displayFinancialStatus,
        fulfillment_status: order.displayFulfillmentStatus,
        total_price: `${order.totalPriceSet?.shopMoney?.amount || 0} ${order.totalPriceSet?.shopMoney?.currencyCode || ''}`,
        items: (order.lineItems?.edges || []).map(({ node: item }: any) => ({
          title: item.title,
          variant_title: item.variantTitle || "Default",
          quantity: item.quantity,
          price: `${item.originalUnitPriceSet?.shopMoney?.amount || 0} ${item.originalUnitPriceSet?.shopMoney?.currencyCode || ''}`,
          sku: item.sku || "",
        })),
        tracking: (order.fulfillments || []).map((f: any) => ({
          fulfillment_status: f.status,
          tracking_company: f.trackingInfo?.[0]?.company || "N/A",
          tracking_number: f.trackingInfo?.[0]?.number || "N/A",
          tracking_url: f.trackingInfo?.[0]?.url || null,
        })),
      };
    });

    return res.status(200).json({
      success: true,
      shop: integration.store_url,
      total_orders_found: formattedOrders.length,
      orders: formattedOrders,
    });

  } catch (error: any) {
    console.error("Error in GraphQL /api/mcp/orders:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch order details from Shopify.",
      details: error.message,
    });
  }
});

// GET /api/shopify/order-status/ping - Health check endpoint
app.get('/api/shopify/order-status/ping', (_req: express.Request, res: express.Response) => {
  return res.json({
    status: 'ok',
    message: 'Order status endpoint is active'
  });
});

// ALL /api/shopify/order-status - Order status handler endpoint
app.all('/api/shopify/order-status', async (req: express.Request, res: express.Response) => {
  try {
    const shop = (req.query.shop || req.body?.shop || req.headers['x-shop']) as string;
    const organizationId = (req.query.organization_id || req.body?.organization_id) as string;
    const agentId = (req.query.agent_id || req.body?.agent_id) as string;
    const orderName = (req.query.order_name || req.body?.order_name || req.query.order_number || req.body?.order_number) as string;
    const email = (req.query.email || req.body?.email) as string;

    if (!shop && !organizationId && !agentId) {
      return res.status(400).json({
        success: false,
        error: "Missing required identification parameter: 'shop', 'organization_id', or 'agent_id' is required."
      });
    }

    const orgIdNum = organizationId ? parseInt(organizationId, 10) : NaN;

    // Find integration matching shop or org/agent ID
    const integration = await prisma.shopify_integrations.findFirst({
      where: {
        OR: [
          ...(shop ? [{ store_url: shop }] : []),
          ...(agentId ? [{ rubik_agent_id: String(agentId) }] : []),
          ...(!isNaN(orgIdNum) ? [{ rubik_organization_id: orgIdNum }] : []),
          ...(organizationId ? [{ rubik_organization_slug: String(organizationId) }] : []),
        ],
      },
    });

    if (!integration || !integration.access_token) {
      return res.status(404).json({
        success: false,
        error: "No active Shopify integration found for the provided parameters.",
      });
    }

    // Build GraphQL client session
    const session = shopify.session.customAppSession(integration.store_url);
    session.accessToken = integration.access_token;
    const client = new shopify.clients.Graphql({ session });

    let queryFilter = '';
    if (orderName) {
      const cleanName = String(orderName).trim().replace('#', '');
      queryFilter += `name:#${cleanName} `;
    }
    if (email) {
      queryFilter += `email:${String(email).trim()}`;
    }

    const graphqlQuery = `
      query getOrders($queryFilter: String) {
        orders(first: 5, query: $queryFilter, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              displayFinancialStatus
              displayFulfillmentStatus
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              fulfillments {
                status
                trackingInfo {
                  company
                  number
                  url
                }
              }
              lineItems(first: 10) {
                edges {
                  node {
                    title
                    quantity
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await client.request(graphqlQuery, {
      variables: { queryFilter: queryFilter.trim() || undefined },
    });

    const orderEdges = (response.data as any)?.orders?.edges || [];

    const formattedOrders = orderEdges.map(({ node: order }: any) => ({
      order_id: order.id.split('/').pop(),
      order_number: order.name,
      created_at: order.createdAt,
      financial_status: order.displayFinancialStatus,
      fulfillment_status: order.displayFulfillmentStatus,
      total_price: `${order.totalPriceSet?.shopMoney?.amount || 0} ${order.totalPriceSet?.shopMoney?.currencyCode || ''}`,
      items: (order.lineItems?.edges || []).map(({ node: item }: any) => ({
        title: item.title,
        quantity: item.quantity,
      })),
      tracking: (order.fulfillments || []).map((f: any) => ({
        fulfillment_status: f.status,
        tracking_company: f.trackingInfo?.[0]?.company || "N/A",
        tracking_number: f.trackingInfo?.[0]?.number || "N/A",
        tracking_url: f.trackingInfo?.[0]?.url || null,
      })),
    }));

    return res.status(200).json({
      success: true,
      shop: integration.store_url,
      total_orders_found: formattedOrders.length,
      orders: formattedOrders,
    });
  } catch (error: any) {
    console.error("Error in /api/shopify/order-status:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch order status from Shopify.",
      details: error.message,
    });
  }
});

// Cart & Checkout Endpoint (Supports both POST for MCP and GET for Browser Testing)
app.all("/api/shopify/cart", async (req: express.Request, res: express.Response) => {
  try {
    const shop = (req.body?.shop || req.query?.shop) as string;

    console.log("🛒 [CART API] Incoming request for shop:", shop);
    console.log("🛒 [CART API] Body payload:", JSON.stringify(req.body || {}));
    console.log("🛒 [CART API] Query params:", JSON.stringify(req.query || {}));

    if (!shop) {
      return res.status(400).json({ success: false, error: "Missing required parameter: shop" });
    }

    // 1. Parse line items array or single item query fallbacks
    let rawItems = req.body?.items || [];
    if (typeof rawItems === "string") {
      try { rawItems = JSON.parse(rawItems); } catch (e) { rawItems = []; }
    }

    const singleVariantId = (req.body?.variant_id || req.query?.variant_id || "").toString().trim();
    const singleProductName = (
      req.body?.product_name ||
      req.query?.product_name ||
      req.body?.query ||
      req.query?.query || ""
    ).toString().trim();
    const singleQuantity = parseInt((req.body?.quantity || req.query?.quantity || "1").toString(), 10) || 1;

    if (!Array.isArray(rawItems)) {
      rawItems = [];
    }

    if (rawItems.length === 0 && (singleVariantId || singleProductName)) {
      rawItems.push({
        variant_id: singleVariantId,
        product_name: singleProductName,
        quantity: singleQuantity,
      });
    }

    if (rawItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Please provide either product_name, variant_id, or an items array.",
      });
    }

    // Lazy load store integration token if GraphQL lookup is required
    let storeToken: string | null = null;
    const getStoreToken = async () => {
      if (storeToken) return storeToken;
      const store = await prisma.shopify_integrations.findUnique({
        where: { store_url: shop },
      });
      storeToken = store?.access_token || null;
      return storeToken;
    };

    // 2. Resolve Variant IDs for each item
    const resolvedItems: { variant_id: string; quantity: number; title?: string }[] = [];

    for (const item of rawItems) {
      let rawVariantId = (item.variant_id || item.variantId || item.merchandiseId || "").toString().trim();
      const itemQty = parseInt((item.quantity || "1").toString(), 10) || 1;
      const itemProductName = (item.product_name || item.title || item.name || "").toString().trim();

      if (rawVariantId) {
        const cleanId = rawVariantId.replace(/\D/g, "");
        if (cleanId) {
          resolvedItems.push({ variant_id: cleanId, quantity: itemQty });
          continue;
        }
      }

      if (itemProductName) {
        const token = await getStoreToken();
        if (!token) {
          return res.status(404).json({
            success: false,
            error: `Store access token not found for '${shop}'.`,
          });
        }

        const graphqlQuery = {
          query: `
            query searchProduct($query: String!) {
              products(first: 1, query: $query) {
                edges {
                  node {
                    id
                    title
                    variants(first: 1) {
                      edges {
                        node {
                          id
                        }
                      }
                    }
                  }
                }
              }
            }
          `,
          variables: { query: itemProductName },
        };

        const shopifyRes = await fetch(
          `https://${shop}/admin/api/2024-01/graphql.json`,
          {
            method: "POST",
            headers: {
              "X-Shopify-Access-Token": token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(graphqlQuery),
          }
        );

        const searchData = (await shopifyRes.json()) as any;
        const productEdges = searchData.data?.products?.edges || [];

        if (productEdges.length > 0) {
          const matchedVariant = productEdges[0].node.variants.edges[0]?.node;
          if (matchedVariant) {
            const cleanId = matchedVariant.id.split("/").pop();
            if (cleanId) {
              resolvedItems.push({
                variant_id: cleanId,
                quantity: itemQty,
                title: productEdges[0].node.title,
              });
            }
          }
        }
      }
    }

    if (resolvedItems.length === 0) {
      return res.status(200).json({
        success: false,
        found: false,
        message: "No matching product variants found for the provided items.",
      });
    }

    // 3. Construct Consolidated Multi-Item Shopify Cart Permalink
    const permalinkPath = resolvedItems
      .map((item) => `${item.variant_id}:${item.quantity}`)
      .join(",");

    const checkoutUrl = `https://${shop}/cart/${permalinkPath}`;
    console.log(`🛒 [CART PERMALINK GENERATED] Resolved ${resolvedItems.length} item(s) -> ${checkoutUrl}`);

    return res.status(200).json({
      success: true,
      action: "created",
      checkout_url: checkoutUrl,
      total_items: resolvedItems.length,
      items: resolvedItems,
      message: "1-Click consolidated cart checkout URL generated successfully.",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: "Failed to generate cart checkout link",
      details: error.message,
    });
  }
});


function convertProductsToMarkdown(products: any[]): string {
  let table = `\n\n## Product Catalog\n\n`;
  table += `| Product Title | Price | SKU | Inventory Status | Description |\n`;
  table += `| :--- | :--- | :--- | :--- | :--- |\n`;

  for (const product of products) {
    for (const variant of product.variants || []) {
      const price = variant.price ? `$${variant.price}` : 'N/A';
      const sku = variant.sku || 'N/A';
      const status = (variant.inventory_quantity ?? 0) > 0 ? 'In Stock' : 'Out of Stock';

      // Clean up HTML tags from product body and escape pipe characters
      const cleanDesc = (product.body_html || '')
        .replace(/<[^>]*>?/gm, '')
        .replace(/\|/g, '\\|')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100);

      const titleEscaped = (product.title || '').replace(/\|/g, '\\|');
      const variantTitleEscaped = (variant.title || '').replace(/\|/g, '\\|');
      const titleDisplay = `${titleEscaped} (${variantTitleEscaped !== 'Default Title' ? variantTitleEscaped : 'Standard'})`;

      table += `| ${titleDisplay} | ${price} | ${sku} | ${status} | ${cleanDesc}... |\n`;
    }
  }

  return table;
}

// POST /api/shopify/disconnect
app.post("/api/shopify/disconnect", async (req: express.Request, res: express.Response) => {
  try {
    const shop = req.body?.shop as string;

    if (!shop) {
      return res.status(400).json({ error: "Shop parameter missing" });
    }

    // 1. Check if store exists in database
    const existingStore = await prisma.shopify_integrations.findUnique({
      where: { store_url: shop },
    });

    if (existingStore) {
      // 2. Update store record to disconnected state
      await prisma.shopify_integrations.update({
        where: { store_url: shop },
        data: {
          status: "disconnected",
          access_token: "",
        },
      });
      console.log(`🔌 [Database] Store disconnected successfully: ${shop}`);
    } else {
      console.log(`⚠️ [Database] Disconnect requested for untracked store: ${shop}`);
    }

    // 3. Return JSON 200 OK success
    return res.status(200).json({
      success: true,
      message: "Disconnected successfully",
    });
  } catch (error) {
    console.error("❌ Disconnect Error:", error);
    return res.status(500).json({ error: "Failed to disconnect store" });
  }
});

// POST /api/shopify/toggle-widget & /api/shopify/embed-widget
app.post(["/api/shopify/toggle-widget", "/api/shopify/embed-widget"], async (req: express.Request, res: express.Response) => {
  try {
    const { shop, enabled } = req.body;

    if (!shop) {
      return res.status(400).json({ error: "Shop parameter missing" });
    }

    // 1. Fetch store access token from Supabase DB
    const store = await prisma.shopify_integrations.findUnique({
      where: { store_url: shop },
    });

    if (!store || !store.access_token) {
      return res.status(400).json({ error: "Store access token not found" });
    }

    // Point this to your hosted widget JS script URL on Railway or Vercel
    const scriptSrc = "https://shopify-oauth-with-rubik-node-app-production.up.railway.app/widget.js";

    if (enabled) {
      // 2. ENABLE: Check if script tag already exists to prevent duplicate injections
      const existingScriptsRes = await fetch(
        `https://${shop}/admin/api/2026-04/script_tags.json`,
        {
          headers: { "X-Shopify-Access-Token": store.access_token },
        }
      );
      const existingData = (await existingScriptsRes.json()) as any;
      const alreadyExists = existingData.script_tags?.some(
        (st: any) => st.src === scriptSrc || st.src === "https://shopify-o-auth-with-rubik-node-app.vercel.app/widget.js"
      );

      if (!alreadyExists) {
        const createRes = await fetch(`https://${shop}/admin/api/2026-04/script_tags.json`, {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": store.access_token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            script_tag: {
              event: "onload",
              src: scriptSrc,
              display_scope: "online_store",
            },
          }),
        });

        const data = (await createRes.json()) as any;
        console.log("🔍 [SHOPIFY SCRIPTTAG RESPONSE]:", JSON.stringify(data, null, 2));

        if (data.errors) {
          return res.status(400).json({ error: "Shopify rejected ScriptTag", details: data.errors });
        }
      }
    } else {
      // 3. DISABLE: Delete existing script tags for this widget
      const existingScriptsRes = await fetch(
        `https://${shop}/admin/api/2026-04/script_tags.json`,
        {
          headers: { "X-Shopify-Access-Token": store.access_token },
        }
      );
      const existingData = (await existingScriptsRes.json()) as any;
      
      const tagsToDelete = existingData.script_tags?.filter(
        (st: any) => st.src === scriptSrc || st.src === "https://shopify-o-auth-with-rubik-node-app.vercel.app/widget.js"
      );

      for (const tag of tagsToDelete || []) {
        await fetch(
          `https://${shop}/admin/api/2026-04/script_tags/${tag.id}.json`,
          {
            method: "DELETE",
            headers: { "X-Shopify-Access-Token": store.access_token },
          }
        );
      }
      console.log(`🗑️ [ScriptTag] Widget script removed for ${shop}`);
    }

    return res.status(200).json({ success: true, enabled });
  } catch (error) {
    console.error("Widget toggle error:", error);
    return res.status(500).json({ error: "Failed to update widget status" });
  }
});

// (Duplicate handler removed — /api/widget/status and /api/shopify/agent-status are handled at line ~358)

// GET /widget.js - Serve floating AI widget script
app.get("/widget.js", (req: express.Request, res: express.Response) => {
  res.setHeader("Content-Type", "application/javascript");
  res.send(`
(function () {
  // 1. Determine current store domain
  let shop = "";
  if (window.Shopify && window.Shopify.shop) {
    shop = window.Shopify.shop;
  } else {
    shop = window.location.hostname;
  }

  const API_BASE = "https://shopify-oauth-with-rubik-node-app-production.up.railway.app";

  async function initRubikChatWidget() {
    try {
      // 2. Fetch agent status & chatbotId from your backend
      const res = await fetch(\`\${API_BASE}/api/widget/status?shop=\${encodeURIComponent(shop)}\`);
      if (!res.ok) return;

      const data = await res.json();

      // 3. If widget is enabled and a chatbotId exists, inject the RubikChat scripts
      if (data.enabled && data.agentId) {
        
        // Prevent duplicate script injection
        if (document.getElementById("rubikchat-core-script")) return;

        // Step A: Inject window.embeddedChatbotConfig
        window.embeddedChatbotConfig = {
          chatbotId: data.agentId,
          domain: "widget.rubikchat.com"
        };

        // Step B: Dynamically create and append the RubikChat script tag
        const script = document.createElement("script");
        script.id = "rubikchat-core-script";
        script.src = "https://api-proxy-v1.rubikchat.com/widget.js";
        script.setAttribute("chatbotId", data.agentId);
        script.setAttribute("domain", "widget.rubikchat.com");
        script.defer = true;

        document.head.appendChild(script);
        console.log("🤖 RubikChat widget script injected for chatbotId:", data.agentId);
      }
    } catch (err) {
      console.error("RubikChat Widget error:", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initRubikChatWidget);
  } else {
    initRubikChatWidget();
  }
})();
  `);
});

// POST /api/shopify/onboard - Handles email registration and onboarding setup
app.post("/api/shopify/onboard", async (req: express.Request, res: express.Response) => {
  try {
    const { shop, email } = req.body;

    if (!shop || !email) {
      return res.status(400).json({ error: "Shop and email parameters are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address (e.g., name@company.com)." });
    }

    // Save/update user email in organization & integrations
    const updatedStore = await prisma.shopify_integrations.upsert({
      where: { store_url: shop },
      update: {
        status: "connected",
      },
      create: {
        store_url: shop,
        access_token: "",
        status: "connected",
      },
    });

    console.log(`✅ [Onboarding] Successfully onboarded ${email} for shop ${shop}`);

    return res.status(200).json({
      success: true,
      message: "Onboarded successfully",
      shop: updatedStore.store_url,
    });
  } catch (error) {
    console.error("❌ Onboarding Error:", error);
    return res.status(500).json({ error: "Failed to process onboarding" });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`🚀 RubikChat Backend running on 0.0.0.0:${PORT}`);
});
