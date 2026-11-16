import { RUN_LINE, WIDGET_TEST_FILE } from '../../../test/fixture-rules-cases.constants.ts'
import { moduleOf, paramsOf, positionsOf, preparedOf } from '../../../test/fixture-rules-cases.ts'
import { applyAllowComments } from './allow-comments.ts'
import { checkCodeRules } from './check-code-rules.ts'

import { describe, expect, it } from 'vitest'

import type { FindingsCase } from '../../../test/fixture-rules-cases.types.ts'
import type { CheckCodeRulesParams, RuleFinding } from './check-code-rules.types.ts'

const ROW = '\t<Item/>'

/** The lines of a document of `lineCount` lines: a root element and rows between its two tags. */
function documentOf(params: { lineCount: number }): string[] {
	return ['<Root>', ...Array<string>(params.lineCount - 2).fill(ROW), '</Root>']
}

/** A document whose lines are `before` rows, blank lines, `after` rows, between its two tags (the blanks sit inside). */
function documentWithBlanksOf(params: { before: number; blanks: number; after: number }): string[] {
	return [
		'<Root>',
		...Array<string>(params.before).fill(ROW),
		...Array<string>(params.blanks).fill(''),
		...Array<string>(params.after).fill(ROW),
		'</Root>',
	]
}

/** A table whose one case holds the property `name` with the document between backtick lines of their own. */
function tableOf(params: { name: string; document: string[] }): string[] {
	return [
		'const testCases = {',
		"\t'a widget': {",
		`\t\t${params.name}: \``,
		...params.document,
		'`,',
		'\t},',
		'}',
		RUN_LINE,
	]
}

/** A file const holding the document, used as the `sourceXml` of a case. */
function constantOf(params: { document: string[] }): string[] {
	return [
		'const BIG_DOCUMENT = `',
		...params.document,
		'`',
		'const testCases = {',
		"\t'a widget': { sourceXml: BIG_DOCUMENT },",
		'}',
		RUN_LINE,
	]
}

/** The message and severity of each length finding of the module. */
function lengthMessagesOf(params: CheckCodeRulesParams): { message: string; severity: string }[] {
	return checkCodeRules(params)
		.filter(isLengthFinding)
		.map((finding) => ({ message: finding.message, severity: finding.severity }))
}

function isLengthFinding(finding: RuleFinding): boolean {
	return finding.rule === 'inline-document-long'
}

describe('inline-document-long: a case document written in the test file', () => {
	const testCases: Record<string, FindingsCase> = {
		'a case document of 41 lines from its first to its last non-blank line → one finding, at the document':
			{
				body: tableOf({ name: 'sourceXml', document: documentOf({ lineCount: 41 }) }),
				found: [{ rule: 'inline-document-long', needle: 'sourceXml: `' }],
			},
		'a case document of 40 lines between its two backtick lines → none': {
			body: tableOf({ name: 'sourceXml', document: documentOf({ lineCount: 40 }) }),
		},
		'a case document of 40 lines with blank lines before and after it inside the backticks → none':
			{
				body: tableOf({
					name: 'sourceXml',
					document: ['', '', ...documentOf({ lineCount: 40 }), '', ''],
				}),
			},
		'a case document of 38 rows and 3 blank lines inside, 41 lines in all → one finding': {
			body: tableOf({
				name: 'sourceXml',
				document: documentWithBlanksOf({ before: 20, blanks: 3, after: 16 }),
			}),
			found: [{ rule: 'inline-document-long', needle: 'sourceXml: `' }],
		},
		'a case document of 38 lines with 2 blank lines inside, 40 lines in all → none': {
			body: tableOf({
				name: 'sourceXml',
				document: documentWithBlanksOf({ before: 20, blanks: 2, after: 16 }),
			}),
		},
		'a targetXml document of 41 lines → one finding, at the document': {
			body: tableOf({ name: 'targetXml', document: documentOf({ lineCount: 41 }) }),
			found: [{ rule: 'inline-document-long', needle: 'targetXml: `' }],
		},
		'a sourceXml and a targetXml document of 41 lines in one case → one finding each': {
			body: [
				'const testCases = {',
				"\t'a widget': {",
				'\t\tsourceXml: `',
				...documentOf({ lineCount: 41 }),
				'`,',
				'\t\ttargetXml: `',
				...documentOf({ lineCount: 41 }),
				'`,',
				'\t},',
				'}',
				RUN_LINE,
			],
			found: [
				{ rule: 'inline-document-long', needle: 'sourceXml: `' },
				{ rule: 'inline-document-long', needle: 'targetXml: `' },
			],
		},
		'a document of 41 lines given to createTestProject → one finding, at the document': {
			body: [
				"it('builds the project', () => {",
				'\tcreateTestProject({',
				'\t\tsourceXml: `',
				...documentOf({ lineCount: 41 }),
				'`,',
				'\t})',
				'})',
			],
			found: [{ rule: 'inline-document-long', needle: 'sourceXml: `' }],
		},
		'a document of 41 lines given to a package wrapper project → one finding, at the document': {
			body: [
				"it('builds the project', () => {",
				'\tcreateWidgetTestProject({',
				'\t\tsourceXml: `',
				...documentOf({ lineCount: 41 }),
				'`,',
				'\t})',
				'})',
			],
			found: [{ rule: 'inline-document-long', needle: 'sourceXml: `' }],
		},
		'a file const of 41 lines used by two cases → one finding, at the const': {
			body: [
				'const BIG_DOCUMENT = `',
				...documentOf({ lineCount: 41 }),
				'`',
				'const testCases = {',
				"\t'first widget': { sourceXml: BIG_DOCUMENT },",
				"\t'second widget': { sourceXml: BIG_DOCUMENT },",
				'}',
				RUN_LINE,
			],
			found: [{ rule: 'inline-document-long', needle: 'const BIG_DOCUMENT = `' }],
		},
		'a const alias of a ?raw import used as sourceXml → none': {
			body: [
				"import OneWidgetXml from './fixtures/one-widget.xml?raw'",
				'const DOCUMENT = OneWidgetXml',
				'const testCases = {',
				"\t'a widget': { sourceXml: DOCUMENT },",
				'}',
				RUN_LINE,
			],
		},
		'a file const of 45 lines used as sourceXml → one finding, at the const': {
			body: constantOf({ document: documentOf({ lineCount: 45 }) }),
			found: [{ rule: 'inline-document-long', needle: 'const BIG_DOCUMENT = `' }],
		},
		'a file const of 45 lines no case uses as a document → none': {
			body: [
				'const BIG_DOCUMENT = `',
				...documentOf({ lineCount: 45 }),
				'`',
				"it('parses the document', () => {",
				'\tparseXml(BIG_DOCUMENT)',
				'})',
			],
		},
		'an expected string of 60 lines, not a case document → none': {
			body: [
				"it('writes the document', () => {",
				'\texpect(exportWidget()).toBe(`',
				...documentOf({ lineCount: 60 }),
				'`)',
				'})',
			],
		},
		'a document of 41 lines in a module that is not a Dialecte change → none': {
			testRules: false,
			body: tableOf({ name: 'sourceXml', document: documentOf({ lineCount: 41 }) }),
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const { expected, params } = preparedOf(testCase)
			expect(positionsOf(checkCodeRules(params).filter(isLengthFinding))).toEqual(expected)
		})
})

describe('inline-document-long: message and opt-out', () => {
	it('an inline document and a const document name their line count, the move and the static import, as errors', () => {
		const inline = preparedOf({
			body: tableOf({ name: 'sourceXml', document: documentOf({ lineCount: 41 }) }),
		})
		const constant = preparedOf({ body: constantOf({ document: documentOf({ lineCount: 45 }) }) })
		expect({
			inline: lengthMessagesOf(inline.params),
			constant: lengthMessagesOf(constant.params),
		}).toEqual({
			inline: [
				{
					message:
						'case document of 41 lines (over 40): move it to fixtures/<what-it-holds>.xml with a static ?raw import',
					severity: 'error',
				},
			],
			constant: [
				{
					message:
						'case document of 45 lines (over 40): move it to fixtures/<what-it-holds>.xml with a static ?raw import',
					severity: 'error',
				},
			],
		})
	})

	it('an opt-out with a reason on the line before the document silences it and is counted', () => {
		const text = moduleOf({
			body: [
				'const testCases = {',
				"\t'a widget': {",
				'\t\t// dialecte-allow inline-document-long: one document of every variant',
				'\t\tsourceXml: `',
				...documentOf({ lineCount: 41 }),
				'`,',
				'\t},',
				'}',
				RUN_LINE,
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
						isLengthFinding(finding) ||
						finding.rule === 'invalid-allow' ||
						finding.rule === 'unused-allow',
				),
			),
		}).toEqual({ findings: [], allowed: { 'inline-document-long': 1 } })
	})
})
