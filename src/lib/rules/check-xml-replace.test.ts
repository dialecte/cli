import { RUN_LINE, WIDGET_TEST_FILE } from '../../../test/fixture-rules-cases.constants.ts'
import {
	isStepFinding,
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

describe('xml-replace: replace on a fixture document', () => {
	const testCases: Record<string, FindingsCase> = {
		'replace on a const XML literal reaching sourceXml → flagged': {
			body: [
				'const BASE = `<Root/>`',
				'const testCases = {',
				"\t'a widget variant': {",
				"\t\tsourceXml: BASE.replace('a', 'b'), // flag xml-replace",
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'a chain of replace calls reaching sourceXml → one finding per call': {
			body: [
				'const BASE = `<Root/>`',
				"const variant = BASE.replace('a', 'b') // flag xml-replace",
				'const testCases = {',
				"\t'a widget variant': {",
				"\t\tsourceXml: variant.replaceAll('c', 'd'), // flag xml-replace",
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'replace on a ?raw import reaching sourceXml → flagged': {
			body: [
				'const testCases = {',
				"\t'a widget variant': {",
				"\t\tsourceXml: BaseXml.replace('a', 'b'), // flag xml-replace",
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'replace on an XML literal reaching sourceXml → flagged': {
			body: [
				'const testCases = {',
				"\t'a widget variant': {",
				"\t\tsourceXml: `<Root/>`.replace('a', 'b'), // flag xml-replace",
				'\t},',
				'}',
				RUN_LINE,
			],
		},
		'replace reaching the object given to createTestProject → flagged': {
			body: [
				'const BASE = `<Root/>`',
				"it('builds the project', () => {",
				"\tcreateTestProject({ sourceXml: BASE.replace('a', 'b') }) // flag xml-replace",
				'})',
			],
		},
		'replace in an expected string of a matcher → none': {
			body: [
				'const GOLDEN = `<Root/>`',
				"it('writes the text', () => {",
				"\texpect(out).toBe(GOLDEN.replace('\\r', ''))",
				'})',
			],
		},
		'replace on a plain string binding reaching sourceXml, no XML literal receiver → none': {
			body: [
				"const name = 'a-b'",
				'const testCases = {',
				"\t'a widget variant': { sourceXml: name.replace('-', '_') },",
				'}',
				RUN_LINE,
			],
		},
		'replace on an XML literal whose result never reaches a case document → none': {
			body: [
				'const BASE = `<Root/>`',
				"it('parses the variant', () => {",
				"\tparseXml(BASE.replace('a', 'b'))",
				'})',
			],
		},
		'an XML literal const used as sourceXml without replace → none': {
			body: [
				'const BASE = `<Root/>`',
				'const testCases = {',
				"\t'a widget': { sourceXml: BASE },",
				'}',
				RUN_LINE,
			],
		},
		'a replace on a fixture document in a module that is not a Dialecte change → none': {
			testRules: false,
			body: [
				'const testCases = {',
				"\t'a widget variant': { sourceXml: BaseXml.replace('a', 'b') },",
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

describe('xml-replace: message and opt-out', () => {
	const replaceBody = [
		'const BASE = `<Root/>`',
		'const testCases = {',
		"\t'a widget variant': {",
		"\t\tsourceXml: BASE.replace('a', 'b'),",
		'\t},',
		'}',
		RUN_LINE,
	]

	it('a replace on a fixture document asks for a document of its own, as an error', () => {
		const { params } = preparedOf({ body: replaceBody })
		expect(
			checkCodeRules(params)
				.filter((finding) => finding.rule === 'xml-replace')
				.map((finding) => ({ message: finding.message, severity: finding.severity })),
		).toEqual([
			{
				message: '.replace() on a fixture document: give the variant its own document',
				severity: 'error',
			},
		])
	})

	it('an opt-out with a reason before the line silences the replace and is counted', () => {
		const text = moduleOf({
			body: [
				'const BASE = `<Root/>`',
				'const testCases = {',
				"\t'a widget variant': {",
				'\t\t// dialecte-allow xml-replace: the variant differs by one value only',
				"\t\tsourceXml: BASE.replace('a', 'b'),",
				'\t},',
				'}',
				RUN_LINE,
			],
		})
		const params = paramsOf({ file: WIDGET_TEST_FILE, text, testRules: true })
		expect(
			summarizedAllow(
				applyAllowComments({ file: WIDGET_TEST_FILE, text, findings: checkCodeRules(params) }),
			),
		).toEqual({ findings: [], allowed: { 'xml-replace': 1 } })
	})
})
