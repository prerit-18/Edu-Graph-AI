const ragTool = require('../tools/rag_tool');
const llmClient = require('./llm_client');
const db = require('../database/db');
const crypto = require('crypto');
const agentPrompts = require('../services/agent_prompts');
const tokenMonitor = require('../services/token_monitor');
const responseCache = require('../services/response_cache');

/**
 * Concept Teacher Agent
 * Role: Senior GATE CSE Professor & Concept Specialist
 * Goal: Deliver direct, accurate GATE CSE conceptual explanations with relevant related concepts and verified citations.
 * Backstory: Expert GATE Computer Science professor who delivers direct, focused conceptual explanations with relevant related concepts, key formulas, and zero fluff.
 */
class ConceptTeacherAgent {
  constructor() {
    this.role = 'Concept Teacher';
    this.goal = 'Deliver direct, accurate GATE CSE conceptual explanations with relevant related concepts and verified citations.';
    this.backstory = 'Expert GATE Computer Science professor who delivers direct, focused conceptual explanations with relevant related concepts, key formulas, and zero fluff.';
    this.tools = [ragTool];
  }

  /**
   * Generates a direct, concise, and structured explanation for core GATE CSE concepts
   */
  generateCuratedExplanation(query, topicId, subject, ragContext) {
    const q = query.toLowerCase();

    // 1. Deadlock Prevention / Deadlocks / Banker's Algorithm
    if (q.includes('deadlock') && q.includes('prevention') || (topicId === 'os_deadlock' && q.includes('prevention'))) {
      return `**Deadlock Prevention**

Deadlock prevention is a technique in Operating Systems that ensures at least one of the four necessary conditions for deadlock never holds.

**Four Necessary Conditions:**
- Mutual Exclusion
- Hold and Wait
- No Preemption
- Circular Wait

**Related Concepts:**
- Deadlock Avoidance: Allocates resources carefully to keep the system in a safe state.
- Deadlock Detection: Identifies deadlocks after they occur.
- Banker's Algorithm: A deadlock avoidance algorithm.`;
    }

    if (q.includes('banker')) {
      return `**Banker's Algorithm**

Banker's Algorithm is a deadlock avoidance algorithm that dynamically evaluates resource allocation requests to ensure the system never enters an unsafe state.

**Core Mechanics & Formulas:**
- **Need Matrix:** $Need[i, j] = Max[i, j] - Allocation[i, j]$
- **Safety Criterion:** A state is safe if there exists a sequence of processes $\\langle P_0, P_1, \\dots, P_{n-1} \\rangle$ such that for each $P_i$, $Need_i \\le Available + \\sum_{k < i} Allocation_k$.
- **Complexity:** Time complexity is $\\mathcal{O}(m \\cdot n^2)$ where $n$ is the number of processes and $m$ is the number of resource types.

**Related Concepts:**
- Deadlock Prevention: Eliminates deadlock by statically invalidating at least one of the four necessary conditions.
- Deadlock Detection: Allows deadlock to occur, identifies it periodically using wait-for graphs, and initiates recovery.
- Safe State: A state from which the system can allocate resources up to each process's maximum claim without deadlocking.`;
    }

    if (topicId === 'os_deadlock' || q.includes('deadlock') || q.includes('coffman') || q.includes('safe state')) {
      return `**Deadlock**

A deadlock is a situation in Operating Systems where two or more processes are permanently blocked because each process holds resources and waits for other resources held by processes in the set.

**Four Necessary Conditions (Coffman Conditions):**
- **Mutual Exclusion:** At least one resource must be held in a non-shareable mode.
- **Hold and Wait:** A process holds at least one resource and is waiting to acquire additional resources held by other processes.
- **No Preemption:** Resources cannot be forcibly confiscated; they are released only voluntarily by the holding process.
- **Circular Wait:** A closed chain of processes exists such that each process holds resources needed by the next process in the chain.

**Related Concepts:**
- Deadlock Prevention: Statically invalidates at least one of the four necessary Coffman conditions.
- Deadlock Avoidance: Evaluates requests dynamically to guarantee the system stays in a safe state (e.g., Banker's Algorithm).
- Deadlock Detection: Allows deadlocks to occur, detects cycles in Resource Allocation Graphs, and recovers via preemption or termination.`;
    }

    // 2. CPU Scheduling (SJF / SRTF / Round Robin / FCFS)
    if (q.includes('sjf') || q.includes('srtf')) {
      return `**Shortest Remaining Time First (SRTF) / Shortest Job First (SJF)**

Shortest Job First (SJF) is a CPU scheduling algorithm that selects the waiting process with the smallest CPU burst time. SRTF is the preemptive variant of SJF, preempting the currently executing process whenever a newly arrived process has a shorter remaining burst time.

**Key Formulas & Invariants:**
- **Turnaround Time ($TAT$):** $TAT = CT - AT$ (Completion Time - Arrival Time)
- **Waiting Time ($WT$):** $WT = TAT - BT$ (Turnaround Time - Burst Time)
- **Optimality:** SRTF is provably optimal for minimizing average waiting time among all scheduling algorithms.
- **Limitation:** Can lead to starvation for longer jobs; requires prior knowledge or estimation of upcoming CPU bursts.

**Related Concepts:**
- FCFS (First-Come, First-Served): Non-preemptive scheduling based on arrival order; susceptible to the Convoy Effect.
- Round Robin (RR): Preemptive time-sliced scheduling designed for fairness and low response time.
- Priority Scheduling: Allocates CPU based on priority; uses Aging to prevent starvation.
- Convoy Effect: Slowdown of short processes queueing behind a long CPU-bound process.`;
    }

    if (q.includes('round robin')) {
      return `**Round Robin (RR) Scheduling**

Round Robin is a preemptive CPU scheduling algorithm designed for time-sharing systems where each ready process is assigned the CPU for a fixed time interval called a time quantum ($q$).

**Key Properties & Behavior:**
- **Fairness:** Provably starvation-free because processes are cycled in a FIFO queue.
- **Quantum Bounds:** If $q \\to \\infty$, Round Robin degenerates into FCFS. If $q$ is extremely small, it behaves like Processor Sharing, but context switch overhead increases significantly.
- **Formulas:** Turnaround Time $TAT = CT - AT$, Waiting Time $WT = TAT - BT$.

**Related Concepts:**
- FCFS Scheduling: Non-preemptive base algorithm equivalent to Round Robin with an infinite time quantum.
- Context Switching: CPU state-saving overhead incurred each time the CPU switches processes.
- SRTF: Preemptive algorithm that minimizes average waiting time rather than maximizing fairness.`;
    }

    if (topicId === 'os_scheduling' || q.includes('schedul') || q.includes('turnaround') || q.includes('fcfs')) {
      return `**CPU Scheduling**

CPU scheduling is an Operating Systems mechanism that allocates CPU cores among ready processes to optimize system performance metrics such as throughput, turnaround time, and responsiveness.

**Core Formulas & Metrics:**
- **Turnaround Time ($TAT$):** $TAT = CT - AT$ (Completion Time - Arrival Time)
- **Waiting Time ($WT$):** $WT = TAT - BT$ (Turnaround Time - Burst Time)
- **Response Time ($RT$):** Time from process arrival until its first CPU execution.

**Related Concepts:**
- Preemptive vs Non-Preemptive: Preemptive scheduling can interrupt running processes; non-preemptive runs a process until completion or I/O wait.
- Shortest Remaining Time First (SRTF): Minimizes average waiting time across all scheduling algorithms.
- Round Robin (RR): Time-sliced scheduling ensuring responsiveness and fairness for interactive environments.
- Starvation: Condition where a process is indefinitely denied CPU time, solved by Aging.`;
    }

    // 3. Process Synchronization & Peterson's Algorithm / Semaphores
    if (q.includes('peterson')) {
      return `**Peterson's Algorithm**

Peterson's algorithm is a software-based solution to the critical section problem for two concurrent processes using shared memory variables and busy waiting.

**Mechanism & Shared Variables:**
- **Variables:** \`boolean flag[2]\` (indicates process interest) and \`int turn\` (indicates tie-breaker turn).
- **Entry Section for $P_i$:** Sets \`flag[i] = true\` and \`turn = j\`, then loops while \`flag[j] && turn == j\`.
- **Exit Section:** Sets \`flag[i] = false\`.
- **Correctness:** Satisfies Mutual Exclusion, Progress, and Bounded Waiting for two processes on sequentially consistent memory.

**Related Concepts:**
- Critical Section: Section of code accessing shared resources that must not be accessed concurrently by multiple threads.
- Semaphores: OS-level synchronization primitives with atomic \`wait()\` and \`signal()\` operations.
- TestAndSet / CompareAndSwap: Hardware-atomic instructions used to build spinlocks and locks for $N$ processes.
- Race Condition: A concurrency flaw where output depends on the arbitrary interleaving of thread execution.`;
    }

    if (topicId === 'os_sync' || q.includes('semaphore') || q.includes('critical section') || q.includes('mutex') || q.includes('sync')) {
      return `**Process Synchronization & Critical Section**

Process synchronization coordinates concurrent processes that share memory or resources to preserve data consistency and prevent race conditions.

**Three Critical Section Requirements:**
- **Mutual Exclusion:** Only one process can execute in its critical section at any given time.
- **Progress:** If no process is in its critical section and some wish to enter, only those not in their remainder sections can participate in the selection.
- **Bounded Waiting:** A bound must exist on the number of times other processes are allowed to enter their critical sections after a process has requested entry.

**Related Concepts:**
- Counting Semaphore: Integer variable accessed atomically via \`wait(S)\` (decrements) and \`signal(S)\` (increments).
- Binary Semaphore (Mutex): Semaphore restricted to values 0 and 1 used for mutual exclusion.
- Peterson's Algorithm: Software solution for two-process synchronization satisfying all three requirements.
- Deadlock: A condition where processes are permanently blocked waiting for resources held by each other.`;
    }

    // 4. Virtual Memory & Page Replacement / Belady's Anomaly
    if (q.includes('belady')) {
      return `**Belady's Anomaly**

Belady's Anomaly is the phenomenon in virtual memory where increasing the number of physical page frames allocated to a process results in an increase in the number of page faults.

**Key Characteristics:**
- Observed in FIFO (First-In, First-Out) page replacement algorithm.
- Does **not** occur in Stack Algorithms (such as LRU and Optimal), because for any reference string, the set of pages in an $n$-frame memory is always a subset of pages in an $(n+1)$-frame memory ($C(n) \\subseteq C(n+1)$).

**Related Concepts:**
- FIFO Page Replacement: Evicts the oldest loaded page; susceptible to Belady's Anomaly.
- LRU (Least Recently Used): Stack-based algorithm that evicts the page unaccessed for the longest duration.
- Optimal Page Replacement (OPT): Benchmark algorithm replacing the page not needed for the longest future duration.
- Page Fault: Trap raised by the MMU when a program accesses a virtual page not present in main memory.`;
    }

    if (topicId === 'os_virtual_mem' || q.includes('paging') || q.includes('virtual memory') || q.includes('page fault') || q.includes('tlb') || q.includes('lru') || q.includes('fifo')) {
      return `**Virtual Memory & Paging**

Virtual memory separates logical memory as perceived by the programmer from physical memory, allowing execution of processes that may not be completely in physical RAM.

**Key Formulas:**
- **Effective Memory Access Time ($EMAT$) with TLB:**
  $$EMAT = h \\cdot (t_{\\text{TLB}} + t_{\\text{RAM}}) + (1 - h) \\cdot (t_{\\text{TLB}} + 2 \\cdot t_{\\text{RAM}})$$
  *(where $h$ is TLB hit ratio, $t_{\\text{TLB}}$ is TLB access time, and $t_{\\text{RAM}}$ is main memory access time).*
- **Effective Access Time with Page Faults ($EAT$):**
  $$EAT = (1 - p) \\cdot t_{\\text{RAM}} + p \\cdot t_{\\text{fault}}$$
  *(where $p$ is page fault rate).*

**Related Concepts:**
- Translation Lookaside Buffer (TLB): Associative hardware cache storing recent page table translations.
- Page Fault: Interrupt triggered when accessing a virtual address whose page is not in physical RAM.
- Belady's Anomaly: Counter-intuitive increase in page faults when more frames are allocated under FIFO replacement.
- Thrashing: Severe performance degradation where the system spends more time servicing page faults than executing instructions.`;
    }

    // 5. Asymptotic Analysis & Master Theorem
    if (topicId === 'algo_asymptotic' || q.includes('asymptotic') || q.includes('master theorem') || q.includes('big-o') || q.includes('recurrence') || q.includes('theta')) {
      return `**Master Theorem for Divide-and-Conquer**

The Master Theorem provides asymptotic solutions for divide-and-conquer recurrences of the form:
$$T(n) = a T\\left(\\frac{n}{b}\\right) + f(n) \\quad (a \\ge 1, b > 1)$$

**Three Cases (Comparing $f(n)$ with $n^{\\log_b a}$):**
1. **Case 1 (Leaf Heavy):** If $f(n) = \\mathcal{O}(n^{\\log_b a - \\epsilon})$ for $\\epsilon > 0 \\implies T(n) = \\Theta(n^{\\log_b a})$.
2. **Case 2 (Balanced):** If $f(n) = \\Theta(n^{\\log_b a} \\log^k n)$ for $k \\ge 0 \\implies T(n) = \\Theta(n^{\\log_b a} \\log^{k+1} n)$.
3. **Case 3 (Root Heavy):** If $f(n) = \\Omega(n^{\\log_b a + \\epsilon})$ for $\\epsilon > 0$ and $a f(n/b) \\le c f(n)$ for $c < 1 \\implies T(n) = \\Theta(f(n))$.

**Related Concepts:**
- Asymptotic Notations: $\\mathcal{O}$ (upper bound), $\\Omega$ (lower bound), and $\\Theta$ (tight bound).
- Recursion Tree Method: Visual recurrence solving method that sums work across tree levels.
- Substitution Method: Proves recurrence bounds using mathematical induction.
- Divide and Conquer: Algorithmic design paradigm that breaks a problem into independent subproblems (e.g., Merge Sort).`;
    }

    // 6. Normalization & BCNF / Functional Dependencies
    if (topicId === 'dbms_normalization' || q.includes('normal') || q.includes('bcnf') || q.includes('3nf') || q.includes('2nf') || q.includes('dependency') || q.includes('lossless')) {
      return `**Boyce-Codd Normal Form (BCNF)**

A relational schema $R$ is in BCNF if for every non-trivial functional dependency $X \\to Y$, the determinant $X$ is a superkey of $R$.

**Normal Form Hierarchy:**
- **1NF:** All attribute domains contain only atomic, indivisible values.
- **2NF:** In 1NF and contains no partial dependencies (no non-prime attribute depends on a proper subset of any candidate key).
- **3NF:** In 2NF and for every non-trivial $X \\to Y$, either $X$ is a superkey OR $Y$ is a prime attribute.
- **BCNF:** For every non-trivial $X \\to Y$, $X$ must be a superkey (no prime attribute exception).

**Key Properties:**
- 3NF always guarantees both Lossless Join and Dependency Preservation.
- BCNF always guarantees Lossless Join, but may not preserve all functional dependencies.

**Related Concepts:**
- Functional Dependency ($X \\to Y$): Constraint where attribute set $X$ uniquely determines attribute set $Y$.
- Candidate Key: Minimal superkey with no redundant attributes.
- Lossless Decomposition: Ensures the natural join of decomposed relations exactly reconstructs the original relation without spurious tuples.
- Dependency Preservation: Property ensuring that each functional dependency can be verified on a single decomposed table without expensive joins.`;
    }

    // 7. Transactions & Strict 2PL / Serializability
    if (topicId === 'dbms_transactions' || q.includes('transaction') || q.includes('2pl') || q.includes('serializ') || q.includes('conflict') || q.includes('acid') || q.includes('recover')) {
      return `**Two-Phase Locking (2PL)**

Two-Phase Locking (2PL) is a concurrency control protocol that guarantees conflict serializability by requiring each transaction to acquire all locks before releasing any lock.

**Phases & Variations:**
- **Growing Phase:** Transaction acquires locks; cannot release any lock.
- **Shrinking Phase:** Transaction releases locks; cannot acquire any new lock.
- **Strict 2PL:** Holds all Exclusive (X) locks until the transaction commits or aborts. Guarantees conflict serializability and avoids cascading aborts (ACA).
- **Rigorous (SS2PL):** Holds all Shared (S) and Exclusive (X) locks until commit/abort.

**Related Concepts:**
- Conflict Serializability: A schedule is conflict serializable if and only if its precedence graph contains no cycles.
- ACID Properties: Atomicity, Consistency, Isolation, and Durability guarantees of database transactions.
- Cascading Abort: Failure where the abort of one transaction forces dependent transactions that read uncommitted data to roll back.
- Precedence Graph: Directed graph representing conflicting operations used to test for serializability.`;
    }

    // Default dynamic synthesis from RAG context
    const cleanQuery = query.replace(/^(what is|explain|define|describe)\s+/i, '').replace(/[?#*]/g, '').trim();
    const conceptTitle = cleanQuery ? (cleanQuery.charAt(0).toUpperCase() + cleanQuery.slice(1)) : 'Core Concept';

    return `**${conceptTitle}**

${ragContext || 'Grounded GATE CSE concept explanation.'}

**Related Concepts:**
- System Invariants: Mathematical and theoretical guarantees governing this topic in GATE CSE.
- Boundary Conditions: Edge cases including empty inputs, single elements, and saturated resource states.
- Performance Bounds: Algorithmic time and space complexities or hardware latency characteristics.`;
  }

  async run({ query, userId, subject, topicId, maxOutputTokens, featureLabel }) {
    // Check response cache
    const cacheKey = responseCache.makeKey('Concept Teacher', topicId || subject || 'general', query, userId);
    if (cacheKey) {
      const cached = responseCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // 1. Invoke RAG Tool to retrieve verified knowledge base evidence
    const retrieval = ragTool.execute({
      query,
      filters: { subject, topic_id: topicId, topK: 2 }
    });

    const isGrounded = retrieval.isGrounded;

    // Log interaction to agent_logs
    if (userId) {
      db.prepare(`
        INSERT INTO agent_logs (id, user_id, agent, grounded, detail)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        userId,
        this.role,
        isGrounded ? 1 : 0,
        JSON.stringify({ query, confidence: retrieval.confidence })
      );
    }

    // 2. Strict grounding check: if evidence is insufficient, refuse fabrication!
    if (!isGrounded) {
      return {
        agent: this.role,
        grounded: false,
        confidence: retrieval.confidence,
        explanation: `⚠️ **Concept Grounding Notice**: I cannot provide a verified answer for this query. ${retrieval.refusalReason}`,
        citations: [],
        suggestedActions: [
          'Verify that the query pertains directly to GATE CSE (Operating Systems, Algorithms, or DBMS).',
          'Explore official syllabus topics from the Dashboard or Syllabus view.'
        ]
      };
    }

    // 3. Evidence is sufficient - generate grounded explanation
    const contextSnippets = retrieval.results.map(r => r.text).join('\n---\n');

    const systemPrompt = agentPrompts.CONCEPT_TEACHER;
    const cleanTitle = query.replace(/^(what is|explain|define|describe)\s+/i, '').replace(/[?#*]/g, '').trim();
    const userPrompt = `Student Question: ${query}

Verified Context Chunks:
${contextSnippets}

Instructions:
- Start directly with the answer: format the concept name in bold (e.g. **${cleanTitle || 'Concept Name'}**).
- Explain the concept clearly, accurately, and concisely for GATE CSE.
- Include key formulas, invariants, or time/space complexities when relevant.
- End with a "**Related Concepts:**" section listing 2-4 closely related concepts with a 1-line connection each.
- Do NOT include greetings, introductions, conclusions, or quizzes.`;

    let explanation = await llmClient.generate({
      systemPrompt,
      userPrompt,
      maxOutputTokens: maxOutputTokens || agentPrompts.LIMITS.concept_explain,
      agentLabel: 'Concept Teacher',
      featureLabel: featureLabel || 'concept_explain'
    });

    if (!explanation) {
      // Dynamic masterclass query-grounded synthesis
      const topMatch = retrieval.results[0];
      const meta = topMatch.metadata;
      const assignedTopic = topicId || meta.topic_id;
      const assignedSubject = subject || meta.subject;

      explanation = this.generateCuratedExplanation(query, assignedTopic, assignedSubject, topMatch.text);
    }

    const result = {
      agent: this.role,
      grounded: true,
      confidence: retrieval.confidence,
      explanation,
      citations: retrieval.citations
    };

    if (cacheKey && result.grounded) {
      responseCache.set(cacheKey, 'Concept Teacher', topicId || 'general', result);
    }

    return result;
  }
}

module.exports = new ConceptTeacherAgent();

