/**
 * A stand-in for vitest: it appends its arguments to `calls.txt` and prints vitest's summary lines, failing files
 * named with a project tag (`|node|`) and without one (a config without projects). `mode` says how it behaves:
 * - `flaky`: three files fail in parallel; everything passes with `--no-file-parallelism`;
 * - `broken`: one of them still fails serially;
 * - `unhandled`: fails in parallel on an error outside any test file;
 * - `counts`: exits 0 in parallel with a failed test counted;
 * - `empty`: fails in parallel; the serial run exits 0 and runs no test;
 * - `counted`: fails in parallel; the serial run exits 0 with a failed test counted;
 * - `diff`: as `flaky`, a failing case's diff printing a gate line that starts with `FAIL` in the parallel run.
 */
export const FAKE_VITEST = `
printf '%s\\n' "$*" >> calls.txt
mode=$(cat mode)
case " $* " in *" --no-file-parallelism "*) serial=1 ;; *) serial= ;; esac
if [ "$mode" = unhandled ]; then
	if [ -n "$serial" ]; then printf ' Test Files  10 passed (10)\\n      Tests  42 passed (42)\\n'; exit 0; fi
	printf 'Unhandled Errors\\nError: the worker exited\\n Test Files  10 passed (10)\\n      Tests  42 passed (42)\\n'
	exit 1
fi
if [ -n "$serial" ] && [ "$mode" = empty ]; then
	printf 'No test files found, exiting with code 0\\n'
	exit 0
fi
if [ -n "$serial" ] && [ "$mode" = counted ]; then
	printf ' Test Files  3 passed (3)\\n      Tests  1 failed | 2 passed (3)\\n'
	exit 0
fi
if [ -n "$serial" ] && { [ "$mode" = flaky ] || [ "$mode" = counts ] || [ "$mode" = diff ]; }; then
	printf ' Test Files  2 passed (2)\\n      Tests  3 passed (3)\\n'
	exit 0
fi
if [ -n "$serial" ]; then
	printf ' FAIL  |node| src/a.test.ts > group > one\\nthe serial run failed here\\n Test Files  1 failed | 1 passed (2)\\n      Tests  1 failed | 2 passed (3)\\n'
	exit 1
fi
[ "$mode" = diff ] && printf -- 'AssertionError: expected the gate output\\n    FAIL  tests  exit 1  tests 3 passed, 1 failed / 4\\n'
printf ' FAIL  |node| src/c.test.ts [ src/c.test.ts ]\\nError: boom\\n FAIL  |node| src/a.test.ts > group > one\\n FAIL  src/b.test.ts > three\\n Test Files  3 failed | 7 passed (10)\\n      Tests  2 failed | 40 passed (42)\\n'
[ "$mode" = counts ] && exit 0
exit 1
`
