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

    // Try to fetch user info or organizations
    const orgsResponse = await axios.get('https://api-proxy-v1.rubikchat.com/api/user/organizations', {
      headers: { Authorization: `Bearer ${token}` }
    }).catch(e => e.response);

    console.log('Organizations:', JSON.stringify(orgsResponse?.data, null, 2));
    
    // Also try /api/organizations
    const orgsResponse2 = await axios.get('https://api-proxy-v1.rubikchat.com/api/organizations', {
      headers: { Authorization: `Bearer ${token}` }
    }).catch(e => e.response);
    console.log('Organizations 2:', JSON.stringify(orgsResponse2?.data, null, 2));
    
  } catch (err) {
    console.error('Failed:', err.message);
  }
}
main();
