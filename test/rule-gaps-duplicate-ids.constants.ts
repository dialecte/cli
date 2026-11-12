/**
 * The test files, the stub and the expected texts of the duplicate case id scenarios: each text is a whole test
 * file, its line numbers fixed (line 1 the vitest import) so a case can name the lines a duplicate reports.
 */

export const VITEST_IMPORT_LINE = "import { describe, expect, it } from 'vitest'"

export const ADD_IMPORT_LINE = "import { add } from './add.ts'"

export const ADD_FILE = 'src/add.ts'

export const ADD_STUB =
	"export function add(left: number, right: number): number {\n\tthrow new Error('not implemented: add')\n}\n"

export const ADD_IMPLEMENTED =
	'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'

/** The package's `dialecte` key: one gate step that always passes, so a gate run reaches the tdd step on its own. */
export const TRUE_GATE_PACKAGE_KEY = { gate: { fast: [{ name: 'check', run: 'true' }] } }

/** The run of a test file's own title at vitest's default threshold: forty characters, then the title differs. */
export const LONG_TITLE_PREFIX = 'a'.repeat(40)

/** `it.each` rows whose `$name` titles share their first forty characters (D1). */
export const EACH_CUT_FILE = 'src/each-cut.test.ts'
export const EACH_CUT_TEXT = [
	VITEST_IMPORT_LINE,
	`it.each([{ name: '${LONG_TITLE_PREFIX}x' }, { name: '${LONG_TITLE_PREFIX}y' }])('$name', () => {`,
	'\texpect(1).toBe(2)',
	'})',
	'',
].join('\n')

/** The same two titles spelled out through a plain loop (D2). */
export const SPELLED_OUT_FILE = 'src/spelled-out.test.ts'
export const SPELLED_OUT_TEXT = [
	VITEST_IMPORT_LINE,
	`const ROWS = [{ name: '${LONG_TITLE_PREFIX}x' }, { name: '${LONG_TITLE_PREFIX}y' }]`,
	'for (const row of ROWS) it(row.name, () => { expect(1).toBe(2) })',
	'',
].join('\n')

/** Two plain `it('same')` calls, on lines 2 and 3 (D13). */
export const PLAIN_DUPLICATE_FILE = 'src/plain-duplicate.test.ts'
export const PLAIN_DUPLICATE_TEXT = [
	VITEST_IMPORT_LINE,
	"it('same', () => { expect(1).toBe(2) })",
	"it('same', () => { expect(1).toBe(3) })",
	'',
].join('\n')

/** The lines the two calls of the plain duplicate are on. */
export const PLAIN_DUPLICATE_LINES = [2, 3]

/** A file of one passing-to-be case and no duplicate. */
export const CLEAN_FILE = 'src/clean.test.ts'
export const CLEAN_TEXT = [VITEST_IMPORT_LINE, "it('alone', () => { expect(1).toBe(2) })", ''].join(
	'\n',
)

/** A failing case and a skipped one under one title (D9). */
export const SKIPPED_MEMBER_FILE = 'src/skipped-member.test.ts'
export const SKIPPED_MEMBER_TEXT = [
	VITEST_IMPORT_LINE,
	"it('same', () => { expect(1).toBe(2) })",
	"it.skip('same', () => { expect(1).toBe(2) })",
	'',
].join('\n')

/** One plain failing case and an untargeted duplicate pair (D9b). */
export const UNTARGETED_PAIR_FILE = 'src/untargeted-pair.test.ts'
export const UNTARGETED_PAIR_TEXT = [
	VITEST_IMPORT_LINE,
	"it('caseA', () => { expect(1).toBe(2) })",
	"it('dup', () => { expect(1).toBe(2) })",
	"it('dup', () => { expect(1).toBe(3) })",
	'',
].join('\n')

/** The duplicate pair of D10, in a file the run does not target. */
export const OTHER_FILE_PAIR_FILE = 'src/other-file-pair.test.ts'

/** A duplicate pair with two other failing cases (D11). */
export const PAIR_AND_TWO_FILE = 'src/pair-and-two.test.ts'
export const PAIR_AND_TWO_TEXT = [
	VITEST_IMPORT_LINE,
	"it('dup', () => { expect(1).toBe(2) })",
	"it('red one', () => { expect(1).toBe(2) })",
	"it('dup', () => { expect(1).toBe(3) })",
	"it('red two', () => { expect(1).toBe(2) })",
	'',
].join('\n')

/** Two `describe.each` rows whose `$x` arrays print alike: the same first ten items, fifteen in all (D15). */
export const EACH_ARRAYS_FILE = 'src/each-arrays.test.ts'
export const EACH_ARRAYS_TEXT = [
	VITEST_IMPORT_LINE,
	'const HEAD = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]',
	'describe.each([{ x: [...HEAD, 11, 12, 13, 14, 15] }, { x: [...HEAD, 21, 22, 23, 24, 25] }])(',
	"\t'rows $x',",
	'\t() => {',
	"\t\tit('plain', () => { expect(1).toBe(2) })",
	'\t},',
	')',
	'',
].join('\n')

/** The base of D16: one file, one case. */
export const MOVED_SOURCE_FILE = 'src/dd.test.ts'
export const MOVED_SOURCE_TEXT = [
	VITEST_IMPORT_LINE,
	"describe('D', () => {",
	"\tdescribe('DD_1', () => {",
	"\t\tit('keeps attribute a', () => { expect('DD_1').toBe('DD_1') })",
	'\t})',
	'})',
	'',
].join('\n')

/** D16's target: the case of the base twice under the same describes, so its name is shared. */
export const MOVED_TARGET_FILE = 'src/dd-1.test.ts'
export const MOVED_TARGET_TEXT = [
	VITEST_IMPORT_LINE,
	"describe('D', () => {",
	"\tdescribe('DD_1', () => {",
	"\t\tit('keeps attribute a', () => { expect('DD_1').toBe('DD_1') })",
	"\t\tit('keeps attribute a', () => { expect('DD_1').toBe('DD_1') })",
	'\t})',
	'})',
	'',
].join('\n')

/** The full name of the case of D16's files. */
export const MOVED_CASE_NAME = 'D > DD_1 > keeps attribute a'

/** The reason a refused member carries, up to its hint. */
export const REASON_START = '2 cases share this id (lines '

/** A fragment of the table hint and the whole plain one. */
export const TABLE_HINT_FRAGMENT = 'spell each title in full'
export const RENAME_HINT = 'rename one'

/** A case the stub makes red then green, and an untargeted duplicate pair on lines 4 and 5 (Q18 at green). */
export const GREEN_UNTARGETED_FILE = 'src/green-untargeted.test.ts'
export const GREEN_UNTARGETED_TEXT = [
	VITEST_IMPORT_LINE,
	ADD_IMPORT_LINE,
	"it('three', () => { expect(add(1, 2)).toBe(3) })",
	"it('dup', () => { expect(add(1, 1)).toBe(2) })",
	"it('dup', () => { expect(add(1, 1)).toBe(3) })",
	'',
].join('\n')

/** The lines of the pair of `GREEN_UNTARGETED_TEXT`. */
export const GREEN_UNTARGETED_LINES = [4, 5]

/** D14's file: a duplicate pair and a case the stub makes red, then green. */
export const GATE_FILE = 'src/gate.test.ts'
export const GATE_TEXT = [
	VITEST_IMPORT_LINE,
	ADD_IMPORT_LINE,
	"it('same', () => { expect(add(1, 1)).toBe(2) })",
	"it('same', () => { expect(add(1, 1)).toBe(3) })",
	"it('three', () => { expect(add(1, 2)).toBe(3) })",
	'',
].join('\n')

/** The lines of D14's duplicate pair. */
export const GATE_DUPLICATE_LINES = [3, 4]

/** The gate's reason for D14. */
export const GATE_DUPLICATE_REASON = `duplicate case ids in 1 file(s): ${GATE_FILE}`
