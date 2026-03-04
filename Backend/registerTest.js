// node-fetch v3 is ESM; import default via .default
const fetch = require('node-fetch').default;

(async () => {
  try {
    const res = await fetch('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'admin1', email: 'admin1@example.com', password: 'password' })
    });
    console.log('status', res.status);
    console.log(await res.text());
  } catch (err) {
    console.error(err);
  }
})();