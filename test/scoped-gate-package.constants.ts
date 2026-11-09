/** The fake scoped step and the git recorder of the tests of `gate` on a package with a scoped step. */

/** The record of `dialecte gate --release` in the worktree's git folder. */
export const RELEASE_RECORD_FILE = 'dialecte-gate-release.json'

/** The branch the scratch package's feature work is on (HEAD), cut from `main`. */
export const FEATURE_BRANCH = 'feat/x'

/**
 * A scoped step as a script, run as `sh <script> <log> <move file>`: it logs the base and tree it got, keeps the changed
 * file it got next to the log, moves `main` to the commit its move file names when that file exists (a base ref that
 * moves while the gate runs), then writes an honest selection (`T0`, every changed path judged) and prints a test count.
 */
export const SCOPED_STEP_SCRIPT = `log=$1
move=$2
echo "$DIALECTE_GATE_BASE $DIALECTE_GATE_TREE" >> "$log"
if [ -n "$DIALECTE_GATE_CHANGED" ]; then cp "$DIALECTE_GATE_CHANGED" "$log.changed"; fi
if [ -f "$move" ]; then git update-ref refs/heads/main "$(cat "$move")"; fi
n=0
if [ -n "$DIALECTE_GATE_CHANGED" ]; then n=$(tr -cd '\\0' < "$DIALECTE_GATE_CHANGED" | wc -c | tr -d ' '); fi
printf '{"schema":1,"base":"%s","tree":"%s","changed":%s,"selected":[{"id":"T0","reasons":["always"]}],"skipped":[]}\\n' "$DIALECTE_GATE_BASE" "$DIALECTE_GATE_TREE" "$n" > "$DIALECTE_GATE_SELECTION"
printf '      Tests  4 passed (4)\\n'
`

/** The `git` stand-in put first on the PATH: it appends its arguments to the log, then runs the real git. */
export const GIT_RECORDER_SCRIPT = `#!/bin/sh
printf '%s\\n' "$*" >> {log}
exec {git} "$@"
`
