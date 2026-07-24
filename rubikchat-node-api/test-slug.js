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

    const agentForm = new FormData();
    agentForm.append('website', '[{"url":"https://example.com","content":"Test Content"}]');
    agentForm.append('agentType', 'website');
    agentForm.append('instructions', `Test.`);
    agentForm.append('botName', `Test`);

    try {
      const res = await axios.post(`https://api-proxy-v1.rubikchat.com/api/chatbots/train-chatbot/totally-fake-slug-123`, agentForm, {
        headers: { ...agentForm.getHeaders(), Authorization: `Bearer ${token}` }
      });
      console.log('Created successfully:', JSON.stringify(res.data, null, 2));
    } catch (e) {
      console.error('Failed API Call:', e.response?.data || e.message);
    }
  } catch (err) {
    console.error('Failed login:', err.message);
  }
}
main();
