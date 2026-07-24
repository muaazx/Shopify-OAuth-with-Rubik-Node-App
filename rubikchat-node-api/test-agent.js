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
    console.log('Token:', token);

    // Try creating agent using organization_id
    const agentForm = new FormData();
    agentForm.append('website', '[{"url":"https://rubikchat-test-store.myshopify.com","content":"test"}]');
    agentForm.append('agentType', 'website');
    agentForm.append('instructions', 'Test');
    agentForm.append('temperature', '0');
    agentForm.append('llm', 'gpt-4o-mini');
    agentForm.append('botName', 'Test Assistant');
    
    const orgId = loginResponse.data.user.organization_id;

    // Test with org id
    try {
      const res = await axios.post(`https://api-proxy-v1.rubikchat.com/api/chatbots/train-chatbot/${orgId}`, agentForm, {
        headers: { ...agentForm.getHeaders(), Authorization: `Bearer ${token}` }
      });
      console.log('Created with Org ID:', JSON.stringify(res.data, null, 2));
      return;
    } catch (e) {
      console.error('Failed with Org ID:', e.response?.data || e.message);
    }
    
    // If that fails, test with user id
    const userId = loginResponse.data.user.id;
    try {
      const res = await axios.post(`https://api-proxy-v1.rubikchat.com/api/chatbots/train-chatbot/${userId}`, agentForm, {
        headers: { ...agentForm.getHeaders(), Authorization: `Bearer ${token}` }
      });
      console.log('Created with User ID:', JSON.stringify(res.data, null, 2));
      return;
    } catch (e) {
      console.error('Failed with User ID:', e.response?.data || e.message);
    }
  } catch (err) {
    console.error('Failed login:', err.message);
  }
}
main();
