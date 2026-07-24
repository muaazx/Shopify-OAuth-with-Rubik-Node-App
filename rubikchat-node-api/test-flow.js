const axios = require('axios');
const FormData = require('form-data');

async function main() {
  const registerForm = new FormData();
  const random = Math.floor(Math.random() * 10000);
  const storeName = `Test Store ${random}`;
  const storeUrl = `teststore${random}.myshopify.com`;
  
  registerForm.append('name', storeName);
  registerForm.append('email', `testuser${random}@example.com`);
  registerForm.append('password', 'password123');
  registerForm.append('company_name', storeName);
  registerForm.append('domain', storeUrl);

  try {
    const res = await axios.post('https://api-proxy-v1.rubikchat.com/api/wps/register', registerForm, {
      headers: registerForm.getHeaders(),
    });
    console.log('Register successful');
    
    // The exact slug returned by the backend!
    const exactSlug = res.data.organization.url;
    
    const loginForm = new FormData();
    loginForm.append('email', `testuser${random}@example.com`);
    loginForm.append('password', 'password123');
    
    const loginRes = await axios.post('https://api-proxy-v1.rubikchat.com/api/login', loginForm, {
      headers: loginForm.getHeaders(),
    });
    const token = loginRes.data.token;
    
    // Now create the agent
    const formData = new FormData();
    formData.append('website', JSON.stringify([{ url: storeUrl, content: 'Test content', is_deleted: false, is_fetched: true, size: 12 }]));
    formData.append('agentType', 'website');
    formData.append('instructions', `You are the professional AI assistant for ${storeName}.`);
    formData.append('botName', `${storeName} Assistant`);
    formData.append('llm', 'gpt-4o-mini');
    formData.append('is_streaming', '1');

    console.log(`Sending to /train-chatbot/${exactSlug}`);
    try {
      const createRes = await axios.post(`https://api-proxy-v1.rubikchat.com/api/chatbots/train-chatbot/${exactSlug}`, formData, {
        headers: { ...formData.getHeaders(), Authorization: `Bearer ${token}` }
      });
      console.log('Created successfully:', JSON.stringify(createRes.data, null, 2));
    } catch (e) {
      console.error('Failed API Call:', e.response?.data || e.message);
    }

  } catch (err) {
    console.error('Failed:', err.response?.data || err.message);
  }
}
main();
