#!/usr/bin/env python3
"""
EduGraph AI - Data Pipeline Indexer
Preprocesses syllabus and PYQs into structured documents.
"""

import json
import os
import sys

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, 'data')
    syllabus_file = os.path.join(data_dir, 'syllabus', 'syllabus.json')
    pyq_dir = os.path.join(data_dir, 'pyq')
    
    print("Reading GATE syllabus...")
    with open(syllabus_file, 'r', encoding='utf-8') as f:
        syllabus = json.load(f)
    print(f"Loaded {len(syllabus)} subjects from syllabus.")
    
    total_pyqs = 0
    for subj in ['os', 'algorithms', 'dbms']:
        q_path = os.path.join(pyq_dir, subj, 'questions.json')
        if os.path.exists(q_path):
            with open(q_path, 'r', encoding='utf-8') as f:
                qs = json.load(f)
                total_pyqs += len(qs)
                print(f"Loaded {len(qs)} PYQs for {subj.upper()}.")

    print(f"Total dataset indexed: {total_pyqs} PYQs, {sum(len(s['topics']) for s in syllabus)} topics.")

if __name__ == '__main__':
    main()
