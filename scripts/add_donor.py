#!/usr/bin/env python3
"""Add a supporter to donors.json after Tony confirms the payment arrived.

Only confirmed payments are listed; the number shown to everyone is the
count of this list. Names are nicknames chosen by the supporter.
Usage: python3 scripts/add_donor.py "暱稱" [--message "留言"] [--date 2026-10-23]
"""
import argparse
import datetime
import json
from pathlib import Path

PATH = Path(__file__).resolve().parent.parent / 'donors.json'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('name')
    ap.add_argument('--message', default='')
    ap.add_argument('--date', default=datetime.date.today().isoformat())
    a = ap.parse_args()
    data = json.loads(PATH.read_text(encoding='utf-8')) if PATH.exists() else {'donors': []}
    donors = data.get('donors', [])
    n = len(donors) + 1
    donors.append({'n': n, 'name': a.name.strip()[:40], 'date': a.date, 'message': a.message.strip()[:200]})
    PATH.write_text(json.dumps({'count': len(donors), 'donors': donors}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'第 {n} 位贊助者：{a.name}')


if __name__ == '__main__':
    main()
