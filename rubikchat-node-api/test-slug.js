const axios = require('axios');
const FormData = require('form-data');

async function main() {
  const loginForm = new FormData();
  loginForm.append('email', 'hassanx1@gmail.com');
  loginForm.append('password', '2qr0f6back');

  try {
    const loginResponse = await axios.post('https://api-proxy-v1.rubikchat.com/api/login', loginForm, {
      headers: loginForm.getHeaders(),
    });
    const token = loginResponse.data.token;
    
    const storeName = 'Rubikchat Test Store';
    const storeUrl = 'rubikchat-test-store.myshopify.com';
    const organizationSlug = 'rubikchat-test-storemyshopifycom-1';

    const formData = new FormData();
    const websiteData = [{ url: `https://${storeUrl}`, content: 'Test Content', is_deleted: false, is_fetched: true }];
    formData.append('website', JSON.stringify(websiteData));
    formData.append('agentType', 'website');
    formData.append('instructions', `You are the professional AI assistant for ${storeName}.`);
    formData.append('botName', `${storeName} Assistant`);
    formData.append('llm', 'gpt-4o-mini');
    formData.append('is_streaming', '1');
    formData.append('temperature', '0'); // Added just in case
    
    // I will add the organization_id field just in case they expect it in the body too!
    const orgId = loginResponse.data.user.organization_id;
    formData.append('organization_id', orgId);

    try {
      // Testing with the URL slug
      const res = await axios.post(`https://api-proxy-v1.rubikchat.com/api/chatbots/train-chatbot/${organizationSlug}`, formData, {
        headers: { ...formData.getHeaders(), Authorization: `Bearer ${token}` }
      });
      console.log('Created successfully with slug:', JSON.stringify(res.data, null, 2));
      return;
    } catch (e) {
      console.error('Failed API Call with slug:', e.response?.data || e.message);
    }

    try {
      // Testing with orgId in the URL just in case
      const res = await axios.post(`https://api-proxy-v1.rubikchat.com/api/chatbots/train-chatbot/${orgId}`, formData, {
        headers: { ...formData.getHeaders(), Authorization: `Bearer ${token}` }
      });
      console.log('Created successfully with org ID in URL:', JSON.stringify(res.data, null, 2));
    } catch (e) {
      console.error('Failed API Call with org ID:', e.response?.data || e.message);
    }
  } catch (err) {
    console.error('Failed login:', err.message);
  }
}
main();
