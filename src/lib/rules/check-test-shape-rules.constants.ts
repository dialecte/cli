/** Callees that export the document as XML: an act that calls one reads exported XML. */
export const XML_EXPORT_CALLS: readonly string[] = [
	'exportXml',
	'exportDocument',
	'toXml',
	'assertExpectedElementQueries',
]

/** A snapshot call that reads exported XML when asked for it: `getSnapshot({ as: 'xml' })`. */
export const XML_SNAPSHOT_CALL = 'getSnapshot'

/** The `as` value of a snapshot call that asks for XML. */
export const XML_SNAPSHOT_FORMAT = 'xml'

/** Plan or round tags a test title, a table key or a test file name may not carry. */
export const PLAN_TAG_PATTERNS: readonly RegExp[] = [
	/\bround[ _-]?\d+\b/i,
	/\bR\d+-\d+\b/,
	/\bstep[ _-]?\d+\b/i,
]

/** The label of the committed-text patterns that are plan tags: a title may not carry them either. */
export const COMMITTED_PLAN_TAG_LABEL = 'plan tag'

/** A test-case runner: core's `runTestCases` or a package's wrapper (`runWidgetTestCases`). */
export const RUNNER_NAME_PATTERN = /^run\w*TestCases$/

/** The runner mode that exports the document and checks the exported XML with the case's queries. */
export const RUNNER_WITH_EXPORT = 'withExport'

/** The runner mode that checks the case without exporting the document. */
export const RUNNER_WITHOUT_EXPORT = 'withoutExport'

/** The properties of a runner call's argument. */
export const RUNNER_TABLE_PROPERTY = 'testCases'
export const RUNNER_ACT_PROPERTY = 'act'

/** The property of an act's first parameter that holds the case. */
export const ACT_CASE_PROPERTY = 'testCase'

/** The case fields whose queries the runner checks on the exported XML (an empty list checks nothing). */
export const EXPORT_QUERY_FIELDS: readonly string[] = ['expectedQueries', 'unexpectedQueries']

/** Test support file names `fileKindOf` reads as implementation: `x-fixtures.ts`, `x.test-fixtures.ts`, `x-cases.ts`. */
export const TEST_SUPPORT_NAME_PATTERN = /(-fixtures|-cases)\.[cm]?tsx?$/

/** The top-level folder of a package's test support. */
export const TEST_FOLDER = 'test'

/** A TypeScript source file name. */
export const TYPESCRIPT_NAME_PATTERN = /\.[cm]?tsx?$/

/** XML in a string: `<` followed by a letter, not after a name (`Record<string>` is a generic). */
export const XML_START_PATTERN = /(?<![\w$])<[A-Za-z]/

/** A literal part that ends where XML starts with a substituted element name: `<` of `` `<${tag} .../>` ``. */
export const XML_SUBSTITUTED_START_PATTERN = /(?<![\w$])<$/
