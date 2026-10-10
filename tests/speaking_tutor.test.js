const assert = require('assert');
const http = require('http');
const app = require('../backend/app');
const db = require('../backend/database/db');
const { normalizeEducationalTextForSpeech, normalizeFormula, splitTextIntoSpeechChunks } = require('../backend/services/text_normalizer');
const { EducationalTextNormalizer, TutorSpeechService } = require('../frontend/tutor_speech');

let server;
let baseUrl;

function post(endpoint, data, token) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data || {});
    const url = new URL(endpoint, baseUrl);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(url, { method: 'POST', headers }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function get(endpoint, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, baseUrl);
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(url, { method: 'GET', headers }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runSpeakingTutorTests() {
  console.log('--- Testing Realistic AI Speaking Tutor End-to-End ---');

  await new Promise(resolve => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Test 1: GET /api/tts/config returns tutor avatar metadata & speeds
  console.log('Test 1: Verifying /api/tts/config endpoint...');
  const configRes = await get('/api/tts/config');
  assert.strictEqual(configRes.status, 200);
  assert(configRes.data.avatar, 'Avatar metadata must be returned');
  assert.strictEqual(configRes.data.avatar.name, 'Arya');
  assert(configRes.data.avatar.image.includes('tutor_avatar.jpg'), 'Must link to tutor avatar image');
  assert.deepStrictEqual(configRes.data.playback.speedOptions, [0.75, 1.0, 1.25, 1.5]);
  console.log('✓ Test 1 Passed: /api/tts/config returned tutor configuration');

  // Test 2: Text normalization removes Markdown, code blocks, tables, citations
  console.log('Test 2: Verifying Markdown, table, and code block stripping...');
  const sampleMarkdown = `
### 📘 Operating Systems ➔ CPU SCHEDULING
*Masterclass conceptual overview.*
**Space Complexity:** O(1).
**Time Complexity:** O(n).
* Key takeaway for GATE.
---
\`\`\`c
int wt = tat - bt;
\`\`\`
| Algorithm | Time |
| :--- | :--- |
| FCFS | O(n) |

> ⚠️ **IIT Paper-Setter Trap:** Watch out for arrival times!
[Source: Silberschatz OS Concepts]
`;

  const normRes = await post('/api/tts/normalize', { text: sampleMarkdown });
  assert.strictEqual(normRes.status, 200);
  assert(!normRes.data.normalizedText.includes('###'), 'Must strip Markdown ###');
  assert(!normRes.data.normalizedText.includes('```'), 'Must strip raw code block syntax');
  assert(!normRes.data.normalizedText.includes('| Algorithm |'), 'Must replace Markdown table with audio summary');
  assert(!normRes.data.normalizedText.includes('[Source:'), 'Must strip citation brackets');
  assert(normRes.data.normalizedText.includes('Space Complexity: Big O of 1'), 'Bold space complexity converted cleanly without times times');
  assert(normRes.data.normalizedText.includes('Time Complexity: Big O of n'), 'Bold time complexity converted cleanly without times times');
  assert(!normRes.data.normalizedText.includes('times times'), 'Must NOT speak asterisks as times times');
  assert(normRes.data.normalizedText.includes('Operating Systems: CPU SCHEDULING.'), 'Preserves clean section headers');
  console.log('✓ Test 2 Passed: Markdown, tables, citations, and asterisks sanitized without times-times artifacts');

  // Test 3: Mathematical Formula Normalization
  console.log('Test 3: Verifying GATE CSE formula normalization to spoken words...');
  const formulaSample = 'Formulas: $TAT = CT - AT$, $WT = TAT - BT$, asymptotic $O(n \\log n)$, $\\Theta(n^2)$, $T(n) = a*T(n/b) + f(n)$, $2^n$, $|V| = 10$.';
  const normFormula = normalizeEducationalTextForSpeech(formulaSample);
  assert(normFormula.includes('Turnaround Time equals Completion Time minus Arrival Time'), 'TAT formula expanded');
  assert(normFormula.includes('Waiting Time equals Turnaround Time minus Burst Time'), 'WT formula expanded');
  assert(normFormula.includes('Big O of n log n'), 'Big O notation expanded');
  assert(normFormula.includes('Theta of n squared'), 'Theta notation expanded');
  assert(normFormula.includes('T of n equals a times T of n over b plus f of n'), 'Master theorem expanded');
  assert(normFormula.includes('two to the power of n'), 'Exponents expanded');
  assert(normFormula.includes('number of vertices equals 10'), 'Graph cardinality expanded');
  console.log('✓ Test 3 Passed: GATE CSE mathematical formulas converted into natural speech');

  // Test 4: Chunking splits long educational text without cutting words
  console.log('Test 4: Verifying speech chunking for long paragraphs...');
  const longText = 'CPU scheduling is the process by which the operating system allocates CPU execution time to ready processes. When multiple jobs arrive simultaneously, the scheduler uses algorithms such as Shortest Job First or Round Robin to optimize turnaround time and minimize waiting time. Aging is an essential mechanism that prevents process starvation in priority queues.';
  const chunks = splitTextIntoSpeechChunks(longText, 150);
  assert(chunks.length >= 2, 'Long text should be split into multiple chunks');
  chunks.forEach(chunk => {
    assert(chunk.length <= 180, `Chunk length (${chunk.length}) should not exceed threshold`);
    assert(chunk.trim().length > 0, 'Chunks should not be empty');
  });
  console.log(`✓ Test 4 Passed: Split into ${chunks.length} speech chunks safely`);

  // Test 5: Client-Side Normalizer consistency
  console.log('Test 5: Verifying client-side EducationalTextNormalizer parity...');
  const clientNorm = EducationalTextNormalizer.normalize('$TAT = CT - AT$ and $O(n \\log n)$');
  assert(clientNorm.includes('Turnaround Time equals Completion Time minus Arrival Time'));
  assert(clientNorm.includes('Big O of n log n'));
  console.log('✓ Test 5 Passed: Client-side normalizer matches backend specifications');

  // Test 6: POST /api/tts/speak input validation & response
  console.log('Test 6: Verifying POST /api/tts/speak payload handling...');
  const emptyRes = await post('/api/tts/speak', { text: '' });
  assert.strictEqual(emptyRes.status, 400);

  const validSpeakRes = await post('/api/tts/speak', { text: 'Peterson algorithm guarantees mutual exclusion.', speed: 1.25 });
  assert.strictEqual(validSpeakRes.status, 200);
  assert.strictEqual(validSpeakRes.data.provider, 'browser');
  assert.strictEqual(validSpeakRes.data.speed, 1.25);
  assert(validSpeakRes.data.normalizedText.includes('Peterson algorithm'));
  assert(validSpeakRes.data.chunks.length > 0);
  console.log('✓ Test 6 Passed: /api/tts/speak validated input and returned synthesis payload');

  // Test 7: Speech playback causes ZERO side-effects (No BKT update, no attempt added)
  console.log('Test 7: Verifying audio playback produces NO BKT or database side-effects...');
  const initialMasteryCount = db.prepare('SELECT count(*) as count FROM mastery').get().count;
  const initialAttemptsCount = db.prepare('SELECT count(*) as count FROM attempts').get().count;

  // Simulate multiple speech requests for an explanation
  await post('/api/tts/speak', { text: 'Turnaround time calculation explanation' });
  await post('/api/tts/normalize', { text: 'Feedback explanation text' });

  const afterMasteryCount = db.prepare('SELECT count(*) as count FROM mastery').get().count;
  const afterAttemptsCount = db.prepare('SELECT count(*) as count FROM attempts').get().count;

  assert.strictEqual(initialMasteryCount, afterMasteryCount, 'Mastery records must NOT change on speech playback');
  assert.strictEqual(initialAttemptsCount, afterAttemptsCount, 'Attempt records must NOT change on speech playback');
  console.log('✓ Test 7 Passed: Speech playback is strictly presentational with zero BKT side-effects');

  // Test 8: State machine simulation (idle -> speaking -> paused -> speaking -> idle)
  console.log('Test 8: Simulating TutorSpeechService state transitions...');
  global.SpeechSynthesisUtterance = class MockUtterance {
    constructor(text) { this.text = text; }
  };

  let lastRecordedState = 'idle';
  const mockSynth = {
    speak: () => {},
    cancel: () => {},
    pause: () => {},
    resume: () => {},
    getVoices: () => [{ name: 'Google US English', lang: 'en-US' }]
  };

  const service = new TutorSpeechService();
  service.synth = mockSynth;
  service.addListener((data) => {
    lastRecordedState = data.state;
  });

  service.speak('Testing speech state machine');
  assert.strictEqual(service.state, 'speaking');
  assert.strictEqual(lastRecordedState, 'speaking');

  service.pause();
  assert.strictEqual(service.state, 'paused');
  assert.strictEqual(lastRecordedState, 'paused');

  service.resume();
  assert.strictEqual(service.state, 'speaking');

  service.stop();
  assert.strictEqual(service.state, 'idle');
  assert.strictEqual(lastRecordedState, 'idle');
  console.log('✓ Test 8 Passed: State machine transitions (idle -> speaking -> paused -> idle) verified');

  server.close();
  console.log('======================================================');
  console.log('🎉 All 8 AI Speaking Tutor Tests Passed Successfully!');
  console.log('======================================================');
}

runSpeakingTutorTests().catch(err => {
  console.error('Speaking Tutor test failed:', err);
  if (server) server.close();
  process.exit(1);
});
