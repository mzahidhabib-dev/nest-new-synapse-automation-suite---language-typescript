/**
 * Phase 2 Integration Test
 * Tests the RAG endpoints: Get Documents, Chat, Get Chat History
 */
require('dotenv').config();

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, label) {
    if (condition) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.error(`  ❌ ${label}`);
      failed++;
    }
  }

  // ── Test 1: Get Documents ───────────────────────────────────────────────
  console.log('\n📋 Test 1: Get Documents');
  try {
    const res = await fetch(`${BASE_URL}/rag/documents`);
    const docs = await res.json();
    assert(Array.isArray(docs), `Returns an array of documents (got ${typeof docs})`);
    if (docs.length > 0) {
      assert('id' in docs[0], 'Document has an ID');
      assert('filename' in docs[0], 'Document has a filename');
    } else {
      console.log('  ⚠️  No documents found in DB. Upload one to test fully.');
    }
  } catch (e) {
    assert(false, `Request failed: ${e.message}`);
  }

  // ── Test 2: RAG Chat ────────────────────────────────────────────────────
  console.log('\n📋 Test 2: RAG Chat');
  try {
    const res = await fetch(`${BASE_URL}/rag/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Hello, what information do you have?' })
    });
    const chatRes = await res.json();
    
    assert(res.status === 200 || res.status === 201, `Returns 2xx (got ${res.status})`);
    assert(typeof chatRes.answer === 'string', `Response has an answer string: "${chatRes.answer.substring(0, 50)}..."`);
    assert(Array.isArray(chatRes.sourceChunkIds), `Response has sourceChunkIds array`);
    assert(typeof chatRes.sessionId === 'string', `Response has sessionId`);
  } catch (e) {
    assert(false, `Request failed: ${e.message}`);
  }

  // ── Test 3: Get Chat History ────────────────────────────────────────────
  console.log('\n📋 Test 3: Get Chat History');
  try {
    const res = await fetch(`${BASE_URL}/rag/chat/default-session`);
    const history = await res.json();
    
    assert(res.status === 200, `Returns 2xx (got ${res.status})`);
    assert(Array.isArray(history), `Returns an array of messages`);
    if (history.length > 0) {
      assert('role' in history[0], 'Message has a role');
      assert('content' in history[0], 'Message has content');
    }
  } catch (e) {
    assert(false, `Request failed: ${e.message}`);
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
}

runTests().catch(e => {
  console.error('\nFatal error:', e.message);
  process.exit(1);
});
