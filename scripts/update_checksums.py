#!/usr/bin/env python3
"""Write SHA256SUMS.txt for every tracked file except itself.

Hashes are of the committed bytes (see .gitattributes for line endings).
Usage: python3 scripts/update_checksums.py
"""
import hashlib
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    files = subprocess.run(['git', '-C', str(ROOT), 'ls-files', '-z'], capture_output=True, check=True).stdout
    paths = sorted(p for p in files.decode().split('\0') if p and p != 'SHA256SUMS.txt')
    lines = []
    for rel in paths:
        blob = subprocess.run(['git', '-C', str(ROOT), 'show', f':{rel}'], capture_output=True, check=True).stdout
        lines.append(f'{hashlib.sha256(blob).hexdigest()}  ./{rel}')
    (ROOT / 'SHA256SUMS.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'{len(lines)} files hashed')


if __name__ == '__main__':
    main()
