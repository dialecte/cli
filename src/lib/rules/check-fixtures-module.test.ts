import {
	isStepFinding,
	moduleOf,
	paramsOf,
	positionsOf,
	preparedOf,
} from '../../../test/fixture-rules-cases.ts'
import { checkCodeRules } from './check-code-rules.ts'

import { describe, expect, it } from 'vitest'

import type { FindingsCase } from '../../../test/fixture-rules-cases.types.ts'
import type { RuleName, RuleSeverity } from './check-code-rules.types.ts'

type SeverityCase = {
	file: string
	testRules: boolean
	body: string[]
	expected: { rule: RuleName; severity: RuleSeverity }[]
}

describe('fixtures-module: a fixtures module that exports XML', () => {
	const testCases: Record<string, FindingsCase> = {
		'a .test-fixtures.ts file exporting an XML string → flagged at the export': {
			file: 'src/widget/widget.test-fixtures.ts',
			bare: true,
			body: ["export const WIDGET_XML = '<Root/>' // flag fixtures-module"],
		},
		'a -fixtures.ts file exporting an XML string → flagged at the export': {
			file: 'src/widget/widget-fixtures.ts',
			bare: true,
			body: ["export const WIDGET_XML = '<Root/>' // flag fixtures-module"],
		},
		'a .fixtures.ts file exporting an XML string → flagged at the export': {
			file: 'src/widget/widget.fixtures.ts',
			bare: true,
			body: ["export const WIDGET_XML = '<Root/>' // flag fixtures-module"],
		},
		'a .test-fixtures.ts file exporting a function that returns XML → flagged at the export': {
			file: 'src/widget/widget.test-fixtures.ts',
			bare: true,
			body: [
				'export function widgetXml(): string { // flag fixtures-module',
				"\treturn '<Root/>'",
				'}',
			],
		},
		'a .fixtures.ts file exporting a function that returns XML → flagged at the export': {
			file: 'src/widget/widget.fixtures.ts',
			bare: true,
			body: [
				'export function widgetXml(): string { // flag fixtures-module',
				"\treturn '<Root/>'",
				'}',
			],
		},
		'a -fixtures.ts file exporting a function that returns XML → flagged at the export': {
			file: 'src/widget/widget-fixtures.ts',
			bare: true,
			body: [
				'export function widgetXml(): string { // flag fixtures-module',
				"\treturn '<Root/>'",
				'}',
			],
		},
		'a .fixtures.ts file exporting a builder with a substitution → fixtures-module only, no fixture-builder':
			{
				file: 'src/widget/widget.fixtures.ts',
				bare: true,
				body: [
					'export function widgetXml(children: string) { // flag fixtures-module',
					'\treturn `<Root>${children}</Root>`',
					'}',
				],
			},
		'a -fixtures.ts file exporting a builder with a substitution → fixtures-module only, no fixture-builder':
			{
				file: 'src/widget/widget-fixtures.ts',
				bare: true,
				body: [
					'export function widgetXml(children: string) { // flag fixtures-module',
					'\treturn `<Root>${children}</Root>`',
					'}',
				],
			},
		'an exported builder that also builds a test project from its substitution → fixtures-module only, no xml-splice':
			{
				file: 'src/widget/widget.fixtures.ts',
				bare: true,
				body: [
					"import { createTestProject } from '@dialecte/core/test'",
					'export function widgetXml(children: string) { // flag fixtures-module',
					'\tcreateTestProject({ sourceXml: `<Root>${children}</Root>` })',
					'\treturn `<Root>${children}</Root>`',
					'}',
				],
			},
		'two XML exports in one fixtures module → one finding each': {
			file: 'src/widget/widget.fixtures.ts',
			bare: true,
			body: [
				"export const FIRST_XML = '<Root/>' // flag fixtures-module",
				"export const SECOND_XML = '<Root><A/></Root>' // flag fixtures-module",
			],
		},
		'two exported builders in one fixtures module → one finding each': {
			file: 'src/widget/widget-fixtures.ts',
			bare: true,
			body: [
				'export function firstXml(children: string) { // flag fixtures-module',
				'\treturn `<Root>${children}</Root>`',
				'}',
				'export function secondXml(children: string) { // flag fixtures-module',
				'\treturn `<Root><A>${children}</A></Root>`',
				'}',
			],
		},
		'a .fixtures.ts file exporting only a number → none': {
			file: 'src/widget/widget.fixtures.ts',
			bare: true,
			body: ['export const WIDGET_COUNT = 3'],
		},
		'a .fixtures.ts file exporting a function that returns a number → none': {
			file: 'src/widget/widget.fixtures.ts',
			bare: true,
			body: ['export function widgetCount(): number {', '\treturn 3', '}'],
		},
		'a .fixtures.ts file holding an XML string that is not exported → none': {
			file: 'src/widget/widget.fixtures.ts',
			bare: true,
			body: ["const WIDGET_XML = '<Root/>'", 'export const WIDGET_COUNT = WIDGET_XML.length'],
		},
		'a test file exporting an XML string → none': {
			bare: true,
			body: ["export const WIDGET_XML = '<Root/>'"],
		},
		'a fixtures module exporting an XML string in a module that is not a Dialecte change → none': {
			testRules: false,
			file: 'src/widget/widget.fixtures.ts',
			bare: true,
			body: ["export const WIDGET_XML = '<Root/>'"],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const { expected, params } = preparedOf(testCase)
			expect(positionsOf(checkCodeRules(params).filter(isStepFinding))).toEqual(expected)
		})
})

describe('fixtures-module and fixture-builder: severity', () => {
	const testCases: Record<string, SeverityCase> = {
		'a builder that is not exported in a -fixtures.ts file, testRules given → error, and no xml-splice inside it':
			{
				file: 'src/widget/widget-fixtures.ts',
				testRules: true,
				body: [
					'function buildRootXml(children: string): string {',
					'\tcreateTestProject({ sourceXml: `<Root>${children}</Root>` })',
					'\treturn `<Root>${children}</Root>`',
					'}',
				],
				expected: [{ rule: 'fixture-builder', severity: 'error' }],
			},
		'a builder that is not exported in a -fixtures.ts file, no testRules → warning': {
			file: 'src/widget/widget-fixtures.ts',
			testRules: false,
			body: [
				'function buildRootXml(children: string): string {',
				'\treturn `<Root>${children}</Root>`',
				'}',
			],
			expected: [{ rule: 'fixture-builder', severity: 'warning' }],
		},
		'a builder in a test file, testRules given → error': {
			file: 'src/widget/add-widget.test.ts',
			testRules: true,
			body: [
				'function buildRootXml(children: string): string {',
				'\treturn `<Root>${children}</Root>`',
				'}',
			],
			expected: [{ rule: 'fixture-builder', severity: 'error' }],
		},
		'a splice outside the builder of the same fixtures file → error xml-splice besides the builder':
			{
				file: 'src/widget/widget-fixtures.ts',
				testRules: true,
				body: [
					'function buildRootXml(children: string): string {',
					'\treturn `<Root>${children}</Root>`',
					'}',
					'createTestProject({ sourceXml: `<Root>${OTHER}</Root>` })',
				],
				expected: [
					{ rule: 'fixture-builder', severity: 'error' },
					{ rule: 'xml-splice', severity: 'error' },
				],
			},
		'an XML export of a fixtures module → error fixtures-module': {
			file: 'src/widget/widget.fixtures.ts',
			testRules: true,
			body: ["export const WIDGET_XML = '<Root/>'"],
			expected: [{ rule: 'fixtures-module', severity: 'error' }],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const text = moduleOf({ body: testCase.body, bare: true })
			const params = paramsOf({ file: testCase.file, text, testRules: testCase.testRules })
			expect(
				checkCodeRules(params)
					.filter(isStepFinding)
					.map(({ rule, severity }) => ({ rule, severity }))
					.sort((left, right) => left.rule.localeCompare(right.rule)),
			).toEqual(testCase.expected)
		})
})
