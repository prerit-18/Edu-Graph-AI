const ragTool = require('../tools/rag_tool');
const pyqTool = require('../tools/pyq_tool');
const bktTool = require('../tools/bkt_tool');
const syllabusTool = require('../tools/syllabus_tool');
const math = require('mathjs');
const { tokenize } = require('../rag/embeddings');
const learnerStateTool = require('../tools/learner_state_tool');
const llmClient = require('./llm_client');
const db = require('../database/db');
const crypto = require('crypto');
const agentPrompts = require('../services/agent_prompts');
const MAX_RECALL_ATTEMPTS = 3;

/**
 * Active Recall Agent
 * Role: GATE CSE Active Recall Specialist & Socratic Evaluator
 * Goal: Formulate evidence-based conceptual recall probes dynamically using Gemini & RAG,
 *       evaluate understanding semantically, update Bayesian Knowledge Tracing (BKT) deterministically,
 *       and recommend adaptive follow-ups.
 */
class ActiveRecallAgent {
  constructor() {
    this.role = 'Active Recall Agent';
    this.goal = 'Challenge learner memory with open-ended, formula, and conceptual recall prompts dynamically generated with Gemini, evaluate understanding against verified rubrics, and update BKT.';
    this.backstory = 'Cognitive retrieval specialist who trains GATE CSE aspirants to actively pull deep conceptual knowledge from memory rather than passively recognizing multiple choice options.';
    this.tools = [learnerStateTool, ragTool, bktTool];
  }

  /**
   * Curated high-yield prompt bank across all 5 core GATE CSE subjects (all 26 topics)
   */
  getPromptsRepository() {
    return {
      // ==========================================
      // 1. ALGORITHMS
      // ==========================================
      algo_asymptotic: [
        {
          type: 'formula_recall',
          difficulty: 'medium',
          question: 'State the Master Theorem recurrence formulation T(n) = a*T(n/b) + f(n). What are the three standard cases comparing f(n) with n^(log_b a), and what is the resulting time complexity for Case 2 when f(n) = Theta(n^(log_b a))?',
          referenceAnswer: 'The Master Theorem solves recurrences of the form T(n) = a*T(n/b) + f(n) where a >= 1, b > 1. Case 1: If f(n) = O(n^(log_b a - epsilon)), then T(n) = Theta(n^(log_b a)). Case 2: If f(n) = Theta(n^(log_b a)), then T(n) = Theta(n^(log_b a) * log n). Case 3: If f(n) = Omega(n^(log_b a + epsilon)) and regularity condition holds, then T(n) = Theta(f(n)).',
          keyConcepts: ['case 2', 'log_b a', 'theta(n^(log_b a) * log n)', 'recurrence'],
          rubric: 'Full marks for stating all 3 cases and correctly writing Case 2 complexity as Theta(n^(log_b a) * log n).',
          citations: [{ source: 'CLRS Introduction to Algorithms', topic: 'Recurrences & Master Theorem' }]
        },
        {
          type: 'concept_recall',
          difficulty: 'easy',
          question: 'Explain the formal mathematical difference between Big-O, Big-Omega, and Big-Theta asymptotic notations. Which one provides an asymptotically tight bound?',
          referenceAnswer: 'Big-O denotes an asymptotic upper bound (f(n) <= c*g(n) for n >= n0). Big-Omega denotes an asymptotic lower bound (f(n) >= c*g(n) for n >= n0). Big-Theta denotes an asymptotically tight bound (c1*g(n) <= f(n) <= c2*g(n)), holding simultaneously from above and below.',
          keyConcepts: ['upper bound', 'lower bound', 'tight bound', 'theta', 'big-o', 'omega'],
          rubric: 'Must state upper bound for O, lower bound for Omega, and tight bound for Theta.',
          citations: [{ source: 'CLRS Introduction to Algorithms', topic: 'Asymptotic Notation' }]
        }
      ],
      algo_searching_sorting_hashing: [
        {
          type: 'concept_recall',
          difficulty: 'medium',
          question: 'Why is the lower bound for any comparison-based sorting algorithm Omega(n log n)? How does Counting Sort achieve linear O(n+k) time?',
          referenceAnswer: 'Any comparison sort can be modeled as a decision tree with n! leaves. The height of a binary tree with n! leaves is at least log2(n!) = Omega(n log n). Counting Sort achieves O(n+k) because it is non-comparison based and uses direct arithmetic indexing into an auxiliary frequency array.',
          keyConcepts: ['decision tree', 'n! leaves', 'log(n!)', 'omega(n log n)', 'non-comparison', 'frequency array'],
          rubric: 'Must explain decision tree height with n! leaves and non-comparison direct indexing for Counting Sort.',
          citations: [{ source: 'CLRS Introduction to Algorithms', topic: 'Sorting Lower Bounds' }]
        },
        {
          type: 'compare_contrast',
          difficulty: 'medium',
          question: 'Compare Open Addressing (Linear Probing) and Separate Chaining for hash table collision resolution under high load factors (alpha > 1).',
          referenceAnswer: 'Open Addressing stores all elements directly within the table array, so load factor alpha cannot exceed 1; as alpha approaches 1, primary clustering degrades lookup time to O(n). Separate Chaining maintains linked lists outside the table array, gracefully supporting alpha > 1 with expected lookup time Theta(1 + alpha).',
          keyConcepts: ['open addressing', 'separate chaining', 'load factor', 'alpha > 1', 'clustering', 'linked lists'],
          rubric: 'Must explain that open addressing fails when alpha > 1 due to clustering, while chaining handles alpha > 1 with linked lists.',
          citations: [{ source: 'CLRS Introduction to Algorithms', topic: 'Hashing Collision Resolution' }]
        }
      ],
      algo_divide_conquer: [
        {
          type: 'trace_predict',
          difficulty: 'hard',
          question: 'In Quick Sort using the first element as the pivot, what happens to the recursion tree and time complexity when the input array is already sorted in ascending order? How does Randomized Quick Sort prevent this?',
          referenceAnswer: 'When already sorted, choosing the first element creates maximally unbalanced partitions of sizes 0 and n-1 at each step. The recursion depth becomes n, leading to worst-case time complexity of O(n^2). Randomized Quick Sort chooses a random pivot uniformly at random, making the expected running time O(n log n) regardless of input ordering.',
          keyConcepts: ['unbalanced partition', 'o(n^2)', 'worst case', 'randomized pivot', 'o(n log n)'],
          rubric: 'Must explain unbalanced 0 and n-1 partitions causing O(n^2) and uniform pivot selection achieving expected O(n log n).',
          citations: [{ source: 'CLRS Introduction to Algorithms', topic: 'Quick Sort Partitioning' }]
        }
      ],
      algo_greedy: [
        {
          type: 'concept_recall',
          difficulty: 'medium',
          question: 'Explain the Greedy-Choice Property and Optimal Substructure. Why does the Greedy strategy yield an optimal solution for Fractional Knapsack but fail for 0/1 Knapsack?',
          referenceAnswer: 'Greedy-choice property allows a locally optimal choice to lead to a globally optimal solution. Optimal substructure means an optimal solution contains optimal subproblem solutions. In Fractional Knapsack, items can be subdivided so sorting by value-to-weight ratio guarantees 100% capacity utilization. In 0/1 Knapsack, item indivisibility can leave empty unused capacity, requiring dynamic programming.',
          keyConcepts: ['greedy-choice', 'optimal substructure', 'fractional knapsack', 'value-to-weight ratio', 'indivisibility', '0/1 knapsack'],
          rubric: 'Must define both properties and contrast fractional item divisibility vs 0/1 indivisibility.',
          citations: [{ source: 'CLRS Introduction to Algorithms', topic: 'Greedy Strategy' }]
        }
      ],
      algo_dp: [
        {
          type: 'formula_recall',
          difficulty: 'hard',
          question: 'State the recurrence relation for the 0/1 Knapsack Problem: DP[i][w] representing the maximum value considering the first i items with capacity limit w.',
          referenceAnswer: 'If weight of item i > w: DP[i][w] = DP[i-1][w]. If weight wt[i] <= w: DP[i][w] = max(DP[i-1][w], val[i] + DP[i-1][w - wt[i]]). Base condition: DP[0][w] = 0 and DP[i][0] = 0.',
          keyConcepts: ['dp[i][w]', 'max(dp[i-1][w], val[i] + dp[i-1][w - wt[i]])', 'weight', 'capacity', 'base condition'],
          rubric: 'Must state both cases: when item exceeds capacity and when taking max of including vs excluding item.',
          citations: [{ source: 'CLRS Introduction to Algorithms', topic: 'Dynamic Programming Knapsack' }]
        }
      ],
      algo_graphs_mst_shortest_paths: [
        {
          type: 'compare_contrast',
          difficulty: 'medium',
          question: 'Compare Dijkstra\'s Algorithm and Bellman-Ford Algorithm for single-source shortest paths. Why does Dijkstra fail on graphs with negative weight edges, and how does Bellman-Ford detect negative weight cycles?',
          referenceAnswer: 'Dijkstra uses a greedy strategy assuming once a node is extracted from the priority queue its distance is finalized; negative edges violate this optimal substructure and cause Dijkstra to fail. Bellman-Ford relaxes all edges |V|-1 times and works with negative edge weights. If a further relaxation in the |V|-th iteration still reduces distance, a negative weight cycle is detected.',
          keyConcepts: ['greedy', 'negative edge', 'bellman-ford', 'v-1 relaxations', 'negative weight cycle'],
          rubric: 'Must explain why greedy choice fails with negative weights and how V-th iteration detects negative cycles.',
          citations: [{ source: 'CLRS Introduction to Algorithms', topic: 'Graph Shortest Paths' }]
        }
      ],

      // ==========================================
      // 2. COMPILER DESIGN
      // ==========================================
      compiler_lexical: [
        {
          type: 'concept_recall',
          difficulty: 'medium',
          question: 'In lexical analysis, state the two primary disambiguation rules used when a substring matches multiple token definitions or regular expressions.',
          referenceAnswer: '1. Longest Match (Maximal Munch Rule): The lexer chooses the token corresponding to the longest prefix matching any pattern. 2. Priority Rule (First Declared Rule): If multiple regular expressions match the exact same longest prefix, the rule declared first in the grammar/specification takes precedence.',
          keyConcepts: ['longest match', 'maximal munch', 'priority', 'precedence', 'first declared'],
          rubric: 'Must identify Longest Match / Maximal Munch and Rule Priority / Precedence.',
          citations: [{ source: 'Aho & Ullman Compilers (Dragon Book)', topic: 'Lexical Analysis' }]
        }
      ],
      compiler_parsing: [
        {
          type: 'short_answer',
          difficulty: 'hard',
          question: 'What is the structural hierarchy of LR parsers in increasing order of parsing power: SLR(1), LR(0), CLR(1), LALR(1)? What type of conflict can arise when merging states in LALR(1)?',
          referenceAnswer: 'Power hierarchy: LR(0) < SLR(1) < LALR(1) < CLR(1). When merging states with identical LR(0) cores to form LALR(1), Reduce-Reduce (R-R) conflicts may be introduced, but Shift-Reduce (S-R) conflicts are never created.',
          keyConcepts: ['lr(0) < slr(1) < lalr(1) < clr(1)', 'reduce-reduce conflict', 'r-r conflict', 'identical cores'],
          rubric: 'Must list correct power order and specify that merging cores can introduce Reduce-Reduce conflicts only.',
          citations: [{ source: 'Aho & Ullman Compilers (Dragon Book)', topic: 'LR Parsing' }]
        }
      ],
      compiler_sdt_codegen: [
        {
          type: 'compare_contrast',
          difficulty: 'medium',
          question: 'Compare S-attributed definitions and L-attributed definitions in Syntax-Directed Translation. Which evaluation order is required for each?',
          referenceAnswer: 'S-attributed definitions use only synthesized attributes (computed from children in parse tree) and can be evaluated bottom-up during LR parsing. L-attributed definitions allow synthesized attributes and restricted inherited attributes (from parent or left siblings only) and are evaluated in a single depth-first left-to-right (L-R) pass.',
          keyConcepts: ['s-attributed', 'l-attributed', 'synthesized', 'inherited', 'left-to-right', 'bottom-up'],
          rubric: 'Must state S-attributed has synthesized only with bottom-up traversal; L-attributed allows left-sibling inherited attributes with depth-first traversal.',
          citations: [{ source: 'Aho & Ullman Compilers (Dragon Book)', topic: 'Syntax-Directed Translation' }]
        }
      ],
      compiler_optimization_dataflow: [
        {
          type: 'concept_recall',
          difficulty: 'medium',
          question: 'Define a Basic Block in code optimization. What are the two rules for identifying leaders that partition three-address code into basic blocks?',
          referenceAnswer: 'A Basic Block is a sequence of consecutive three-address instructions where execution enters only at the first instruction and leaves only at the last instruction without branching. Leader rules: 1. The first instruction of the intermediate code. 2. Any instruction that is the target of a conditional or unconditional jump. 3. Any instruction that immediately follows a conditional or unconditional jump.',
          keyConcepts: ['basic block', 'first instruction', 'target of jump', 'follows jump', 'leaders'],
          rubric: 'Must define single entry/single exit and list the 3 leader identification criteria.',
          citations: [{ source: 'Aho & Ullman Compilers (Dragon Book)', topic: 'Code Optimization' }]
        }
      ],

      // ==========================================
      // 3. OPERATING SYSTEMS
      // ==========================================
      os_process_ipc: [
        {
          type: 'trace_predict',
          difficulty: 'medium',
          question: 'In C on Linux, how many child processes are created when fork() is called 3 times in a row without branches: fork(); fork(); fork();? State the formula for n consecutive fork() calls.',
          referenceAnswer: 'For n consecutive fork() calls, a total of 2^n processes exist in total, consisting of 1 parent and 2^n - 1 child processes. For n=3, 2^3 = 8 total processes, creating exactly 7 child processes.',
          keyConcepts: ['2^n', '2^3 = 8', '7 child processes', '2^n - 1', 'fork'],
          rubric: 'Must state 7 child processes (8 total) and give the general formula 2^n - 1.',
          citations: [{ source: 'Silberschatz OS Concepts', topic: 'Processes and fork() System Call' }]
        }
      ],
      os_scheduling: [
        {
          type: 'concept_recall',
          difficulty: 'medium',
          question: 'In your own words, state the primary disadvantage of Non-Preemptive Shortest Job First (SJF) scheduling and name the scheduling mechanism that prevents this by dynamically adjusting priorities over time.',
          referenceAnswer: 'SJF causes starvation (indefinite waiting) for longer processes when shorter jobs arrive continuously. Aging (gradually increasing process priority the longer it waits in the ready queue) prevents starvation.',
          keyConcepts: ['starvation', 'aging', 'indefinite waiting', 'burst time', 'priority'],
          rubric: 'Must explain starvation/indefinite waiting for long processes and Aging as the solution.',
          citations: [{ source: 'Silberschatz OS Concepts', topic: 'CPU Scheduling Algorithms' }]
        },
        {
          type: 'formula_recall',
          difficulty: 'easy',
          question: 'Write the exact formulas for Turnaround Time (TAT) and Waiting Time (WT) in terms of Arrival Time (AT), Burst Time (BT), and Completion Time (CT).',
          referenceAnswer: 'Turnaround Time: TAT = CT - AT (Completion Time minus Arrival Time). Waiting Time: WT = TAT - BT (Turnaround Time minus Burst Time), or WT = (CT - AT) - BT.',
          keyConcepts: ['tat = ct - at', 'wt = tat - bt', 'completion time', 'arrival time', 'burst time'],
          rubric: 'Full marks for writing TAT = CT - AT and WT = TAT - BT.',
          citations: [{ source: 'Silberschatz OS Concepts', topic: 'CPU Scheduling Metrics' }]
        },
        {
          type: 'trace_predict',
          difficulty: 'medium',
          question: 'In Round Robin scheduling, what happens to the scheduling behavior as the time quantum q approaches infinity? What happens as q approaches 0?',
          referenceAnswer: 'As time quantum q -> infinity, Round Robin behaves identically to First-Come First-Served (FCFS). As q -> 0 (infinitesimally small), it approximates Processor Sharing where each of n processes progresses at 1/n speed, but with immense context switching overhead.',
          keyConcepts: ['fcfs', 'first-come first-served', 'processor sharing', 'context switch overhead', 'infinity', 'zero'],
          rubric: 'Must identify FCFS when q -> inf, and Processor Sharing with high context switch overhead when q -> 0.',
          citations: [{ source: 'Silberschatz OS Concepts', topic: 'Round Robin Properties' }]
        }
      ],
      os_sync: [
        {
          type: 'short_answer',
          difficulty: 'medium',
          question: 'State the three mandatory conditions required for any valid solution to the Critical Section problem, and define the Bounded Waiting condition.',
          referenceAnswer: 'The 3 mandatory conditions are: 1. Mutual Exclusion (only one process in critical section at a time). 2. Progress (only processes not in remainder section decide who enters next). 3. Bounded Waiting (a limit exists on the number of times other processes can enter their critical section after a process has made a request).',
          keyConcepts: ['mutual exclusion', 'progress', 'bounded waiting', 'limit on entries'],
          rubric: 'Must list Mutual Exclusion, Progress, and Bounded Waiting, and explain that Bounded Waiting limits starvation.',
          citations: [{ source: 'Silberschatz OS Concepts', topic: 'Process Synchronization' }]
        }
      ],
      os_deadlock: [
        {
          type: 'short_answer',
          difficulty: 'medium',
          question: 'List the four Coffman conditions necessary for a deadlock to occur. Which condition is eliminated when resources are preempted?',
          referenceAnswer: 'The 4 Coffman conditions are: 1. Mutual Exclusion, 2. Hold and Wait, 3. No Preemption, 4. Circular Wait. Preempting allocated resources directly eliminates the "No Preemption" condition.',
          keyConcepts: ['mutual exclusion', 'hold and wait', 'no preemption', 'circular wait'],
          rubric: 'Must list all 4 conditions and identify No Preemption as the eliminated condition.',
          citations: [{ source: 'Silberschatz OS Concepts', topic: 'Deadlock Characterization' }]
        }
      ],
      os_virtual_mem: [
        {
          type: 'concept_recall',
          difficulty: 'medium',
          question: 'What is Belady\'s Anomaly in virtual memory page replacement? Which page replacement algorithm exhibits Belady\'s Anomaly, and why are Stack Algorithms immune to it?',
          referenceAnswer: 'Belady\'s Anomaly is the phenomenon where increasing the number of allocated page frames results in an increase in the number of page faults. FIFO (First-In, First-Out) exhibits Belady\'s Anomaly. Stack algorithms (like LRU and Optimal) are immune because the set of pages in a frame of size n is always a subset of pages in a frame of size n+1.',
          keyConcepts: ['belady\'s anomaly', 'fifo', 'page faults increase with more frames', 'stack algorithms', 'subset property'],
          rubric: 'Must explain that more frames cause more faults in FIFO, and subset property makes stack algorithms immune.',
          citations: [{ source: 'Silberschatz OS Concepts', topic: 'Virtual Memory & Page Replacement' }]
        }
      ],
      os_storage: [
        {
          type: 'compare_contrast',
          difficulty: 'medium',
          question: 'Compare SCAN (Elevator) and C-SCAN (Circular SCAN) disk scheduling algorithms. Why does C-SCAN provide more uniform waiting times across disk cylinders?',
          referenceAnswer: 'SCAN services requests in one direction until reaching the end cylinder, then reverses direction. C-SCAN services requests in one direction, but immediately jumps back to the beginning of the disk without servicing requests on the return trip. C-SCAN provides more uniform waiting times because cylinders near the start/end do not get preferential double-servicing on reversals.',
          keyConcepts: ['scan', 'c-scan', 'circular scan', 'uniform wait time', 'return trip without servicing'],
          rubric: 'Must explain unidirectional servicing with immediate jump back in C-SCAN creating uniform waiting times.',
          citations: [{ source: 'Silberschatz OS Concepts', topic: 'Disk Scheduling Algorithms' }]
        }
      ],

      // ==========================================
      // 4. DATABASES (DBMS)
      // ==========================================
      dbms_er_relational: [
        {
          type: 'concept_recall',
          difficulty: 'medium',
          question: 'Define a Weak Entity set in an ER diagram. What two components are required to uniquely identify an instance of a weak entity set in a relational schema?',
          referenceAnswer: 'A Weak Entity set does not have sufficient attributes to form a primary key on its own and depends on an Identifying (Owner) Entity set. To uniquely identify a weak entity tuple, we combine the Primary Key of the Identifying Entity with the Partial Key (Discriminator) of the Weak Entity.',
          keyConcepts: ['weak entity', 'identifying entity', 'partial key', 'discriminator', 'primary key'],
          rubric: 'Must explain owner entity dependency and combination of owner primary key + partial key.',
          citations: [{ source: 'Korth & Silberschatz Database System Concepts', topic: 'ER Model & Weak Entities' }]
        }
      ],
      dbms_rel_algebra_sql: [
        {
          type: 'concept_recall',
          difficulty: 'hard',
          question: 'In Relational Algebra, what is the Division Operator (R / S) used for, and how can it be expressed using standard Project, Cartesian Product, and Set Difference operators?',
          referenceAnswer: 'The Division operator R / S is used for "for all" (universal quantification) queries (e.g. find students enrolled in all courses). Formally: R / S = Projection_{R-S}(R) - Projection_{R-S}((Projection_{R-S}(R) x S) - R).',
          keyConcepts: ['division', 'r / s', 'for all', 'universal quantification', 'projection', 'cartesian product', 'set difference'],
          rubric: 'Must identify "for all" query matching and formula using projection, cross product, and set difference.',
          citations: [{ source: 'Korth & Silberschatz Database System Concepts', topic: 'Relational Algebra Division' }]
        }
      ],
      dbms_normalization: [
        {
          type: 'concept_recall',
          difficulty: 'medium',
          question: 'Define Boyce-Codd Normal Form (BCNF). For every non-trivial functional dependency X -> Y in a relational schema R, what condition must hold for the determinant X?',
          referenceAnswer: 'A relation R is in BCNF if for every non-trivial functional dependency X -> Y, the determinant X is a Superkey (or Candidate Key) of R.',
          keyConcepts: ['superkey', 'super key', 'candidate key', 'determinant', 'non-trivial'],
          rubric: 'Must state that determinant X must be a superkey/candidate key for every non-trivial FD.',
          citations: [{ source: 'Korth & Silberschatz Database System Concepts', topic: 'Relational Normalization' }]
        }
      ],
      dbms_indexing: [
        {
          type: 'compare_contrast',
          difficulty: 'medium',
          question: 'Compare B-Trees and B+ Trees for relational database indexing. Why do modern database storage engines (like InnoDB) universally use B+ Trees over B-Trees for range queries?',
          referenceAnswer: 'In B-Trees, data pointers are stored in both internal and leaf nodes. In B+ Trees, data pointers are stored exclusively at the leaf level, and all leaf nodes are linked sequentially as a doubly linked list. B+ Trees are superior for range queries because scanning a range requires only traversing the leaf chain without traversing up and down the tree.',
          keyConcepts: ['b+ tree', 'b-tree', 'leaf nodes', 'linked list', 'range query', 'data pointers'],
          rubric: 'Must explain leaf-only pointers and sequential leaf linked-list enabling efficient range scans in B+ Trees.',
          citations: [{ source: 'Korth & Silberschatz Database System Concepts', topic: 'B+ Tree Indexing' }]
        }
      ],
      dbms_transactions: [
        {
          type: 'compare_contrast',
          difficulty: 'hard',
          question: 'State the Two-Phase Locking (2PL) protocol rules. What guarantee does Basic 2PL provide regarding conflict serializability, and does it prevent deadlocks or cascading aborts? How does Strict 2PL address cascading aborts?',
          referenceAnswer: 'Basic 2PL requires each transaction to have a Growing Phase (only acquiring locks) and a Shrinking Phase (only releasing locks). Basic 2PL guarantees Conflict Serializability, but does NOT prevent deadlocks or cascading aborts. Strict 2PL holds all Exclusive locks until the transaction commits or aborts, which guarantees Cascadelessness (Strict schedules).',
          keyConcepts: ['growing phase', 'shrinking phase', 'conflict serializability', 'deadlocks possible', 'strict 2pl', 'cascadeless'],
          rubric: 'Must describe 2 phases, state conflict serializability is guaranteed, acknowledge deadlocks/cascades possible, and explain Strict 2PL holds exclusive locks until commit.',
          citations: [{ source: 'Korth & Silberschatz Database System Concepts', topic: 'Concurrency Control & 2PL' }]
        }
      ],

      // ==========================================
      // 5. COMPUTER NETWORKS
      // ==========================================
      cn_layering_switching: [
        {
          type: 'formula_recall',
          difficulty: 'medium',
          question: 'State the formulas for Transmission Delay (T_tx) and Propagation Delay (T_prop) in packet networks in terms of Packet Length L, Bandwidth B, Distance d, and Signal Speed s. What is the Bandwidth-Delay Product (BDP)?',
          referenceAnswer: 'Transmission Delay: T_tx = L / B (Length divided by Bandwidth). Propagation Delay: T_prop = d / s (Distance divided by Propagation speed). Bandwidth-Delay Product: BDP = Bandwidth * Propagation Delay, representing the maximum volume of bits in transit in the pipe.',
          keyConcepts: ['t_tx = l / b', 't_prop = d / s', 'bdp = bandwidth * prop delay', 'bits in pipe'],
          rubric: 'Full marks for writing T_tx = L/B, T_prop = d/s, and explaining BDP as capacity of the channel.',
          citations: [{ source: 'Kurose & Ross Computer Networking', topic: 'Network Delays & Metrics' }]
        }
      ],
      cn_datalink_mac: [
        {
          type: 'formula_recall',
          difficulty: 'hard',
          question: 'In CSMA/CD (Ethernet), what is the minimum frame size requirement in terms of Transmission Time (T_tx) and one-way Propagation Delay (T_prop)? Why must T_tx >= 2 * T_prop?',
          referenceAnswer: 'The requirement is T_tx >= 2 * T_prop, meaning Minimum Frame Size = 2 * T_prop * Bandwidth. This ensures that the sending node is still transmitting its frame when a collision detection signal returns from the furthest possible station, preventing undetected collisions.',
          keyConcepts: ['t_tx >= 2 * t_prop', 'minimum frame size', 'collision detection', 'round trip time', '2 * t_prop'],
          rubric: 'Must write T_tx >= 2*T_prop and explain that sender must still be transmitting to detect worst-case collision.',
          citations: [{ source: 'Kurose & Ross Computer Networking', topic: 'CSMA/CD & Ethernet Framing' }]
        }
      ],
      cn_routing: [
        {
          type: 'concept_recall',
          difficulty: 'medium',
          question: 'Explain the Count-to-Infinity problem in Distance Vector Routing (Bellman-Ford). Name two mechanisms used in RIP to mitigate or eliminate this problem.',
          referenceAnswer: 'Count-to-Infinity occurs when a link breaks and two adjacent routers exchange slowly incrementing distance vectors for the unreachable node, incrementing metric to infinity (or 16 in RIP). Mitigations: 1. Split Horizon (do not advertise routes back on the interface from which they were learned). 2. Poison Reverse (advertise unreachable route back with distance infinity/16). 3. Hold-down timers.',
          keyConcepts: ['count to infinity', 'link failure', 'split horizon', 'poison reverse', 'infinity = 16'],
          rubric: 'Must explain the routing loop metric increment and name Split Horizon / Poison Reverse.',
          citations: [{ source: 'Kurose & Ross Computer Networking', topic: 'Distance Vector Routing' }]
        }
      ],
      cn_network_ipv4: [
        {
          type: 'concept_recall',
          difficulty: 'medium',
          question: 'In IPv4 datagram fragmentation, what is the unit of the Fragmentation Offset field in the IPv4 header? Why must the fragment data length (except the last fragment) be a multiple of this value?',
          referenceAnswer: 'The Fragmentation Offset is measured in units of 8-byte blocks (64 bits). Because the offset field is 13 bits while total length is 16 bits, the offset must be multiplied by 8; thus, every intermediate fragment data payload must be an exact multiple of 8 bytes.',
          keyConcepts: ['8 bytes', '8-byte blocks', '13 bits', 'fragmentation offset', 'multiple of 8'],
          rubric: 'Must specify 8-byte units and explain that data payload must be a multiple of 8.',
          citations: [{ source: 'Kurose & Ross Computer Networking', topic: 'IPv4 Fragmentation' }]
        }
      ],
      cn_transport_tcp: [
        {
          type: 'concept_recall',
          difficulty: 'medium',
          question: 'Describe the 3-Way Handshake protocol used by TCP to establish a connection. State the flags (SYN, ACK) and sequence number synchronization in each step.',
          referenceAnswer: 'Step 1: Client sends SYN segment with initial sequence number client_isn. Step 2: Server responds with SYN-ACK segment with server_isn and ACK = client_isn + 1. Step 3: Client sends ACK segment with ACK = server_isn + 1 and sequence number client_isn + 1. The connection is now established.',
          keyConcepts: ['syn', 'syn-ack', 'ack', 'isn', 'client_isn + 1', 'server_isn + 1'],
          rubric: 'Must detail Step 1 (SYN), Step 2 (SYN-ACK), and Step 3 (ACK) with sequence number increments.',
          citations: [{ source: 'Kurose & Ross Computer Networking', topic: 'TCP Connection Management' }]
        }
      ],
      cn_application_dns_http: [
        {
          type: 'compare_contrast',
          difficulty: 'medium',
          question: 'Compare Recursive DNS Resolution and Iterative DNS Resolution. How do they differ in terms of server workload and query flow from the local DNS server?',
          referenceAnswer: 'In Recursive Resolution, the contacted DNS server assumes the entire burden of fetching the IP address by querying root, TLD, and authoritative servers on behalf of the requester. In Iterative Resolution, if the contacted DNS server does not have the mapping, it responds with the IP address of the next server to query, and the local DNS resolver performs the successive queries directly.',
          keyConcepts: ['recursive', 'iterative', 'root server', 'tld', 'local dns', 'server workload'],
          rubric: 'Must contrast server delegated resolution in recursive vs referral step-by-step resolution in iterative.',
          citations: [{ source: 'Kurose & Ross Computer Networking', topic: 'DNS Resolution Architecture' }]
        }
      ]
    };
  }

  /**
   * Learner context for generation: level from BKT, concepts missed in the last wrong challenges, recent questions.
   */
  learnerContext(userId, topicId) {
    let p = null, n = 0;
    if (userId) {
      const m = db.prepare('SELECT p_know, n_attempts FROM mastery WHERE user_id = ? AND topic_id = ?').get(userId, topicId);
      if (m) { p = m.p_know; n = m.n_attempts || 0; }
    }
    const level = p === null || n < 2 ? 'beginner' : p < 0.5 ? 'weak' : p < 0.75 ? 'intermediate' : 'advanced';
    const difficulty = { beginner: 'easy', weak: 'easy', intermediate: 'medium', advanced: 'hard' }[level];
    let missed = []; let previous = [];
    if (userId) {
      const rows = db.prepare(`SELECT ra.feedback_json FROM recall_attempts ra JOIN recall_prompts rp ON rp.id = ra.prompt_id
        WHERE ra.user_id = ? AND rp.topic_id = ? AND ra.correct = 0 AND ra.feedback_json IS NOT NULL ORDER BY ra.created_at DESC LIMIT 3`).all(userId, topicId);
      for (const r of rows) { try { missed.push(...(JSON.parse(r.feedback_json).missing || [])); } catch (e) { /* ignore */ } }
      missed = [...new Set(missed)].slice(0, 5);
      previous = db.prepare('SELECT question FROM recall_prompts WHERE user_id = ? AND topic_id = ? ORDER BY rowid DESC LIMIT 8').all(userId, topicId).map(r => r.question);
    }
    return { p, n, level, difficulty, missed, previous };
  }

  /**
   * Dynamic, grounded question generation (Gemini, one structured call) + deterministic validation.
   * Returns a prompt object or throws (caller falls back openly and labels the result).
   */
  async generatePromptDynamic({ topicId, topicName, subject, type, userId }) {
    const ctx = this.learnerContext(userId, topicId);
    const desc = syllabusTool.getTopicDescription(topicId) || '';
    const kw = syllabusTool.getTopicKeywords(topicId) || '';
    const rag = ragTool.execute({ query: `${topicName} definitions formulas conditions`, filters: { strategy: 'concept', topic_id: topicId, topK: 2 } });
    const material = rag.results.map(r => r.text).join('\n').slice(0, 900);
    const { questions } = pyqTool.search({ topic_id: topicId, hasKey: true, verifiedOnly: true }, { limit: 10 });
    const ref = questions.find(q => q.origin === 'official_gate') || questions[0];
    const wanted = ['concept_recall', 'formula', 'application', 'gate_style', 'numeric'].includes(type) ? type : (ctx.level === 'advanced' ? 'application' : 'concept_recall');

    const system = agentPrompts.ACTIVE_RECALL_GENERATOR;
    const user = JSON.stringify({
      topic: topicName, subject, learner_level: ctx.level, difficulty: ctx.difficulty, question_type: wanted,
      syllabus: desc.slice(0, 320), material, style_reference: ref ? ref.question.slice(0, 200) : undefined,
      target_weaknesses: ctx.missed.length ? ctx.missed : undefined, avoid: ctx.previous.slice(0, 4).map(q => q.slice(0, 90))
    });
    const vocab = new Set(tokenize(`${topicName} ${desc} ${kw} ${material}`));
    let built = null;
    await llmClient.generateJSON({
      systemPrompt: system, userPrompt: user, temperature: 0.8, maxOutputTokens: agentPrompts.LIMITS.active_recall_generate,
      agentLabel: 'Active Recall Agent', featureLabel: 'active_recall',
      validate: o => {
        const need = f => { if (typeof o[f] !== 'string' || !o[f].trim()) throw new Error(`"${f}" missing`); return o[f].trim(); };
        const question = need('question'), referenceAnswer = need('referenceAnswer'); const rubric = typeof o.rubric === 'string' ? o.rubric : '';
        if (question.length < 20 || question.length > 500) throw new Error('question length out of range');
        if (referenceAnswer.length < 5 || referenceAnswer.length > 1200) throw new Error('referenceAnswer length out of range');
        if (!Array.isArray(o.keyConcepts) || o.keyConcepts.length < 2 || o.keyConcepts.length > 8 || o.keyConcepts.some(k => typeof k !== 'string' || !k.trim())) throw new Error('keyConcepts must be 2-8 short strings');
        if (/\bGATE[\s-]*(19|20)\d\d\b|previous[- ]year|\bPYQ\b/i.test(`${question} ${referenceAnswer}`)) throw new Error('generated question must not claim to be a GATE/PYQ question');
        if (!tokenize(`${question} ${referenceAnswer}`).some(t => vocab.has(t))) throw new Error('question is unrelated to the topic');
        const h = crypto.createHash('sha1').update(question.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()).digest('hex');
        if (db.prepare('SELECT 1 FROM recall_prompts WHERE user_id = ? AND content_hash = ?').get(userId || '', h)) throw new Error('duplicate of an earlier question');
        let answerNumeric = null;
        if (o.numeric) {
          const v = Number(math.evaluate(String(o.numeric.expression)));
          if (!Number.isFinite(v) || Math.abs(v - Number(o.numeric.result)) > 1e-6 * Math.max(1, Math.abs(v))) throw new Error('numeric.expression does not match numeric.result');
          answerNumeric = v;
        }
        built = { question, referenceAnswer, rubric, keyConcepts: o.keyConcepts.map(k => k.trim()), hash: h, answerNumeric,
          difficulty: ['easy', 'medium', 'hard'].includes(o.difficulty) ? o.difficulty : ctx.difficulty };
        return null;
      }
    });
    return {
      type: wanted, difficulty: built.difficulty, question: built.question, referenceAnswer: built.referenceAnswer,
      keyConcepts: built.keyConcepts, rubric: built.rubric || 'Credit for correct, complete and precise use of the key concepts; accept equivalent wording.',
      citations: [{ source: 'GATE CSE syllabus (data/syllabus/syllabus.json)', topic: topicName }].concat(ref ? [{ source: 'style/grounding reference', question_id: ref.id, official: ref.origin === 'official_gate' }] : []),
      origin: 'ai_generated_practice', hash: built.hash, answerNumeric: built.answerNumeric, generatedBy: llmClient.modelFor('active_recall'), learnerLevel: ctx.level
    };
  }

  /** Previously validated AI questions for this topic (other learners', or this learner's older ones) not seen by this learner */
  reuseValidatedPrompt(userId, topicId) {
    const row = db.prepare(`SELECT * FROM recall_prompts WHERE topic_id = ? AND origin = 'ai_generated_practice' AND content_hash IS NOT NULL
      AND (user_id IS NULL OR user_id != ?) AND content_hash NOT IN (SELECT content_hash FROM recall_prompts WHERE user_id = ? AND content_hash IS NOT NULL)
      ORDER BY RANDOM() LIMIT 1`).get(topicId, userId || '', userId || '');
    if (!row) return null;
    let key = []; try { key = JSON.parse(row.key_concepts || '[]'); } catch (e) { key = []; }
    return { type: row.prompt_type, difficulty: row.difficulty, question: row.question, referenceAnswer: row.reference_answer, keyConcepts: key, rubric: row.rubric,
      citations: JSON.parse(row.source_references || '[]'), origin: 'ai_generated_practice', hash: row.content_hash, answerNumeric: row.answer_numeric, generatedBy: 'reused_validated' };
  }

  /**
   * Procedural syllabus prompt generator fallback
   */
  generatePromptProcedural({ topicId, topicName, subject, type, recentPromptQuestions = [] }) {
    const repo = this.getPromptsRepository();
    const topicPrompts = repo[topicId] || [];

    // Filter by type if requested
    let candidatePrompts = topicPrompts;
    if (type && type !== 'all') {
      const filtered = topicPrompts.filter(p => p.type === type);
      if (filtered.length > 0) candidatePrompts = filtered;
    }

    // Filter out recently attempted
    let availablePrompts = candidatePrompts.filter(p => !recentPromptQuestions.includes(p.question));
    if (availablePrompts.length === 0) {
      availablePrompts = candidatePrompts.length > 0 ? candidatePrompts : topicPrompts;
    }

    if (availablePrompts.length > 0) {
      return availablePrompts[Math.floor(Math.random() * availablePrompts.length)];
    }

    // No curated prompt for this topic: build a syllabus-grounded recall question (no invented content)
    const desc = syllabusTool.getTopicDescription(topicId) || '';
    const concepts = desc.split(/[,;]|\band\b/).map(x => x.replace(/[.()]/g, '').trim()).filter(x => x.length > 3).slice(0, 6);
    return {
      type: type || 'concept_recall',
      difficulty: 'medium',
      question: `According to the GATE CSE syllabus, which main concepts fall under "${topicName}"? List them and state one key fact about each.`,
      referenceAnswer: desc || `Review the official syllabus entry for ${topicName}.`,
      keyConcepts: concepts.length ? concepts : [topicName.toLowerCase()],
      rubric: 'Credit for naming the main syllabus concepts and giving a correct key fact for each.',
      citations: [{ source: 'GATE CSE syllabus (data/syllabus/syllabus.json)', topic: topicName }]
    };
  }

  /**
   * Select a personalized or requested topic for the student
   */
  selectTargetTopic({ topicId, subject, userId }) {
    if (topicId) {
      const topicRow = db.prepare('SELECT * FROM topics WHERE id = ?').get(topicId);
      if (topicRow) {
        return {
          topicId: topicRow.id,
          topicName: topicRow.name,
          subject: topicRow.subject,
          reason: `Topic chosen explicitly: ${topicRow.name}`
        };
      }
    }

    if (subject && subject !== 'All') {
      const topicsInSubject = db.prepare('SELECT * FROM topics WHERE subject = ?').all(subject);
      if (topicsInSubject.length > 0) {
        if (userId) {
          const userMastery = learnerStateTool.getUserMastery(userId);
          const subjMastery = userMastery.filter(m => m.subject === subject);
          const weakest = subjMastery.sort((a, b) => a.p_know - b.p_know)[0];
          if (weakest) {
            return {
              topicId: weakest.topic_id,
              topicName: weakest.topic_name,
              subject: weakest.subject,
              reason: `Lowest mastery topic in ${subject} (${Math.round(weakest.p_know * 100)}%)`
            };
          }
        }
        const picked = topicsInSubject[0];
        return {
          topicId: picked.id,
          topicName: picked.name,
          subject: picked.subject,
          reason: `Foundation topic in ${subject}`
        };
      }
    }

    if (userId) {
      // 1. Check revision schedule for due topics
      const dueTopic = db.prepare(`
        SELECT rs.topic_id, rs.priority, t.name as topic_name, t.subject, COALESCE(m.p_know, 0.0) as p_know
        FROM revision_schedule rs
        JOIN topics t ON t.id = rs.topic_id
        LEFT JOIN mastery m ON m.topic_id = t.id AND m.user_id = rs.user_id
        WHERE rs.user_id = ?
        ORDER BY rs.priority DESC, rs.due_at ASC
        LIMIT 1
      `).get(userId);

      if (dueTopic) {
        return {
          topicId: dueTopic.topic_id,
          topicName: dueTopic.topic_name,
          subject: dueTopic.subject,
          reason: `Recommended by Revision Scheduler based on spaced repetition schedule`
        };
      }

      // 2. Check weak topics from mastery
      const userMastery = learnerStateTool.getUserMastery(userId);
      const attempted = userMastery.filter(m => m.last_seen !== null);
      if (attempted.length > 0) {
        const weak = attempted.sort((a, b) => a.p_know - b.p_know)[0];
        if (weak && weak.p_know < 0.70) {
          return {
            topicId: weak.topic_id,
            topicName: weak.topic_name,
            subject: weak.subject,
            reason: `Targeted reinforcement for low mastery topic (${Math.round(weak.p_know * 100)}% P(Know))`
          };
        }
      }
    }

    // Default fallback
    const defaultTopic = db.prepare('SELECT * FROM topics WHERE id = ?').get('os_scheduling') 
      || db.prepare('SELECT * FROM topics LIMIT 1').get();

    return {
      topicId: defaultTopic ? defaultTopic.id : 'os_scheduling',
      topicName: defaultTopic ? defaultTopic.name : 'CPU Scheduling',
      subject: defaultTopic ? defaultTopic.subject : 'Operating Systems',
      reason: 'Starting baseline diagnostic topic for GATE CSE'
    };
  }

  /**
   * Generate an active recall challenge. Order: dynamic Gemini question -> previously validated AI question ->
   * curated/syllabus fallback. The result always says which path produced it; nothing is silent.
   * The answer key is stored server-side and never sent to the student.
   */
  async generatePrompt({ topicId, subject, type, userId }) {
    const selection = this.selectTargetTopic({ topicId, subject, userId });
    const targetTopicId = selection.topicId;
    const topicName = selection.topicName;
    const topicSubject = selection.subject;

    let selectedPrompt = null; let generation = 'gemini'; let aiNotice = null;
    try {
      if (!llmClient.isAvailable()) { const st = llmClient.status(); throw new llmClient.LLMError(st.disabledReason ? 'INVALID_KEY' : (!st.configured ? 'NO_KEY' : (st.lastError && st.lastError.code) || 'RATE_LIMIT'), 'AI not available'); }
      selectedPrompt = await this.generatePromptDynamic({ topicId: targetTopicId, topicName, subject: topicSubject, type, userId });
    } catch (err) {
      aiNotice = `AI question generation unavailable (${err.code || 'error'}).`;
    }
    if (!selectedPrompt) {
      selectedPrompt = this.reuseValidatedPrompt(userId, targetTopicId);
      if (selectedPrompt) { generation = 'reused_validated'; aiNotice += ' Showing a previously validated AI-generated question.'; }
    }
    if (!selectedPrompt) {
      let recent = [];
      if (userId) recent = db.prepare('SELECT question FROM recall_prompts WHERE user_id = ? ORDER BY rowid DESC LIMIT 12').all(userId).map(a => a.question);
      selectedPrompt = this.generatePromptProcedural({ topicId: targetTopicId, topicName, subject: topicSubject, type, recentPromptQuestions: recent });
      generation = 'fallback';
      selectedPrompt.origin = (this.getPromptsRepository()[targetTopicId] || []).some(p => p.question === selectedPrompt.question) ? 'curated_fallback' : 'syllabus_fallback';
      selectedPrompt.hash = crypto.createHash('sha1').update(selectedPrompt.question.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()).digest('hex');
    }

    const promptId = `prompt_${crypto.randomUUID()}`;
    const promptType = selectedPrompt.type || type || 'concept_recall';
    const difficulty = selectedPrompt.difficulty || 'medium';
    const citations = selectedPrompt.citations || [{ source: 'GATE CSE syllabus', topic: topicName }];

    db.prepare(`
      INSERT INTO recall_prompts (id, topic_id, prompt_type, question, reference_answer, key_concepts, rubric, difficulty, source_references, user_id,
        origin, content_hash, answer_numeric, generated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(promptId, targetTopicId, promptType, selectedPrompt.question, selectedPrompt.referenceAnswer, JSON.stringify(selectedPrompt.keyConcepts || []),
      selectedPrompt.rubric || '', difficulty, JSON.stringify(citations), userId || null,
      selectedPrompt.origin || 'curated_fallback', selectedPrompt.hash || null, selectedPrompt.answerNumeric ?? null, selectedPrompt.generatedBy || null);

    return {
      agent: this.role, promptId, topicId: targetTopicId, topicName, subject: topicSubject, promptType, difficulty,
      question: selectedPrompt.question, recommendationReason: selection.reason, sourceReferences: citations,
      origin: selectedPrompt.origin, generation, aiNotice,
      label: selectedPrompt.origin === 'ai_generated_practice' ? 'AI-generated practice question (not an authentic GATE question)'
        : selectedPrompt.origin === 'curated_fallback' ? 'Curated practice question (AI generation was unavailable)' : 'Syllabus-based practice question (AI generation was unavailable)'
    };
  }

  /**
   * Server-side attempt state for one (user, prompt). The client can never influence it.
   */
  getAttemptState(userId, promptId) {
    const rows = db.prepare(`
      SELECT attempt_no, score, correct, created_at FROM recall_attempts
      WHERE user_id = ? AND prompt_id = ? ORDER BY attempt_no
    `).all(userId, promptId);
    const used = rows.length;
    const solved = rows.some(r => r.correct === 1);
    const completed = solved || used >= MAX_RECALL_ATTEMPTS;
    return { used, solved, completed, remaining: completed ? 0 : MAX_RECALL_ATTEMPTS - used, attempts: rows };
  }

  /** Public state, revealing the reference only once the challenge is finished. */
  getPromptState(userId, promptId) {
    const prompt = db.prepare('SELECT * FROM recall_prompts WHERE id = ?').get(promptId);
    if (!prompt || (prompt.user_id && prompt.user_id !== userId)) return null;
    const st = this.getAttemptState(userId, promptId);
    const out = {
      promptId, topicId: prompt.topic_id, question: prompt.question,
      maxAttempts: MAX_RECALL_ATTEMPTS, attemptsUsed: st.used, attemptsRemaining: st.remaining,
      completed: st.completed, solved: st.solved, attempts: st.attempts
    };
    if (st.completed) {
      out.referenceAnswer = prompt.reference_answer;
      try { out.keyConcepts = JSON.parse(prompt.key_concepts || '[]'); } catch (e) { out.keyConcepts = []; }
      out.rubric = prompt.rubric;
    }
    return out;
  }

  /**
   * Grade one attempt. Rules (enforced here, not in the browser):
   *  - authenticated users only, prompt must belong to the caller
   *  - max 3 attempts; the correct answer + explanation are revealed only when the challenge is
   *    completed (correct answer, or the 3rd incorrect attempt)
   *  - after completion further submissions are rejected (409)
   *  - BKT is updated exactly once per challenge, at completion
   */
  async gradeResponse({ promptId, studentAnswer, userId }) {
    const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
    if (!userId) throw fail(401, 'Authentication required');
    if (!promptId) throw fail(400, 'promptId is required');
    if (typeof studentAnswer !== 'string' || studentAnswer.trim() === '') {
      throw fail(400, 'Please type your answer from memory before submitting.');
    }
    if (studentAnswer.length > 4000) throw fail(400, 'Answer is too long (max 4000 characters).');

    const promptRecord = db.prepare('SELECT * FROM recall_prompts WHERE id = ?').get(promptId);
    if (!promptRecord || (promptRecord.user_id && promptRecord.user_id !== userId)) {
      throw fail(404, 'Recall prompt not found');
    }
    const state = this.getAttemptState(userId, promptId);
    if (state.completed) {
      throw fail(409, 'This recall challenge is already complete. Request a new question to continue.',
        { state: this.getPromptState(userId, promptId) });
    }

    const targetTopicId = promptRecord.topic_id;
    const question = promptRecord.question;
    const referenceAnswer = promptRecord.reference_answer;
    let keyConcepts = []; let citations = [];
    try { keyConcepts = JSON.parse(promptRecord.key_concepts || '[]'); } catch (e) { keyConcepts = []; }
    try { citations = JSON.parse(promptRecord.source_references || '[]'); } catch (e) { citations = []; }
    const topicRow = db.prepare('SELECT name, subject FROM topics WHERE id = ?').get(targetTopicId);
    const topicName = topicRow ? topicRow.name : targetTopicId;
    const topicSubject = topicRow ? topicRow.subject : '';

    const evaluation = await this.evaluateSemantically({
      question, studentAnswer, referenceAnswer, keyConcepts,
      rubric: promptRecord.rubric, answerNumeric: promptRecord.answer_numeric
    });
    const score = evaluation.score;
    const isCorrect = score >= 60; // binary BKT observation: score >= 60 counts as correct
    const attemptNumber = state.used + 1;
    const completed = isCorrect || attemptNumber >= MAX_RECALL_ATTEMPTS;

    // Atomically claim the attempt number (UNIQUE(user,prompt,attempt_no) blocks double-submits)
    try {
      db.prepare(`INSERT INTO recall_attempts (id, user_id, prompt_id, attempt_no, answer, score, correct, feedback_json)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(crypto.randomUUID(), userId, promptId, attemptNumber, studentAnswer, score, isCorrect ? 1 : 0,
          JSON.stringify({ missing: evaluation.missingPoints || [], misconceptions: evaluation.misconceptions || [], evaluatedBy: evaluation.evaluatedBy }));
    } catch (e) {
      throw fail(409, 'Duplicate submission detected. Please refresh the challenge state.');
    }

    let bktResult = null;
    if (completed) {
      bktResult = bktTool.recordPractice(userId, targetTopicId, this.role, question, studentAnswer, isCorrect,
        { type: 'RECALL', source: 'active_recall', questionId: promptId });
    }

    const base = {
      agent: this.role, promptId, topicId: targetTopicId, topicName, subject: topicSubject,
      score, correctness: evaluation.correctness, isCorrect, evaluatedBy: evaluation.evaluatedBy,
      origin: promptRecord.origin,
      attemptNumber, maxAttempts: MAX_RECALL_ATTEMPTS,
      attemptsRemaining: completed ? 0 : MAX_RECALL_ATTEMPTS - attemptNumber,
      completed, solved: isCorrect, bktUpdate: bktResult
    };

    if (!completed) {
      // Between attempts: coach without leaking the answer key.
      const total = Math.max(1, keyConcepts.length);
      const got = (evaluation.correctPoints || []).length;
      return {
        ...base,
        feedback: `Not quite yet (${score}/100). You covered about ${Math.min(got, total)} of ${total} key ideas. ` +
          `Re-read the question, try recalling the definition, formula or condition more precisely, and try again.`,
        correctPoints: evaluation.correctPoints || [],
        missingPoints: [], misconceptions: [],
        referenceAnswer: null, explanation: null, nextAction: null
      };
    }

    const newMastery = bktResult ? bktResult.newPKnow : null;
    return {
      ...base,
      feedback: evaluation.feedback,
      correctPoints: evaluation.correctPoints,
      missingPoints: evaluation.missingPoints,
      misconceptions: evaluation.misconceptions,
      referenceAnswer,
      explanation: referenceAnswer,
      keyConcepts,
      sourceReferences: citations,
      nextAction: this.generateAdaptiveNextAction({
        topicId: targetTopicId, topicName, subject: topicSubject, isCorrect, score, newMastery
      })
    };
  }

  /**
   * Evaluation: numeric questions are compared deterministically; descriptive answers are judged by Gemini
   * AGAINST the stored reference answer and key concepts (it may not invent a new correct answer, and equivalent wording
   * is accepted). If Gemini is unavailable a transparent keyword matcher is used and the result says so.
   * Returns { score, correctness, feedback, correctPoints, missingPoints, misconceptions, evaluatedBy }.
   */
  async evaluateSemantically({ question, studentAnswer, referenceAnswer, keyConcepts, rubric, answerNumeric = null }) {
    const concepts = (keyConcepts || []).map(String);
    const band = score => (score >= 70 ? 'correct' : score >= 40 ? 'partial' : 'incorrect');

    // 1. deterministic numeric comparison
    if (answerNumeric !== null && answerNumeric !== undefined) {
      const nums = (studentAnswer.replace(/,/g, '').match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) || []).map(Number);
      const ok = nums.some(n => Math.abs(n - answerNumeric) <= Math.max(0.01, Math.abs(answerNumeric) * 0.005));
      const score = ok ? 100 : (nums.length ? 20 : 0);
      return { score, correctness: band(score), evaluatedBy: 'numeric_check',
        feedback: ok ? 'Correct numerical result.' : (nums.length ? 'The numerical result does not match.' : 'No numerical answer found in your response.'),
        correctPoints: ok ? ['final numerical result'] : [], missingPoints: ok ? [] : ['correct numerical result'], misconceptions: [] };
    }

    // 2. semantic evaluation grounded in the validated reference
    if (llmClient.isAvailable()) {
      try {
        const r = await llmClient.generateJSON({
          systemPrompt: agentPrompts.ACTIVE_RECALL_EVALUATOR,
          userPrompt: JSON.stringify({ question, reference_answer: referenceAnswer, key_concepts: concepts, rubric: rubric || undefined, student_answer: studentAnswer.slice(0, 2500) }),
          temperature: 0.1, maxOutputTokens: agentPrompts.LIMITS.active_recall, agentLabel: 'Active Recall Agent', featureLabel: 'active_recall_eval',
          validate: o => {
            if (typeof o.score !== 'number' || o.score < 0 || o.score > 100) throw new Error('score must be a number 0-100');
            if (!Array.isArray(o.matched_concepts) || !Array.isArray(o.missing_concepts)) throw new Error('matched_concepts and missing_concepts must be arrays');
            return null;
          }
        });
        const keep = arr => (arr || []).filter(x => concepts.some(c => c.toLowerCase() === String(x).toLowerCase()));
        const matched = keep(r.matched_concepts), missing = concepts.filter(c => !matched.map(m => m.toLowerCase()).includes(c.toLowerCase()));
        let score = Math.round(r.score);
        const ratio = concepts.length ? matched.length / concepts.length : 0;
        const mis = Array.isArray(r.misconceptions) ? r.misconceptions.map(String).slice(0, 4) : [];
        if (ratio >= 0.8 && mis.length === 0) score = Math.max(score, 70);   // consistency guards against an over-harsh judge
        if (ratio === 0 && concepts.length) score = Math.min(score, 35);
        return { score, correctness: band(score), feedback: String(r.feedback || 'Answer evaluated.').slice(0, 400), correctPoints: matched, missingPoints: missing, misconceptions: mis, evaluatedBy: 'gemini' };
      } catch (err) {
        console.warn('[ActiveRecall] semantic evaluation unavailable:', err.code || err.message);
      }
    }

    // 3. transparent keyword fallback (cannot understand paraphrases - labelled as such)
    const lower = studentAnswer.toLowerCase();
    const matched = [], missing = [];
    for (const c of concepts) {
      const cl = c.toLowerCase();
      const words = cl.split(/\s+/).filter(w => w.length > 3);
      (lower.includes(cl) || (words.length && words.every(w => lower.includes(w))) ? matched : missing).push(c);
    }
    const ratio = concepts.length ? matched.length / concepts.length : 0;
    const wordCount = studentAnswer.trim().split(/\s+/).length;
    let score = Math.round(ratio * 85) + (wordCount >= 8 && ratio > 0 ? 15 : 0);
    score = Math.max(0, Math.min(100, score));
    return { score, correctness: band(score), evaluatedBy: 'keyword_fallback',
      feedback: `Keyword-based check (AI evaluation unavailable): ${matched.length} of ${concepts.length} key ideas found. Paraphrased answers may be under-scored.`,
      correctPoints: matched, missingPoints: missing, misconceptions: [] };
  }

  /**
   * Generate next adaptive recommendation
   */
  generateAdaptiveNextAction({ topicId, topicName, subject, isCorrect, score, newMastery }) {
    if (!isCorrect && newMastery < 0.45) {
      return {
        type: 'study_studio',
        label: 'Study Concept & Invariants',
        url: `study.html?topic=${topicId}`,
        reason: `Mastery is low (${Math.round(newMastery * 100)}%). Reviewing the fundamental concept in Study Studio will resolve the missing points.`
      };
    }

    if (!isCorrect && newMastery >= 0.45) {
      return {
        type: 'retry_topic',
        label: 'Retry Active Recall on this Topic',
        url: `recall.html?topic=${topicId}`,
        reason: `Solidify retention by testing another recall probe on ${topicName}.`
      };
    }

    if (isCorrect && newMastery < 0.75) {
      return {
        type: 'problem_solver',
        label: 'Solve Step-by-Step Problems',
        url: `study.html?view=solver&topic=${topicId}`,
        reason: `Good recall! Advance your mastery to >75% by solving step-by-step practice problems.`
      };
    }

    // High mastery
    return {
      type: 'next_topic',
      label: 'Explore Next Syllabus Unit',
      url: 'dashboard.html',
      reason: `High mastery reached (${Math.round(newMastery * 100)}%). Ready to move to the next syllabus unit.`
    };
  }

  /**
   * Retrieve student recall history
   */
  getRecallHistory(userId, topicId = null, limit = 10) {
    if (!userId) return [];
    let query = `
      SELECT a.id, a.topic_id, t.name AS topic_name, t.subject, a.question, a.answer, a.correct, a.created_at
      FROM attempts a
      JOIN topics t ON t.id = a.topic_id
      WHERE a.user_id = ? AND a.agent = ?
    `;
    const params = [userId, this.role];

    if (topicId) {
      query += ` AND a.topic_id = ?`;
      params.push(topicId);
    }

    query += ` ORDER BY a.created_at DESC LIMIT ?`;
    params.push(limit);

    return db.prepare(query).all(...params);
  }
}

module.exports = new ActiveRecallAgent();
