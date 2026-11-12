"""Builds a SYNTHETIC test paper + answer-key PDF in GATE layout (for pipeline tests only; never imported
into the real database). Usage: make_fake_gate_pdf.py <out_dir>"""
import sys, os, fitz

out = sys.argv[1]
os.makedirs(out, exist_ok=True)

def opts(a, b, c, d): return [f"(A) {a}", f"(B) {b}", f"(C) {c}", f"(D) {d}"]
GA = [  # 10 questions
    ("Choose the word closest in meaning to the synonym of 'benevolent' in this sentence about the author.", opts("kind", "cruel", "late", "small")),
    ("Select the grammar-correct sentence for the following paragraph.", opts("He go", "He goes", "He going", "He gone")),
    ("A train travels at a speed of 60 km/h for 2 hours. What is the distance covered?", []),
    ("The ratio of boys to girls is 3:2 and the percentage of girls is?", opts("20", "30", "40", "50")),
    ("What is the average of the number series 2, 4, 6, 8?", []),
    ("Work done by 4 men in 6 days equals work by how many men in 3 days?", opts("4", "6", "8", "12")),
    ("A shop sells at a profit of 20 percent; cost price is 50. Selling price?", []),
    ("Probability of getting a head in one toss of a fair coin is?", opts("0", "0.25", "0.5", "1")),
    ("Choose the antonym of the word 'ancient' in the passage.", opts("old", "modern", "huge", "rare")),
    ("If age of A is twice the age of B and sum is 30, age of B is?", []),
]
CS = [
    ("Which page replacement algorithm suffers from Belady's anomaly when page frames increase?", opts("LRU", "FIFO", "Optimal", "LFU"), "MCQ", "B"),
    ("Consider processes P1, P2, P3 with burst times 10, 4, 2 under non-preemptive SJF scheduling. The average waiting time (in ms, up to 2 decimals) is ____", [], "NAT", "2.66 to 2.67"),
    ("Which of the following concurrency protocols guarantee serializability with two-phase locking? Select all that apply.", opts("Basic 2PL", "Strict 2PL", "Timestamp ordering", "No locking"), "MSQ", "A;B"),
    ("The time complexity of breadth first search with an adjacency list graph representation is", opts("O(V^2)", "O(V+E)", "O(E log V)", "O(VE)"), "MCQ", "B"),
    ("A relation R satisfies functional dependency A -> B and the candidate key is A. The highest normal form is", opts("1NF", "2NF", "3NF", "BCNF"), "MCQ", "D"),
    ("In TCP congestion control, after three duplicate ACKs the sender performs", opts("slow start", "fast retransmit", "reset connection", "nothing"), "MCQ", "B"),
    ("Consider the logic circuit shown in the figure below. The output is", opts("AND", "OR", "XOR", "NAND"), "MCQ", "C"),
    ("The number of states in the minimal DFA for strings over {a,b} ending with ab is ____", [], "NAT", "3"),
    ("Which statement about LR parsers and LALR conflicts is true", ["(A) only one", "(B) only two", "(C) only three"], "MCQ", "A"),   # 3 options -> review
    ("Which page replacement algorithm suffers from Belady's anomaly when page frames increase?", opts("LRU", "FIFO", "Optimal", "LFU"), "MCQ", "B"),  # duplicate of Q1
    ("An unsolved question with no key row in the answer key about cache hit ratio and main memory access time is", opts("1", "2", "3", "4"), "MCQ", None),
    ("The eigenvalues of a 2x2 identity matrix are", opts("0,0", "1,1", "0,1", "2,2"), "MCQ", "B"),
]
# pad CS to 55 questions with simple distinct numeric questions
for i in range(len(CS) + 1, 56):
    CS.append((f"Consider the binary tree with {i} nodes in a heap; the height of the complete binary heap is ____", [], "NAT", str(len(bin(i)) - 3)))

lines = ["GATE 2099 Computer Science and Information Technology", "General Aptitude (GA)", "Q.1 – Q.5 carry one mark each."]
def block(n, text, options):
    return [f"Q.{n} {text}"] + options
for i, (t, o) in enumerate(GA[:5], 1): lines += block(i, t, o)
lines += ["Q.6 – Q.10 carry two marks each."]
for i, (t, o) in enumerate(GA[5:], 6): lines += block(i, t, o)
lines += ["Computer Science and Information Technology", "Q.11 – Q.35 carry one mark each."]
for i, (t, o, ty, k) in enumerate(CS[:25], 11): lines += block(i, t, o)
lines += ["Q.36 – Q.65 carry two marks each."]
for i, (t, o, ty, k) in enumerate(CS[25:], 36): lines += block(i, t, o)

def write(path, lines):
    doc = fitz.open(); page = doc.new_page(); y = 60; n = 1
    for ln in lines:
        if y > 780:
            page = doc.new_page(); y = 60; n += 1
        page.insert_text((50, y), ln[:110], fontsize=9); y += 12
        page.insert_text((280, 830), f"CS {n}/9", fontsize=7)
    doc.save(path)

write(os.path.join(out, "paper.pdf"), lines)
key = ["Q. No.  Session  Question Type  Section  Key/Range  Marks"]
ga_keys = ["A", "B", "120", "C", "5", "A", "60", "C", "B", "10"]
for i, k in enumerate(ga_keys, 1):
    ty = "NAT" if not GA[i-1][1] else "MCQ"
    key.append(f"{i} Set1 {ty} GA {k} {1 if i <= 5 else 2}")
for i, (t, o, ty, k) in enumerate(CS, 1):
    if k is None: continue
    key.append(f"{i + 10} Set1 {ty} CS {k} {1 if i <= 25 else 2}")
write(os.path.join(out, "key.pdf"), key)
print("ok")
