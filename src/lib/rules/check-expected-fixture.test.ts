import { RUN_LINE, WIDGET_TEST_FILE } from '../../../test/fixture-rules-cases.constants.ts'
import { moduleOf, paramsOf, positionsOf, preparedOf } from '../../../test/fixture-rules-cases.ts'
import { applyAllowComments } from './allow-comments.ts'
import { checkCodeRules } from './check-code-rules.ts'

import { describe, expect, it } from 'vitest'

import type { FindingsCase } from '../../../test/fixture-rules-cases.types.ts'
import type { RuleFinding } from './check-code-rules.types.ts'

const EXPECTED_IMPORT = "import ExpectedXml from './fixtures/expected.xml?raw'"

/** A test whose lines are the given ones, after the imports. */
function testOf(lines: string[]): string[] {
	return ["it('writes the widget', () => {", ...lines.map((line) => `\t${line}`), '})']
}

function isExpectationFinding(finding: RuleFinding): boolean {
	return finding.rule === 'expected-fixture'
}

describe('expected-fixture: a fixture document as the expected side of a comparison', () => {
	const testCases: Record<string, FindingsCase> = {
		'a ?raw import as the argument of toBe → one finding': {
			body: [
				EXPECTED_IMPORT,
				...testOf([
					'const exported = exportWidget()',
					'expect(exported).toBe(ExpectedXml) // flag expected-fixture',
				]),
			],
		},
		'a ?raw import as the argument of toStrictEqual → one finding': {
			body: [
				EXPECTED_IMPORT,
				...testOf(['expect(exportWidget()).toStrictEqual(ExpectedXml) // flag expected-fixture']),
			],
		},
		'a ?raw import as the argument of toMatch → one finding': {
			body: [
				EXPECTED_IMPORT,
				...testOf(['expect(exportWidget()).toMatch(ExpectedXml) // flag expected-fixture']),
			],
		},
		'an XML literal as the argument of toEqual, the actual side not an export → none': {
			body: testOf(['expect(exportWidget()).toEqual(`<Root><A/></Root>`)']),
		},
		'an XML literal as the argument of toMatchInlineSnapshot, the actual side not an export → none':
			{
				body: testOf(['expect(exportWidget()).toMatchInlineSnapshot(`<Root><A/></Root>`)']),
			},
		'an XML literal compared with a string utility result → none': {
			body: testOf(["expect(formatXml(input)).toBe('<a><b/></a>')"]),
		},
		'an XML literal with a declaration compared with the records writer result → none': {
			body: testOf(['expect(writeRecords(records)).toBe(\'<?xml version="1.0"?><Root/>\')']),
		},
		'an XML literal as the argument of toBe, the actual side an exportXml call → one finding': {
			body: testOf(["expect(await exportXml(doc)).toBe('<Root/>') // flag expected-fixture"]),
		},
		'an XML literal compared with a binding assigned from a snapshot asked as xml → one finding, at the comparison':
			{
				body: testOf([
					"const exported = await doc.getSnapshot({ as: 'xml' })",
					"expect(exported).toBe('<Root/>') // flag expected-fixture",
				]),
			},
		'a binding from a call that is not an export compared with an XML literal → none': {
			body: testOf(['const out = formatXml(input)', "expect(out).toBe('<a/>')"]),
		},
		'a binding from a snapshot asked as a tree compared with an XML literal → none': {
			body: testOf([
				"const tree = await doc.getSnapshot({ as: 'tree' })",
				"expect(tree).toBe('<a/>')",
			]),
		},
		'a ?raw import as the expected side of a value that is not an export → one finding': {
			body: [
				EXPECTED_IMPORT,
				...testOf(['expect(countWidgets()).toBe(ExpectedXml) // flag expected-fixture']),
			],
		},
		'a ?raw import on the actual side of toBe, the export result as the argument → one finding, at the fixture':
			{
				body: [
					EXPECTED_IMPORT,
					...testOf(['expect(ExpectedXml).toBe(await exportXml(doc)) // flag expected-fixture']),
				],
			},
		'a file const holding an XML literal compared with an export result → one finding, at the comparison':
			{
				body: [
					"const GOLDEN = '<Root><A/></Root>'",
					...testOf(['expect(await exportXml(doc)).toBe(GOLDEN) // flag expected-fixture']),
				],
			},
		'an XML literal on the actual side, the export result as the argument → one finding, at the comparison':
			{
				body: testOf(["expect('<Root/>').toBe(await exportXml(doc)) // flag expected-fixture"]),
			},
		'a file const holding an XML literal on the actual side, the export result as the argument → one finding, at the comparison':
			{
				body: [
					"const GOLDEN = '<Root><A/></Root>'",
					...testOf(['expect(GOLDEN).toBe(await exportXml(doc)) // flag expected-fixture']),
				],
			},
		'a const alias of the ?raw import as the expected side → one finding': {
			body: [
				EXPECTED_IMPORT,
				'const GOLDEN = ExpectedXml',
				...testOf(['expect(exportWidget()).toBe(GOLDEN) // flag expected-fixture']),
			],
		},
		'a ?raw import as the argument of toContain, a matcher the rule does not judge → none': {
			body: [EXPECTED_IMPORT, ...testOf(['expect(exportWidget()).toContain(ExpectedXml)'])],
		},
		'the import used as sourceXml in a case and as the expected side in a test → one finding, at the expectation':
			{
				body: [
					EXPECTED_IMPORT,
					'const testCases = {',
					"\t'a widget': { sourceXml: ExpectedXml },",
					'}',
					RUN_LINE,
					...testOf(['expect(exportWidget()).toBe(ExpectedXml) // flag expected-fixture']),
				],
			},
		'a ?raw import used only as sourceXml → none': {
			body: [
				EXPECTED_IMPORT,
				'const testCases = {',
				"\t'a widget': { sourceXml: ExpectedXml },",
				'}',
				RUN_LINE,
			],
		},
		'a ?raw import read by a parser, the expectation an object → none': {
			body: [EXPECTED_IMPORT, ...testOf(['expect(parseXml(ExpectedXml)).toEqual({ ok: true })'])],
		},
		'a plain string and a number as the expected side → none': {
			body: testOf([
				"expect(exportWidget()).toBe('done')",
				'expect(countWidgets()).toBe(2)',
				'expect(exportWidget()).toEqual(`a < b`)',
			]),
		},
		'a ?raw import as the expected side in a module that is not a Dialecte change → none': {
			testRules: false,
			body: [EXPECTED_IMPORT, ...testOf(['expect(exportWidget()).toBe(ExpectedXml)'])],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const { expected, params } = preparedOf(testCase)
			expect(positionsOf(checkCodeRules(params).filter(isExpectationFinding))).toEqual(expected)
		})
})

describe('expected-fixture: message and opt-out', () => {
	it('each finding names the base name of its file, asks for XPath expectations, as an error', () => {
		const { params } = preparedOf({
			body: [
				EXPECTED_IMPORT,
				"import TwoWidgetsXml from './fixtures/two-widgets.xml?raw'",
				...testOf([
					'expect(exportWidget()).toBe(ExpectedXml)',
					'expect(exportWidgets()).toBe(TwoWidgetsXml)',
					'expect(await exportXml(doc)).toEqual(`<Root><A/></Root>`)',
				]),
			],
		})

		expect(
			checkCodeRules(params)
				.filter(isExpectationFinding)
				.sort((first, second) => first.line - second.line)
				.map((finding) => ({ message: finding.message, severity: finding.severity })),
		).toEqual([
			{
				message:
					'expected.xml is the expected result: write the expectation as XPath from the requirement (expectedQueries)',
				severity: 'error',
			},
			{
				message:
					'two-widgets.xml is the expected result: write the expectation as XPath from the requirement (expectedQueries)',
				severity: 'error',
			},
			{
				message:
					'this XML literal is the expected result: write the expectation as XPath from the requirement (expectedQueries)',
				severity: 'error',
			},
		])
	})

	it('an opt-out with a reason before the line silences the finding and is counted', () => {
		const text = moduleOf({
			body: [
				EXPECTED_IMPORT,
				...testOf([
					'// dialecte-allow expected-fixture: a byte-for-byte export check',
					'expect(exportWidget()).toBe(ExpectedXml)',
				]),
			],
		})
		const params = paramsOf({ file: WIDGET_TEST_FILE, text, testRules: true })
		const applied = applyAllowComments({
			file: WIDGET_TEST_FILE,
			text,
			findings: checkCodeRules(params),
		})

		expect({
			allowed: applied.allowed,
			findings: positionsOf(
				applied.findings.filter(
					(finding) =>
						isExpectationFinding(finding) ||
						finding.rule === 'invalid-allow' ||
						finding.rule === 'unused-allow',
				),
			),
		}).toEqual({ findings: [], allowed: { 'expected-fixture': 1 } })
	})
})
