import { RUN_LINE, WIDGET_TEST_FILE } from '../../../test/fixture-rules-cases.constants.ts'
import {
	isStepFinding,
	lineOfText,
	moduleOf,
	paramsOf,
	positionsOf,
	preparedOf,
	summarizedAllow,
} from '../../../test/fixture-rules-cases.ts'
import { applyAllowComments } from './allow-comments.ts'
import { checkCodeRules } from './check-code-rules.ts'

import { describe, expect, it } from 'vitest'

import type { FindingsCase } from '../../../test/fixture-rules-cases.types.ts'

const SPLICE_HELP =
	'splices XML into a case document: write the whole document (inline, or fixtures/<what-it-holds>.xml with ?raw)'

describe('xml-splice: case documents that splice XML', () => {
	const testCases: Record<string, FindingsCase> = {
		'a content substitution in a case sourceXml → flagged': {
			body: [
				'const testCases = {',
				"\t'a widget with children': {",
				'\t\tsourceXml: `<Root>${CHILDREN}</Root>`, // flag xml-splice',
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'a multi-line template bound to a const used as sourceXml → flagged on the substitution line in the const':
			{
				found: [{ rule: 'xml-splice', needle: '${CHILDREN}' }],
				body: [
					'const SOURCE = `',
					'\t<Root>',
					'\t\t${CHILDREN}',
					'\t</Root>',
					'`',
					'const testCases = {',
					"\t'a widget with children': { sourceXml: SOURCE },",
					'}',
					RUN_LINE,
				],
			},
		'a substitution at the start of a targetXml → flagged': {
			body: [
				'const testCases = {',
				"\t'a widget with a header': {",
				"\t\tsourceXml: '<Root/>',",
				'\t\ttargetXml: `${HEADER}<Root/>`, // flag xml-splice',
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'a substitution at the end of a case document → flagged': {
			body: [
				'const testCases = {',
				"\t'a widget with a trailer': {",
				'\t\tsourceXml: `<Root/>${TRAILER}`, // flag xml-splice',
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'a content substitution in an object given to createTestProject, call, property and substitution on their own lines → flagged on the substitution':
			{
				found: [{ rule: 'xml-splice', needle: '${A}' }],
				body: [
					"it('builds the project', () => {",
					'\tcreateTestProject(',
					'\t\t{',
					'\t\t\tsourceXml: `',
					'\t\t\t\t<Root>',
					'\t\t\t\t\t${A}',
					'\t\t\t\t</Root>`,',
					'\t\t},',
					'\t)',
					'})',
				],
			},
		'a content substitution in the object given to a wrapper project factory → flagged': {
			body: [
				"it('builds the widget project', () => {",
				'\tcreateWidgetTestProject({ sourceXml: `<Root>${A}</Root>` }) // flag xml-splice',
				'})',
			],
		},
		'a targetXml given to createTestProject is a case document → flagged': {
			body: [
				"it('builds the project', () => {",
				'\tcreateTestProject({ targetXml: `<Root>${A}</Root>` }) // flag xml-splice',
				'})',
			],
		},
		'a substitution inside an XML comment in content position → flagged': {
			body: [
				'const testCases = {',
				"\t'a widget with a note': {",
				'\t\tsourceXml: `<Root><!-- ${note} --></Root>`, // flag xml-splice',
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'a substitution inside a CDATA section → flagged': {
			body: [
				'const testCases = {',
				"\t'a widget with a text section': {",
				'\t\tsourceXml: `<Root><![CDATA[${text}]]></Root>`, // flag xml-splice',
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'a conditional that yields XML with its own substitution → flagged once, on the outer substitution':
			{
				body: [
					'const testCases = {',
					"\t'a widget with an optional child': {",
					"\t\tsourceXml: `<Root>${condition ? `<A>${x}</A>` : ''}</Root>`, // flag xml-splice",
					'\t},',
					'}',
					RUN_LINE,
				],
			},
		'two content substitutions in one multi-line document → one finding each': {
			found: [
				{ rule: 'xml-splice', needle: '${FIRST}' },
				{ rule: 'xml-splice', needle: '${SECOND}' },
			],
			body: [
				'const testCases = {',
				"\t'a widget with two children': {",
				'\t\tsourceXml: `',
				'\t\t\t<Root>',
				'\t\t\t\t<A>${FIRST}</A>',
				'\t\t\t\t<B>${SECOND}</B>',
				'\t\t\t</Root>',
				'\t\t`,',
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'substitutions inside the tag, with a quoted > before one → none': {
			body: [
				'const testCases = {',
				"\t'a widget with computed attributes': {",
				'\t\tsourceXml: `<Root ${ALL_NS} a="${UUID}" b="x>y" ${ID}="v"/>`,',
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'a tag with a substituted prefix and a quoted > → none': {
			body: [
				'const testCases = {',
				"\t'a widget with a prefixed root': {",
				'\t\tsourceXml: `<${ns}:Root ${ALL_NS} a="${UUID}" b="x>y" ${ID}="v"/>`,',
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'attribute substitutions in a nested tag → none': {
			body: [
				'const testCases = {',
				"\t'a widget with a nested child': {",
				'\t\tsourceXml: `<Root a="${UUID}"><A name="${NAME}"/></Root>`,',
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'an XML literal fed to a parser, not a case document → none': {
			body: ["it('parses the text', () => {", '\tparseXml(`<Root>${A}</Root>`)', '})'],
		},
		'an XML literal used as the expected string → none': {
			body: ["it('writes the text', () => {", '\texpect(out).toBe(`<Root>${A}</Root>`)', '})'],
		},
		'a const with a content substitution only fed to a parser → none': {
			body: [
				'const NOTE = `<Root>${A}</Root>`',
				"it('parses the text', () => {",
				'\tparseXml(NOTE)',
				'})',
			],
		},
		'a const followed through one level only: a second const bound to it → none': {
			body: [
				'const A = `<Root>${CHILDREN}</Root>`',
				'const B = A',
				'const testCases = {',
				"\t'a widget with children': { sourceXml: B },",
				'}',
				RUN_LINE,
			],
		},
		'a content substitution in a property that is no case document → none': {
			body: [
				'const testCases = {',
				"\t'a widget with a note': {",
				"\t\tsourceXml: '<Root/>',",
				'\t\tnote: `<Root>${A}</Root>`,',
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'a text with < then a space and a substitution → none (not an XML literal)': {
			body: [
				'const testCases = {',
				"\t'a widget with a comparison': {",
				'\t\tsourceXml: `a < b ${value}`,',
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'a case document without any substitution → none': {
			body: [
				'const testCases = {',
				"\t'a widget with children': { sourceXml: '<Root><A/></Root>' },",
				'}',
				RUN_LINE,
			],
		},
		'a content substitution in a module that is not a Dialecte change → none': {
			testRules: false,
			body: [
				'const testCases = {',
				"\t'a widget with children': { sourceXml: `<Root>${CHILDREN}</Root>` },",
				'}',
				RUN_LINE,
			],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const { expected, params } = preparedOf(testCase)
			expect(positionsOf(checkCodeRules(params).filter(isStepFinding))).toEqual(expected)
		})
})

describe('xml-splice: messages', () => {
	it('a content substitution names its text and says to write the whole document', () => {
		const { params } = preparedOf({
			body: [
				'const testCases = {',
				"\t'a widget with children': { sourceXml: `<Root>${CHILDREN}</Root>` },",
				'}',
				RUN_LINE,
			],
		})
		expect(
			checkCodeRules(params)
				.filter((finding) => finding.rule === 'xml-splice')
				.map((finding) => ({ message: finding.message, severity: finding.severity })),
		).toEqual([{ message: `\`\${CHILDREN}\` ${SPLICE_HELP}`, severity: 'error' }])
	})

	it('two substitutions each name their own text', () => {
		const { params } = preparedOf({
			body: [
				'const testCases = {',
				"\t'a widget with two children': {",
				'\t\tsourceXml: `',
				'\t\t\t<Root>',
				'\t\t\t\t<A>${FIRST}</A>',
				'\t\t\t\t<B>${buildSecond(1)}</B>',
				'\t\t\t</Root>',
				'\t\t`,',
				'\t},',
				'}',
				RUN_LINE,
			],
		})
		expect(
			checkCodeRules(params)
				.filter((finding) => finding.rule === 'xml-splice')
				.sort((left, right) => left.line - right.line)
				.map((finding) => finding.message),
		).toEqual([`\`\${FIRST}\` ${SPLICE_HELP}`, `\`\${buildSecond(1)}\` ${SPLICE_HELP}`])
	})
})

describe('xml-splice: opt-out comments', () => {
	function preparedAllow(body: string[]) {
		const text = moduleOf({ body })
		return { text, params: paramsOf({ file: WIDGET_TEST_FILE, text, testRules: true }) }
	}

	it('an opt-out with a reason before the line silences the splice and is counted', () => {
		const { text, params } = preparedAllow([
			'const testCases = {',
			"\t'a widget with a text value': {",
			'\t\t// dialecte-allow xml-splice: a text value spliced on purpose',
			'\t\tsourceXml: `<Root><V>${value}</V></Root>`,',
			'\t},',
			'}',
			RUN_LINE,
		])
		expect(
			summarizedAllow(
				applyAllowComments({ file: WIDGET_TEST_FILE, text, findings: checkCodeRules(params) }),
			),
		).toEqual({ findings: [], allowed: { 'xml-splice': 1 } })
	})

	it('an opt-out with a reason under 15 characters is invalid and silences nothing', () => {
		const { text, params } = preparedAllow([
			'const testCases = {',
			"\t'a widget with a text value': {",
			'\t\t// dialecte-allow xml-splice: a value',
			'\t\tsourceXml: `<Root><V>${value}</V></Root>`,',
			'\t},',
			'}',
			RUN_LINE,
		])
		expect(
			summarizedAllow(
				applyAllowComments({ file: WIDGET_TEST_FILE, text, findings: checkCodeRules(params) }),
			),
		).toEqual({
			allowed: {},
			findings: [
				{ rule: 'invalid-allow', line: lineOfText({ text, needle: 'dialecte-allow' }) },
				{ rule: 'xml-splice', line: lineOfText({ text, needle: 'sourceXml' }) },
			],
		})
	})

	it('an opt-out several lines above the splice leaves it flagged', () => {
		const { text, params } = preparedAllow([
			'const testCases = {',
			"\t'a widget with a text value': {",
			'\t\t// dialecte-allow xml-splice: a text value spliced on purpose',
			"\t\tsourceXml: '<Root/>',",
			"\t\ttargetXml: '<Root/>',",
			'\t\tother: {',
			'\t\t\tsourceXml: `<Root><V>${value}</V></Root>`,',
			'\t\t},',
			'\t},',
			'}',
			RUN_LINE,
		])
		expect(
			summarizedAllow(
				applyAllowComments({ file: WIDGET_TEST_FILE, text, findings: checkCodeRules(params) }),
			),
		).toEqual({
			allowed: {},
			findings: [
				{ rule: 'unused-allow', line: lineOfText({ text, needle: 'dialecte-allow' }) },
				{ rule: 'xml-splice', line: lineOfText({ text, needle: '${value}' }) },
			],
		})
	})
})
