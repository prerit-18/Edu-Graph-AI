const http = require('http');
const app = require('../backend/app');

function startServer() {
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` }));
  });
}

function request(baseUrl, method, endpoint, data, token) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(new URL(endpoint, baseUrl), { method, headers }, res => {
      let out = '';
      res.on('data', c => (out += c));
      res.on('end', () => { let d = out; try { d = JSON.parse(out); } catch (e) { /* non-JSON */ } resolve({ status: res.statusCode, data: d }); });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function signup(baseUrl, label = 'user') {
  const email = `${label}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
  const r = await request(baseUrl, 'POST', '/api/auth/signup', { name: label, email, password: 'password123' });
  if (r.status !== 201) throw new Error('signup failed: ' + JSON.stringify(r));
  return { token: r.data.token, id: r.data.user.id, email };
}

module.exports = { startServer, request, signup };
