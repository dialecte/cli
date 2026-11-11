/** What an escaped line feed prints as. */
export const LINE_FEED_ESCAPE = '\\u{a}'

/** The tail lines the stand-in vitest prints before it ends without a report: a colour, a cursor move. */
export const COLOURED_TAIL_LINE = '\u001b[32mtail colour line\u001b[0m'
export const MOVED_TAIL_LINE = 'tail move\u001b[2Aline'
export const PRINTED_MOVED_TAIL_LINE = 'tail move\\u{1b}[2Aline'

/** A stand-in `node_modules/.bin/vitest`: prints the tail lines, writes no report, exits 1. */
export const VITEST_WITHOUT_REPORT = [
	'#!/bin/sh',
	`printf '%s\\n' '${COLOURED_TAIL_LINE}'`,
	`printf '%s\\n' '${MOVED_TAIL_LINE}'`,
	'exit 1',
	'',
].join('\n')

/** The package: one test file new in the tree, a stand-in vitest, nothing else. */
export const PACKAGE_FILES = {
	'package.json': `${JSON.stringify({ name: 'demo', type: 'module' }, null, '\t')}\n`,
	'.gitignore': 'node_modules\n',
}
export const NEW_TEST_FILES = {
	'src/demo.test.ts': "import { it } from 'vitest'\nit('one', () => {})\n",
}

/** The path of the stand-in binary, from the package root. */
export const STAND_IN_BINARY = 'node_modules/.bin/vitest'

/** The start of the cli's own reason line, per subcommand. */
export const NO_REPORT_REASON_PATTERN = /^tdd (red|green|status): vitest wrote no report/
