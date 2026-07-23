import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { shopifyApi, ApiVersion } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors({
  origin: ['http://localhost:5173', 'https://shopify-oauth-with-rubik-node-app-production.up.railway.app'],
  credentials: true,
}));
app.use(express.json());

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY || 'fake_key',
  apiSecretKey: process.env.SHOPIFY_API_SECRET || 'fake_secret',
  apiVersion: ApiVersion.July26,
  scopes: ['read_products', 'write_products'], // Set required scopes
  isEmbeddedApp: false,
  hostName: process.env.HOST?.replace(/https:\/\//, '') || 'localhost:3001', // Update based on ngrok or railway domain
});

// GET /api/auth/shopify
app.get('/api/auth/shopify', async (req, res) => {
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

    // Save initial session info
    await prisma.shopify_integrations.upsert({
      where: { store_url: session.shop },
      update: {
        access_token: session.accessToken as string,
        scope: session.scope,
        status: 'connected',
      },
      create: {
        store_url: session.shop,
        access_token: session.accessToken as string,
        scope: session.scope,
        status: 'connected',
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

    // Redirect to frontend UI with success flag
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/?status=success&shop=${session.shop}`);
  } catch (error) {
    console.error('OAuth Callback Error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/?status=error&message=auth_failed`);
  }
});

// Phase 3: RubikChat -> GET /api/shopify/products -> Node -> Read Shopify credentials -> Call Shopify -> Return Products
app.get('/api/shopify/products', async (req, res) => {
  try {
    const shop = req.query.shop as string;

    if (!shop) {
      return res.status(400).json({ error: 'Missing shop query parameter' });
    }

    // Read Shopify credentials from new table
    const integrationRecord = await prisma.shopify_integrations.findUnique({
      where: { store_url: shop },
    });

    if (!integrationRecord || !integrationRecord.access_token) {
      return res.status(404).json({ error: 'No active integration found for this shop.' });
    }

    // Call Shopify API to get products
    const client = new shopify.clients.Graphql({
      session: {
        shop: integrationRecord.store_url,
        accessToken: integrationRecord.access_token,
      } as any,
    });

    const response = await client.request(`
      query {
        products(first: 10) {
          edges {
            node {
              id
              title
              handle
              status
              images(first: 1) {
                edges {
                  node {
                    url
                  }
                }
              }
            }
          }
        }
      }
    `);

    // Format products
    const products = (response.data as any)?.products?.edges?.map((e: any) => ({
      id: e.node.id,
      title: e.node.title,
      handle: e.node.handle,
      status: e.node.status,
      imageUrl: e.node.images?.edges?.[0]?.node?.url || null,
    })) || [];

    res.json({
      success: true,
      shop: integrationRecord.store_url,
      products,
    });
  } catch (error: any) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`RubikChat Phase 3 Node API is running on port ${PORT}`);
});
