/** What the tests of a hook on a scoped package share: the hook's script, the env probe, the empty-selection step. */
import { REPOSITORY_CLI_PATH } from './gate-hook.constants.ts'

/** The hook script of a package whose commit hook runs the repository cli's `gate --hook` as `npm run test:hook` would. */
export const GATE_HOOK_SCRIPT = [
	"printf '\\n> demo@1.0.0 test:hook\\n> node src/cli.ts gate --hook\\n'",
	`node '${REPOSITORY_CLI_PATH}' gate --hook`,
].join('\n')

/** The commit hook files of the scratch package (husky as it installs them), and the folder of the wrapper. */
export const HUSKY_WRAPPER_FOLDER = '.husky/_'
export const HUSKY_HOOK_RUNNER =
	'#!/usr/bin/env sh\nn=$(basename "$0")\ns=$(dirname "$(dirname "$0")")/$n\n[ ! -f "$s" ] && exit 0\nsh -e "$s" "$@"\n'
export const HUSKY_PRE_COMMIT_WRAPPER = '#!/usr/bin/env sh\n. "$(dirname "$0")/h"\n'

/** The hook line appending `base|folder` as the hook saw its two hand-over variables (`unset` when absent) to `{log}`. */
export const HANDOVER_ENVIRONMENT_PROBE =
	'printf \'%s|%s\\n\' "${DIALECTE_HANDOVER_BASE-unset}" "${DIALECTE_HANDOVER_FOLDER-unset}" >> {log}'

/**
 * A scoped step as a script, run as `sh <script> <log>`: it logs the base and tree it got and writes an honest
 * selection of nothing (every changed path judged, none selected); it prints no test count.
 */
export const EMPTY_SELECTION_STEP_SCRIPT = `log=$1
echo "$DIALECTE_GATE_BASE $DIALECTE_GATE_TREE" >> "$log"
n=0
if [ -n "$DIALECTE_GATE_CHANGED" ]; then n=$(tr -cd '\\0' < "$DIALECTE_GATE_CHANGED" | wc -c | tr -d ' '); fi
printf '{"schema":1,"base":"%s","tree":"%s","changed":%s,"selected":[],"skipped":[]}\\n' "$DIALECTE_GATE_BASE" "$DIALECTE_GATE_TREE" "$n" > "$DIALECTE_GATE_SELECTION"
`

/** A scoped step as a script, run as `sh <script> <log>`: honest selection of two ids, `T0` and `T4`, and a test count. */
export const TWO_IDS_STEP_SCRIPT = `log=$1
echo "$DIALECTE_GATE_BASE $DIALECTE_GATE_TREE" >> "$log"
n=0
if [ -n "$DIALECTE_GATE_CHANGED" ]; then n=$(tr -cd '\\0' < "$DIALECTE_GATE_CHANGED" | wc -c | tr -d ' '); fi
printf '{"schema":1,"base":"%s","tree":"%s","changed":%s,"selected":[{"id":"T0","reasons":["always"]},{"id":"T4","reasons":["always"]}],"skipped":[]}\\n' "$DIALECTE_GATE_BASE" "$DIALECTE_GATE_TREE" "$n" > "$DIALECTE_GATE_SELECTION"
printf '      Tests  4 passed (4)\\n'
`

/**
 * A scoped step as a script, run as `sh <script> <log>`: honest selection and a test count, then exit 1 when its base
 * is the empty tree (so `gate --release` fails and any run on a real base passes).
 */
export const FAILS_ON_EMPTY_TREE_STEP_SCRIPT = `log=$1
echo "$DIALECTE_GATE_BASE $DIALECTE_GATE_TREE" >> "$log"
n=0
if [ -n "$DIALECTE_GATE_CHANGED" ]; then n=$(tr -cd '\\0' < "$DIALECTE_GATE_CHANGED" | wc -c | tr -d ' '); fi
printf '{"schema":1,"base":"%s","tree":"%s","changed":%s,"selected":[{"id":"T0","reasons":["always"]}],"skipped":[]}\\n' "$DIALECTE_GATE_BASE" "$DIALECTE_GATE_TREE" "$n" > "$DIALECTE_GATE_SELECTION"
printf '      Tests  4 passed (4)\\n'
if [ "$DIALECTE_GATE_BASE" = "$(git hash-object -t tree /dev/null)" ]; then exit 1; fi
`

/** An unscoped test step: it appends `base|folder` as it saw the hand-over variables (`unset` when absent) to `{log}`. */
export const HANDOVER_ENVIRONMENT_STEP =
	'printf \'%s|%s\\n\' "${DIALECTE_HANDOVER_BASE-unset}" "${DIALECTE_HANDOVER_FOLDER-unset}" >> {log} && printf \'      Tests  4 passed (4)\\n\''

/** The start time a live run marker is written with (never compared by a hand-over's own marker). */
export const LIVE_RUN_STARTED_AT = '2026-11-09T10:00:00.000Z'
