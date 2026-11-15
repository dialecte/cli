/** The matchers whose comparison `expected-fixture` judges, either side of it. */
export const EXPECTED_FIXTURE_MATCHERS: readonly string[] = [
	'toBe',
	'toEqual',
	'toStrictEqual',
	'toMatch',
	'toMatchInlineSnapshot',
]

/** The `expected-fixture` message: `{fixture}` the fixture file's base name, or `this XML literal`. */
export const EXPECTED_FIXTURE_MESSAGE =
	'{fixture} is the expected result: write the expectation as XPath from the requirement (expectedQueries)'

/** What `expected-fixture` names an XML literal written in the test file. */
export const XML_LITERAL_NAME = 'this XML literal'

/** The `fixture-case-comment` message: `{path}` the path the `?raw` import names. */
export const FIXTURE_CASE_COMMENT_MESSAGE =
	'case reads {path}: say in one comment what matters in it'
