/** The test file of the data-fixture scenarios: new in the working tree, its cases accepted or red. */
export const READER_TEST = 'src/read.test.ts'

/** The suite and case title of the reader test file (the same in every scenario). */
export const READER_SUITE = 'a reader of data'
export const READER_TITLE = 'the reads hold → the assertions pass'

/** The id of the reader's one case as the lot file names it (a scratch package runs one project, unnamed). */
export const READER_CASE = `${READER_TEST}::${READER_SUITE} > ${READER_TITLE}`

/** The reason an accepted case of the scenarios carries. */
export const ACCEPT_REASON = 'the case pins a fixture and passes without a red'

/** The `.xml` fixture beside the reader, as committed or written. */
export const ONE_IED_FIXTURE = 'src/fixtures/one-ied.xml'
export const ONE_IED_TEXT = '<SCL><IED name="A"/></SCL>\n'

/** A second `.xml` fixture, read by one file only. */
export const TWO_IEDS_FIXTURE = 'src/fixtures/two-ieds.xml'
export const TWO_IEDS_TEXT = '<SCL><IED name="A"/><IED name="B"/></SCL>\n'

/** The fixture text after an edit that keeps it a document the case still passes on. */
export const ONE_IED_EDITED_TEXT = '<SCL><IED name="A"/><!-- edited --></SCL>\n'

/** A `.json` fixture. */
export const DATA_JSON_FIXTURE = 'src/fixtures/data.json'
export const DATA_JSON_TEXT = '{ "name": "A" }\n'

/** A `.ts` helper under a test folder, imported by the reader. */
export const CODE_HELPER = 'test/helper.ts'
export const CODE_HELPER_TEXT = "export const HELPER_NAME = 'A'\n"

/** A `.ts` helper whose source is read as text with `?raw`. */
export const CODE_RAW_HELPER = 'test/helper-text.ts'
export const CODE_RAW_HELPER_TEXT = "export const RAW_NAME = 'A'\n"

/** A `.ts` file a glob of the reader matches. */
export const CODE_GLOB_MATCH = 'src/fixtures/code/glob-match.ts'
export const CODE_GLOB_MATCH_TEXT = "export const GLOB_NAME = 'A'\n"

/** The red test file of the shared-fixture scenario: a case failing on an assertion at the shared fixture. */
export const RED_TEST = 'src/red.test.ts'
export const RED_TEST_TEXT = [
	"import SharedXml from './fixtures/one-ied.xml?raw'",
	"import { describe, expect, it } from 'vitest'",
	"describe('a red reader', () => {",
	"\tit('the fixture names B → the text holds it', () => { expect(SharedXml).toContain('name=\"B\"') })",
	'})',
	'',
].join('\n')

/** The committed production of the red-then-green scenario: counts nothing yet. */
export const COUNTER = 'src/count-ieds.ts'
export const COUNTER_TEXT =
	'export function countIeds(xml: string): number {\n\treturn xml.length * 0\n}\n'

/** The production once a green step wrote it: counts the `<IED` openings. */
export const COUNTER_DONE_TEXT =
	"export function countIeds(xml: string): number {\n\treturn xml.split('<IED').length - 1\n}\n"

/** The test file counting the IEDs of the fixture, red on the stub counter, green on the real one. */
export const COUNTER_TEST = 'src/count.test.ts'
export const COUNTER_TEST_TEXT = [
	"import { countIeds } from './count-ieds.ts'",
	"import OneIedXml from './fixtures/one-ied.xml?raw'",
	"import { describe, expect, it } from 'vitest'",
	"describe('a counter', () => {",
	"\tit('one IED in the fixture → one', () => { expect(countIeds(OneIedXml)).toBe(1) })",
	'})',
	'',
].join('\n')

/** The refusal `tdd green` gives for a changed frozen file. */
export const CHANGED_SINCE_RED = 'test code changed since the last red run'
