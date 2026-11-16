import { RUN_LINE } from '../../../test/fixture-rules-cases.constants.ts'
import { positionsOf, preparedOf } from '../../../test/fixture-rules-cases.ts'
import { checkCodeRules } from './check-code-rules.ts'

import { describe, expect, it } from 'vitest'

import type { FindingsCase } from '../../../test/fixture-rules-cases.types.ts'
import type { RuleFinding } from './check-code-rules.types.ts'

const ONE_WIDGET_IMPORT = "import OneWidgetXml from './fixtures/one-widget.xml?raw'"
const KEY = "\t'one widget only': {"

function isCommentFinding(finding: RuleFinding): boolean {
	return finding.rule === 'fixture-case-comment'
}

describe('fixture-case-comment: a case that reads a ?raw fixture says what matters in it', () => {
	const testCases: Record<string, FindingsCase> = {
		'a case reading a ?raw fixture with no comment → one finding, at the case key': {
			body: [
				ONE_WIDGET_IMPORT,
				'const testCases = {',
				KEY,
				'\t\tsourceXml: OneWidgetXml,',
				'\t},',
				'}',
				RUN_LINE,
			],
			found: [{ rule: 'fixture-case-comment', needle: "'one widget only'" }],
		},
		'a comment on the line before the key → none': {
			body: [
				ONE_WIDGET_IMPORT,
				'const testCases = {',
				'\t// widget A only: no child',
				KEY,
				'\t\tsourceXml: OneWidgetXml,',
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'a comment inside the case object → none': {
			body: [
				ONE_WIDGET_IMPORT,
				'const testCases = {',
				KEY,
				'\t\t// widget A only: no child',
				'\t\tsourceXml: OneWidgetXml,',
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'a comment after the document inside the case object → none': {
			body: [
				ONE_WIDGET_IMPORT,
				'const testCases = {',
				KEY,
				'\t\tsourceXml: OneWidgetXml, // widget A only: no child',
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'a trailing comment on the line of the case key → none': {
			body: [
				ONE_WIDGET_IMPORT,
				'const testCases = {',
				"\t'one widget only': { sourceXml: OneWidgetXml }, // only widget A matters",
				'}',
				RUN_LINE,
			],
		},
		'a trailing comment on the key line of the first case, a second case without one → one finding, at the second key':
			{
				body: [
					ONE_WIDGET_IMPORT,
					'const testCases = {',
					"\t'first widget': { sourceXml: OneWidgetXml }, // only widget A matters",
					"\t'second widget': { sourceXml: OneWidgetXml },",
					'}',
					RUN_LINE,
				],
				found: [{ rule: 'fixture-case-comment', needle: "'second widget'" }],
			},
		'a comment above the table, not before the key → one finding': {
			body: [
				ONE_WIDGET_IMPORT,
				'// the cases of one widget',
				'const testCases = {',
				KEY,
				'\t\tsourceXml: OneWidgetXml,',
				'\t},',
				'}',
				RUN_LINE,
			],
			found: [{ rule: 'fixture-case-comment', needle: "'one widget only'" }],
		},
		'two cases reading the fixture, only the first commented → one finding, at the second key': {
			body: [
				ONE_WIDGET_IMPORT,
				'const testCases = {',
				'\t// widget A only: no child',
				"\t'first widget': {",
				'\t\tsourceXml: OneWidgetXml,',
				'\t},',
				"\t'second widget': {",
				'\t\tsourceXml: OneWidgetXml,',
				'\t},',
				'}',
				RUN_LINE,
			],
			found: [{ rule: 'fixture-case-comment', needle: "'second widget'" }],
		},
		'a case reading a ?raw fixture as its targetXml with no comment → one finding, at the case key':
			{
				body: [
					ONE_WIDGET_IMPORT,
					'const testCases = {',
					KEY,
					'\t\tsourceXml: `<Root/>`,',
					'\t\ttargetXml: OneWidgetXml,',
					'\t},',
					'}',
					RUN_LINE,
				],
				found: [{ rule: 'fixture-case-comment', needle: "'one widget only'" }],
			},
		'a const alias of the ?raw import used as sourceXml, no comment → one finding, at the case key':
			{
				body: [
					ONE_WIDGET_IMPORT,
					'const DOCUMENT = OneWidgetXml',
					'const testCases = {',
					KEY,
					'\t\tsourceXml: DOCUMENT,',
					'\t},',
					'}',
					RUN_LINE,
				],
				found: [{ rule: 'fixture-case-comment', needle: "'one widget only'" }],
			},
		'a case holding an inline document with no comment → none': {
			body: [
				'const testCases = {',
				KEY,
				'\t\tsourceXml: `<Root><A/></Root>`,',
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'a case reading a ?raw fixture in a module that is not a Dialecte change → none': {
			testRules: false,
			body: [
				ONE_WIDGET_IMPORT,
				'const testCases = {',
				KEY,
				'\t\tsourceXml: OneWidgetXml,',
				'\t},',
				'}',
				RUN_LINE,
			],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const { expected, params } = preparedOf(testCase)
			expect(positionsOf(checkCodeRules(params).filter(isCommentFinding))).toEqual(expected)
		})
})

describe('fixture-case-comment: message', () => {
	it('a const alias names the fixture path of the import it stands for', () => {
		const { params } = preparedOf({
			body: [
				ONE_WIDGET_IMPORT,
				'const DOCUMENT = OneWidgetXml',
				'const testCases = {',
				KEY,
				'\t\tsourceXml: DOCUMENT,',
				'\t},',
				'}',
				RUN_LINE,
			],
		})

		expect(
			checkCodeRules(params)
				.filter(isCommentFinding)
				.map((finding) => finding.message),
		).toEqual(['case reads fixtures/one-widget.xml: say in one comment what matters in it'])
	})

	it('each finding names the fixture path of its import and asks for one comment, as a warning', () => {
		const { params } = preparedOf({
			body: [
				ONE_WIDGET_IMPORT,
				"import FourWidgetsXml from './fixtures/four-widgets.xml?raw'",
				'const testCases = {',
				"\t'one widget only': {",
				'\t\tsourceXml: OneWidgetXml,',
				'\t},',
				"\t'four widgets': {",
				'\t\tsourceXml: FourWidgetsXml,',
				'\t},',
				'}',
				RUN_LINE,
			],
		})

		expect(
			checkCodeRules(params)
				.filter(isCommentFinding)
				.sort((first, second) => first.line - second.line)
				.map((finding) => ({ message: finding.message, severity: finding.severity })),
		).toEqual([
			{
				message: 'case reads fixtures/one-widget.xml: say in one comment what matters in it',
				severity: 'warning',
			},
			{
				message: 'case reads fixtures/four-widgets.xml: say in one comment what matters in it',
				severity: 'warning',
			},
		])
	})
})
