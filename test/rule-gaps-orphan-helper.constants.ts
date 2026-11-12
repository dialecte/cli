/** The committed test helper the orphan-helper scenarios change. */
export const ORPHAN_HELPER = 'test/expected.ts'

/** The reason the lot file gives for the helper's revision. */
export const ORPHAN_REVISION_REASON = 'the helper gained a constant at review'

/** The helper as committed. */
export const ORPHAN_HELPER_TEXT = 'export const EXPECTED = 3\n'

/** The helper changed in the working tree: a constant the committed production still satisfies. */
export const ORPHAN_EDITED_HELPER_TEXT = `${ORPHAN_HELPER_TEXT}export const SPARE = 4\n`

/** The helper changed a second time. */
export const ORPHAN_EDITED_AGAIN_HELPER_TEXT = `${ORPHAN_EDITED_HELPER_TEXT}export const MORE = 5\n`

/** The committed test file importing the helper, and the only one that does. */
export const ORPHAN_DEPENDENT_TEST = 'src/add.test.ts'

/** The committed production the dependent test runs. */
export const ORPHAN_PRODUCTION =
	'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'

/** The committed test file, reading the expected sum from the helper. */
export const ORPHAN_DEPENDENT_TEST_TEXT = [
	"import { add } from './add.ts'",
	"import { EXPECTED } from '../test/expected.ts'",
	"import { describe, expect, it } from 'vitest'",
	"describe('add', () => {",
	"\tit('one plus two → three', () => { expect(add(1, 2)).toBe(EXPECTED) })",
	'})',
	'',
].join('\n')

/** A second test file importing the helper, written after the commit (a changed dependent). */
export const ORPHAN_SECOND_DEPENDENT_TEST = 'src/twice.test.ts'

/** Its text: a case on the committed production, red on an assertion at the changed helper. */
export const ORPHAN_SECOND_DEPENDENT_TEST_TEXT = [
	"import { add } from './add.ts'",
	"import { EXPECTED } from '../test/expected.ts'",
	"import { describe, expect, it } from 'vitest'",
	"describe('twice', () => {",
	"\tit('two plus one → three', () => { expect(add(2, 1)).toBe(EXPECTED + 1) })",
	'})',
	'',
].join('\n')
