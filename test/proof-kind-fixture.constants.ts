import { hashText } from '../src/lib/tdd/tdd-files.ts'

/** The test file of the proof-kind fixture: made up, a case named in the core test vocabulary. */
export const PROOF_KIND_TEST_FILE = 'src/dd-element.test.ts'

/** The production file the fixture's case calls. */
export const PROOF_KIND_PRODUCTION_FILE = 'src/dd-element.ts'

/** The fixture's one case, as vitest names it. */
export const PROOF_KIND_CASE_NAME = 'D > DD_1 keeps attribute a'

/** The fixture's case as the lot file and the output name it. */
export const PROOF_KIND_CASE_LABEL = `${PROOF_KIND_TEST_FILE}::${PROOF_KIND_CASE_NAME}`

export const PROOF_KIND_PRODUCTION_TEXT =
	'export function keepAttribute(element: { a: string }): string {\n\treturn element.a\n}\n'

export const PROOF_KIND_TEST_TEXT = [
	"import { keepAttribute } from './dd-element.ts'",
	"import { describe, expect, it } from 'vitest'",
	"describe('D', () => {",
	"\tit('DD_1 keeps attribute a', () => { expect(keepAttribute({ a: 'x' })).toBe('x') })",
	'})',
	'',
].join('\n')

export const PROOF_KIND_ACCEPT_REASON = 'pins behaviour that already exists'

export const PROOF_KIND_REVISED_REASON = 'the review asked for the attribute to be read'

/** The receipts of the first runs carry other hashes: the case was reworded and its file edited since. */
export const FAKE_CASE_HASHES = [
	'first wording',
	'second wording',
	'third wording',
	'fourth wording',
].map(hashText)

/** The test file's hashes at the earlier runs (the last of them is the one the greens saw). */
export const FAKE_FILE_HASHES = ['file one', 'file two', 'file three', 'file four'].map(hashText)

/** The production states of the earlier runs: none is the production of the scratch package now. */
export const FAKE_PRODUCTION_HASHES = ['production one', 'production two', 'production three'].map(
	hashText,
)

/** The time every hand-written receipt carries. */
export const PROOF_KIND_AT = '2026-10-29T12:00:00.000Z'
