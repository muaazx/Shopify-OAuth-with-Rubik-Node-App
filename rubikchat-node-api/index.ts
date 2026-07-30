import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { shopifyApi, ApiVersion, DataType } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import axios from 'axios';
import FormData from 'form-data';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors({
  origin: ['http://localhost:5173', 'https://shopify-oauth-with-rubik-node-app-production.up.railway.app', 'https://shopify-o-auth-with-rubik-node-app.vercel.app'],
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY || 'fake_key',
  apiSecretKey: process.env.SHOPIFY_API_SECRET || 'fake_secret',
  apiVersion: ApiVersion.July26,
  scopes: ['read_products', 'write_products', 'write_script_tags', 'read_script_tags', 'read_orders'], // Set required scopes
  isEmbeddedApp: false,
  hostName: process.env.HOST?.replace(/https:\/\//, '') || 'localhost:3001', // Update based on ngrok or railway domain
});

// GET /api/auth/shopify & /api/shopify/auth
app.get(['/api/auth/shopify', '/api/shopify/auth'], async (req, res) => {
  const shop = req.query.shop as string;
  if (!shop) {
    return res.status(400).send('Missing shop parameter. Please provide a Shopify store URL.');
  }

  try {
    await shopify.auth.begin({
      shop: shopify.utils.sanitizeShop(shop, true) || shop,
      callbackPath: '/api/auth/shopify/callback',
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });
  } catch (error) {
    console.error('Error starting OAuth:', error);
    res.status(500).send('Failed to begin OAuth');
  }
});

// GET /api/auth/shopify/callback
app.get('/api/auth/shopify/callback', async (req, res) => {
  try {
    const callbackResponse = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    const session = callbackResponse.session;

    // Generate state_token
    const crypto = require('crypto');
    const stateToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiration

    // Save initial session info
    await prisma.shopify_integrations.upsert({
      where: { store_url: session.shop },
      update: {
        access_token: session.accessToken as string,
        scope: session.scope,
        status: 'connected',
        state_token: stateToken,
        token_expires_at: tokenExpiresAt,
      },
      create: {
        store_url: session.shop,
        access_token: session.accessToken as string,
        scope: session.scope,
        status: 'connected',
        state_token: stateToken,
        token_expires_at: tokenExpiresAt,
      }
    });

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
          where: { store_url: session.shop },
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

    // Redirect to frontend onboarding UI with shop and state_token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/onboarding?shop=${session.shop}&state_token=${stateToken}`);
  } catch (error) {
    console.error('OAuth Callback Error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/functions?status=error&message=auth_failed`);
  }
});

// Phase 3: RubikChat -> GET /api/shopify/products -> Node -> Read Shopify credentials -> Call Shopify -> Return Products
app.all('/api/shopify/products', async (req: express.Request, res: express.Response) => {
  try {
    // Check POST body, GET query params, or headers for shop
    const shop = (req.body?.shop || req.query?.shop || req.headers["x-shop"]) as string;

    if (!shop || shop === "{shop}") {
      return res.status(400).json({ error: "Missing required shop parameter." });
    }

    // Fetch access_token from Supabase
    const integration = await prisma.shopify_integrations.findUnique({
      where: { store_url: shop },
    });

    if (!integration || !integration.access_token) {
      return res.status(404).json({ error: `No access token found for store: ${shop}` });
    }

    // Query Shopify Admin GraphQL API
    const shopifyGraphqlUrl = `https://${shop}/admin/api/2024-04/graphql.json`;
    const query = `
      query getProducts {
        products(first: 10) {
          edges {
            node {
              id
              title
              handle
              status
              totalInventory
              priceRangeV2 {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              images(first: 1) {
                edges { node { url } }
              }
            }
          }
        }
      }
    `;

    const shopifyRes = await fetch(shopifyGraphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": integration.access_token,
      },
      body: JSON.stringify({ query }),
    });

    const data = await shopifyRes.json();

    if (data.errors) {
      return res.status(400).json({ error: "Shopify API Error", details: data.errors });
    }

    const products = (data.data?.products?.edges || []).map(({ node }: any) => ({
      id: node.id,
      title: node.title,
      handle: node.handle,
      status: node.status,
      inventory: node.totalInventory,
      price: `${node.priceRangeV2.minVariantPrice.amount} ${node.priceRangeV2.minVariantPrice.currencyCode}`,
      imageUrl: node.images.edges[0]?.node?.url || null,
    }));

    return res.json({
      success: true,
      shop,
      products,
    });
  } catch (err: any) {
    console.error("Products endpoint error:", err);
    return res.status(500).json({ error: "Internal Server Error", message: err.message });
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
  let organizationId = '';

  if (shop) {
    try {
      const integration = await prisma.shopify_integrations.findUnique({
        where: { store_url: shop }
      });
      if (integration && integration.rubik_organization_id) {
        organizationId = String(integration.rubik_organization_id);
      }

      const org = await prisma.rubikchat_organizations.findUnique({
        where: { store_url: shop },
        include: { agents: true }
      });

      if (org && org.agents && org.agents.length > 0) {
        // Find the most recently created agent
        const agent = org.agents.sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0];
        agentId = agent.agent_id;
      } else if (org && org.token) {
        // Fallback to the organization token if no agent is explicitly created
        agentId = org.token;
      }
    } catch (error) {
      console.error('Error fetching agent for widget:', error);
    }
  }

  // Use the dynamically retrieved agent ID and append the shop parameter for the public embedded widget
  const CHAT_IFRAME_URL = `https://widget.rubikchat.com/chatbot?id=${agentId}`;

  res.send(`
    (function() {
      console.log('RubikChat Widget Loaded Successfully!');

      function createWidget() {
        if (document.getElementById('rubikchat-floating-btn')) return;

        // 1. Create the Floating Button
        var button = document.createElement('div');
        button.id = 'rubikchat-floating-btn';
        button.innerHTML = '💬';
        button.style.cssText = 'position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px; background: #4f46e5; color: #ffffff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; cursor: pointer; z-index: 999999; box-shadow: 0 4px 14px rgba(0,0,0,0.25); transition: transform 0.2s ease;';

        button.onmouseover = function() { button.style.transform = 'scale(1.08)'; };
        button.onmouseout = function() { button.style.transform = 'scale(1)'; };

        // 2. Create the Chat Iframe Container
        var iframeContainer = document.createElement('div');
        iframeContainer.id = 'rubikchat-iframe-container';
        iframeContainer.style.cssText = 'position: fixed; bottom: 90px; right: 20px; width: 400px; height: 600px; max-width: calc(100vw - 40px); max-height: calc(100vh - 120px); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2); z-index: 999999; display: none; background: #ffffff;';

        // 3. Create the Iframe pointing to your RubikChat agent
        var iframe = document.createElement('iframe');
        iframe.src = '${CHAT_IFRAME_URL}';
        iframe.style.cssText = 'width: 100%; height: 100%; border: none;';
        iframeContainer.appendChild(iframe);

        // 4. Toggle Chat Window Visibility on Click
        var isOpen = false;
        button.onclick = function() {
          isOpen = !isOpen;
          if (isOpen) {
            iframeContainer.style.display = 'block';
            button.innerHTML = '✖'; // Change button icon to Close
          } else {
            iframeContainer.style.display = 'none';
            button.innerHTML = '💬'; // Change back to Chat icon
          }
        };

        // 5. Mount elements to DOM
        document.body.appendChild(iframeContainer);
        document.body.appendChild(button);
      }

      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        createWidget();
      } else {
        window.addEventListener('load', createWidget);
      }
    })();
  `);
});

// Embed/Remove Widget via ScriptTag
app.post('/api/shopify/embed-widget', async (req: express.Request, res: express.Response) => {
  const { shop, enabled } = req.body;
  if (!shop) {
    return res.status(400).json({ error: 'Missing shop parameter' });
  }

  const shouldEmbed = enabled !== false; // default to true if not specified

  try {
    const integrationRecord = await prisma.shopify_integrations.findUnique({
      where: { store_url: shop },
    });

    if (!integrationRecord || !integrationRecord.access_token || integrationRecord.access_token === 'pending') {
      return res.status(401).json({ error: 'Store requires re-authentication to grant widget permissions.' });
    }

    const client = new shopify.clients.Rest({
      session: {
        shop: integrationRecord.store_url,
        accessToken: integrationRecord.access_token,
      } as any,
    });

    // Check if script tag already exists
    const existingTags: any = await client.get({ path: 'script_tags' });
    const targetSrc = 'https://shopify-oauth-with-rubik-node-app-production.up.railway.app/widget.js';

    const matchingTags = (existingTags?.body?.script_tags || []).filter((tag: any) => tag.src === targetSrc);

    if (shouldEmbed) {
      if (matchingTags.length === 0) {
        await client.post({
          path: 'script_tags',
          data: {
            script_tag: {
              event: 'onload',
              src: targetSrc,
            },
          },
          type: DataType.JSON,
        });
      }
      return res.json({ success: true, enabled: true, message: 'Widget embedded successfully!' });
    } else {
      if (matchingTags.length > 0) {
        for (const tag of matchingTags) {
          if (tag.id) {
            await client.delete({
              path: `script_tags/${tag.id}`,
            });
          }
        }
      }
      return res.json({ success: true, enabled: false, message: 'Widget removed successfully!' });
    }
  } catch (error: any) {
    console.error('Error toggling widget:', error?.response?.body || error.message);
    res.status(500).json({ error: 'Failed to toggle widget', details: error?.response?.body || error.message });
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

    if (req.method === 'GET' || req.query.shop) {
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

    let widgetEmbedded = false;
    if (shopifyIntegration.access_token) {
      try {
        const client = new shopify.clients.Rest({
          session: {
            shop: shopifyIntegration.store_url,
            accessToken: shopifyIntegration.access_token,
          } as any,
        });
        const existingTags: any = await client.get({ path: 'script_tags' });
        const targetSrc = 'https://shopify-oauth-with-rubik-node-app-production.up.railway.app/widget.js';
        widgetEmbedded = existingTags?.body?.script_tags?.some((tag: any) => tag.src === targetSrc) || false;
      } catch (err) {
        console.warn('ScriptTag check skipped - access token needs refresh:', (err as any)?.message || err);
      }
    }

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

    // Fetch products from Shopify
    let productsMarkdown = '';
    try {
      const client = new shopify.clients.Rest({
        session: {
          shop: shopifyRecord.store_url,
          accessToken: shopifyRecord.access_token,
        } as any,
      });

      const productsResponse: any = await client.get({
        path: 'products',
        query: { limit: 250, status: 'active' }
      });
      const products = productsResponse.body.products || [];
      productsMarkdown = convertProductsToMarkdown(products);
    } catch (prodErr: any) {
      console.error('Failed to fetch Shopify products for training (non-fatal):', prodErr.message || prodErr);
      productsMarkdown = '\n\n## Product Catalog\nNo products found or failed to load product catalog.';
    }

    const storeContent = `${storeName} | Autonomous AI Agents for Customer Support, Sales and Marketing
Automate customer service, capture more leads and boost sales with ${storeName} AI Agents. Provide instant support, reduce costs and grow your business.
Boost sales by 20x and cut support costs. Connect your knowledge base and let ${storeName} handle your entire customer journey automatically.
Deploy autonomous AI agents that qualify leads, close sales, and provide 24/7 support across WhatsApp, Web, and Social Media. Stop chatting, start converting.

Solutions
Products
Resources
Pricing

The World’s Most Powerful AI Agents for Customer Service.
Scale your business, convert more leads, cut support costs, and boost customer loyalty with ${storeName}’s autonomous AI Agents built for powerful, human-like customer service.

Generate Leads
5× More Leads — Automatically
Deploy AI Agents that engage visitors, ask smart qualifying questions, and guide them toward conversions with human-like precision.

Boost Sales
Convert High-Intent Buyers in Minutes
Your AI Sales Agents handle objections, recommend products, and move prospects through the funnel faster — boosting sales up to 20×.

24/7 Customer Support
Instant Answers. Real Conversations. Zero Wait.
Provide around-the-clock support with AI Agents that understand context, resolve issues, and offer human-level service—without human costs.

Try ${storeName} Free
Set Up Your Business with ${storeName}'s AI Chatbot Solutions
${storeName} offers advanced AI chatbot solutions that transform how you interact with your customers and streamline your business processes.

Efficient Automation
Automate tasks and interactions to enhance productivity and user engagement.

Brand Aligned
Configure chatbot interactions to align with your brand’s personality.

Seamless Integration
Connects with over 400 apps, integrating effortlessly with your existing systems.

Your AI Agents Handle the Work — So Your Team Can Focus on Growth
Automate conversations, actions, and workflows across the entire customer journey — reducing workload, cutting support costs, and boosting performance instantly.

Built-in CRM
Stay organized and productive with a CRM that’s part of your chat platform. No extra tools, no switching tabs — just smarter selling.

Built-in Omnichannel
From DMs to live chat, engage customers consistently across every touchpoint with one integrated solution.

Built-in MCP
Scope AI actions with precision — whether it’s sending updates, scheduling meetings, or managing integrations — all within ${storeName}.

How ${storeName} Works
Improve Productivity with ${storeName}'s
${storeName}'s uses advanced AI technology to automate and streamline your business interactions. Here’s how it typically works:

01 -Train Your Agents
Upload and organize your knowledge sources — from files and plain text to website URLs or Notion pages. Our platform lets your AI agents learn directly from your business content, so they can accurately answer questions, follow your brand voice, and deliver reliable responses every time.
02 -Connect Your Channels
03 -Set Up Your Workflows

See ${storeName} AI Agents in Action
Real businesses using autonomous AI Agents to convert leads, boost sales, and automate support.

Talk to Experts
Not Sure Where to Start?
Our experts will help you design the perfect omnichannel strategy for your business Free consultation, no commitment required

Provide instant, accurate assistance to your users, reducing response times and enhancing satisfaction.

Contact
${storeName}, LLC
1111B S Governors Ave STE 25390
Dover, DE 19904
Email: support@rubikchat.com
© 2026 ${storeName}. All rights reserved.

${productsMarkdown}`;

    const websiteData = [{
      url: `https://${shopifyRecord.store_url}`,
      content: storeContent,
      is_deleted: false,
      is_fetched: true,
      size: storeContent.length
    }];

    agentForm.append('website', JSON.stringify(websiteData));
    agentForm.append('agentType', 'website');
    agentForm.append('instructions', `You are the professional AI assistant for ${storeName}.`);
    agentForm.append('temperature', '0');
    agentForm.append('llm', 'gpt-4o-mini');
    agentForm.append('initial_messages', '["Welcome! I\'m here to help you explore our website, services, and answers to your questions."]');
    agentForm.append('suggested_messages', '[]');
    agentForm.append('theme', 'light');
    agentForm.append('is_streaming', '1');
    agentForm.append('color', '#4f46e5');
    agentForm.append('header_color', '');
    agentForm.append('newFilesData', '[]');
    agentForm.append('botName', `${storeName} Assistant`);
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
          status: 'connected',
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

      return res.json({ success: true, agentId });
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
      vendor: p.vendor,
      product_type: p.product_type,
      tags: p.tags,
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
      query getOrders($query: String!) {
        orders(first: 5, query: $query) {
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
              customer {
                firstName
                lastName
                email
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
              fulfillments {
                status
                trackingInfo {
                  company
                  number
                  url
                }
              }
            }
          }
        }
      }
    `;

    const response = await client.request(graphqlQuery, {
      variables: { query: searchQuery.trim() },
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
        total_price: `${order.totalPriceSet?.shopMoney?.amount} ${order.totalPriceSet?.shopMoney?.currencyCode}`,
        customer: {
          first_name: order.customer?.firstName || "",
          last_name: order.customer?.lastName || "",
          email: order.customer?.email || "",
        },
        items: (order.lineItems?.edges || []).map(({ node: item }: any) => ({
          title: item.title,
          variant_title: item.variantTitle || "Default",
          quantity: item.quantity,
          price: `${item.originalUnitPriceSet?.shopMoney?.amount} ${item.originalUnitPriceSet?.shopMoney?.currencyCode}`,
          sku: item.sku || "",
        })),
        tracking: (order.fulfillments || []).map((f: any) => ({
          fulfillment_status: f.status,
          tracking_company: f.trackingInfo[0]?.company || "N/A",
          tracking_number: f.trackingInfo[0]?.number || "N/A",
          tracking_url: f.trackingInfo[0]?.url || null,
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`RubikChat Phase 3 Node API is running on port ${PORT}`);
});
