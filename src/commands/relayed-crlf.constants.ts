import { join } from 'node:path'

/** What an escaped carriage return prints as. */
export const CARRIAGE_RETURN_ESCAPE = '\\u{d}'

/** The two lines a child prints with CRLF line ends. */
export const CRLF_LINES = ['first crlf line', 'second crlf line']

/** A step that prints them with CRLF ends and fails, so its tail is relayed. */
export const FAILING_CRLF_STEP = {
	name: 'crlf',
	run: `printf '%s\\r\\n' '${CRLF_LINES[0]}' '${CRLF_LINES[1]}'; exit 1`,
}

/** A stand-in `node_modules/.bin/vitest` that prints the same lines with CRLF ends. */
export const VITEST_WITH_CRLF = [
	'#!/bin/sh',
	`printf '%s\\r\\n' '${CRLF_LINES[0]}' '${CRLF_LINES[1]}'`,
	'exit 0',
	'',
].join('\n')

/** The package the scoped tests entry runs over: a changed module and a manifest. */
export const SCOPED_PACKAGE_FILES = {
	'package.json': `${JSON.stringify({ name: 'demo', type: 'module' }, null, '\t')}\n`,
	'.gitignore': 'node_modules\n',
	'src/a.ts': 'export const a = 1\n',
}

/** The entry the gate runs for its scoped tests step. */
export const SCOPED_TESTS_ENTRY = join(import.meta.dirname, '..', 'scoped-tests.ts')

/** The bound on the spawned entry: a guard against a hang, never a measure of speed. */
export const SCOPED_ENTRY_BOUND_MS = 90_000
