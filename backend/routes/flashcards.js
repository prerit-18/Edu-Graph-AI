const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/authRequired');
const learnerStateTool = require('../tools/learner_state_tool');

const CURATED_FLASHCARDS = [
  {
    id: 'fc_01',
    subject: 'Operating Systems',
    topic_id: 'os_scheduling',
    type: 'formula',
    front: 'Turnaround Time & Waiting Time Formulas',
    back: '• Turnaround Time (TAT) = Completion Time - Arrival Time\n• Waiting Time (WT) = Turnaround Time - Burst Time\n• In preemptive scheduling, keep cumulative track of execution segments in the Gantt chart.'
  },
  {
    id: 'fc_02',
    subject: 'Operating Systems',
    topic_id: 'os_deadlock',
    type: 'condition',
    front: 'Four Coffman Conditions for Deadlock',
    back: '1. Mutual Exclusion (non-shareable resources)\n2. Hold and Wait (process holds at least 1 resource while waiting for another)\n3. No Preemption (resources cannot be forcibly taken)\n4. Circular Wait (closed loop of waiting processes)'
  },
  {
    id: 'fc_03',
    subject: 'Operating Systems',
    topic_id: 'os_virtual_mem',
    type: 'trap',
    front: 'Belady\'s Anomaly — What is it and when does it occur?',
    back: '• Phenomenon where increasing number of allocated page frames leads to MORE page faults.\n• Occurs in FIFO page replacement.\n• DOES NOT occur in stack algorithms like LRU or Optimal.'
  },
  {
    id: 'fc_04',
    subject: 'Algorithms',
    topic_id: 'algo_asymptotic',
    type: 'formula',
    front: 'Master Theorem for T(n) = a*T(n/b) + f(n)',
    back: 'Compare f(n) with n^(log_b a):\n1. f(n) = O(n^(log_b a - ε)) => T(n) = Θ(n^(log_b a))\n2. f(n) = Θ(n^(log_b a) * log^k n) => T(n) = Θ(n^(log_b a) * log^(k+1) n)\n3. f(n) = Ω(n^(log_b a + ε)) and regular => T(n) = Θ(f(n))'
  },
  {
    id: 'fc_05',
    subject: 'Algorithms',
    topic_id: 'algo_shortest_paths',
    type: 'trap',
    front: 'Dijkstra vs Bellman-Ford on Negative Edges',
    back: '• Dijkstra assumes edge weights >= 0 and fails with negative edges.\n• Bellman-Ford handles negative edge weights in O(V * E) time and can detect negative weight cycles.'
  },
  {
    id: 'fc_06',
    subject: 'Database Management Systems',
    topic_id: 'dbms_normalization',
    type: 'definition',
    front: 'Normal Forms Hierarchy & Conditions (1NF -> BCNF)',
    back: '• 1NF: Atomic values only, no repeating groups.\n• 2NF: 1NF + No partial dependency (no non-prime attribute depends on subset of candidate key).\n• 3NF: 2NF + No transitive dependency (for X->Y, X is superkey OR Y is prime).\n• BCNF: For every non-trivial X->Y, X MUST be a superkey.'
  },
  {
    id: 'fc_07',
    subject: 'Database Management Systems',
    topic_id: 'dbms_transactions',
    type: 'definition',
    front: 'Strict Two-Phase Locking (Strict 2PL)',
    back: '• Phase 1 (Growing): Locks acquired, none released.\n• Phase 2 (Shrinking): Locks released.\n• Strict 2PL Rule: All EXCLUSIVE (write) locks must be held until COMMIT/ABORT.\n• Guarantees: Conflict Serializability + Cascadelessness.'
  }
];

/**
 * GET /api/flashcards
 */
router.get('/', optionalAuth, (req, res) => {
  let cards = [...CURATED_FLASHCARDS];
  const subject = req.query.subject;

  if (subject && subject !== 'All') {
    cards = cards.filter(c => c.subject.toLowerCase() === subject.toLowerCase());
  }

  // If user is authenticated, prioritize flashcards on their weak topics
  if (req.user?.id) {
    const weak = learnerStateTool.getWeakTopics(req.user.id);
    const weakTopicIds = new Set(weak.map(w => w.topic_id));
    cards.sort((a, b) => {
      const aWeak = weakTopicIds.has(a.topic_id) ? 1 : 0;
      const bWeak = weakTopicIds.has(b.topic_id) ? 1 : 0;
      return bWeak - aWeak;
    });
  }

  res.json({
    total: cards.length,
    flashcards: cards
  });
});

module.exports = router;
