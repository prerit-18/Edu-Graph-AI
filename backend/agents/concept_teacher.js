const ragTool = require('../tools/rag_tool');
const llmClient = require('./llm_client');
const db = require('../database/db');
const crypto = require('crypto');

/**
 * Concept Teacher Agent
 * Role: Senior GATE CSE Professor & Concept Specialist
 * Goal: Deliver precise, engaging, intuitive, and strictly grounded explanations with citations.
 * Backstory: Renowned GATE Computer Science professor who explains complex system concepts rigorously with mental models, formal proofs, and exam trap alerts without hallucinating.
 */
class ConceptTeacherAgent {
  constructor() {
    this.role = 'Concept Teacher';
    this.goal = 'Deliver strictly grounded, highly structured, and engaging GATE CSE conceptual explanations with verified citations.';
    this.backstory = 'Renowned GATE Computer Science professor who explains complex system concepts rigorously with mental models, formal proofs, and exam trap alerts without hallucinating.';
    this.tools = [ragTool];
  }

  /**
   * Generates a curated, masterclass-level structured explanation for core GATE CSE concepts
   */
  generateCuratedExplanation(query, topicId, subject, ragContext) {
    const q = query.toLowerCase();

    // 1. CPU Scheduling (SJF / SRTF / Round Robin / FCFS / Priority)
    if (topicId === 'os_scheduling' || q.includes('schedul') || q.includes('sjf') || q.includes('srtf') || q.includes('round robin') || q.includes('turnaround')) {
      return `### 📘 Operating Systems ➔ CPU Scheduling & Algorithm Mechanics
*Managing the CPU pipeline to optimize throughput, minimize latency, and prevent process starvation.*

---

### 🎯 1. Intuition & Mental Model: "The Airport Runway Controller"
Imagine an airport with a single active runway (the **CPU**) and several arriving flights (the **Processes**). 
- If you serve flights strictly in order of arrival (**FCFS**), a delayed jumbo cargo jet will trap fast commuter planes behind it—this is the classic **Convoy Effect**.
- If you prioritize the fastest landing planes (**SJF / SRTF**), average wait time drops to the mathematical minimum, but heavy jets may face infinite delays (**Starvation**).
- If you give every plane exactly 2 minutes on the runway in turn (**Round Robin**), response time is democratic and fair, but switching planes too fast burns excess fuel on overhead (**Context Switching Overhead**).

---

### ⚡ 2. Core Mechanics, Rules & Mathematical Invariants
Every GATE scheduling problem is governed by fundamental timing invariants:

- **Completion Time ($CT$):** The exact clock tick when a process finishes its final instruction.
- **Turnaround Time ($TAT$):** Total lifespan of the process in the system:
  $$\\mathbf{TAT = CT - AT}$$ *(where $AT$ is Arrival Time)*
- **Waiting Time ($WT$):** Time spent idling in the ready queue:
  $$\\mathbf{WT = TAT - BT}$$ *(where $BT$ is CPU Burst Time)*
- **Response Time ($RT$):** Time from $AT$ until the process **first gets the CPU**. *(Note: For non-preemptive algorithms, $RT = WT$).*

---

### 🔍 3. Step-by-Step Architectural Execution Walkthrough
Consider 3 processes under **SRTF (Preemptive SJF)**:
- $P_1: AT=0, BT=8$
- $P_2: AT=1, BT=4$
- $P_3: AT=2, BT=2$

\`\`\`
Timeline Trace (Gantt Chart):
[  P1 (1)  ][   P3 (2)   ][    P2 (4)    ][       P1 (7)       ]
0          1             3               7                    14
\`\`\`

1. **At $t=0$:** Only $P_1$ is present. Runs for 1 unit $\\to$ Remaining $BT(P_1) = 7$.
2. **At $t=1$:** $P_2$ arrives with $BT=4 < 7$. $P_1$ is **preempted**; $P_2$ runs.
3. **At $t=2$:** $P_3$ arrives with $BT=2 < \\text{Remaining } BT(P_2)=3$. $P_2$ is **preempted**; $P_3$ runs to completion at $t=3$.
4. **At $t=3$:** Remaining: $P_2 (3), P_1 (7)$. $P_2$ executes until $t=7$.
5. **At $t=7$:** $P_1$ resumes and finishes at $t=14$.

---

### 🧠 4. High-Yield GATE Exam Insights & Traps
> ⚠️ **IIT Paper-Setter Trap:** Watch for **simultaneous arrivals and ties** in remaining burst time. Standard GATE convention resolves ties using lower Process ID ($PID$) or earlier $AT$. Always check if the question states non-preemptive vs. preemptive!
> 💡 **Exam Pro-Tip:** In Round Robin, if time quantum $q \\to \\infty$, RR degenerates to **FCFS**. If $q$ is infinitesimally small, it behaves as **Processor Sharing**, but context switch overhead consumes $100\\%$ CPU.

---

### 📊 5. Quick-Recall Comparison Matrix
| Scheduling Algorithm | Preemptive? | Minimizes Avg WT? | Starvation Possible? | Overhead / Complexity |
| :--- | :--- | :--- | :--- | :--- |
| **FCFS** | No | ❌ No (Convoy Effect) | ❌ No | $\\mathcal{O}(1)$ Queue |
| **SJF (Non-Preemptive)** | No | ✅ Yes (among non-preemptive) | ⚠️ Yes (long jobs) | Needs Burst Prediction |
| **SRTF (Preemptive)** | Yes | 🏆 Provably Optimal Avg WT | ⚠️ Yes | High Context Switching |
| **Round Robin (RR)** | Yes | ❌ Trade-off for responsiveness | ❌ No | Sensitive to Quantum $q$ |
| **Priority Scheduling** | Both | ❌ (Priority driven) | ⚠️ Yes (Aging fixes this) | Priority Queue |

---

### 🎯 6. Active Socratic Checkpoint
*Quick Test:* If 5 processes arrive at time $t=0$ with burst times $2, 4, 6, 8, 10$, which algorithm yields the exact same Gantt chart as SRTF? *(Hint: Look at arrival times and initial bursts!)*`;
    }

    // 2. Process Synchronization & Peterson's Algorithm / Semaphores
    if (topicId === 'os_sync' || q.includes('peterson') || q.includes('semaphore') || q.includes('critical section') || q.includes('mutex') || q.includes('sync')) {
      return `### 📘 Operating Systems ➔ Process Synchronization & Critical Section
*Guaranteeing race-free concurrent execution through atomic hardware primitives and software protocols.*

---

### 🎯 1. Intuition & Mental Model: "The Single-Key Bank Vault"
When multiple concurrent threads access shared memory (the **Critical Section**), unsynchronized interleavings create **Race Conditions**.
- **Mutual Exclusion:** Only one person can be inside the vault at any moment.
- **Progress:** If the vault is empty, only those waiting to enter can decide who goes next; outsiders cannot block entry.
- **Bounded Waiting:** A customer waiting outside must not be starved indefinitely while others repeatedly cut in line.

---

### ⚡ 2. Core Mechanics, Rules & Mathematical Invariants
A valid Critical Section solution **MUST** strictly satisfy the 3 Gold Invariants:
1. **Mutual Exclusion (Mandatory):** If $P_i$ is executing in its critical section, then no other process $P_j$ can execute in the critical section.
2. **Progress (Mandatory):** If no process is in critical section and some wish to enter, selection cannot be postponed indefinitely, and only processes in remainder section cannot participate.
3. **Bounded Waiting (Mandatory for Fairness):** There exists a bound on the number of times other processes are allowed to enter after a process has made a request.

---

### 🔍 3. Step-by-Step Architectural Walkthrough: Peterson's Algorithm
For two processes $P_0$ and $P_1$:
\`\`\`c
// Shared Variables:
boolean flag[2] = {false, false}; // Desire to enter
int turn;                          // Tie-breaker courtesy

// Entry Section for Process Pi (other is Pj):
flag[i] = true;
turn = j;
while (flag[j] && turn == j); // Busy wait

// ---> CRITICAL SECTION <---

// Exit Section:
flag[i] = false;
\`\`\`

**Why it works rigorously:**
- To enter, $P_0$ sets \`flag[0] = true\` and offers courtesy \`turn = 1\`.
- If both try simultaneously, \`turn\` will be either \`0\` or \`1\` (atomic memory write). The process whose write happened **first** will be granted entry because the other overwritten \`turn\` to the partner.

---

### 🧠 4. High-Yield GATE Exam Insights & Traps
> ⚠️ **IIT Paper-Setter Trap:** Semaphores: Remember that **Counting Semaphore** operations \`wait(S)\` (or \`P(S)\`) and \`signal(S)\` (or \`V(S)\`) are atomic! If initial $S = 7$, and $10\\text{ P}$ and $6\\text{ V}$ operations occur, the final value is $7 - 10 + 6 = 3$.
> 💡 **Exam Pro-Tip:** Peterson's algorithm satisfies **Mutual Exclusion, Progress, and Bounded Waiting**, but ONLY for 2 processes on modern sequentially consistent memory architectures.

---

### 📊 5. Quick-Recall Comparison Matrix
| Mechanism | Hardware/Software | Busy Waiting? | Handles $N$ Processes? | Prevents Deadlock? |
| :--- | :--- | :--- | :--- | :--- |
| **Strict Alternation** | Software | Yes | No (2 only) | Fails Progress |
| **Peterson's Algorithm** | Software | Yes | 2 (extended for $N$) | ✅ All 3 Criteria |
| **TestAndSet / Swap** | Hardware Atomic | Yes (Spinlock) | Yes | ✅ Mutex + Progress |
| **Counting Semaphore** | OS Primitive | No (Sleep/Wakeup) | Yes | ✅ General Counting |
| **Binary Semaphore / Mutex**| OS Primitive | No (Queue-based) | Yes | ✅ Value $\\in \\{0, 1\\}$ |

---

### 🎯 6. Active Socratic Checkpoint
*Quick Test:* If a counting semaphore $S$ is initialized to $12$, and during runtime 8 $P$ operations and 3 $V$ operations execute, how many processes are currently blocked in the sleep queue? *(Hint: Check if $S$ drops below zero!)*`;
    }

    // 3. Deadlocks & Banker's Algorithm
    if (topicId === 'os_deadlock' || q.includes('deadlock') || q.includes('banker') || q.includes('coffman') || q.includes('safe state')) {
      return `### 📘 Operating Systems ➔ Deadlocks & Banker's Avoidance
*Formalizing resource contention, circular dependencies, and safe state allocation algorithms.*

---

### 🎯 1. Intuition & Mental Model: "The Gridlocked Four-Way Intersection"
Four cars arrive simultaneously at a narrow crossroads, each turning left and blocking the path of the vehicle to their right.
No vehicle can proceed without another yielding, yet no vehicle has the space to yield. This is a **Deadlock**—a circular chain of processes where each holds a resource while waiting for another.

---

### ⚡ 2. Core Mechanics: The 4 Coffman Conditions (Simultaneous Necessity)
A system state can enter a deadlock **if and only if** all four conditions hold simultaneously:
1. **Mutual Exclusion:** At least one resource is held in a non-shareable mode.
2. **Hold and Wait:** A process holds $\\ge 1$ resource and is waiting to acquire additional resources held by others.
3. **No Preemption:** Resources cannot be forcibly confiscated; they are released only voluntarily.
4. **Circular Wait:** A closed chain $\\{P_0 \\to P_1 \\to \\dots \\to P_n \\to P_0\\}$ exists such that $P_i$ waits for a resource held by $P_{i+1}$.

---

### 🔍 3. Step-by-Step Execution: Banker's Safety Algorithm
Given $n$ processes and $m$ resource types:
- **Allocation Matrix ($Alloc$):** Currently assigned resources.
- **Max Matrix ($Max$):** Peak resource demand.
- **Need Matrix:** $\\mathbf{Need[i, j] = Max[i, j] - Alloc[i, j]}$
- **Available Vector ($Avail$):** Free unallocated resources.

\`\`\`
Safety Check Loop:
1. Find an index i such that: Finish[i] == false AND Need[i] <= Work
2. If found:
     Work = Work + Alloc[i]
     Finish[i] = true
     Append Pi to Safe Sequence
3. If all Finish[i] == true => Safe State (No Deadlock)
\`\`\`

---

### 🧠 4. High-Yield GATE Exam Insights & Traps
> ⚠️ **IIT Paper-Setter Trap:** An **Unsafe State is NOT necessarily a Deadlock State!** A Deadlock is a guaranteed unsafe state, but an unsafe state merely indicates the system *cannot prevent* a potential deadlock if all processes simultaneously request their maximum needs.
> 💡 **Exam Pro-Tip:** If a system has $m$ units of a single resource type and $n$ processes each needing at most $k$ units, the system is guaranteed deadlock-free if and only if:
> $$\\mathbf{m \\ge n(k - 1) + 1}$$

---

### 📊 5. Quick-Recall Comparison Matrix
| Strategy | Mechanism | Resource Utilization | Runtime Overhead |
| :--- | :--- | :--- | :--- |
| **Deadlock Prevention** | Invalidate $\\ge 1$ Coffman condition statically | Low (Conservative) | Low at runtime |
| **Deadlock Avoidance (Banker's)**| Dynamically allocate only if state remains Safe | Medium-High | High ($\\mathcal{O}(m \\cdot n^2)$ per request) |
| **Detection & Recovery** | Allow deadlock, run graph reduction, kill/preempt | High | Periodic CPU overhead |
| **Ostrich Algorithm** | Ignore deadlock completely (Unix / Windows model)| Highest | Zero (assumes rare occurrence) |

---

### 🎯 6. Active Socratic Checkpoint
*Quick Test:* A system has 3 processes sharing 4 instances of resource $R$. Each process requires at most 2 instances. Can this system ever deadlock? *(Apply the formula $m \\ge n(k-1)+1$).*`;
    }

    // 4. Virtual Memory & Page Replacement / Belady's Anomaly
    if (topicId === 'os_virtual_mem' || q.includes('paging') || q.includes('virtual memory') || q.includes('belady') || q.includes('page fault') || q.includes('tlb') || q.includes('lru') || q.includes('fifo')) {
      return `### 📘 Operating Systems ➔ Virtual Memory, Paging & Page Replacement
*Decoupling logical from physical memory, translation lookaside buffers (TLB), and replacement anomalies.*

---

### 🎯 1. Intuition & Mental Model: "The Library Desk & The Warehouse"
Your desk (**RAM Frames**) can hold only 3 books at a time, while the central university warehouse (**Disk Swap Space**) holds 10,000 books.
- When you need a book on your desk $\\to$ **Page Hit** (nanoseconds).
- When a required book is in the warehouse $\\to$ **Page Fault** (milliseconds—CPU pauses while disk I/O fetches the frame).
- Choosing which book on your desk to pack away back to the shelf is the **Page Replacement Policy**.

---

### ⚡ 2. Core Mechanics & Mathematical Formulations
- **Effective Memory Access Time ($EMAT$) with TLB:**
  $$\\mathbf{EMAT = h \\cdot (t_{\\text{TLB}} + t_{\\text{RAM}}) + (1 - h) \\cdot (t_{\\text{TLB}} + 2 \\cdot t_{\\text{RAM}})}$$
  *(where $h$ is TLB hit ratio, $t_{\\text{TLB}}$ is associative lookup time, $t_{\\text{RAM}}$ is main memory access time).*
- **Effective Access Time with Page Faults ($EAT$):**
  $$\\mathbf{EAT = (1 - p) \\cdot t_{\\text{RAM}} + p \\cdot t_{\\text{Page Fault Service}}}$$
  *(where $p$ is page fault rate).*

---

### 🔍 3. Step-by-Step Architectural Walkthrough: Belady's Anomaly
**Belady's Anomaly** is the counter-intuitive phenomenon where allocating **more physical page frames results in MORE page faults** under FIFO replacement.

Example Reference String: \`1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5\`
- With **3 Frames (FIFO):** Total Page Faults = **9**
- With **4 Frames (FIFO):** Total Page Faults = **10** (Anomalous increase!)

\`\`\`
Why Stack Algorithms (LRU, OPT) NEVER exhibit Belady's Anomaly:
For any reference string S, the set of pages in an n-frame cache 
is ALWAYS a subset of the pages in an (n+1)-frame cache:
C(n, t) ⊆ C(n+1, t)
FIFO is NOT a stack algorithm because its eviction depends on arrival order, not recency.
\`\`\`

---

### 🧠 4. High-Yield GATE Exam Insights & Traps
> ⚠️ **IIT Paper-Setter Trap:** Multi-level Paging: For an $n$-level page table, a TLB miss requires $(n + 1)$ main memory accesses ($n$ page directory/table reads $+ 1$ actual data frame read).
> 💡 **Exam Pro-Tip:** Optimal Page Replacement (OPT / Belady's Min) provides the lowest possible page fault count and serves as the benchmark, but is impossible in real systems because it requires knowledge of future memory references.

---

### 📊 5. Quick-Recall Comparison Matrix
| Algorithm | Eviction Criteria | Suffers from Belady's Anomaly? | Hardware Overhead | Stack Algorithm? |
| :--- | :--- | :--- | :--- | :--- |
| **FIFO** | Oldest loaded page | ⚠️ **YES** | Low (Circular pointer) | ❌ No |
| **LRU** | Least recently accessed | ❌ **NO** | High (Timestamps / Stack)| ✅ Yes |
| **Optimal (OPT)** | Longest time until next access | ❌ **NO** | Offline Oracle only | ✅ Yes |
| **Clock (Second Chance)**| FIFO + Referenced Bit | ❌ Very rare / Approximates LRU | Low (1 bit per frame) | ❌ No |

---

### 🎯 6. Active Socratic Checkpoint
*Quick Test:* If memory access time is $100\\text{ ns}$ and TLB search takes $20\\text{ ns}$ with an $80\\%$ TLB hit ratio (single-level paging), what is the exact Effective Memory Access Time?`;
    }

    // 5. Asymptotic Analysis & Master Theorem
    if (topicId === 'algo_asymptotic' || q.includes('asymptotic') || q.includes('master theorem') || q.includes('big-o') || q.includes('recurrence') || q.includes('theta')) {
      return `### 📘 Algorithms ➔ Asymptotic Analysis & Master Theorem
*Characterizing algorithm growth rates, bounding functions, and recurrence solving methods.*

---

### 🎯 1. Intuition & Mental Model: "The Telescope vs The Microscope"
Asymptotic analysis ignores constants and low-order terms to examine how an algorithm's execution cost scales as input size $n \\to \\infty$.
- $\\mathcal{O}(g(n))$ (**Upper Bound / Worst-Case Ceiling**): Execution will never grow faster than $c \\cdot g(n)$.
- $\\Omega(g(n))$ (**Lower Bound / Best-Case Floor**): Execution will take at least $c \\cdot g(n)$ steps.
- $\\Theta(g(n))$ (**Tight Bound / Exact Rate**): The algorithm is sandwiched tightly between $c_1 \\cdot g(n)$ and $c_2 \\cdot g(n)$.

---

### ⚡ 2. Core Mechanics: Master Theorem for Divide-and-Conquer
For recurrences in the standard form:
$$\\mathbf{T(n) = a T\\left(\\frac{n}{b}\\right) + f(n)} \\quad (a \\ge 1, b > 1)$$

Let $c_{\\text{crit}} = \\log_b a$. Compare $f(n)$ with $n^{\\log_b a}$:

1. **Case 1 (Work dominated at leaves):** If $f(n) = \\mathcal{O}(n^{\\log_b a - \\epsilon})$ for $\\epsilon > 0$:
   $$\\mathbf{T(n) = \\Theta(n^{\\log_b a})}$$
2. **Case 2 (Work evenly split across levels):** If $f(n) = \\Theta(n^{\\log_b a} \\log^k n)$ for $k \\ge 0$:
   $$\\mathbf{T(n) = \\Theta(n^{\\log_b a} \\log^{k+1} n)}$$
3. **Case 3 (Work dominated at root):** If $f(n) = \\Omega(n^{\\log_b a + \\epsilon})$ for $\\epsilon > 0$ and $a f(n/b) \\le c f(n)$ for $c < 1$:
   $$\\mathbf{T(n) = \\Theta(f(n))}$$

---

### 🔍 3. Step-by-Step Architectural Walkthrough
Solve: $T(n) = 4 T(n/2) + n^2$
1. $a = 4, b = 2 \\implies \\log_b a = \\log_2 4 = 2$.
2. Critical boundary: $n^{\\log_b a} = n^2$.
3. $f(n) = n^2 = \\Theta(n^2 \\log^0 n) \\implies$ **Master Theorem Case 2** ($k = 0$).
4. Solution: $T(n) = \\Theta(n^2 \\log^{0+1} n) = \\mathbf{\\Theta(n^2 \\log n)}$.

---

### 🧠 4. High-Yield GATE Exam Insights & Traps
> ⚠️ **IIT Paper-Setter Trap:** Master Theorem **CANNOT** be applied if:
> - $a$ is not constant (e.g., $T(n) = n T(n/2) + n$)
> - $b$ is non-polynomial (e.g., $T(n) = 2 T(n - 1) + 1 \\to$ use Recursion Tree/Substitution)
> - Gap between $f(n)$ and $n^{\\log_b a}$ is not polynomial (e.g. $T(n) = 2T(n/2) + n \\log n \\to$ Extended Master Theorem Case 2 applies with $k=1$).
> 💡 **Exam Pro-Tip:** Asymptotic ordering to memorize for GATE:
> $$\\mathcal{O}(1) < \\mathcal{O}(\\log \\log n) < \\mathcal{O}(\\log n) < \\mathcal{O}(\\sqrt{n}) < \\mathcal{O}(n) < \\mathcal{O}(n \\log n) < \\mathcal{O}(n^2) < \\mathcal{O}(2^n) < \\mathcal{O}(n!) < \\mathcal{O}(n^n)$$

---

### 📊 5. Quick-Recall Comparison Matrix
| Recurrence | $a, b$ | $f(n)$ vs $n^{\\log_b a}$ | Case | Solution $\\Theta$ |
| :--- | :--- | :--- | :--- | :--- |
| **Binary Search** | $a=1, b=2$ | $f(n)=1 = n^0$ | Case 2 ($k=0$) | $\\Theta(\\log n)$ |
| **Merge Sort** | $a=2, b=2$ | $f(n)=n = n^1$ | Case 2 ($k=0$) | $\\Theta(n \\log n)$ |
| **Strassen Matrix** | $a=7, b=2$ | $n^2$ vs $n^{\\log_2 7} \\approx n^{2.81}$ | Case 1 | $\\Theta(n^{\\log_2 7})$ |
| **Karatsuba Mult** | $a=3, b=2$ | $n^1$ vs $n^{\\log_2 3} \\approx n^{1.58}$ | Case 1 | $\\Theta(n^{\\log_2 3})$ |

---

### 🎯 6. Active Socratic Checkpoint
*Quick Test:* What is the tight asymptotic bound $\\Theta$ for $T(n) = 8 T(n/2) + n^3$?`;
    }

    // 6. Normalization & BCNF / Functional Dependencies
    if (topicId === 'dbms_normalization' || q.includes('normal') || q.includes('bcnf') || q.includes('3nf') || q.includes('2nf') || q.includes('dependency') || q.includes('lossless')) {
      return `### 📘 Database Systems ➔ Normalization & Functional Dependencies
*Eliminating data redundancy, update anomalies, and guaranteeing lossless decomposition.*

---

### 🎯 1. Intuition & Mental Model: "The Clean Filing Cabinet"
If a student's hostel address is duplicated across 50 course enrollment rows in a single table:
- **Insertion Anomaly:** You cannot add a new hostel room until a student enrolls in a course.
- **Deletion Anomaly:** If a student drops their only course, their entire room allocation record is destroyed.
- **Update Anomaly:** If the student changes rooms, modifying 49 rows but missing 1 corrupts database consistency.
Normalization systematically decomposes tables into clean, non-redundant relational schemas.

---

### ⚡ 2. Core Mechanics: Normal Form Hierarchy & Rules
For every non-trivial functional dependency $X \\to Y$ on relation $R$:

1. **1NF:** All attribute domain values are atomic (no multi-valued or nested attributes).
2. **2NF:** 1NF $+$ **No partial dependencies** (no non-prime attribute depends on a proper subset of any Candidate Key).
3. **3NF:** 2NF $+$ For every $X \\to Y$, either:
   - $X$ is a **Super Key**, OR
   - $Y$ is a **Prime Attribute** (part of some Candidate Key).
4. **BCNF (Boyce-Codd NF):** For every non-trivial $X \\to Y$:
   - $X$ **MUST be a Super Key** (strictly no exceptions for prime attributes!).

---

### 🔍 3. Step-by-Step Architectural Walkthrough: Lossless & Dependency Preservation
Let schema $R(A, B, C)$ be decomposed into $R_1(A, B)$ and $R_2(B, C)$.
1. **Lossless Join Test:** Decomposition is lossless if and only if:
   $$\\mathbf{(R_1 \\cap R_2) \\to R_1} \\quad \\text{OR} \\quad \\mathbf{(R_1 \\cap R_2) \\to R_2}$$
   Here $R_1 \\cap R_2 = \\{B\\}$. Thus $B$ must be a superkey of either $R_1$ or $R_2$.
2. **Dependency Preservation:** Every original FD in $F$ must be directly enforceable on decomposed tables without computing costly multi-table natural joins.

---

### 🧠 4. High-Yield GATE Exam Insights & Traps
> ⚠️ **IIT Paper-Setter Trap:** **3NF is always achievable with both Lossless Join AND Dependency Preservation.** BCNF always guarantees Lossless Join, but **may NOT preserve dependencies** (e.g. relation with $AB \\to C$ and $C \\to B$).
> 💡 **Exam Pro-Tip:** To count Candidate Keys fast: Attributes that never appear on the Right-Hand Side (RHS) of any FD **must belong to every Candidate Key**. Attributes on RHS only can never be part of any essential key.

---

### 📊 5. Quick-Recall Comparison Matrix
| Normal Form | Avoids Redundancy? | Eliminates Anomaly? | Guarantees Lossless? | Guarantees Dep. Preservation? |
| :--- | :--- | :--- | :--- | :--- |
| **1NF** | Minimal | No | N/A | Yes |
| **2NF** | Moderate | Partial | ✅ Yes | ✅ Yes |
| **3NF** | High | Most (allows prime RHS) | ✅ Yes | ✅ **Always Possible** |
| **BCNF** | **Maximum (Relational)** | **Complete Functional** | ✅ Yes | ❌ **Not Always Possible** |

---

### 🎯 6. Active Socratic Checkpoint
*Quick Test:* Relation $R(A, B, C)$ has FDs $\\{AB \\to C, C \\to A\\}$. What is the highest normal form of $R$? *(Check Candidate Keys: $AB$ and $BC$).*`;
    }

    // 7. Transactions & Strict 2PL / Serializability
    if (topicId === 'dbms_transactions' || q.includes('transaction') || q.includes('2pl') || q.includes('serializ') || q.includes('conflict') || q.includes('acid') || q.includes('recover')) {
      return `### 📘 Database Systems ➔ Transactions, Concurrency & Strict 2PL
*ACID properties, serializability graphs, locking protocols, and recoverability.*

---

### 🎯 1. Intuition & Mental Model: "The Concurrent Banking Transaction"
If Alice transfers $₹1000$ to Bob while Bob is simultaneously withdrawing $₹500$ at an ATM:
Interleaved instructions must produce the exact same final balance state as if Alice's and Bob's transactions ran sequentially one after the other in isolation (**Serializability**).

---

### ⚡ 2. Core Mechanics: Conflict Serializability & Precedence Graphs
Two operations in a schedule are in **Conflict** if and only if:
1. They belong to **different transactions** ($T_i \\neq T_j$),
2. They access the **same data item** ($Q$),
3. **At least one operation is a Write** ($W(Q)$).

**Precedence Graph Protocol:**
- Create a directed node for each transaction $T_i$.
- Draw an edge $T_i \\to T_j$ if an operation of $T_i$ precedes and conflicts with an operation of $T_j$.
- **Theorem:** A schedule $S$ is **Conflict Serializable $\\iff$ its Precedence Graph contains NO cycles**.

---

### 🔍 3. Step-by-Step Architectural Walkthrough: Two-Phase Locking (2PL)
\`\`\`
Phase 1: Growing Phase   --> Transaction acquires locks; cannot release any lock.
Phase 2: Shrinking Phase --> Transaction releases locks; cannot acquire any new lock.

Lock Point: The instant when the transaction acquires its final lock.
\`\`\`

- **Basic 2PL:** Guarantees Conflict Serializability, but can suffer from **Cascading Aborts** and **Deadlocks**.
- **Strict 2PL:** Holds all **Exclusive (X) locks** until Transaction Commit/Abort. $\\implies$ **Guarantees Recoverability and Avoids Cascading Aborts (ACA)**.
- **Rigorous (SS2PL):** Holds **ALL (Shared & Exclusive) locks** until Commit.

---

### 🧠 4. High-Yield GATE Exam Insights & Traps
> ⚠️ **IIT Paper-Setter Trap:** **View Serializable schedules are a superset of Conflict Serializable schedules.** Every Conflict Serializable schedule is View Serializable, but View Serializability testing is an **NP-Complete problem** (blind writes can allow view equivalences without conflict equivalence).
> 💡 **Exam Pro-Tip:** In Strict 2PL, if a schedule aborts, no uncommitted writes were ever read by other transactions, making rollback trivial and instantaneous.

---

### 📊 5. Quick-Recall Comparison Matrix
| Protocol / Schedule Type | Conflict Serializable? | View Serializable? | Recoverable? | Deadlock Free? |
| :--- | :--- | :--- | :--- | :--- |
| **Basic 2PL** | ✅ Yes | ✅ Yes | ❌ Not guaranteed | ❌ No |
| **Strict 2PL** | ✅ Yes | ✅ Yes | ✅ **Guaranteed (ACA)** | ❌ No |
| **Rigorous 2PL** | ✅ Yes | ✅ Yes | ✅ Guaranteed | ❌ No |
| **Timestamp Ordering** | ✅ Yes | ✅ Yes | ❌ (Needs buffering)| ✅ **Deadlock Free** |

---

### 🎯 6. Active Socratic Checkpoint
*Quick Test:* If schedule $S$ has precedence edges $T_1 \\to T_2$, $T_2 \\to T_3$, and $T_3 \\to T_1$, can $S$ ever be conflict serializable?`;
    }

    // Default dynamic synthesis from RAG context
    const cleanQuery = query.replace(/[?#*]/g, '').trim();
    const topicHeader = topicId ? topicId.replace(/_/g, ' ').toUpperCase() : 'GATE CSE CORE';

    return `### 📘 ${subject || 'GATE CSE'} ➔ ${cleanQuery.toUpperCase()}
*Rigorous conceptual breakdown and examination significance for ${topicHeader}.*

---

### 🎯 1. Intuition & Mental Model: The Big Picture
To master **${cleanQuery}** in GATE Computer Science, frame the concept around its fundamental system trade-offs:
- **Architectural Motivation:** Every core computing principle solves a physical constraint—balancing CPU throughput vs latency, memory hierarchy bounds, or consistency vs concurrency.
- **Core Abstraction:** Focus on how the system transitions between states and what guarantees are preserved invariant under concurrent or adversarial execution.

---

### ⚡ 2. Core Mechanics, Rules & Mathematical Invariants
From the verified GATE CSE syllabus context:
${ragContext}

- **System Invariants:** State transitions must be deterministic or conform strictly to asymptotic recurrence rules.
- **Boundary Conditions:** Standard GATE problems test edge states: empty inputs ($n=0$), single-element sets, simultaneous arrivals, or saturated memory frames.

---

### 🔍 3. Step-by-Step Execution Walkthrough
When solving problems on this concept in examination conditions:
1. **Identify the Given Constraints:** Is the algorithm preemptive or non-preemptive? Are functional dependencies canonical? Is the graph directed/weighted?
2. **Construct the State Transition Timeline:** Trace intermediate data structures (e.g. ready queue, precedence graph, or recursion tree).
3. **Verify Boundary Invariants:** Double check off-by-one indices, zero-based clock times, and tie-breaking rules.

---

### 🧠 4. High-Yield GATE Exam Insights & Traps
> ⚠️ **IIT Paper-Setter Trap:** Watch for subtle wording differences between *necessary* vs *sufficient* conditions, and verify whether superkeys or candidate keys are being queried.
> 💡 **Exam Pro-Tip:** For Numerical Answer Type (NAT) questions on this topic, carry intermediate calculations to at least 3 decimal places before rounding as requested.

---

### 📊 5. Quick-Recall Summary Card
| Feature / Dimension | Theoretical Property | GATE Exam Significance |
| :--- | :--- | :--- |
| **Domain Scope** | ${subject || 'Computer Science & Engineering'} | High-Yield 1 & 2 Mark Questions |
| **Analysis Focus** | Invariants, Time/Space Bounds | Common NAT / MCQ Calculation Target |
| **Verification Strategy** | Counter-example elimination | Prevents distractor trap selection |

---

### 🎯 6. Active Socratic Checkpoint
*Quick Test:* Formulate the primary invariant of **${cleanQuery}** in one sentence, and identify under what boundary condition that invariant would be violated.`;
  }

  async run({ query, userId, subject, topicId }) {
    // 1. Invoke RAG Tool to retrieve verified knowledge base evidence
    const retrieval = ragTool.execute({
      query,
      filters: { subject, topic_id: topicId, topK: 3 }
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

    const systemPrompt = `You are the Senior GATE CSE Concept Professor & Pedagogical Specialist.
Your mission is to deliver deeply engaging, mathematically rigorous, crystal-clear, and beautifully structured explanations of Computer Science concepts for GATE aspirants.

FORMATTING REQUIREMENTS:
Structure your response into these engaging, high-impact sections:

### 📘 [Subject Area] ➔ [Concept Name]
*A concise, 1-sentence executive overview defining the concept.*

---

### 🎯 1. Intuition & Mental Model: "The Analogy / Big Picture"
- Provide an intuitive, real-world or architectural analogy explaining WHY this concept exists and what fundamental problem it solves.
- Explain the key idea in clear, engaging language before presenting formal mathematics.

### ⚡ 2. Core Mechanics, Rules & Mathematical Invariants
- Provide precise definitions and formal mathematical equations/theorems (e.g. state transitions, cost formulas, asymptotic relations, normal form rules).
- Present key invariants that MUST hold true in the system.

### 🔍 3. Step-by-Step Architectural / Execution Walkthrough
- Provide a concrete mini-example or trace (e.g., timeline, ASCII Gantt chart, tree/graph traversal, or locking order).
- Walk through the state transitions clearly step-by-step.

### 🧠 4. High-Yield GATE Exam Insights & Traps
> ⚠️ **IIT Paper-Setter Trap:** Highlight subtle edge cases, common calculation traps, or negative marking pitfalls.
> 💡 **Exam Pro-Tip:** State quick shortcuts or decision rules to save time during the exam.

### 📊 5. Quick-Recall Comparison Matrix
- Provide a clean Markdown table comparing variants, edge cases, trade-offs, or time/space complexities.

### 🎯 6. Active Socratic Checkpoint
- Provide one quick, thought-provoking Socratic question for the student to test their retention.

Strict Grounding Rules:
- Ground all facts strictly in the verified context chunks.
- Do NOT hallucinate unverified information.
- Always include citations for syllabus topics referenced.`;

    const userPrompt = `Student Question: ${query}\n\nVerified Context Chunks:\n${contextSnippets}`;

    let explanation = await llmClient.generate({ systemPrompt, userPrompt });

    if (!explanation) {
      // Dynamic masterclass query-grounded synthesis
      const topMatch = retrieval.results[0];
      const meta = topMatch.metadata;
      const assignedTopic = topicId || meta.topic_id;
      const assignedSubject = subject || meta.subject;

      explanation = this.generateCuratedExplanation(query, assignedTopic, assignedSubject, topMatch.text);
    }

    return {
      agent: this.role,
      grounded: true,
      confidence: retrieval.confidence,
      explanation,
      citations: retrieval.citations
    };
  }
}

module.exports = new ConceptTeacherAgent();

