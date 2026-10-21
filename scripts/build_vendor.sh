#!/usr/bin/env bash
# Rebuild js/vendor/anthropic-sdk.js (browser ESM bundle of the official Anthropic TypeScript SDK).
set -euo pipefail
SDK_VERSION="${SDK_VERSION:-0.131.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
cd "$WORK"
npm init -y >/dev/null
npm install --silent "@anthropic-ai/sdk@${SDK_VERSION}" esbuild@0.25.0
echo 'export { default as Anthropic } from "@anthropic-ai/sdk";' > entry.js
npx esbuild entry.js --bundle --format=esm --minify --platform=browser \
  --outfile="$ROOT/js/vendor/anthropic-sdk.js"
cp node_modules/@anthropic-ai/sdk/LICENSE "$ROOT/js/vendor/anthropic-sdk.LICENSE.txt"
echo "Built @anthropic-ai/sdk ${SDK_VERSION}"
