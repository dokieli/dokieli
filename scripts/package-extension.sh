#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./manifest.json').version")
ZIP="dokieli-extension-${VERSION}.zip"

echo "Building dokieli extension v${VERSION}"

# Remove previous build output so old chunks are not packaged
git clean -fdXq scripts/

yarn minify

rm -f "$ZIP"
{
  git ls-files
  find scripts -type f -name '*.js'
} | sort -u | zip -q "$ZIP" -@

echo "Wrote: $ZIP ($(du -h "$ZIP" | cut -f1))"
