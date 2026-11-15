export const TEST_FILE = 'src/widget/add-widget.test.ts'
export const SOURCE_FILE = 'src/widget/add-widget.ts'
export const FIXTURE_FILE = 'src/widget/fixtures/big.xml'
export const BASE_VARIABLE = 'DIALECTE_GATE_BASE'
export const TEST_FILE_LONG_MESSAGE =
	'test file of {count} lines (over 400): one table per behaviour, split by behaviour'
export const FIXTURE_LONG_MESSAGE =
	'fixture of {count} lines (over 120): split it, one document per variant'
export const NOT_GROWN = ' (not grown by this change)'
export const LENGTH_RULES = ['test-file-long', 'fixture-file-long', 'invalid-allow', 'unused-allow']

export const DIALECTE_PACKAGE = {
	'package.json': `${JSON.stringify({ name: '@dialecte/demo' })}\n`,
	'src/v1/generated/definition.generated.ts': 'export {}\n',
}

/** A test file that reads the fixture with `?raw`. */
export const FIXTURE_READER = [
	"import BigXml from './fixtures/big.xml?raw'",
	'const testCases = {',
	"\t'a big widget': { sourceXml: BigXml },",
	'}',
	'runWidgetTestCases.withExport({ testCases, act: async () => {} })',
	'',
].join('\n')
