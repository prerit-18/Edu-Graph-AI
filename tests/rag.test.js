const assert = require('assert');
const { retrieve, GROUNDING_THRESHOLD } = require('../backend/rag/retriever');

console.log('--- Testing RAG & Grounding System ---');

// 1. In-domain concept retrieval
const q1 = 'Explain CPU Scheduling and Round Robin turnaround time';
const r1 = retrieve(q1);
console.log(`Query: "${q1}" => Grounded: ${r1.isGrounded}, Confidence: ${r1.confidence}`);
assert(r1.isGrounded === true, 'In-domain GATE concept should be grounded');
assert(r1.results.length > 0, 'Results should not be empty');
assert(r1.citations.length > 0, 'Citations should be present');
assert(r1.results.some(res => res.metadata.topic_id === 'os_scheduling'), 'Should match os_scheduling');

// 2. Specific PYQ topic retrieval
const q2 = "Belady's Anomaly and FIFO page replacement";
const r2 = retrieve(q2);
console.log(`Query: "${q2}" => Grounded: ${r2.isGrounded}, Confidence: ${r2.confidence}`);
assert(r2.isGrounded === true, 'Belady anomaly query should be grounded');
assert(r2.results.some(res => res.metadata.topic_id === 'os_virtual_mem'), 'Should match os_virtual_mem');

// 3. Out-of-domain query grounding check
const q3 = 'How to cook delicious pasta with marinara sauce recipe';
const r3 = retrieve(q3);
console.log(`Query: "${q3}" => Grounded: ${r3.isGrounded}, Confidence: ${r3.confidence}`);
assert(r3.isGrounded === false, 'Out-of-domain query MUST NOT be grounded');
assert(r3.refusalReason !== null, 'Refusal reason must be provided');
console.log('Refusal message:', r3.refusalReason);

console.log('All RAG tests passed successfully!');
