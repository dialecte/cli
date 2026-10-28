/** Name of the lock file, in the repository's git folder, while a hand-over script waits or runs. */
export const HANDOVER_LOCK_FILE = 'dialecte-handover.lock'

export const COMMIT_SCRIPT_FILE = 'commit.sh'

/** The commit a lots file names: a sha or an unambiguous prefix of one. */
export const HEAD_PATTERN = /^[0-9a-f]{7,40}$/

/** How many leading bytes decide that a file is binary (no references looked for in it). */
export const BINARY_PROBE_LENGTH = 8000

/**
 * The commit-by-lots script. People run it with `sh` (macOS: bash 3.2), so it re-executes itself
 * with bash, and uses no `mapfile`; an empty array is never expanded under `set -u`.
 *
 * Placeholders: `__HEADER__`, `__REPOSITORY__`, `__BRANCH__`, `__HEAD__`, `__REFERENCES__`, `__LOCK__`,
 * `__SCRIPT__`, `__LOT_CALLS__`, `__COUNT__`, `__REFERENCE_FREE_CASE__` (the `case` pattern of the files
 * where no reference is looked for).
 */
export const COMMIT_SCRIPT_TEMPLATE = `#!/usr/bin/env bash
__HEADER__
if [ -z "\${BASH_VERSION:-}" ]; then exec bash "$0" "$@"; fi
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd __REPOSITORY__

fail() { echo ">> $1, aborting." >&2; exit 1; }

[ "$(git rev-parse --abbrev-ref HEAD)" = __BRANCH__ ] || fail "Expected branch "__BRANCH__
[ "$(git rev-parse HEAD)" = __HEAD__ ] || fail "Expected HEAD "__HEAD__
git diff --cached --quiet || fail "Something is staged already"
if [ -s "$HERE/files.sha256" ] && ! shasum -a 256 -c --quiet "$HERE/files.sha256"; then
  fail "A file differs from the reviewed snapshot (dialecte handover --rehash after a review)"
fi
while IFS= read -r path; do
  [ ! -e "$path" ] || fail "$path was deleted in the snapshot and exists again"
done < "$HERE/files.deleted"
EXTRA="$({ git -c core.quotePath=false diff --name-only --no-renames HEAD; git -c core.quotePath=false ls-files --others --exclude-standard; } | LC_ALL=C sort -u | LC_ALL=C comm -23 - "$HERE/files.txt")"
if [ -n "$EXTRA" ]; then echo "$EXTRA" >&2; fail "Files changed outside the lots (above)"; fi

REFERENCES=__REFERENCES__
FILES=()
while IFS= read -r line; do
  case "$line" in
    __REFERENCE_FREE_CASE__) ;;
    *) [ ! -e "$line" ] || FILES+=("$line") ;;
  esac
done < "$HERE/files.txt"
if [ \${#FILES[@]} -gt 0 ] && grep -n -I -E "$REFERENCES" -- "\${FILES[@]}"; then
  fail "A plan tag or a standard citation above"
fi

for message in "$HERE"/lot*.msg; do
  if grep -n -E "$REFERENCES" "$message"; then fail "A plan tag or a standard citation in $message"; fi
done

commit_lot() {
  local list="$1" message="$2" paths=()
  while IFS= read -r line; do paths+=("$line"); done < "$list"
  git add -- "\${paths[@]}"
  git commit -q -F "$message"
  git --no-pager log -1 --format='%h %s'
  git --no-pager show --stat --format= HEAD
}

__LOT_CALLS__
LOCK=__LOCK__
if [ -f "$LOCK" ] && [ "$(cat "$LOCK")" = __SCRIPT__ ]; then rm -f "$LOCK"; fi
git status --short
echo ">> Done: __COUNT__ commit(s) on "__BRANCH__". Nothing pushed."
`
