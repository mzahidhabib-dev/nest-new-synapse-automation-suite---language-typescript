const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

async function run() {
  // 1. Get or create tenant
  let tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    tenant = await prisma.tenant.create({ data: { name: 'Test Tenant' } });
  }

  // 2. Get or create user
  const email = 'testuser2@example.com';
  let user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    const hash = await bcrypt.hash('password', 10);
    user = await prisma.user.create({ data: { email, passwordHash: hash, tenantId: tenant.id } });
  }

  // 3. Login
  const loginRes = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password', tenantId: tenant.id })
  });
  const loginData = await loginRes.json();
  const token = loginData.access_token;
  console.log('Got token:', !!token);

  // 4. Create Session
  const sessRes = await fetch('http://localhost:3000/rag/sessions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const sessData = await sessRes.json();
  const sessionId = sessData.id;
  console.log('Got session:', sessionId);

  // 5. Chat Stream
  console.log('Sending chat stream request...');
  const chatRes = await fetch('http://localhost:3000/rag/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ query: 'Hello!', sessionId })
  });
  console.log('Chat Status:', chatRes.status);
  
  const reader = chatRes.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (value) console.log('CHUNK:', decoder.decode(value));
    if (done) break;
  }
}
run().catch(console.error);
