const fs = require('fs');
const path = require('path');
const llmClient = require('./llm_client');
const learnerStateTool = require('../tools/learner_state_tool');

const CACHE_FILE = path.resolve(__dirname, '../../data/daily_flashcards_cache.json');
const SYLLABUS_PATH = path.resolve(__dirname, '../../data/syllabus/syllabus.json');

// In-Memory Flashcard Knowledge Bank (5 Core Subjects: Algorithms, Compiler Design, OS, DBMS, Computer Networks)
const SYLLABUS_KNOWLEDGE_BANK = [
  // 1. ALGORITHMS
  {
    id: 'fc_algo_01',
    subject: 'Algorithms',
    topic_id: 'algo_asymptotic',
    type: 'formula',
    front: 'Master Theorem for Divide & Conquer Recurrences: T(n) = a·T(n/b) + f(n)',
    back: 'Let c = log_b(a). Compare f(n) with n^c:\n• Case 1: f(n) = O(n^(c - ε)) for ε > 0 ⟹ T(n) = Θ(n^c)\n• Case 2: f(n) = Θ(n^c · log^k n) for k ≥ 0 ⟹ T(n) = Θ(n^c · log^(k+1) n)\n• Case 3: f(n) = Ω(n^(c + ε)) for ε > 0 and regularity holds ⟹ T(n) = Θ(f(n))\n> ⚠️ IIT Trap: Master theorem fails if a is not constant or gap is non-polynomial (e.g. 2^n).'
  },
  {
    id: 'fc_algo_02',
    subject: 'Algorithms',
    topic_id: 'algo_graphs_mst_shortest_paths',
    type: 'complexity',
    front: 'Dijkstra vs Bellman-Ford vs Floyd-Warshall Comparison',
    back: '• Dijkstra: Single source, non-negative weights only. Min-Heap time: O((V + E) log V).\n• Bellman-Ford: Single source, handles negative weights & detects negative cycles. Time: O(V · E).\n• Floyd-Warshall: All-pairs shortest path, DP dynamic matrix. Time: Θ(V³).\n• DAG Shortest Path: Topological Sort + Edge relaxation. Time: O(V + E) (handles negative weights!).'
  },
  {
    id: 'fc_algo_03',
    subject: 'Algorithms',
    topic_id: 'algo_dp',
    type: 'definition',
    front: '0/1 Knapsack vs Fractional Knapsack Algorithmic Paradigms',
    back: '• Fractional Knapsack: Solved via GREEDY strategy (sort by Value/Weight ratio). Time: O(n log n).\n• 0/1 Knapsack: Items cannot be split. Solved via DYNAMIC PROGRAMMING. Time: O(n · W) (Pseudo-polynomial; NP-Complete in general).\n• Longest Common Subsequence (LCS): DP time O(m · n), space O(min(m, n)).'
  },
  {
    id: 'fc_algo_04',
    subject: 'Algorithms',
    topic_id: 'algo_searching_sorting_hashing',
    type: 'complexity',
    front: 'Comparison-Based Sorting Theoretical Bounds & Hashing Collisions',
    back: '• Any comparison sort requires Ω(n log n) comparisons in the worst case (decision tree height log2(n!) ≈ n log2(n)).\n• QuickSort: Best/Avg O(n log n), Worst O(n²) (already sorted with extremal pivot).\n• Open Addressing with Linear Probing suffers from Primary Clustering.'
  },

  // 2. COMPILER DESIGN
  {
    id: 'fc_compiler_01',
    subject: 'Compiler Design',
    topic_id: 'compiler_parsing',
    type: 'hierarchy',
    front: 'Parser Expressive Power & Table Size Hierarchy',
    back: '• Expressive Power Hierarchy:\n  LR(0) ⊂ SLR(1) ⊂ LALR(1) ⊂ CLR(1) / LR(1)\n  Top-down: LL(1) ⊂ LR(1)\n• Number of Parsing States in Tables:\n  State Count: LR(0) = SLR(1) = LALR(1) < CLR(1)\n• LALR(1) merges states with identical core items in CLR(1). Merging NEVER creates Shift-Reduce conflicts, but CAN create Reduce-Reduce conflicts!'
  },
  {
    id: 'fc_compiler_02',
    subject: 'Compiler Design',
    topic_id: 'compiler_sdt_codegen',
    type: 'definition',
    front: 'S-Attributed vs L-Attributed Syntax-Directed Definitions (SDDs)',
    back: '• S-Attributed Definition:\n  - Uses ONLY Synthesized attributes (computed from children in parse tree).\n  - Evaluated Bottom-Up during LR parsing.\n• L-Attributed Definition:\n  - Allows Synthesized AND restricted Inherited attributes.\n  - An inherited attribute of node X_j can depend ONLY on: Parent attribute, or left siblings (X_1, ..., X_{j-1}).\n  - Evaluated in a single Top-Down Depth-First left-to-right pass.'
  },
  {
    id: 'fc_compiler_03',
    subject: 'Compiler Design',
    topic_id: 'compiler_optimization_dataflow',
    type: 'definition',
    front: 'Data Flow Analysis: Constant Propagation & Liveness Analysis',
    back: '• Constant Propagation: Forward data-flow analysis finding variables with constant values at compile time.\n• Liveness Analysis: Backward data-flow analysis checking if variable x is used before being redefined along some execution path (used in register allocation).\n• Common Subexpression Elimination: Removes duplicate evaluations of identical expressions using DAGs.'
  },

  // 3. OPERATING SYSTEMS
  {
    id: 'fc_os_01',
    subject: 'Operating Systems',
    topic_id: 'os_scheduling',
    type: 'formula',
    front: 'Turnaround Time, Waiting Time & Preemption Invariants',
    back: '• Turnaround Time (TAT) = Completion Time - Arrival Time (CT - AT)\n• Waiting Time (WT) = Turnaround Time - Burst Time (TAT - BT)\n• Response Time (RT) = Time when process first gets CPU - AT\n• In SRTF (Preemptive SJF), ties in remaining burst are broken by arrival time/PID.\n• Round Robin with quantum q → ∞ degenerates to FCFS.'
  },
  {
    id: 'fc_os_02',
    subject: 'Operating Systems',
    topic_id: 'os_sync',
    type: 'condition',
    front: 'Critical Section 3 Gold Invariants & Peterson\'s Solution',
    back: '1. Mutual Exclusion (Mandatory): Only 1 process inside CS at a time.\n2. Progress (Mandatory): Selection of who enters next is decided only by processes not in remainder.\n3. Bounded Waiting (Fairness): Finite bound on entries allowed to others after request.\n• Peterson\'s uses flag[i]=true and turn=j (courtesy variable) to satisfy all 3 for 2 processes.'
  },
  {
    id: 'fc_os_03',
    subject: 'Operating Systems',
    topic_id: 'os_deadlock',
    type: 'formula',
    front: 'Banker\'s Algorithm & Deadlock Freedom Condition',
    back: '• 4 Coffman Conditions: Mutual Exclusion, Hold & Wait, No Preemption, Circular Wait.\n• Deadlock-Free Guarantee: For n processes each needing at most k resource instances from m total resources, system is deadlock-free if:\n  m ≥ n · (k - 1) + 1\n• Safe State ⟹ No Deadlock. Unsafe State ⇏ Deadlock (only potential deadlock).'
  },
  {
    id: 'fc_os_04',
    subject: 'Operating Systems',
    topic_id: 'os_virtual_mem',
    type: 'trap',
    front: 'Belady\'s Anomaly & Effective Memory Access Time (EMAT)',
    back: '• Belady\'s Anomaly: Increasing allocated frames causes MORE page faults (occurs in FIFO, NEVER in LRU or OPT stack algorithms).\n• EMAT with TLB:\n  EMAT = h · (t_TLB + t_RAM) + (1 - h) · (t_TLB + (k + 1) · t_RAM)\n  where h = TLB hit ratio, k = number of page table levels.'
  },

  // 4. DATABASES (DBMS)
  {
    id: 'fc_dbms_01',
    subject: 'Databases',
    topic_id: 'dbms_normalization',
    type: 'hierarchy',
    front: 'Relational Normal Forms (1NF → BCNF) & Lossless Decompositions',
    back: 'For functional dependency X → Y in relation R:\n• 1NF: Atomic attribute values.\n• 2NF: 1NF + No partial dependency (non-prime depends on subset of candidate key).\n• 3NF: 2NF + For every X → Y, X is Superkey OR Y is Prime attribute.\n• BCNF: For every non-trivial X → Y, X MUST be a Superkey.\n• Lossless Join Condition: (R1 ∩ R2) → R1 OR (R1 ∩ R2) → R2 (Common attribute is a superkey of R1 or R2).'
  },
  {
    id: 'fc_dbms_02',
    subject: 'Databases',
    topic_id: 'dbms_transactions',
    type: 'protocol',
    front: 'Conflict Serializability & Two-Phase Locking (2PL Variants)',
    back: '• Conflict Serializable ⟺ Precedence Graph has NO directed cycles.\n• Basic 2PL: Growing Phase (acquire locks) + Shrinking Phase (release locks). Guarantees Serializability; prone to cascading aborts and deadlocks.\n• Strict 2PL: Holds Exclusive (write) locks until COMMIT/ABORT. Guarantees conflict serializability + Avoids Cascading Aborts (ACA).\n• Rigorous 2PL: Holds ALL locks until Commit.'
  },
  {
    id: 'fc_dbms_03',
    subject: 'Databases',
    topic_id: 'dbms_indexing',
    type: 'formula',
    front: 'B-Tree & B+ Tree Node Capacity and Fanout Calculations',
    back: 'For node size P bytes, block pointer B bytes, record pointer R bytes, key size K bytes:\n• B+ Tree Internal Node: n · K + (n + 1) · B ≤ P ⟹ Max keys = n\n• B+ Tree Leaf Node: m · (K + R) + B ≤ P (leaf nodes contain record pointers & next-leaf pointer)\n• Min keys in B+ Tree Internal node = ⌈(n+1)/2⌉ - 1; Root has at least 1 key.'
  },

  // 5. COMPUTER NETWORKS
  {
    id: 'fc_cn_01',
    subject: 'Computer Networks',
    topic_id: 'cn_datalink_mac',
    type: 'formula',
    front: 'CSMA/CD Minimum Frame Size & Sliding Window Efficiency',
    back: '• CSMA/CD Minimum Frame Length: L ≥ 2 · T_prop · Bandwidth = 2 · (Distance / v) · B\n• Stop-and-Wait Efficiency: η = 1 / (1 + 2a) where a = T_prop / T_trans\n• Go-Back-N Efficiency: η = N / (1 + 2a) (Sender Window = N, Receiver Window = 1)\n• Selective Repeat Efficiency: η = N / (1 + 2a) (Sender Window = N, Receiver Window = N; Max N = 2^(k-1) for k sequence bits).'
  },
  {
    id: 'fc_cn_02',
    subject: 'Computer Networks',
    topic_id: 'cn_network_ipv4',
    type: 'formula',
    front: 'IPv4 Subnetting, CIDR & Fragmentation Offset Rules',
    back: '• CIDR /n notation: Subnet Mask has n leading 1s. Usable host IPs = 2^(32 - n) - 2 (subtract Network ID and Broadcast ID).\n• IPv4 Fragmentation Offset: Measured in 8-byte units! Offset = (Original Byte Position) / 8.\n• More Fragments (MF) flag = 1 for all fragments except the last one (MF = 0).'
  },
  {
    id: 'fc_cn_03',
    subject: 'Computer Networks',
    topic_id: 'cn_transport_tcp',
    type: 'protocol',
    front: 'TCP Congestion Control Phases: Slow Start, AIMD & Fast Recovery',
    back: '• Slow Start: Congestion Window (cwnd) doubles every RTT (exponential growth) until cwnd reaches ssthresh.\n• Congestion Avoidance: cwnd increases by 1 MSS per RTT (linear additive increase, AIMD).\n• Timeout Occurs: ssthresh = cwnd / 2, cwnd resets to 1 MSS (Slow start restarts).\n• 3 Duplicate ACKs (Fast Retransmit): ssthresh = cwnd / 2, cwnd = ssthresh + 3 MSS (Fast Recovery, avoids dropping to 1).'
  }
];

function createPrng(seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(31, h) + seedStr.charCodeAt(i) | 0;
  }
  let s = h;
  return function() {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

class DailyFlashcardGenerator {
  constructor() {
    this.cache = this.loadCache();
    this.syllabus = this.loadSyllabus();
  }

  loadCache() {
    if (fs.existsSync(CACHE_FILE)) {
      try {
        return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      } catch (e) {
        return {};
      }
    }
    return {};
  }

  saveCache() {
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2), 'utf8');
    } catch (e) {
      console.warn('Could not save flashcards cache:', e.message);
    }
  }

  loadSyllabus() {
    if (fs.existsSync(SYLLABUS_PATH)) {
      try {
        return JSON.parse(fs.readFileSync(SYLLABUS_PATH, 'utf8'));
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  /**
   * Generates a dynamic daily deck using Google Gemini when available, with automatic caching & fallback
   */
  async getDailyDeck({ dateStr, subject = 'All', userId = null, count = 10, seed = null, forceRefresh = false }) {
    const todayStr = dateStr || new Date().toISOString().slice(0, 10);
    const cacheKey = `${todayStr}_${subject}_${seed || 'daily'}_${count}`;

    // Return cached deck if valid and not forced to refresh
    if (!forceRefresh && this.cache[cacheKey] && this.cache[cacheKey].flashcards?.length === count) {
      return this.cache[cacheKey];
    }

    // 1. Attempt Dynamic Synthesis via Google Gemini LLM
    if (llmClient.hasValidKey()) {
      try {
        const geminiDeck = await this.synthesizeWithGemini({
          todayStr,
          subject,
          userId,
          count
        });

        if (geminiDeck && geminiDeck.flashcards && geminiDeck.flashcards.length > 0) {
          this.cache[cacheKey] = geminiDeck;
          this.saveCache();
          return geminiDeck;
        }
      } catch (err) {
        console.warn('[Gemini Flashcard Warning] Falling back to dynamic procedural deck:', err.message);
      }
    }

    // 2. Procedural Dynamic Syllabus Rotation (Fallback / Offline)
    const proceduralDeck = this.getProceduralDeck({
      todayStr,
      subject,
      userId,
      count,
      seed
    });

    this.cache[cacheKey] = proceduralDeck;
    this.saveCache();
    return proceduralDeck;
  }

  /**
   * Prompts Gemini to generate fresh, unique syllabus-grounded flashcards for the day
   */
  async synthesizeWithGemini({ todayStr, subject = 'All', userId = null, count = 10 }) {
    // Select relevant topics from syllabus for today's generation prompt
    let targetSubjects = this.syllabus;
    if (subject && subject !== 'All') {
      targetSubjects = this.syllabus.filter(s => s.subject.toLowerCase() === subject.toLowerCase());
    }
    if (targetSubjects.length === 0) targetSubjects = this.syllabus;

    // Pick topics across subjects
    const topicsToCover = [];
    for (const sub of targetSubjects) {
      for (const t of sub.topics) {
        topicsToCover.push({ subject: sub.subject, topic_id: t.id, name: t.name, desc: t.description, pyq_weight: t.pyq_weight || 0.85 });
      }
    }

    // Incorporate weak topics if student has prior attempts
    let weakTopicsList = [];
    if (userId) {
      try {
        const weak = learnerStateTool.getWeakTopics(userId);
        weakTopicsList = weak.map(w => w.topic_id);
      } catch (e) {}
    }

    // Deterministic PRNG sampling based on date + subject so every day is a fresh curated batch
    const prng = createPrng(`${todayStr}_${subject}_gemini_deck`);
    const sampledTopics = topicsToCover
      .map(t => {
        let weight = prng() * t.pyq_weight;
        if (weakTopicsList.includes(t.topic_id)) weight += 1.0;
        return { t, weight };
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, Math.min(10, topicsToCover.length))
      .map(x => `[${x.t.subject}] ${x.t.name}: ${x.t.desc}`)
      .join('\n- ');

    const systemPrompt = `You are the Principal GATE CSE Examination Strategist & Flashcard Creator.
Your task is to generate exactly ${count} high-yield, conceptually rigorous, and deeply engaging flashcards strictly grounded in the official GATE CSE syllabus for date ${todayStr}.

CARD DESIGN REQUIREMENTS:
- Formula Cards: Exact equations, invariant properties, and computational formulas (e.g. Master Theorem, EMAT with TLB, CSMA/CD frame size, Catalan numbers).
- Trap Cards: Common subtle exam pitfalls and edge-case gotchas set by IIT paper setters.
- Complexity & Comparison Cards: Algorithmic time/space bounds and protocol trade-offs.
- Definition & Theorem Cards: Clean, precise definitions, Rice's theorem, closure properties, normal forms.
- Front: Active recall question, tricky conceptual problem, or invariant challenge.
- Back: Concise, bulleted breakdown with formulas, definitions, and exam trap alerts.`;

    const userPrompt = `Target Scope: "${subject}"
Topics from Official GATE Syllabus to generate cards for:
- ${sampledTopics}

Generate exactly ${count} distinct, masterclass-quality flashcards distributed across these topics.`;

    const flashcardSchema = {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          subject: { type: "STRING" },
          topic_id: { type: "STRING" },
          type: { type: "STRING", enum: ["formula", "trap", "theorem", "complexity", "protocol", "definition"] },
          front: { type: "STRING" },
          back: { type: "STRING" }
        },
        required: ["subject", "topic_id", "type", "front", "back"]
      }
    };

    const responseText = await llmClient.generate({
      systemPrompt,
      userPrompt,
      temperature: 0.4,
      jsonMode: true,
      responseSchema: flashcardSchema
    });

    if (!responseText) return null;

    let parsed = null;
    try {
      const cleaned = responseText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed) && parsed.flashcards && Array.isArray(parsed.flashcards)) {
        parsed = parsed.flashcards;
      }
    } catch (parseErr) {
      console.warn('Could not parse Gemini flashcard JSON:', parseErr.message);
      return null;
    }

    if (Array.isArray(parsed) && parsed.length > 0) {
      const finalCards = parsed.slice(0, count).map((card, idx) => ({
        id: card.id || `fc_gemini_${Date.now()}_${idx}`,
        subject: card.subject || subject,
        topic_id: card.topic_id || 'core_syllabus',
        type: card.type || 'formula',
        front: card.front,
        back: card.back
      }));

      return {
        date: todayStr,
        source: 'Google Gemini (Live Syllabus Synthesis)',
        aiGenerated: true,
        subject,
        total: finalCards.length,
        flashcards: finalCards
      };
    }

    return null;
  }

  /**
   * Procedural Dynamic Syllabus Rotation (Deterministic PRNG with date seed)
   */
  getProceduralDeck({ todayStr, subject = 'All', userId = null, count = 10, seed = null }) {
    const activeSeed = seed || `${todayStr}_gate_cse_deck`;
    const prng = createPrng(activeSeed);

    let pool = [...SYLLABUS_KNOWLEDGE_BANK];

    if (subject && subject !== 'All') {
      pool = pool.filter(c => c.subject.toLowerCase() === subject.toLowerCase());
      if (pool.length === 0) pool = [...SYLLABUS_KNOWLEDGE_BANK];
    }

    let weakTopicIds = new Set();
    if (userId) {
      try {
        const weak = learnerStateTool.getWeakTopics(userId);
        weakTopicIds = new Set(weak.map(w => w.topic_id));
      } catch (e) {}
    }

    const shuffled = pool.map(item => {
      let score = prng();
      if (weakTopicIds.has(item.topic_id)) {
        score += 1.5;
      }
      return { item, score };
    }).sort((a, b) => b.score - a.score).map(x => x.item);

    const selected = [];
    const subjectsCount = {};

    for (const card of shuffled) {
      if (selected.length >= count) break;
      const subj = card.subject;
      subjectsCount[subj] = (subjectsCount[subj] || 0);
      if (subject === 'All' && subjectsCount[subj] >= 2 && selected.length < (count - 2)) {
        continue;
      }
      selected.push(card);
      subjectsCount[subj]++;
    }

    if (selected.length < count) {
      for (const card of shuffled) {
        if (selected.length >= count) break;
        if (!selected.includes(card)) selected.push(card);
      }
    }

    return {
      date: todayStr,
      source: 'Syllabus Knowledge Base (PRNG Rotation)',
      aiGenerated: false,
      seed: activeSeed,
      subject,
      total: selected.length,
      availablePool: pool.length,
      flashcards: selected
    };
  }

  /**
   * On-demand Custom Topic Flashcard Synthesis
   */
  async generateAIFlashcards({ subject = 'Operating Systems', topicId, query, count = 3 }) {
    if (!llmClient.hasValidKey()) {
      return this.getProceduralDeck({ todayStr: new Date().toISOString().slice(0, 10), subject, count });
    }

    const systemPrompt = `You are the GATE CSE Flashcard Master.
Generate ${count} crisp, high-yield, engaging flashcards for the GATE CSE syllabus covering formulas, exam traps, and definitions.`;

    const userPrompt = `Subject: "${subject}", Topic/Query: "${query || topicId || subject}". Generate ${count} flashcards.`;

    const flashcardSchema = {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          subject: { type: "STRING" },
          topic_id: { type: "STRING" },
          type: { type: "STRING", enum: ["formula", "trap", "theorem", "complexity", "protocol", "definition"] },
          front: { type: "STRING" },
          back: { type: "STRING" }
        },
        required: ["subject", "topic_id", "type", "front", "back"]
      }
    };

    try {
      const raw = await llmClient.generate({
        systemPrompt,
        userPrompt,
        temperature: 0.4,
        jsonMode: true,
        responseSchema: flashcardSchema
      });
      if (raw) {
        const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return {
            date: new Date().toISOString().slice(0, 10),
            source: 'Google Gemini (Custom Request)',
            aiGenerated: true,
            total: parsed.length,
            flashcards: parsed.map((c, i) => ({ id: c.id || `fc_ai_${Date.now()}_${i}`, ...c }))
          };
        }
      }
    } catch (err) {
      console.warn('AI Flashcard generation error:', err.message);
    }

    return this.getProceduralDeck({ todayStr: new Date().toISOString().slice(0, 10), subject, count });
  }
}

module.exports = new DailyFlashcardGenerator();
