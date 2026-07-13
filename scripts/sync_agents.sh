#!/bin/zsh
set -euo pipefail

SRC=~/Documents/knowbase/Agents
REPO_AGENTS=~/Desktop/development/.claude/agents
COMMANDS=~/Desktop/development/.claude/commands
DRIVE="$HOME/Library/CloudStorage/GoogleDrive-mikejfinch.mf@gmail.com/My Drive/Backups/Agents"

rsync -a --delete "$SRC/definitions/" "$REPO_AGENTS/"

mkdir -p "$COMMANDS"
for p in "$SRC"/protocols/*.md; do
  name=$(basename "$p")
  {
    echo "Adopt the protocol below for: \$ARGUMENTS"
    echo
    cat "$p"
  } > "$COMMANDS/$name"
done

rsync -a --delete "$SRC/" "$DRIVE/"

echo "drift check:"
diff -rq "$SRC/definitions" "$REPO_AGENTS" && echo "  definitions in sync"
diff -rq "$SRC" "$DRIVE" && echo "  drive backup in sync"
