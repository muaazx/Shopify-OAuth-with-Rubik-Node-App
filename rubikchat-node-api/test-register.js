const axios = require('axios');
const FormData = require('form-data');

async function main() {
  const registerForm = new FormData();
  const random = Math.floor(Math.random() * 10000);
  registerForm.append('name', `Test Store ${random}`);
  registerForm.append('email', `testuser${random}@example.com`);
  registerForm.append('password', 'password123');
  registerForm.append('company_name', `Test Store ${random}`);
  registerForm.append('domain', `my-awesome_store.myshopify.com!`);

  try {
    const res = await axios.post('https://api-proxy-v1.rubikchat.com/api/wps/register', registerForm, {
      headers: registerForm.getHeaders(),
    });
    console.log('Returned URL (slug):', res.data.organization.url);
  } catch (err) {
    console.error('Register failed:', err.response?.data || err.message);
  }
}
main();
