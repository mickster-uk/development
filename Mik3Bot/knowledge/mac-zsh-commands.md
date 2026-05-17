# Mac zsh Commands — Essential Reference

## Searching for Files

### find — locate files by name or attribute
```zsh
find . -name "*.log"                   # files ending in .log under current dir
find . -name "config.json"             # exact filename match
find . -iname "readme*"                # case-insensitive name match
find ~ -name "*.env" -maxdepth 3       # limit search depth to 3 levels
find . -type f -name "*.sh"            # files only (not directories)
find . -type d -name "node_modules"    # directories only
find . -name "*.tmp" -delete           # find and delete in one pass
find . -newer reference.txt            # files modified more recently than reference.txt
find . -mtime -7                       # files modified in the last 7 days
find . -size +10M                      # files larger than 10 MB
```

**Best practice:** always quote patterns (`"*.log"`) to prevent the shell globbing before `find` sees the argument. Prefer `-maxdepth` to keep searches fast on large trees.

### locate — fast index-based file search
```zsh
locate config.json                     # instant search via pre-built index
sudo /usr/libexec/locate.updatedb      # refresh the index (run periodically)
```

**Note:** `locate` uses a database updated nightly — results may be stale. Use `find` when you need real-time accuracy.

### mdfind — Spotlight search from the terminal
```zsh
mdfind -name "budget.xlsx"             # search by filename via Spotlight
mdfind "kind:pdf author:Mike"          # full metadata search
mdfind -onlyin ~/Documents "invoice"   # restrict to a directory
```

`mdfind` is macOS-specific and extremely fast for user files; it respects Spotlight privacy exclusions.

---

## Searching File Contents

### grep — search text patterns inside files
```zsh
grep "error" app.log                   # lines containing "error"
grep -i "error" app.log                # case-insensitive
grep -r "TODO" ./src                   # recursive search through a directory
grep -rn "TODO" ./src                  # include line numbers
grep -rl "TODO" ./src                  # print only filenames, not lines
grep -v "debug" app.log                # lines that do NOT match
grep -E "error|warn" app.log           # extended regex — match either word
grep -A 3 "Exception" app.log          # 3 lines of context after each match
grep -B 2 -A 2 "Exception" app.log     # 2 lines before and after
grep --include="*.js" -r "fetch" .     # limit recursive search to .js files
grep --exclude-dir=node_modules -r "apiKey" .   # skip a directory
```

**Best practice:** use `-r` with `--exclude-dir=node_modules` (and `.git`) when searching projects to avoid noise and slow scans.

### ripgrep (rg) — faster modern alternative to grep
```zsh
rg "TODO" ./src                        # recursive by default, respects .gitignore
rg -i "error" logs/                    # case-insensitive
rg -l "apiKey"                         # filenames only
rg -n "function init"                  # with line numbers
rg --type js "fetch"                   # limit to a file type
rg -e "error" -e "warn"               # multiple patterns
```

Install with `brew install ripgrep`. Preferred over `grep -r` for codebases — faster and `.gitignore`-aware by default.

---

## Navigating the Filesystem

```zsh
pwd                                    # print current directory
cd ~                                   # go to home directory
cd -                                   # go back to previous directory
cd ../..                               # go up two levels
ls -la                                 # list all files with details
ls -lh                                 # human-readable file sizes
ls -lt                                 # sort by modification time (newest first)
du -sh ./node_modules                  # disk usage of a directory
du -sh */ | sort -h                    # size of each subdirectory, sorted
```

---

## Viewing and Inspecting Files

```zsh
cat file.txt                           # print entire file
less file.txt                          # page through a file (q to quit)
head -n 20 file.txt                    # first 20 lines
tail -n 50 file.txt                    # last 50 lines
tail -f app.log                        # follow a log file in real time
wc -l file.txt                         # count lines
file mystery.bin                       # detect file type from content
```

---

## File and Directory Operations

```zsh
mkdir -p path/to/new/dir               # create nested directories in one go
cp -r source/ dest/                    # copy directory recursively
mv oldname.txt newname.txt             # rename or move
rm -i file.txt                         # delete with confirmation prompt
rm -rf ./dist                          # delete directory (no confirmation — use carefully)
ln -s /path/to/target linkname         # create a symbolic link
touch file.txt                         # create empty file or update timestamp
```

**Best practice:** prefer `rm -i` interactively and reserve `rm -rf` for scripts where the path is unambiguous. Never run `rm -rf` with unquoted variables.

---

## zsh-Specific Features

```zsh
# Glob patterns (zsh extends POSIX globs)
ls **/*.js                             # recursive glob — all .js files in subtree
ls *.{js,ts}                           # match .js or .ts
ls **/!(node_modules)/                 # all dirs except node_modules (extglob)

# History
history                                # show command history
!!                                     # re-run last command
!grep                                  # re-run last command starting with "grep"
ctrl+r                                 # interactive history search

# Aliases (add to ~/.zshrc)
alias ll="ls -lah"
alias grep="grep --color=auto"

# Quick directory bookmarks
hash -d dev=~/Desktop/development      # use ~dev as a short path alias
```

---

## Combining Commands — Practical Patterns

```zsh
# Find all JS files modified today and count them
find . -name "*.js" -mtime 0 | wc -l

# Search for a string, exclude minified files
grep -r "apiBaseUrl" . --include="*.js" --exclude="*.min.js"

# Find large log files and show their sizes
find . -name "*.log" -size +5M -exec du -sh {} \;

# Watch a directory for new files (requires fswatch via brew)
fswatch -o ./uploads | xargs -n1 -I{} echo "Change detected"

# Pipe grep results into a file
grep -rn "deprecated" ./src > deprecated-report.txt
```

---

## Quick Reference — When to Use What

| Goal | Command |
|---|---|
| Find file by name | `find . -name "*.ext"` or `mdfind -name` |
| Search file contents (project) | `rg "pattern"` or `grep -r` |
| Search file contents (single file) | `grep "pattern" file` |
| Fast system-wide filename search | `mdfind` |
| Follow a live log | `tail -f` |
| Inspect unknown file type | `file filename` |
| Directory size breakdown | `du -sh */ \| sort -h` |
