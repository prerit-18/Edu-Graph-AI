const ragTool = require('../tools/rag_tool');
const pyqTool = require('../tools/pyq_tool');
const bktTool = require('../tools/bkt_tool');
const learnerStateTool = require('../tools/learner_state_tool');
const llmClient = require('./llm_client');
const db = require('../database/db');
const crypto = require('crypto');
const { runCrewAITask } = require('./crewai_bridge');

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
   * Dynamically synthesize a live Active Recall question using Gemini LLM
   */
  async generatePromptWithGemini({ topicId, topicName, subject, type }) {
    if (!llmClient.hasValidKey()) return null;

    let ragContext = '';
    try {
      const ragRes = ragTool.execute({
        query: `${topicName} ${subject} core theorems formulas algorithms invariants and boundary conditions`,
        filters: { topic_id: topicId, topK: 2 }
      });
      if (ragRes && ragRes.results && ragRes.results.length > 0) {
        ragContext = ragRes.results.map(r => r.text).join('\n---\n');
      }
    } catch (e) {
      ragContext = '';
    }

    const systemPrompt = `You are the GATE CSE Active Recall Generator in EduGraph AI.
Your role is to formulate deep, high-yield active recall retrieval probes for GATE Computer Science aspirants.

Rules:
1. Target Subject: ${subject || 'Computer Science'}
2. Target Topic: ${topicName} (ID: ${topicId})
3. Recall Mode: ${type || 'concept_recall'}
4. Do NOT generate multiple choice options.
5. Create a challenging, open-ended question that forces the student to retrieve core invariants, formulas, algorithms, trade-offs, state transitions, or definitions from memory.
6. Provide an authoritative reference solution, 3-5 crucial technical keyConcepts for automated scoring, a clear rubric, and difficulty level.
7. Return strictly valid JSON adhering to the required schema.`;

    const userPrompt = `Generate 1 novel, rigorous GATE CSE Active Recall question.
Context Material:
${ragContext || `Topic: ${topicName} in ${subject}`}

Required Output Format in strict JSON:
{
  "question": "The recall question text",
  "referenceAnswer": "Complete reference solution",
  "keyConcepts": ["key concept 1", "key concept 2", "key concept 3"],
  "rubric": "Grading criteria for full/partial credit",
  "difficulty": "medium",
  "citations": [{"source": "GATE Reference / Standard Textbook", "topic": "${topicName}"}]
}`;

    const promptSchema = {
      type: "OBJECT",
      properties: {
        question: { type: "STRING" },
        referenceAnswer: { type: "STRING" },
        keyConcepts: { type: "ARRAY", items: { type: "STRING" } },
        rubric: { type: "STRING" },
        difficulty: { type: "STRING", enum: ["easy", "medium", "hard"] },
        citations: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              source: { type: "STRING" },
              topic: { type: "STRING" }
            },
            required: ["source", "topic"]
          }
        }
      },
      required: ["question", "referenceAnswer", "keyConcepts", "rubric", "difficulty"]
    };

    try {
      const responseText = await llmClient.generate({
        systemPrompt,
        userPrompt,
        temperature: 0.7,
        jsonMode: true,
        responseSchema: promptSchema
      });

      if (!responseText) return null;

      const cleaned = responseText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      if (parsed && parsed.question && parsed.referenceAnswer) {
        return {
          type: type || 'concept_recall',
          difficulty: parsed.difficulty || 'medium',
          question: parsed.question,
          referenceAnswer: parsed.referenceAnswer,
          keyConcepts: Array.isArray(parsed.keyConcepts) ? parsed.keyConcepts : [topicName.toLowerCase()],
          rubric: parsed.rubric || 'Verify conceptual accuracy against reference answer.',
          citations: Array.isArray(parsed.citations) && parsed.citations.length > 0 
            ? parsed.citations 
            : [{ source: 'GATE CSE Live Gemini AI Synthesis', topic: topicName }]
        };
      }
    } catch (err) {
      console.warn('Gemini dynamic prompt generation error:', err.message);
      return null;
    }

    return null;
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

    // Dynamic synthesis based on syllabus and RAG
    const ragRes = ragTool.execute({
      query: `${topicName} definition principle rules invariants`,
      filters: { topic_id: topicId, topK: 1 }
    });

    const snippet = (ragRes && ragRes.results && ragRes.results[0]?.text) 
      ? ragRes.results[0].text.slice(0, 150) + '...'
      : `Core theoretical rules and system invariants for ${topicName}.`;

    return {
      type: type || 'concept_recall',
      difficulty: 'medium',
      question: `State the fundamental theoretical principle, key invariants, and primary performance trade-offs of ${topicName} in GATE Computer Science.`,
      referenceAnswer: `In GATE CSE, ${topicName} governs algorithmic bounds and state transitions: ${snippet}`,
      keyConcepts: [topicName.toLowerCase(), 'invariants', 'trade-offs'],
      rubric: 'Must state core definition and identify primary trade-offs or constraints.',
      citations: [{ source: 'GATE CSE Verified Syllabus', topic: topicName }]
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
   * Generate an active recall challenge
   * Stored securely server-side; answer key is NEVER sent to the student.
   */
  async generatePrompt({ topicId, subject, type, userId }) {
    const selection = this.selectTargetTopic({ topicId, subject, userId });
    const targetTopicId = selection.topicId;
    const topicName = selection.topicName;
    const topicSubject = selection.subject;

    // Check user's recent recall prompts to avoid immediate repetition
    let recentPromptIds = [];
    if (userId) {
      const recentAttempts = db.prepare(`
        SELECT question FROM attempts
        WHERE user_id = ? AND agent = ?
        ORDER BY created_at DESC LIMIT 5
      `).all(userId, this.role);
      recentPromptIds = recentAttempts.map(a => a.question);
    }

    let selectedPrompt = null;

    // 1. Try dynamic Gemini generation first
    if (llmClient.hasValidKey()) {
      selectedPrompt = await this.generatePromptWithGemini({
        topicId: targetTopicId,
        topicName,
        subject: topicSubject,
        type
      });
    }

    // 2. Fallback to procedural syllabus bank
    if (!selectedPrompt) {
      selectedPrompt = this.generatePromptProcedural({
        topicId: targetTopicId,
        topicName,
        subject: topicSubject,
        type,
        recentPromptQuestions: recentPromptIds
      });
    }

    const promptId = `prompt_${crypto.randomUUID()}`;
    const promptType = selectedPrompt.type || type || 'concept_recall';
    const difficulty = selectedPrompt.difficulty || 'medium';
    const citations = selectedPrompt.citations || [{ source: 'Standard GATE CSE Reference', topic: topicName }];

    // Securely persist prompt in SQLite database
    db.prepare(`
      INSERT INTO recall_prompts (id, topic_id, prompt_type, question, reference_answer, key_concepts, rubric, difficulty, source_references)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      promptId,
      targetTopicId,
      promptType,
      selectedPrompt.question,
      selectedPrompt.referenceAnswer,
      JSON.stringify(selectedPrompt.keyConcepts || []),
      selectedPrompt.rubric || '',
      difficulty,
      JSON.stringify(citations)
    );

    // Return ONLY student-facing metadata. No referenceAnswer or keyConcepts!
    return {
      agent: this.role,
      promptId,
      topicId: targetTopicId,
      topicName,
      subject: topicSubject,
      promptType,
      difficulty,
      question: selectedPrompt.question,
      recommendationReason: selection.reason,
      sourceReferences: citations
    };
  }

  /**
   * Grade student active recall response, update BKT, and recommend next actions
   */
  async gradeResponse({ promptId, topicId, studentAnswer, userId, idempotencyKey }) {
    if (!studentAnswer || studentAnswer.trim() === '') {
      return {
        agent: this.role,
        score: 0,
        correctness: 'incorrect',
        isCorrect: false,
        feedback: 'No response submitted. Please type your explanation to test active recall from memory.',
        correctPoints: [],
        missingPoints: ['No answer provided'],
        misconceptions: [],
        referenceAnswer: null,
        bktUpdate: null,
        nextAction: null
      };
    }

    // 1. Look up prompt from database server-side
    let promptRecord = null;
    if (promptId) {
      promptRecord = db.prepare('SELECT * FROM recall_prompts WHERE id = ?').get(promptId);
    }

    let question = promptRecord ? promptRecord.question : 'Active Recall Challenge';
    let targetTopicId = promptRecord ? promptRecord.topic_id : (topicId || 'os_scheduling');
    let referenceAnswer = promptRecord ? promptRecord.reference_answer : 'Standard syllabus explanation.';
    let keyConcepts = [];
    let rubric = promptRecord ? promptRecord.rubric : '';
    let citations = [];

    if (promptRecord) {
      try { keyConcepts = JSON.parse(promptRecord.key_concepts || '[]'); } catch (e) { keyConcepts = []; }
      try { citations = JSON.parse(promptRecord.source_references || '[]'); } catch (e) { citations = []; }
    } else {
      // Fallback search by topic
      const topicRow = db.prepare('SELECT name, subject FROM topics WHERE id = ?').get(targetTopicId);
      keyConcepts = [topicRow ? topicRow.name.toLowerCase() : 'concept'];
    }

    const topicRow = db.prepare('SELECT name, subject FROM topics WHERE id = ?').get(targetTopicId);
    const topicName = topicRow ? topicRow.name : targetTopicId;
    const topicSubject = topicRow ? topicRow.subject : 'Operating Systems';

    // 2. Perform semantic evaluation (with LLM / CrewAI or resilient domain engine)
    let evaluation = await this.evaluateSemantically({
      question,
      studentAnswer,
      referenceAnswer,
      keyConcepts,
      rubric,
      topicId: targetTopicId,
      topicName
    });

    const score = evaluation.score;
    const correctness = evaluation.correctness;
    // BKT binary mapping rule: score >= 60 maps to correct attempt
    const isCorrect = score >= 60;

    // 3. Deterministic BKT Update (Idempotent per user & prompt)
    let bktResult = null;
    if (userId) {
      // Verify idempotency
      const existingAttempt = db.prepare(`
        SELECT id FROM attempts
        WHERE user_id = ? AND topic_id = ? AND question = ? AND created_at > datetime('now', '-30 seconds')
      `).get(userId, targetTopicId, question);

      if (!existingAttempt) {
        bktResult = bktTool.recordPractice(
          userId,
          targetTopicId,
          this.role,
          question,
          studentAnswer,
          isCorrect
        );
      } else {
        // Return current state without double counting
        const currentMastery = db.prepare('SELECT p_know FROM mastery WHERE user_id = ? AND topic_id = ?').get(userId, targetTopicId);
        bktResult = {
          attemptId: existingAttempt.id,
          topicId: targetTopicId,
          previousPKnow: currentMastery ? currentMastery.p_know : 0.0,
          newPKnow: currentMastery ? currentMastery.p_know : 0.0,
          isCorrect
        };
      }
    }

    // 4. Formulate adaptive next action
    const newMastery = bktResult ? bktResult.newPKnow : (isCorrect ? 0.70 : 0.20);
    const nextAction = this.generateAdaptiveNextAction({
      topicId: targetTopicId,
      topicName,
      subject: topicSubject,
      isCorrect,
      score,
      newMastery
    });

    return {
      agent: this.role,
      promptId,
      topicId: targetTopicId,
      topicName,
      subject: topicSubject,
      score,
      correctness,
      isCorrect,
      feedback: evaluation.feedback,
      correctPoints: evaluation.correctPoints,
      missingPoints: evaluation.missingPoints,
      misconceptions: evaluation.misconceptions,
      referenceAnswer,
      sourceReferences: citations,
      bktUpdate: bktResult,
      nextAction
    };
  }

  /**
   * Semantic Evaluation Engine
   */
  async evaluateSemantically({ question, studentAnswer, referenceAnswer, keyConcepts, rubric, topicId, topicName }) {
    const studentLower = studentAnswer.toLowerCase().trim();

    // Check key concepts presence
    const matchedConcepts = [];
    const missingConcepts = [];

    for (const concept of keyConcepts) {
      const cLower = String(concept).toLowerCase();
      if (studentLower.includes(cLower)) {
        matchedConcepts.push(concept);
      } else {
        // Check fuzzy / word token overlap
        const words = cLower.split(/\s+/).filter(w => w.length > 3);
        const hasWordMatch = words.some(w => studentLower.includes(w));
        if (hasWordMatch) {
          matchedConcepts.push(concept);
        } else {
          missingConcepts.push(concept);
        }
      }
    }

    // Try CrewAI / LLM semantic evaluation first if configured
    if (llmClient.hasValidKey()) {
      try {
        const systemPrompt = `You are a strict and helpful GATE Computer Science evaluator.
Evaluate the student's active recall answer against the reference solution and rubric.
Output strictly JSON matching this schema:
{
  "score": integer (0 to 100),
  "correctness": "correct" | "partial" | "incorrect",
  "feedback": "2-3 concise, constructive sentences explaining accuracy and missing items",
  "correctPoints": ["point 1 correctly recalled", ...],
  "missingPoints": ["missing item 1", ...],
  "misconceptions": ["any wrong assumption", ...]
}`;

        const userPrompt = `Question: ${question}
Reference Answer: ${referenceAnswer}
Key Concepts Expected: ${JSON.stringify(keyConcepts)}
Rubric: ${rubric || 'Standard GATE conceptual accuracy'}
Student Answer: ${studentAnswer}`;

        const llmResult = await llmClient.generate({
          systemPrompt,
          userPrompt,
          temperature: 0.2,
          jsonMode: true
        });

        if (llmResult) {
          let clean = llmResult.trim();
          if (clean.includes('```json')) clean = clean.split('```json')[1].split('```')[0].trim();
          else if (clean.includes('```')) clean = clean.split('```')[1].split('```')[0].trim();
          const parsed = JSON.parse(clean);

          if (parsed && typeof parsed.score === 'number') {
            return {
              score: Math.max(0, Math.min(100, Math.round(parsed.score))),
              correctness: parsed.correctness || (parsed.score >= 70 ? 'correct' : (parsed.score >= 40 ? 'partial' : 'incorrect')),
              feedback: parsed.feedback || 'Answer evaluated.',
              correctPoints: Array.isArray(parsed.correctPoints) && parsed.correctPoints.length > 0 ? parsed.correctPoints : matchedConcepts,
              missingPoints: Array.isArray(parsed.missingPoints) ? parsed.missingPoints : missingConcepts,
              misconceptions: Array.isArray(parsed.misconceptions) ? parsed.misconceptions : []
            };
          }
        }
      } catch (err) {
        console.warn('[ActiveRecall LLM Evaluation Warning]:', err.message);
      }
    }

    // Resilient deterministic grading
    const totalConcepts = Math.max(1, keyConcepts.length);
    const conceptRatio = matchedConcepts.length / totalConcepts;
    const wordCount = studentAnswer.trim().split(/\s+/).length;

    let score = Math.round(conceptRatio * 85);
    if (wordCount >= 8 && conceptRatio > 0) score += 15;
    score = Math.max(0, Math.min(100, score));

    let correctness = 'incorrect';
    if (score >= 70) correctness = 'correct';
    else if (score >= 40) correctness = 'partial';

    let feedback = '';
    if (correctness === 'correct') {
      feedback = `Accurate recall. You successfully identified key principles (${matchedConcepts.join(', ') || 'essential rules'}).`;
    } else if (correctness === 'partial') {
      feedback = `Partially correct. You recalled ${matchedConcepts.join(', ') || 'some points'}, but missed: ${missingConcepts.join(', ') || 'key terms'}.`;
    } else {
      feedback = `Needs reinforcement. Key elements missing: ${missingConcepts.join(', ') || 'essential definitions'}. Review the reference solution.`;
    }

    return {
      score,
      correctness,
      feedback,
      correctPoints: matchedConcepts,
      missingPoints: missingConcepts,
      misconceptions: []
    };
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
