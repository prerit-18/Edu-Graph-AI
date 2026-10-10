#!/usr/bin/env python3
"""
EduGraph AI - 10-Year GATE CSE Paper Ingestion & Indexing Utility
Usage:
    python data_pipeline/ingest_papers.py --input path/to/questions.json
    python data_pipeline/ingest_papers.py --reindex
"""

import os
import sys
import json
import argparse
from typing import List, Dict, Any

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
PYQ_DIR = os.path.join(DATA_DIR, 'pyq')
SYLLABUS_PATH = os.path.join(DATA_DIR, 'syllabus', 'syllabus.json')

SUBJECT_MAP = {
    'operating systems': 'os',
    'os': 'os',
    'algorithms': 'algorithms',
    'algo': 'algorithms',
    'database management systems': 'dbms',
    'dbms': 'dbms',
    'computer networks': 'networks',
    'networks': 'networks',
    'cn': 'networks',
    'computer organization and architecture': 'coa',
    'coa': 'coa',
    'theory of computation': 'toc',
    'toc': 'toc',
    'compiler design': 'compiler',
    'compiler': 'compiler',
    'digital logic': 'digital',
    'digital': 'digital',
    'engineering mathematics': 'math',
    'math': 'math',
    'general aptitude': 'aptitude',
    'aptitude': 'aptitude'
}

REQUIRED_FIELDS = ['id', 'year', 'subject', 'topic_id', 'type', 'question', 'answer', 'explanation']

def validate_question(q: Dict[str, Any], idx: int) -> bool:
    for field in REQUIRED_FIELDS:
        if field not in q:
            print(f"⚠️ [Warning] Question index {idx} missing required field '{field}' -> Skipped.")
            return False
    if q['type'] not in ['MCQ', 'NAT', 'MSQ']:
        print(f"⚠️ [Warning] Question {q.get('id')} has invalid type '{q.get('type')}'. Must be MCQ, NAT, or MSQ.")
        return False
    return True

def ingest_file(file_path: str):
    print(f"\n📂 Reading input file: {file_path}")
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    if isinstance(data, dict):
        questions = data.get('questions', [data])
    elif isinstance(data, list):
        questions = data
    else:
        raise ValueError("Invalid format: JSON must be an array of questions or an object with 'questions' key.")

    print(f"Found {len(questions)} questions to process.")

    grouped = {}
    valid_count = 0

    for i, q in enumerate(questions):
        if not validate_question(q, i):
            continue

        subj_key = SUBJECT_MAP.get(q['subject'].strip().lower(), 'os')
        if subj_key not in grouped:
            grouped[subj_key] = []
        grouped[subj_key].append(q)
        valid_count += 1

    # Merge into data/pyq/<subject>/questions.json
    for subj_key, new_qs in grouped.items():
        target_dir = os.path.join(PYQ_DIR, subj_key)
        os.makedirs(target_dir, exist_ok=True)
        target_file = os.path.join(target_dir, 'questions.json')

        existing = []
        if os.path.exists(target_file):
            try:
                with open(target_file, 'r', encoding='utf-8') as f:
                    existing = json.load(f)
            except Exception as e:
                print(f"Could not read existing {target_file}: {e}")

        # Merge deduplicating by ID
        existing_map = {q['id']: q for q in existing}
        for q in new_qs:
            existing_map[q['id']] = q

        merged_list = sorted(list(existing_map.values()), key=lambda x: (x.get('year', 0), x.get('id', '')), reverse=True)

        with open(target_file, 'w', encoding='utf-8') as f:
            json.dump(merged_list, f, indent=2)

        print(f"✅ Saved {len(merged_list)} questions to data/pyq/{subj_key}/questions.json")

    print(f"\n🎉 Successfully ingested {valid_count} valid questions across {len(grouped)} subject(s)!")
    print("\n👉 Now rebuilding RAG vector index...")
    os.system(f'node "{os.path.join(BASE_DIR, "data_pipeline", "build_rag.js")}"')

def main():
    parser = argparse.ArgumentParser(description="Ingest and index GATE CSE previous year questions.")
    parser.add_argument('--input', '-i', type=str, help="Path to JSON file containing GATE questions")
    parser.add_argument('--reindex', action='store_true', help="Rebuild RAG vector index from existing questions")

    args = parser.parse_args()

    if args.reindex:
        os.system(f'node "{os.path.join(BASE_DIR, "data_pipeline", "build_rag.js")}"')
        return

    if args.input:
        ingest_file(args.input)
    else:
        print("Please specify --input <path_to_json> or --reindex")
        print("\nExample:")
        print("  python data_pipeline/ingest_papers.py --input data_pipeline/gate_2015_2025.json")

if __name__ == '__main__':
    main()
