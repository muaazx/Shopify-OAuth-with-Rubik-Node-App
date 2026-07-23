"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const shopify_api_1 = require("@shopify/shopify-api");
require("@shopify/shopify-api/adapters/node");
dotenv_1.default.config();
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const shopify = (0, shopify_api_1.shopifyApi)({
    apiKey: process.env.SHOPIFY_API_KEY || 'fake_key',
    apiSecretKey: process.env.SHOPIFY_API_SECRET || 'fake_secret',
    apiVersion: shopify_api_1.ApiVersion.July26,
    scopes: [],
    isEmbeddedApp: false,
    hostName: 'localhost',
});
// Phase 3: RubikChat -> GET /api/shopify/products -> Node -> Read Shopify credentials -> Call Shopify -> Return Products
app.get('/api/shopify/products', async (req, res) => {
    try {
        const shop = req.query.shop;
        if (!shop) {
            return res.status(400).json({ error: 'Missing shop query parameter' });
        }
        // Read Shopify credentials (access token) from Supabase
        const sessionRecord = await prisma.session.findFirst({
            where: { shop },
        });
        if (!sessionRecord || !sessionRecord.accessToken) {
            return res.status(404).json({ error: 'No active session found for this shop. Make sure the app is installed and connected.' });
        }
        // Call Shopify API to get products
        const client = new shopify.clients.Graphql({
            session: {
                shop: sessionRecord.shop,
                accessToken: sessionRecord.accessToken,
            },
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
        // Format products for RubikChat
        const products = response.data?.products?.edges?.map((e) => ({
            id: e.node.id,
            title: e.node.title,
            handle: e.node.handle,
            status: e.node.status,
            imageUrl: e.node.images?.edges?.[0]?.node?.url || null,
        })) || [];
        // Return Products
        res.json({
            success: true,
            shop: sessionRecord.shop,
            products,
        });
    }
    catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
});
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`RubikChat Phase 3 Node API is running on port ${PORT}`);
});
//# sourceMappingURL=index.js.map