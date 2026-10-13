#!/usr/bin/env bash
# Symlink private docs from the sibling private repo into this repo (paths are gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."
PRIVATE="${PRIVATE_REPO:-../remote-attendance-private}"
PRIVATE="$(cd "$PRIVATE" && pwd)"
for f in docs/PROJECT_PLAN.md docs/PROGRESS.md docs/IDEA_BRIEF.md docs/CLIENT_QUESTIONS.md docs/client docs/private supabase/legacy; do
  if [ -e "$f" ] && [ ! -L "$f" ]; then echo "skip $f (a real file exists here)"; continue; fi
  ln -sfn "$PRIVATE/$f" "$f" && echo "linked $f"
done
