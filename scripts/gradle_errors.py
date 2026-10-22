#!/usr/bin/env python3
"""Turn Gradle/Kotlin/lint errors in a build log into GitHub annotations.

Annotations are readable through the GitHub API even when raw logs are not.
Usage: python3 scripts/gradle_errors.py build.log
"""
import re
import sys

PATTERNS = [
    re.compile(r'^e: (?:file://)?(.+?):(\d+):(\d+) (.*)$'),           # Kotlin compiler
    re.compile(r'^(.+?\.(?:kt|java|xml|kts)):(\d+): Error: (.*)$'),     # lint
]


def main(path):
    lines = open(path, encoding='utf-8', errors='replace').read().splitlines()
    out = []
    for line in lines:
        for p in PATTERNS:
            m = p.match(line.strip())
            if m:
                g = m.groups()
                f = g[0].split('/android/', 1)[-1]
                out.append(f'::error file=android/{f},line={g[1]}::{g[-1][:400]}')
                break
    # Gradle's own "What went wrong" block.
    for i, line in enumerate(lines):
        if line.startswith('* What went wrong:'):
            msg = ' '.join(x.strip() for x in lines[i + 1:i + 8] if x.strip() and not x.startswith('* '))
            out.append(f'::error::Gradle: {msg[:900]}')
    for line in out[:40] or ['::error::Build failed; no recognizable error lines in the log.']:
        print(line)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'build.log')
