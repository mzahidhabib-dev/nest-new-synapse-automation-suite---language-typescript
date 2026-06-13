async function test() {
  console.log('Fetching...');
  const res = await fetch('http://localhost:3000/rag/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'Hello', sessionId: 'test-node-session' })
  });
  console.log('Status:', res.status);
  
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while(true) {
    const {done, value} = await reader.read();
    if (value) {
      console.log('CHUNK:', decoder.decode(value));
    }
    if (done) break;
  }
}
test();
