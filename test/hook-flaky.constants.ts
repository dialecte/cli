/** What the flaky-hook card cases share: the lines a hook prints, the row it must read as, the words it says. */

/** The npm header of the script the hook runs, as npm prints it before the script's own lines. */
export const HOOK_SCRIPT_HEADER = ['', '> demo@1.0.0 test:hook', '> dialecte gate --hook']

/** A hook step line of the card: a mark, the step name. */
export const TEST_HOOK_ROW = /^[✓!✗] test:hook\b/

/** What the card says of a test that failed in parallel and passed serially. */
export const FLAKY_WORDS = '1 flaky, passed serially'

/**
 * What `gate --hook` prints when its one test step failed in parallel (one test of one file) and passed in the
 * serial rerun of that file, as the real command prints it.
 */
export const FLAKY_HOOK_LINES = [
	...HOOK_SCRIPT_HEADER,
	'gate --hook: no green gate --full or --release of tree 270a1ab64965 with this install: running the tests',
	'ok    tests  exit 1  tests 40 passed, 1 failed / 41, files 10  serial rerun of 1 file(s): exit 0, tests 1 passed / 1, files 1  flaky in parallel',
	'        flaky  src/a.test.ts',
	'      Tests  1 failed | 40 passed (41)',
	'gate --hook: green',
]
