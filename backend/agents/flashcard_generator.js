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
  },

  // 6. EXPANDED CURATED SYLLABUS CARDS (ALL 27 TOPICS COVERAGE)
  {
    id: 'fc_algo_05',
    subject: 'Algorithms',
    topic_id: 'algo_divide_conquer',
    type: 'formula',
    front: 'Divide & Conquer Recurrences: QuickSort vs MergeSort & Inversion Count',
    back: '• MergeSort: T(n) = 2T(n/2) + Θ(n) ⟹ Θ(n log n) in all cases (Best, Avg, Worst). Stable sort.\n• QuickSort: Best/Avg T(n) = 2T(n/2) + Θ(n) ⟹ Θ(n log n). Worst case (sorted input + extremal pivot): T(n) = T(n-1) + Θ(n) ⟹ Θ(n²).\n• Inversion Count: Counting pairs (i, j) with i < j and A[i] > A[j] solved via modified MergeSort in O(n log n).'
  },
  {
    id: 'fc_algo_06',
    subject: 'Algorithms',
    topic_id: 'algo_greedy',
    type: 'definition',
    front: 'Huffman Coding Optimal Prefix Codes & Greedy Choice Property',
    back: '• Huffman Coding creates optimal prefix-free variable-length binary codes based on symbol frequencies.\n• Tree Construction: Uses a Min-Heap. Extracts 2 minimum frequency nodes repeatedly and merges them (Time: O(n log n)).\n• If symbol frequencies are powers of 2 or Fibonacci numbers, tree shape degenerates into a linear skewed chain.\n• Greedy Choice: Local optimal symbol pairing yields global optimal weighted path length (WPL).'
  },
  {
    id: 'fc_compiler_04',
    subject: 'Compiler Design',
    topic_id: 'compiler_lexical',
    type: 'trap',
    front: 'Lexical Analysis: Maximal Munch Rule & DFA State Minimization',
    back: '• Maximal Munch (Longest Match): The lexer always consumes the longest prefix matching any valid token regular expression.\n• Priority Rule: If two token regexes match the exact same longest prefix, the rule declared first takes precedence (e.g. keyword "if" vs identifier "if").\n• Hopcroft\'s DFA Minimization: Partitions states into equivalence classes. Time complexity O(k · n log n).'
  },
  {
    id: 'fc_os_05',
    subject: 'Operating Systems',
    topic_id: 'os_process_ipc',
    type: 'formula',
    front: 'fork() System Call Process Tree Formula & PCB vs TCB State',
    back: '• For n consecutive unconditional fork() calls: Total processes created = 2ⁿ (1 parent + (2ⁿ - 1) child processes).\n• Process vs Thread:\n  - Processes share no memory by default; separate address spaces and PCB.\n  - Threads of the same process share: Code segment, Data segment, Open file descriptors, Heap.\n  - Threads have private: Thread Control Block (TCB), Program Counter (PC), Register set, and Stack.'
  },
  {
    id: 'fc_os_06',
    subject: 'Operating Systems',
    topic_id: 'os_storage',
    type: 'complexity',
    front: 'Disk Scheduling (SCAN / C-SCAN / LOOK) & UNIX Inode File Addressing',
    back: '• SCAN (Elevator): Head moves in one direction servicing requests until boundary, then reverses.\n• C-SCAN (Circular SCAN): Moves in one direction servicing requests; jumps back to opposite end without servicing on return trip (provides uniform waiting time).\n• UNIX Inode: Contains direct block pointers (usually 12), single indirect, double indirect, and triple indirect pointers. Max file size = (Direct + (Block/Ptr) + (Block/Ptr)² + (Block/Ptr)³) × Block Size.'
  },
  {
    id: 'fc_dbms_04',
    subject: 'Databases',
    topic_id: 'dbms_er_relational',
    type: 'definition',
    front: 'Weak Entity Sets, Partial Keys & Relational Schema Reduction',
    back: '• Weak Entity: An entity set lacking sufficient attributes to form a primary key on its own. Depends on an Identifying (Owner) Entity via an Identifying Relationship.\n• Primary Key of Weak Entity = (Primary Key of Owner Entity) + (Partial Key / Discriminator of Weak Entity).\n• Table Reduction: A 1:N relationship can be merged into the N-side entity table by adding the 1-side primary key as a foreign key.'
  },
  {
    id: 'fc_dbms_05',
    subject: 'Databases',
    topic_id: 'dbms_rel_algebra_sql',
    type: 'trap',
    front: 'Relational Algebra Division Operator (R ÷ S) & NULL Traps in SQL',
    back: '• Division Operator (R ÷ S): Expresses "FOR ALL" queries (e.g. students enrolled in ALL courses).\n  Formally: R ÷ S = π_{R-S}(R) - π_{R-S}((π_{R-S}(R) × S) - R).\n• NULL in SQL:\n  - WHERE condition = NULL evaluates to UNKNOWN (treated as FALSE in WHERE clause filters).\n  - COUNT(*) counts all rows including NULLs; COUNT(column) ignores NULL values.\n  - Arithmetic operations with NULL (e.g. salary + NULL) yield NULL.'
  },
  {
    id: 'fc_cn_04',
    subject: 'Computer Networks',
    topic_id: 'cn_layering_switching',
    type: 'formula',
    front: 'Transmission Delay vs Propagation Delay & Bandwidth-Delay Product (BDP)',
    back: '• Transmission Delay (T_tx): Time to push all bits of packet onto physical wire = L / B (Packet Length / Bandwidth).\n• Propagation Delay (T_prop): Time for 1 bit to travel across physical medium = d / v (Distance / Propagation Speed).\n• Bandwidth-Delay Product (BDP): BDP = Bandwidth × T_prop (measures maximum bits in transit in the pipe).\n• Queueing Delay & Processing Delay depend on router congestion and header parsing.'
  },
  {
    id: 'fc_cn_05',
    subject: 'Computer Networks',
    topic_id: 'cn_routing',
    type: 'trap',
    front: 'Distance Vector Routing (Count-to-Infinity) vs Link State Routing (OSPF)',
    back: '• Distance Vector (Bellman-Ford / RIP): Routers exchange vectors only with direct neighbors. Prone to Count-to-Infinity on link failures. Mitigated by Split Horizon, Poison Reverse, and Hop Count Cap (16 in RIP).\n• Link State (Dijkstra / OSPF): Every router floods link state advertisements (LSA) to entire network, then independently runs Dijkstra algorithm to compute shortest path tree. Faster convergence, no count-to-infinity.'
  },
  {
    id: 'fc_cn_06',
    subject: 'Computer Networks',
    topic_id: 'cn_application_dns_http',
    type: 'protocol',
    front: 'Recursive vs Iterative DNS Resolution & HTTP/1.1 vs HTTP/2',
    back: '• DNS Resolution:\n  - Recursive: Contacted server assumes full burden of fetching mapping by querying next servers.\n  - Iterative: Contacted server replies with IP address of next authority server; local resolver continues queries.\n• HTTP Evolutions:\n  - HTTP/1.0: 1 TCP connection per object (non-persistent).\n  - HTTP/1.1: Persistent connections + Pipelining (suffers from Head-of-Line blocking at application layer).\n  - HTTP/2: Binary framing, full multiplexing over a single TCP stream, header compression (HPACK).'
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

  getKnowledgeBank() {
    return [...SYLLABUS_KNOWLEDGE_BANK];
  }
}

module.exports = new DailyFlashcardGenerator();
