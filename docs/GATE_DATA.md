# GATE CSE previous-year question data

## Current status (honest)

Source: official IIT Madras GATE download page (`https://gate2027.iitm.ac.in/download`), 18 PDFs fetched on 2026-11-12 after your approval
(URLs in `data/gate_papers/manifest.json`). The page states no reuse licence ("(c) IIT Madras"); files are for personal study and are git-ignored.

| Year | Papers available | Questions extracted | Stored in bank (answer key mapped) | Issues |
|---|---|---|---|---|
| 2026 | CS-1, CS-2 | 130 | 122 (122 verified) | 8 queued (figures / missing options) |
| 2025 | CS-1, CS-2 | 130 | 116 (116 verified) | 14 queued |
| 2024 | CS-1, CS-2 | 130 | 100 (100 verified) | 30 queued (many figure/table questions) |
| 2023 | CS | 65 | 52 (51 verified, 1 key = marks-to-all, unverified) | 13 queued |
| 2022 | CS | 65 | 56 (56 verified) | 9 queued |
| 2021 | CS (Session 1) | **0** | 0 | Scanned image-only PDF (91 pages) and image-only key; needs OCR, none installed |
| 2017-2020 | **not obtained** | 0 | 0 | Not listed on the official page. A Google Drive archive (2007-2026 papers) is linked there; not fetched, and it may lack keys |

Totals: 520 extracted, **446 stored (445 verified + 1 unverified)** across 5 years, of which 65 are General Aptitude and 381 are CS.
By type (stored): MCQ 216, MSQ 113, NAT 117 (2026: 59/32/31, 2025: 54/29/33, 2024: 51/23/26, 2023: 25/15/12, 2022: 27/14/15).
74 questions + 93 empty-page/paper warnings = 167 rows in `ingest_review_queue` (not served to students): 38 reference a figure/table (images are not extracted),
~30 have fewer than 4 detected options, 1 NAT key has two accepted ranges, and the 2021 scanned pages.
"Verified" means the official key row was mapped and structural checks passed. I hand-checked 4 mappings (e.g. GATE 2024 CS-1 Q11 key D, Q22 key A;C) against the question text.
Topic labels come from a keyword classifier and are **not audited**: 66 of 520 are low-confidence (<0.35) and at least one clear mislabel was seen
(2024 CS-1 Q11, a calculus question, labelled Discrete Maths). Some option texts carry stray page-number characters from the PDF.

What *is* in the database today: a **23-question EduGraph practice set** (`data/pyq/*/questions.json`), tagged
`origin = synthetic_practice`, `verification_status = synthetic`. These are **not** real GATE questions (their ids/years
are labels only). During this work 3 wrong answer keys in that set were corrected (os_2025_001, cn_2024_001, dbms_2025_001).
The UI labels them "Practice set" everywhere and never counts them as official PYQs.

"Training": the platform does **not** train or fine-tune any model on papers. Ingested papers are indexed for retrieval
(RAG) and used for practice, mock tests and statistics only.

## What is built

```
PDF -> text per page -> question detection (Q.n, GA/CS sections, mark banners) -> options -> official-key mapping
    -> subject/topic classification (keyword scorer + confidence) -> validation -> processed JSON
    -> Node importer (SQLite: papers, questions, ingest_review_queue) -> RAG index + practice/mock/analyst/revision
```
* `data_pipeline/gate_ingest.py` - the extractor (pdfplumber, PyMuPDF fallback).
* `backend/services/question_bank.js` - validation, import, search, grading (`importOfficialPapers`).
* Tables: `papers`, `questions`, `ingest_review_queue` (see `backend/database/schema.sql`).
* Types: MCQ (`A-D`), MSQ (`A;C`), NAT (single value or range `low:high`). Marks 1/2, negative marking MCQ only (1/3 and 2/3).
* Verification states: `verified` (official key mapped + structural checks passed), `extracted_unverified` (no key -> no
  answer stored, never graded), `needs_review` (never served; kept in `ingest_review_queue` with raw text + page),
  `synthetic` (practice set). AI/curated explanations are labelled `explanation_source` (`official|ai|curated|none`) and
  never replace the official key.
* Known limits: no OCR engine is installed (scanned pages are queued for manual review); figure/table questions are
  queued for review (images are not extracted); topic classification is keyword-based - low-confidence topics are
  stored with `topic_confidence < 0.35` and flagged; "difficulty" is a proxy from marks, not a measured value.
* Unit-tested on synthetic fixture PDFs (`tests/fixtures/make_fake_gate_pdf.py`) and run on the 8 real papers above (layout: continuous numbering, GA = Q1-10, CS = Q11-65; keys use `;` or `,` for MSQ and `x to x` for NAT).

## How to ingest real papers

1. Download the question paper **and** official answer key PDFs yourself from the official GATE site of each year's
   organising institute (the GATE 2017-2026 organisers were IIT Roorkee, Guwahati, Madras, Delhi, Bombay, Kharagpur,
   Kanpur, IISc Bangalore, Roorkee, Guwahati - verify each year on the official site). Respect each site's terms of use:
   papers are copyrighted; `data/gate_papers/raw/` and `processed/` are git-ignored so they are not redistributed.
2. Put the PDFs in `data/gate_papers/raw/`, copy `data/gate_papers/manifest.example.json` to `manifest.json`, and fill one
   entry per paper/set (real URL, retrieval date, licence note).
3. `pip install -r data_pipeline/requirements.txt`
4. `python3 data_pipeline/gate_ingest.py --manifest data/gate_papers/manifest.json`
   -> `data/gate_papers/processed/<paper_id>.json` + `_report.json` (counts per paper).
5. Restart the backend (or run `npm run seed` in `backend/`): the importer loads the processed JSON, the RAG index
   rebuilds automatically (it fingerprints the question table).
6. Check `ingest_review_queue` (`SELECT * FROM ingest_review_queue`) and fix/complete those questions manually.

Expected per paper: 65 questions (10 GA + 55 CS). The pipeline queues a warning whenever the count differs.
