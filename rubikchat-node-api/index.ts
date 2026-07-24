import express from 'express';
import cors from 'cors';
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
app.use(express.json());

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY || 'fake_key',
  apiSecretKey: process.env.SHOPIFY_API_SECRET || 'fake_secret',
  apiVersion: ApiVersion.July26,
  scopes: ['read_products', 'write_products', 'write_script_tags', 'read_script_tags'], // Set required scopes
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
  const CHAT_IFRAME_URL = `https://app.rubikchat.com/chat/embed?agentId=${agentId}&shop=${shop || ''}`;

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

// Embed Widget via ScriptTag
app.post('/api/shopify/embed-widget', async (req, res) => {
  const { shop } = req.body;
  if (!shop) {
    return res.status(400).json({ error: 'Missing shop parameter' });
  }

  try {
    const integrationRecord = await prisma.shopify_integrations.findUnique({
      where: { store_url: shop },
    });

    if (!integrationRecord || !integrationRecord.access_token) {
      return res.status(404).json({ error: 'Shopify integration not found.' });
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
    
    const exists = existingTags?.body?.script_tags?.some((tag: any) => tag.src === targetSrc);

    if (!exists) {
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

    res.json({ success: true, message: 'Widget embedded successfully!' });
  } catch (error: any) {
    console.error('Error embedding widget:', error.response?.body || error.message);
    res.status(500).json({ error: 'Failed to embed widget' });
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

    return res.json({
      shopifyConnected: true,
      rubikchatConnected: !!rubikchatIntegration,
      shopDetails: {
        store_name: shopifyIntegration.store_name,
      }
    });
  } catch (error) {
    console.error('Error fetching status:', error);
    res.status(500).json({ error: 'Failed to fetch status' });
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

      if (rubikUserId || rubikOrgId) {
        try {
          await prisma.shopify_integrations.update({
            where: { store_url: shop },
            data: {
              rubik_user_id: rubikUserId ? Number(rubikUserId) : null,
              rubik_organization_id: rubikOrgId ? Number(rubikOrgId) : null,
            }
          });
        } catch (dbErr) {
          console.error('Failed to save RubikChat IDs to database:', dbErr);
        }
      }
    } catch (err: any) {
      // Check if user already exists
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

    // 4. Create Agent
    const storeName = shopifyRecord.store_name || shopifyRecord.store_url;
    const storeSlug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    const agentForm = new FormData();
    agentForm.append('website', `[{"url":"https://${shopifyRecord.store_url}","content":"${storeName} | Autonomous AI Agents for Customer Support, Sales and Marketing\\nAutomate customer service, capture more leads and boost sales with ${storeName} AI Agents. Provide instant support, reduce costs and grow your business.\\nBoost sales by 20x and cut support costs. Connect your knowledge base and let ${storeName} handle your entire customer journey automatically.\\nDeploy autonomous AI agents that qualify leads, close sales, and provide 24/7 support across WhatsApp, Web, and Social Media. Stop chatting, start converting.\\nhttps://rubikchat.com/images/logo/rubik-chat.png\\nhttps://rubikchat.com/images/logo/rubik-chat.png\\n\\nSolutions\\nProducts\\nResources\\nPricing\\nLog inGet Started\\nSolutions\\nProducts\\nPricing\\nResources\\nGet Started Free\\n\\nNo credit card required · 14-day free trial\\n\\nThe World’s Most Powerful AI Agents for Customer Service.\\n\\nScale your business, convert more leads, cut support costs, and boost customer loyalty with ${storeName}’s autonomous AI Agents built for powerful, human-like customer service.\\n\\nBuild Your Agent FreeBook a Demo\\nHi :wave:\\n\\nWelcome to Demo Industries Ltd.\\n\\nPlace / Modify OrderCheck Order StatusGet a QuoteTalk to an Expert\\nLosing Leads And Spending Too Much Time\\nOn Customer Service?\\n\\nMeet autonomous AI Agents that don’t just chat — they take action, qualify leads, close sales, and resolve support issues instantly.\\n\\nGenerate Leads\\n5× More Leads — Automatically\\n\\nDeploy AI Agents that engage visitors, ask smart qualifying questions, and guide them toward conversions with human-like precision.\\n\\nBoost Sales\\nConvert High-Intent Buyers in Minutes\\n\\nYour AI Sales Agents handle objections, recommend products, and move prospects through the funnel faster — boosting sales up to 20×.\\n\\n24/7 Customer Support\\nInstant Answers. Real Conversations. Zero Wait.\\n\\nProvide around-the-clock support with AI Agents that understand context, resolve issues, and offer human-level service—without human costs.\\n\\nTry ${storeName} Free\\nSet Up Your Business with ${storeName}'s AI\\nChatbot Solutions\\n\\n${storeName} offers advanced AI chatbot solutions that transform how you interact with your customers and streamline your business processes.\\n\\nEfficient Automation\\n\\nAutomate tasks and interactions to enhance productivity and user engagement.\\n\\nBrand Aligned\\n\\nConfigure chatbot interactions to align with your brand’s personality.\\n\\nSeamless Integration\\n\\nConnects with over 400 apps, integrating effortlessly with your existing systems.\\n\\nYour AI Agents Handle the Work — So Your Team Can Focus on Growth\\n\\nAutomate conversations, actions, and workflows across the entire customer journey — reducing workload, cutting support costs, and boosting performance instantly.\\n\\nBuilt-in CRM\\n\\nStay organized and productive with a CRM that’s part of your chat platform. No extra tools, no switching tabs — just smarter selling.\\n\\nExplore more\\nBuilt-in Omnichannel\\n\\nFrom DMs to live chat, engage customers consistently across every touchpoint with one integrated solution.\\n\\nExplore more\\nBuilt-in MCP\\n\\nScope AI actions with precision — whether it’s sending updates, scheduling meetings, or managing integrations — all within ${storeName}.\\n\\nExplore more\\n\\nHow ${storeName} Works\\n\\nImprove Productivity with ${storeName}'s\\n\\n${storeName}'s uses advanced AI technology to automate and streamline your business interactions. Here’s how it typically works:\\n\\n01 -Train Your Agents\\nUpload and organize your knowledge sources — from files and plain text to website URLs or Notion pages. Our platform lets your AI agents learn directly from your business content, so they can accurately answer questions, follow your brand voice, and deliver reliable responses every time.\\n02 -Connect Your Channels\\n03 -Set Up Your Workflows\\nSee ${storeName} AI Agents in Action\\n\\nReal businesses using autonomous AI Agents to convert leads, boost sales, and automate support.\\n\\nAI Chatbot for Pet Grooming | Smarter Bookings & Happier Pets\\nThe Ultimate Chatbot for Fitness Studios & Gyms :weight_lifter: | Boost Sign-ups & Retention\\n${storeName} AI for Printing Shops :printer: | Smart Chatbot Demo for Faster Orders & Happier Customers\\nBuild an AI Chatbot for Dental Clinics | ${storeName} Demo for Bright Smile Dental :tooth::robot_face:\\nBuild Your Fashion Chatbot with AI | Automate Sales & Customer Support\\nAI Chatbot for Cleaning Services | Automate Bookings & Customer Support :robot_face::sparkles:\\nTalk to Experts\\nNot Sure Where to Start?\\nOur experts will help you design the perfect omnichannel strategy for your business Free consultation, no commitment required\\nTalk to an Expert\\n\\nProvide instant, accurate assistance to your users, reducing response times and enhancing satisfaction.\\n\\nQuick Links\\nBook a Consultation\\nUses Guide\\nPrivacy Policy\\nTerms of Service\\nCookie Policy\\nGDPR\\nData Processing Agreement\\nContact\\n${storeName}, LLC\\n1111B S Governors Ave STE 25390\\nDover, DE 19904\\nEmail: support@rubikchat.com\\nFollow Us\\n© 2026 ${storeName}. All rights reserved.","size":4843,"is_deleted":false,"is_fetched":true}]`);
    agentForm.append('agentType', 'website');
    agentForm.append('instructions', `You are the professional AI assistant for ${storeName}.
1. Role & Identity
- You are the official AI assistant representing ${storeName}.
- You act as the primary digital contact for all user inquiries.
- Your primary goal: provide accurate information, answer questions, and guide users to take action.
2. Tone & Style
- Professional, clear, and respectful at all times.
- Use proper grammar and complete sentences.
- Avoid slang, humor, or overly casual language.
- Use bullet points or numbered steps when presenting multiple items.
3. Opening Behavior
- When a user sends their FIRST message or greeting (e.g., "hi", "hello"), you MUST:
  a) Greet them warmly.
  b) Introduce yourself: "I am your AI assistant for ${storeName}."
  c) Briefly state what you can help with.
  d) Ask how you can assist them today.
4. Grounding & Accuracy
- You MUST ONLY answer factual questions based on the provided knowledge base and enabled tools.
- If a factual question is NOT in your knowledge base or tools, say: "I don't have that information right now, but I'd be happy to connect you with our team."
- Never guess, fabricate, or assume factual information.
- Avoid off-topic discussions unrelated to ${storeName} and its services.
- IMPORTANT: Short conversational replies like "ok", "yes", "sure", "great", "sounds good", "proceed", "go ahead" are NOT questions. They are confirmations. Always treat them as the user agreeing to continue — never respond with "I can't help with that". Instead, continue guiding the user through the next step of the current workflow.
5. Conversation Best Practices
- Always respond in the same language the user is writing in.
- You are encouraged to use relevant emojis to make the conversation engaging and friendly.
- After completing any task, ask: "Is there anything else I can help you with?"
- If a user seems stuck or confused, proactively offer guidance.
- Keep responses concise — avoid walls of text unless the user asks for detail.
5. About ${storeName}
${storeName} | Autonomous AI Agents for Customer Support, Sales and Marketing`);
    agentForm.append('temperature', '0');
    agentForm.append('llm', 'gpt-4o-mini');
    agentForm.append('initial_messages', '["Welcome :wave: I\'m here to help you explore our website, services, and answers to your questions."]');
    agentForm.append('suggested_messages', '[]');
    agentForm.append('theme', 'light');
    agentForm.append('is_streaming', '1');
    agentForm.append('color', '#4f46e5');
    agentForm.append('header_color', '');
    agentForm.append('newFilesData', '[]');
    agentForm.append('botName', storeName);
    agentForm.append('businessType', '{"label":"Other","value":"Other","type":"other"}');

    try {
      const createAgentRes = await axios.post(`https://api-proxy-v1.rubikchat.com/api/chatbots/train-chatbot/${storeSlug}`, agentForm, {
        headers: {
          ...agentForm.getHeaders(),
          Authorization: `Bearer ${token}`
        }
      });

      const agentId = createAgentRes.data?.data?._id || createAgentRes.data?.agent_id || createAgentRes.data?._id || createAgentRes.data?.chatbot_id;

      if (agentId) {
        await prisma.rubikchat_agents.create({
          data: {
            organization_id: orgRecord.id,
            agent_id: agentId.toString(),
          }
        });
      } else {
        console.log('Agent created but no agent_id returned. Response:', createAgentRes.data);
      }
    } catch (agentErr: any) {
      console.error('Failed to create agent:', agentErr.response?.data || agentErr.message);
      // We don't fail the whole request because the user is registered and logged in successfully.
    }

    return res.json({ success: true, message: 'RubikChat connected successfully' });
  } catch (error: any) {
    console.error('RubikChat setup error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Internal server error during RubikChat setup' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`RubikChat Phase 3 Node API is running on port ${PORT}`);
});
