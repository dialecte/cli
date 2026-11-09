/**
 * A scoped step as a script that runs no vitest: each run appends its arguments to `args.log` and the base, tree,
 * changed file and selection path it got to `env.log`; it copies `selection.json` to its selection path and prints
 * `output.txt` and exits with `exit.txt` (`output-serial.txt` and `exit-serial.txt` when told `--no-file-parallelism`).
 */
export const FAILING_STEP_SCRIPT = `
printf '%s\\n' "$*" >> args.log
echo "$DIALECTE_GATE_BASE $DIALECTE_GATE_TREE $DIALECTE_GATE_CHANGED $DIALECTE_GATE_SELECTION" >> env.log
mode=
case " $* " in *" --no-file-parallelism "*) mode=-serial ;; esac
if [ -n "$DIALECTE_GATE_SELECTION" ]; then cp selection.json "$DIALECTE_GATE_SELECTION"; fi
cat "output$mode.txt"
exit "$(cat "exit$mode.txt")"
`

/** How many lines of noise follow the failing lines of a first run: more than the 30 lines a failed step's tail keeps. */
export const NOISE_LINES = 60

/** The printed counts of a run whose tests all passed. */
export const PRINTED_PASSED = ' Test Files  1 passed (1)\n      Tests  3 passed (3)\n'

/** The npm script a step runs through: no vitest named. */
export const SCOPE_SCRIPT = 'sh ./step.sh scoped'

/** What vitest prints when it exits 1 on an error outside any test: no failed test counted, no FAIL line. */
export const UNHANDLED_OUTPUT =
	'Unhandled Errors\nError: the worker exited\n Test Files  10 passed (10)\n      Tests  42 passed (42)\n'

/** What a script that is no test run prints when it fails: no vitest output at all. */
export const SCRIPT_ERROR_OUTPUT = 'step.sh: cannot read the fixtures\n'

/** A run that names a failing file and prints no test counts. */
export const FAIL_LINE_ONLY_OUTPUT = ' FAIL  |node| src/a.test.ts > group > one\n'
