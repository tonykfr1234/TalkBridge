#!/usr/bin/env python3
"""Fail closed on likely credentials and private meeting data before publishing.

Findings list paths and line numbers, never the matched values. Only the
application icons and documentation screenshots may be binary media.
Usage: python3 scripts/security_scan.py [root]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

SKIP_DIRS = {'.git', 'node_modules', '__pycache__', '.venv', 'test-results', 'playwright-report'}
ALLOWED_MEDIA = re.compile(r'^(assets/icon-[\w-]+\.png|docs/media/[\w-]+\.png)$')
MEDIA_SUFFIXES = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.webm', '.m4a', '.ogg', '.wav', '.mp3', '.mov'}
FORBIDDEN_SUFFIXES = {'.log', '.zip', '.7z', '.rar', '.tar', '.gz', '.key', '.pem', '.p12'}
EXPORT_NAME = re.compile(r'^TalkBridge_\d{8}-\d{4}_')
PATTERNS = {
    'Anthropic API key': re.compile(r'\bsk-ant-[A-Za-z0-9_-]{20,}'),
    'OpenAI-style secret': re.compile(r'\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b'),
    'GitHub token': re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b'),
    'Google API key': re.compile(r'\bAIza[0-9A-Za-z_-]{35}\b'),
    'AWS access key': re.compile(r'\bAKIA[0-9A-Z]{16}\b'),
    'Private key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
}
MAX_TEXT_BYTES = 5 * 1024 * 1024


def scan(root: Path) -> list[str]:
    problems = []
    for path in sorted(root.rglob('*')):
        rel = path.relative_to(root).as_posix()
        if any(part in SKIP_DIRS for part in path.relative_to(root).parts) or not path.is_file():
            continue
        name = path.name.lower()
        suffix = path.suffix.lower()
        if name == '.env' or (name.startswith('.env.') and name != '.env.example'):
            problems.append(f'{rel}: environment file must not be committed')
            continue
        if 'credential' in name or 'secret' in name:
            problems.append(f'{rel}: credential-like file name')
            continue
        if EXPORT_NAME.match(path.name):
            problems.append(f'{rel}: exported meeting file must not be committed')
            continue
        if suffix in FORBIDDEN_SUFFIXES:
            problems.append(f'{rel}: forbidden file type {suffix}')
            continue
        if suffix in MEDIA_SUFFIXES:
            if not ALLOWED_MEDIA.match(rel):
                problems.append(f'{rel}: media outside assets/icon-*.png and docs/media/*.png')
            continue
        if path.stat().st_size > MAX_TEXT_BYTES:
            problems.append(f'{rel}: text file larger than 5 MiB')
            continue
        try:
            text = path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            problems.append(f'{rel}: unexpected binary file')
            continue
        for lineno, line in enumerate(text.splitlines(), 1):
            for label, pattern in PATTERNS.items():
                if pattern.search(line):
                    problems.append(f'{rel}:{lineno}: possible {label}')
    return problems


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
    problems = scan(root)
    if problems:
        print('Security scan failed:')
        for p in problems:
            print('  ' + p)
        return 1
    print('Security scan passed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
