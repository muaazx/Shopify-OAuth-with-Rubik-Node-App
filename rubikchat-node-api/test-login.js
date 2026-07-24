const axios = require('axios');
const FormData = require('form-data');

async function main() {
  const loginForm = new FormData();
  // Using the credentials I saw in the DB earlier
  loginForm.append('email', 'hassanx1@gmail.com');
  loginForm.append('password', '2qr0f6back');

  try {
    const loginResponse = await axios.post('https://api-proxy-v1.rubikchat.com/api/login', loginForm, {
      headers: loginForm.getHeaders(),
    });
    console.log(JSON.stringify(loginResponse.data, null, 2));
  } catch (err) {
    console.error('Login failed:', err.response?.data || err.message);
  }
}
main();
