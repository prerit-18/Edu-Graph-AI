#!/usr/bin/env python3
"""EduGraph - official GATE CSE paper ingestion pipeline.

PDF -> page text -> question detection -> option extraction -> answer-key mapping
    -> subject/topic classification -> validation -> JSON (imported into SQLite by the Node backend)

Nothing here fabricates content: a question without an official key is stored WITHOUT an answer
(verification_status 'extracted_unverified'); anything that cannot be parsed reliably goes to the review
queue with the raw text and page number instead of being dropped silently.

Usage
  python3 data_pipeline/gate_ingest.py --manifest data/gate_papers/manifest.json
  python3 data_pipeline/gate_ingest.py --paper-pdf p.pdf --key-pdf k.pdf --year 2023 --session "Set 1" \
        --source-url https://... --key-url https://... --retrieved 2026-01-01 --license "..."
Manifest format: see docs/GATE_DATA.md. Raw PDFs live in data/gate_papers/raw/ (not committed).
"""
import argparse
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import date

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYLLABUS = os.path.join(BASE, "data", "syllabus", "syllabus.json")
DEFAULT_RAW = os.path.join(BASE, "data", "gate_papers", "raw")
DEFAULT_OUT = os.path.join(BASE, "data", "gate_papers", "processed")

# ---------------------------------------------------------------- topic classifier
EXTRA_KW = {
    "os_process_ipc": "process thread pcb fork pipe ipc message passing system call context switch",
    "os_scheduling": "scheduling fcfs sjf srtf round robin quantum turnaround waiting time burst gantt priority",
    "os_sync": "semaphore mutex critical section peterson race condition monitor producer consumer wait signal",
    "os_deadlock": "deadlock banker safe state resource allocation graph coffman circular wait",
    "os_virtual_mem": "paging page fault tlb virtual memory page replacement lru fifo thrashing segmentation frame belady",
    "os_storage": "file system inode disk scheduling sstf scan cylinder block allocation fat directory raid",
    "algo_asymptotic": "asymptotic big-o theta omega recurrence master theorem complexity growth",
    "algo_searching_sorting_hashing": "sorting quicksort mergesort heapsort hashing hash table collision binary search",
    "algo_divide_conquer": "divide conquer strassen inversion merge",
    "algo_greedy": "greedy huffman activity selection knapsack fractional job scheduling",
    "algo_dp": "dynamic programming lcs longest common subsequence matrix chain knapsack memoization optimal substructure",
    "algo_graphs_mst_shortest_paths": "graph bfs dfs dijkstra bellman-ford floyd kruskal prim spanning tree shortest path topological",
    "compiler_lexical": "lexical analysis token lexeme regular expression scanner lex",
    "compiler_parsing": "parsing parser ll(1) lr slr lalr clr first follow shift reduce grammar parse table",
    "compiler_sdt_codegen": "syntax directed translation attribute synthesized inherited three address code intermediate code",
    "compiler_optimization_dataflow": "optimization basic block liveness data flow constant propagation common subexpression register allocation",
    "dbms_er_relational": "er model entity relationship weak entity key relational schema",
    "dbms_rel_algebra_sql": "sql select join relational algebra tuple calculus query group by having nested",
    "dbms_normalization": "normal form functional dependency bcnf 3nf 2nf lossless decomposition candidate key",
    "dbms_indexing": "index b-tree b+ tree file organization block record hashing disk",
    "dbms_transactions": "transaction serializability 2pl two-phase locking schedule recovery concurrency timestamp acid",
    "cn_layering_switching": "osi tcp/ip layer packet switching circuit switching throughput delay bandwidth",
    "cn_datalink_mac": "framing crc hamming csma/cd ethernet sliding window stop-and-wait go-back-n selective repeat mac",
    "cn_routing": "routing distance vector link state ospf rip bgp router shortest path flooding",
    "cn_network_ipv4": "ip address subnet cidr ipv4 fragmentation arp dhcp icmp nat netmask",
    "cn_transport_tcp": "tcp udp congestion window slow start flow control socket port handshake segment",
    "cn_application_dns_http": "dns http smtp ftp email url cookie web server",
    "em_logic_sets_relations": "propositional logic first-order predicate set relation function lattice poset group monoid equivalence relation",
    "em_graph_theory_combinatorics": "graph vertices edges planar chromatic matching combinatorics counting permutation combination generating function recurrence pigeonhole",
    "em_linear_algebra": "matrix determinant eigenvalue eigenvector rank linear equations lu decomposition vector space",
    "em_calculus": "limit continuity derivative integral maxima minima differentiable mean value theorem",
    "em_probability_statistics": "probability random variable distribution binomial poisson normal expectation variance bayes conditional",
    "dl_boolean_minimization": "boolean algebra karnaugh k-map minimization sop pos minterm maxterm gate nand nor",
    "dl_combinational_sequential": "multiplexer decoder adder flip-flop latch counter register sequential circuit state machine",
    "dl_number_representation": "twos complement ieee 754 floating point binary representation overflow bcd",
    "coa_instructions_datapath": "instruction set addressing mode opcode alu data path control unit microprogram cpu register",
    "coa_pipelining": "pipeline hazard stall forwarding speedup cpi stage branch",
    "coa_memory_io": "cache hit ratio miss direct mapped associative main memory dma interrupt io disk access time",
    "pds_c_recursion": "c program pointer recursion output printf function array static",
    "pds_linear_structures": "stack queue linked list array circular queue push pop",
    "pds_trees_heaps_graphs": "binary tree bst heap traversal inorder preorder postorder height avl",
    "toc_regular": "regular expression dfa nfa finite automata regular language pumping lemma minimal dfa",
    "toc_cfg_pda": "context-free grammar pushdown automata pda cfg ambiguity cnf",
    "toc_tm_undecidability": "turing machine decidable undecidable recursively enumerable halting problem reduction",
    "ga_verbal": "sentence grammar word meaning passage synonym antonym verbal paragraph author",
    "ga_numerical": "ratio percentage average speed train work probability number series profit age",
}
STOP = set("the a an of in to and or is are for with on by that this be as it at from which what following given consider".split())


def tok(s):
    return [t for t in re.findall(r"[a-z0-9\+\-/\(\)]+", s.lower()) if t not in STOP and len(t) > 1]


def load_topics():
    topics = []
    for subj in json.load(open(SYLLABUS, encoding="utf-8")):
        for t in subj["topics"]:
            words = Counter(tok(t["name"]) * 3 + tok(t.get("description", "")) + tok(EXTRA_KW.get(t["id"], "")) * 2)
            topics.append({"id": t["id"], "subject": subj["subject"], "kw": words, "phrases": EXTRA_KW.get(t["id"], "").split()})
    return topics


def classify(text, section, topics):
    cand = [t for t in topics if (t["subject"] == "General Aptitude") == (section == "GA")]
    q = Counter(tok(text))
    scored = []
    for t in cand:
        s = sum(min(c, 3) * t["kw"][w] for w, c in q.items() if w in t["kw"])
        low = text.lower()
        s += sum(4 for p in set(t["phrases"]) if len(p) > 4 and p in low)
        scored.append((s, t))
    scored.sort(key=lambda x: -x[0])
    best, second = scored[0], scored[1] if len(scored) > 1 else (0, None)
    if best[0] <= 0:
        return None, 0.0
    conf = best[0] / (best[0] + second[0] + 1e-9) * min(1.0, best[0] / 12.0)
    return best[1], round(conf, 3)


# ---------------------------------------------------------------- PDF helpers
def page_texts(path):
    """Return [(page_no, text, n_images)]; prefers pdfplumber, falls back to PyMuPDF."""
    out = []
    try:
        import pdfplumber
        with pdfplumber.open(path) as pdf:
            for i, p in enumerate(pdf.pages, 1):
                out.append((i, p.extract_text() or "", len(p.images)))
        return out
    except Exception as e:  # noqa: BLE001
        print(f"  pdfplumber failed ({e}); trying PyMuPDF", file=sys.stderr)
    import fitz
    with fitz.open(path) as doc:
        for i, p in enumerate(doc, 1):
            out.append((i, p.get_text(), len(p.get_images())))
    return out


FOOTER = re.compile(r"^(?:CS\s*\d*\s*/\s*\d+|Page\s+\d+(?:\s+of\s+\d+)?|\d+\s*/\s*\d+|Organi[sz]ing Institute.*|.*Page\s+\d+\s+of\s+\d+$|Computer Science (?:and|&) Information Technology.*|General Aptitude(?:\s*\(GA\))?|GATE\s+20\d\d\s+General Aptitude.*|END OF (?:THE )?QUESTION PAPER|SESSION\s*-\s*\d+)$", re.I)
Q_START = re.compile(r"^\s*Q\.?\s*(\d{1,2})\b[\s.:)\-–]*(.*)$")
RANGE_HDR = re.compile(r"Q\.?\s*(\d+)\s*[^\w\s]*\s*(?:to\s+)?Q\.?\s*(\d+)\s*(?:carry|\()\s*(one|two|1|2)\b", re.I)
OPT = re.compile(r"^\s*\(?([A-D])[\).]\s+(.*)$")
FIG = re.compile(r"\b(figure|diagram|shown below|following (?:graph|circuit|tree|table)|image)\b", re.I)


def detect_sections(pages):
    """Yield (page_no, line, section) with section in GA/CS, using the section banners in the paper."""
    section = "GA"
    for pno, text, _ in pages:
        for line in text.splitlines():
            l = line.strip()
            if re.search(r"computer science and information technology|^\s*CS\s*:", l, re.I) and not re.search(r"carry", l, re.I):
                section = "CS"
            elif re.search(r"general aptitude", l, re.I):
                section = "GA"
            yield pno, l, section


def parse_paper(pages, paper_id, year, session, code, source_name):
    questions, review = [], []
    marks_map = {}   # (section, qno) -> marks (from "Q.1 - Q.25 carry one mark each" banners)
    cur = None
    last_q = {"N": 0}

    def finish():
        nonlocal cur
        if cur:
            questions.append(cur)
        cur = None

    # Real GATE papers number questions continuously 1..65: GA = 1-10, CS = 11-65 (the first CS question is 11).
    for pno, line, _banner in detect_sections(pages):
        if not line or FOOTER.match(line):
            continue
        m = RANGE_HDR.search(line)
        if m:
            a, b, w = int(m.group(1)), int(m.group(2)), m.group(3).lower()
            for n in range(a, b + 1):
                marks_map[("GA" if n <= 10 else "CS", n)] = 1 if w in ("one", "1") else 2
            finish()
            continue
        s = Q_START.match(line)
        if s and int(s.group(1)) == last_q["N"] + 1:
            finish()
            last_q["N"] = int(s.group(1))
            n = last_q["N"]
            cur = {"section": "GA" if n <= 10 else "CS", "q_no": n, "page": pno, "lines": [s.group(2).strip()]}
            continue
        if cur is not None:
            cur["lines"].append(line)
    finish()

    out = []
    seen = {}
    for q in questions:
        raw = "\n".join(q["lines"]).strip()
        stem, opts, cur_opt = [], {}, None
        for ln in q["lines"]:
            o = OPT.match(ln)
            if o:
                cur_opt = o.group(1)
                opts[cur_opt] = o.group(2).strip()
            elif cur_opt:
                opts[cur_opt] += " " + ln.strip()
            else:
                stem.append(ln.strip())
        text = re.sub(r"\s+", " ", " ".join(stem)).strip()
        key_ids = f"{q['section']}{q['q_no']}"
        rec = {
            "id": f"{paper_id}_{key_ids}".lower(), "year": year, "session": session, "paper_code": code,
            "q_no": q["q_no"], "section": q["section"], "question": text,
            "options": [f"{k}. {re.sub(chr(10), ' ', v).strip()}" for k, v in sorted(opts.items())],
            "marks": marks_map.get((q["section"], q["q_no"])) or (1 if q["q_no"] <= (5 if q["section"] == "GA" else 25) else 2),
            "marks_from_banner": (q["section"], q["q_no"]) in marks_map,
            "source_document": source_name, "source_page": q["page"], "raw_text": raw,
        }
        issues = []
        if not rec["marks_from_banner"]:
            issues.append("marks inferred from position (banner not found)")
        if len(text) < 10:
            issues.append("empty/short question text")
        if opts and len(opts) < 4:
            issues.append(f"only {len(opts)} option(s) detected")
        if re.search(r"[�\x00-\x08]", raw):
            issues.append("possible extraction error (garbled characters)")
        if FIG.search(text) and q["page"]:
            issues.append("question refers to a figure/table - needs manual review (image not extracted)")
        h = hashlib.sha1(re.sub(r"\W+", " ", text.lower()).encode()).hexdigest()
        if h in seen:
            issues.append(f"duplicate of {seen[h]}")
        seen[h] = rec["id"]
        rec["issues"] = issues
        out.append(rec)
    return out


# ---------------------------------------------------------------- answer key
KEY_ROW = re.compile(r"^\s*(\d{1,2})\s+(?:(\S+)\s+)?(MCQ|MSQ|NAT)\s+(GA|CS[-\w]*)\s+(.+?)\s+(\d)\s*$", re.I)


def parse_key(path, session):
    """Return {(section, qno): {'type','key','marks','mta'}}. Tries table extraction, then text rows."""
    keys = {}
    try:
        import pdfplumber
        with pdfplumber.open(path) as pdf:
            for p in pdf.pages:
                for tbl in p.extract_tables() or []:
                    for row in tbl:
                        cells = [(c or "").strip() for c in row]
                        if len(cells) >= 5 and cells[0].isdigit():
                            _ingest(keys, cells, session)
    except Exception as e:  # noqa: BLE001
        print(f"  key table extraction failed: {e}", file=sys.stderr)
    if not keys:
        for _, text, _ in page_texts(path):
            for line in text.splitlines():
                m = KEY_ROW.match(line)
                if m:
                    _ingest(keys, [m.group(1), m.group(2) or "", m.group(3), m.group(4), m.group(5), m.group(6)], session)
    return keys


def _ingest(keys, c, session):
    # columns: Q.No | Session | QType | Section | Key/Range | Marks   (Session column optional in older keys)
    if len(c) >= 6 and re.fullmatch(r"MCQ|MSQ|NAT", c[2], re.I):
        qno, sess, qtype, sec, key, marks = c[0], c[1], c[2], c[3], c[4], c[5]
    elif len(c) >= 5 and re.fullmatch(r"MCQ|MSQ|NAT", c[1], re.I):
        qno, sess, qtype, sec, key, marks = c[0], "", c[1], c[2], c[3], c[4]
    else:
        return
    sec = "GA" if int(qno) <= 10 else "CS"   # section column varies (CS, CS-1, ...); numbering is authoritative
    keys[(sec, int(qno))] = {"type": qtype.upper(), "key": key.replace(" ", "").replace(",", ";") if qtype.upper() != "NAT" else key.strip(),
                             "marks": int(marks) if str(marks).isdigit() else None, "mta": key.strip().upper() in ("MTA", "ALL")}


def apply_key(q, kinfo):
    if not kinfo:
        q["answer"] = None; q["type"] = "MCQ" if q["options"] else "NAT"
        q["issues"].append("no official key row for this question")
        return
    q["type"] = kinfo["type"]
    if kinfo["marks"]:
        if kinfo["marks"] != q["marks"] and q["marks_from_banner"]:
            q["issues"].append(f"marks mismatch paper={q['marks']} key={kinfo['marks']}; key used")
        q["marks"] = kinfo["marks"]
    if kinfo["mta"]:
        q["answer"] = None; q["issues"].append("official key is MTA (marks to all) - no single answer")
        return
    key = kinfo["key"].upper() if kinfo["type"] != "NAT" else kinfo["key"]
    if kinfo["type"] == "MCQ":
        q["answer"] = key if re.fullmatch(r"[A-D]", key) else None
        if q["answer"] is None: q["issues"].append(f"invalid MCQ key {key!r}")
    elif kinfo["type"] == "MSQ":
        q["answer"] = ";".join(sorted(set(re.findall(r"[A-D]", key)))) or None
        if q["answer"] is None: q["issues"].append(f"invalid MSQ key {key!r}")
    else:
        m = re.fullmatch(r"(-?\d+(?:\.\d+)?)\s*(?:to|-|–)\s*(-?\d+(?:\.\d+)?)", key)
        if m:
            q["answer"] = f"{m.group(1)}:{m.group(2)}"
        elif re.fullmatch(r"-?\d+(?:\.\d+)?", key):
            q["answer"] = key
        else:
            q["answer"] = None; q["issues"].append(f"invalid NAT key {key!r}")
    if q["type"] in ("MCQ", "MSQ") and len(q["options"]) < 4:
        q["issues"].append(f"{q['type']} with {len(q['options'])} options")
    if q["type"] == "NAT" and q["options"]:
        q["issues"].append("NAT question has options - parse check needed")


# ---------------------------------------------------------------- orchestration
def process_paper(cfg, topics, out_dir, raw_dir):
    year, session = int(cfg["year"]), cfg.get("session", "")
    code = cfg.get("paper_code", "CS")
    sess_slug = re.sub(r"\W+", "", session.lower()) or "s1"
    paper_id = f"gate_{code.lower()}_{year}_{sess_slug}"
    pdf = cfg["paper_pdf"] if os.path.isabs(cfg["paper_pdf"]) else os.path.join(raw_dir, cfg["paper_pdf"])
    keyp = cfg.get("key_pdf"); keyp = (keyp if keyp is None or os.path.isabs(keyp) else os.path.join(raw_dir, keyp))
    result = {"paper": {"id": paper_id, "year": year, "session": session, "paper_code": code,
                        "source_url": cfg.get("source_url"), "key_source_url": cfg.get("key_url"),
                        "source_file": os.path.basename(pdf), "retrieved_at": cfg.get("retrieved", str(date.today())),
                        "license_note": cfg.get("license", "Check licence of the source site before redistribution."), "status": "ingested"},
              "questions": [], "review_queue": [], "stats": {}}
    if not os.path.exists(pdf):
        result["paper"]["status"] = "failed"
        result["review_queue"].append({"reason": f"paper PDF not found: {pdf}", "page": 0})
        return result
    pages = page_texts(pdf)
    for pno, text, nimg in pages:
        if len(text.strip()) < 30:
            result["review_queue"].append({"page": pno, "reason": "no extractable text" + (" (scanned/image page - OCR needed; no OCR engine installed)" if nimg else ""), "raw_text": ""})
    qs = parse_paper(pages, paper_id, year, session, code, os.path.basename(pdf))
    keys = parse_key(keyp, session) if keyp and os.path.exists(keyp) else {}
    if not keys:
        result["paper"]["status"] = "partial"
        result["review_queue"].append({"page": 0, "reason": "answer key missing or unparseable - all questions stored WITHOUT answers"})
    for q in qs:
        apply_key(q, keys.get((q["section"], q["q_no"])) if keys else None)
        topic, conf = classify(q["question"] + " " + " ".join(q["options"]), q["section"], topics)
        q["topic_id"] = topic["id"] if topic else None
        q["subject"] = topic["subject"] if topic else ("General Aptitude" if q["section"] == "GA" else None)
        q["topic_confidence"] = conf
        if conf < 0.35:
            q["issues"].append(f"low topic confidence ({conf})")
        q["difficulty"] = "easy" if q["marks"] == 1 else "medium"   # proxy from marks, not a measured difficulty
        q["explanation"] = None
        q["key_verified"] = q["answer"] is not None
        hard = [i for i in q["issues"] if not i.startswith(("low topic", "marks inferred", "marks mismatch"))]
        q["_hard"] = hard
    result["questions"] = qs
    st = Counter(); st["extracted"] = len(qs)
    st["with_key"] = sum(1 for q in qs if q["answer"])
    st["needs_review"] = sum(1 for q in qs if q["_hard"] and not all(i.startswith("no official key") or i.startswith("official key is MTA") for i in q["_hard"]))
    st["by_type"] = dict(Counter(q["type"] for q in qs))
    result["stats"] = dict(st)
    expected = 65
    if len(qs) != expected:
        result["review_queue"].append({"page": 0, "reason": f"expected {expected} questions, extracted {len(qs)} - inspect paper manually"})
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest")
    ap.add_argument("--paper-pdf"); ap.add_argument("--key-pdf")
    ap.add_argument("--year", type=int); ap.add_argument("--session", default="")
    ap.add_argument("--paper-code", default="CS")
    ap.add_argument("--source-url"); ap.add_argument("--key-url"); ap.add_argument("--retrieved"); ap.add_argument("--license")
    ap.add_argument("--raw-dir", default=DEFAULT_RAW); ap.add_argument("--out-dir", default=DEFAULT_OUT)
    a = ap.parse_args()

    papers = []
    if a.manifest:
        papers = json.load(open(a.manifest, encoding="utf-8"))["papers"]
    elif a.paper_pdf and a.year:
        papers = [{"paper_pdf": a.paper_pdf, "key_pdf": a.key_pdf, "year": a.year, "session": a.session, "paper_code": a.paper_code,
                   "source_url": a.source_url, "key_url": a.key_url, "retrieved": a.retrieved, "license": a.license}]
    else:
        ap.error("provide --manifest or --paper-pdf + --year")
    os.makedirs(a.out_dir, exist_ok=True)
    topics = load_topics()
    report = []
    for cfg in papers:
        print(f"Processing {cfg.get('year')} {cfg.get('session', '')} ...")
        r = process_paper(cfg, topics, a.out_dir, a.raw_dir)
        for q in r["questions"]:
            q.pop("_hard", None); q.pop("marks_from_banner", None)
        with open(os.path.join(a.out_dir, f"{r['paper']['id']}.json"), "w", encoding="utf-8") as f:
            json.dump(r, f, indent=2, ensure_ascii=False)
        report.append({"paper": r["paper"]["id"], "year": r["paper"]["year"], "status": r["paper"]["status"], **r["stats"],
                       "review_items": len(r["review_queue"])})
        print("  ->", report[-1])
    with open(os.path.join(a.out_dir, "_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)


if __name__ == "__main__":
    main()
