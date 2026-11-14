import { checkCodeRules } from './check-code-rules.ts'
import { isTestShaped } from './check-test-shape-rules.ts'
import { GENERIC_REFERENCE_PATTERNS } from './committed-text.constants.ts'

import { describe, expect, it } from 'vitest'

import type { RuleName } from './check-code-rules.types.ts'

const FLAG_MARK = ' // flag'

const HEADER_LINES = [
	"import { describe, expect, it } from 'vitest'",
	"import { runTestCases } from '@dialecte/core/test'",
	'',
]

/** What a rule's table adds to a no-finding fixture: one fixture it does flag, on the line marked. */
const CONTROL_LINES: Record<string, string[]> = {
	'table-branch': [
		'',
		'async function controlAct({ testCase }) {',
		'\tif (testCase.control) {' + FLAG_MARK,
		'\t\treturn 1',
		'\t}',
		'\treturn 2',
		'}',
		'runTestCases.withoutExport({ testCases: {}, act: controlAct })',
	],
	'without-export-xml': [
		'',
		'runTestCases.withoutExport({' + FLAG_MARK,
		'\ttestCases: {},',
		'\tact: async ({ source }) => {',
		'\t\tawait exportXml(source)',
		'\t},',
		'})',
	],
	'export-without-queries': [
		'',
		'const controlCases = {',
		"\t'a control widget': { sourceXml: '<Widget/>' }," + FLAG_MARK,
		'}',
		'runTestCases.withExport({ testCases: controlCases, act: async () => {} })',
	],
	'fixture-builder': [
		'',
		'function buildControlXml(name: string) {' + FLAG_MARK,
		'\treturn `<Widget name="${name}"/>`',
		'}',
	],
	'plan-tag': ['', "it('R9-9 a control title', () => {})" + FLAG_MARK],
}

type TestCase = {
	file?: string
	rule: RuleName
	body: string[]
	/** No finding of its own: the rule's control fixture is appended, and is the only finding expected. */
	controlled?: boolean
	/** The expected lines when they are not the marked ones. */
	lines?: number[]
}

type MessageCase = {
	file?: string
	rule: RuleName
	body: string[]
	/** One per marked line, in order. */
	messages: string[]
	severity: 'error' | 'warning'
}

function moduleOf(lines: string[]): string {
	return [...HEADER_LINES, ...lines, ''].join('\n')
}

function markedLinesOf(lines: string[]): number[] {
	return moduleOf(lines)
		.split('\n')
		.flatMap((line, index) => (line.endsWith(FLAG_MARK) ? [index + 1] : []))
}

describe('isTestShaped', () => {
	const testCases: Record<string, { file: string; expected: boolean }> = {
		'a .test.ts file → test-shaped': { file: 'src/lib/a.test.ts', expected: true },
		'a .spec.ts file → test-shaped': { file: 'src/lib/a.spec.ts', expected: true },
		'a .cases.ts file → test-shaped': { file: 'src/lib/a.cases.ts', expected: true },
		'a .fixtures.ts file → test-shaped': { file: 'src/lib/a.fixtures.ts', expected: true },
		'a file under __tests__ → test-shaped': { file: 'src/lib/__tests__/a.ts', expected: true },
		'a -fixtures.ts file → test-shaped': { file: 'src/lib/a-fixtures.ts', expected: true },
		'a .test-fixtures.ts file → test-shaped': {
			file: 'src/lib/a.test-fixtures.ts',
			expected: true,
		},
		'a -cases.ts file → test-shaped': { file: 'src/lib/a-cases.ts', expected: true },
		'a file in the top-level test folder → test-shaped': { file: 'test/helper.ts', expected: true },
		'a file in a sub-folder of the top-level test folder → test-shaped': {
			file: 'test/sub/x.ts',
			expected: true,
		},
		'a plain implementation file → not test-shaped': { file: 'src/lib/a.ts', expected: false },
		'a types file → not test-shaped': { file: 'src/lib/a.types.ts', expected: false },
		'a name starting with fixtures → not test-shaped': {
			file: 'src/lib/fixtures-reader.ts',
			expected: false,
		},
		'a test-utils file under src → not test-shaped': { file: 'src/test-utils.ts', expected: false },
		'a test folder deeper than the first segment → not test-shaped': {
			file: 'src/lib/test/x.ts',
			expected: false,
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(isTestShaped(testCase.file)).toBe(testCase.expected)
		})
})

describe('checkCodeRules test-shape: findings by line', () => {
	const testCases: Record<string, TestCase> = {
		'table-branch: a declared act destructuring testCase, an if on a field → flagged': {
			rule: 'table-branch',
			body: [
				"const testCases = { 'a widget': { naming: true } }",
				'async function act({ testCase }) {',
				'\tif (testCase.naming) {' + FLAG_MARK,
				'\t\treturn 1',
				'\t}',
				'\treturn 2',
				'}',
				'runTestCases.withoutExport({ testCases, act })',
			],
		},
		'table-branch: an act reading params.testCase, an if on a field → flagged': {
			rule: 'table-branch',
			body: [
				"const testCases = { 'a widget': { naming: true } }",
				'function act(params) {',
				'\tif (params.testCase.naming) {' + FLAG_MARK,
				'\t\treturn 1',
				'\t}',
				'\treturn 2',
				'}',
				'runTestCases.withoutExport({ testCases, act })',
			],
		},
		'table-branch: a binding destructured from the case, an if on it → flagged': {
			rule: 'table-branch',
			body: [
				"const testCases = { 'a widget': { nested: true } }",
				'async function act({ testCase }) {',
				'\tconst { nested } = testCase',
				'\tif (nested) {' + FLAG_MARK,
				'\t\treturn 1',
				'\t}',
				'\treturn 2',
				'}',
				'runTestCases.withoutExport({ testCases, act })',
			],
		},
		'table-branch: a switch on a case field → flagged': {
			rule: 'table-branch',
			body: [
				"const testCases = { 'a widget': { kind: 'a' } }",
				'async function act({ testCase }) {',
				'\tswitch (testCase.kind) {' + FLAG_MARK,
				"\t\tcase 'a':",
				'\t\t\treturn 1',
				'\t\tdefault:',
				'\t\t\treturn 2',
				'\t}',
				'}',
				'runTestCases.withoutExport({ testCases, act })',
			],
		},
		'table-branch: a conditional expression on a case field → flagged': {
			rule: 'table-branch',
			body: [
				"const testCases = { 'a widget': { location: true } }",
				'async function act({ testCase }) {',
				"\treturn testCase.location ? 'a' : 'b'" + FLAG_MARK,
				'}',
				'runTestCases.withoutExport({ testCases, act })',
			],
		},
		'table-branch: a case field && a call as a statement → flagged': {
			rule: 'table-branch',
			body: [
				"const testCases = { 'a widget': { flag: true } }",
				'async function act({ testCase }) {',
				'\ttestCase.flag && doIt()' + FLAG_MARK,
				'}',
				'runTestCases.withoutExport({ testCases, act })',
			],
		},
		'table-branch: an inline act arrow with an if on a case field → flagged': {
			rule: 'table-branch',
			body: [
				"const testCases = { 'a widget': { naming: true } }",
				'runTestCases.withoutExport({',
				'\ttestCases,',
				'\tact: async ({ testCase }) => {',
				'\t\tif (testCase.naming) {' + FLAG_MARK,
				'\t\t\treturn 1',
				'\t\t}',
				'\t\treturn 2',
				'\t},',
				'})',
			],
		},
		'table-branch: an it.each callback with an if on a row field → flagged': {
			rule: 'table-branch',
			body: [
				"const ROWS = [{ kind: 'a' }, { kind: 'b' }]",
				"it.each(ROWS)('a row', (row) => {",
				"\tif (row.kind === 'a') {" + FLAG_MARK,
				'\t\texpect(row).toBeDefined()',
				'\t}',
				'})',
			],
		},
		'table-branch: a for-of over rows creating its it, an if on a row field → flagged': {
			rule: 'table-branch',
			body: [
				"const ROWS = [{ kind: 'a', title: 'a row' }]",
				'for (const row of ROWS)',
				'\tit(row.title, () => {',
				"\t\tif (row.kind === 'a')" + FLAG_MARK,
				'\t\t\texpect(row).toBeDefined()',
				'\t})',
			],
		},
		'table-branch: a case field read as a ?? default value inside an expectation → not flagged': {
			rule: 'table-branch',
			controlled: true,
			body: [
				"const testCases = { 'a widget': { expected: undefined } }",
				'async function act({ testCase }) {',
				'\tconst result = await compute()',
				'\texpect(result).toEqual(testCase.expected ?? DEFAULT)',
				'}',
				'runTestCases.withoutExport({ testCases, act })',
			],
		},
		'table-branch: a case field used as a value in an expectation → not flagged': {
			rule: 'table-branch',
			controlled: true,
			body: [
				"const testCases = { 'a widget': { expected: 'a' } }",
				'async function act({ testCase }) {',
				'\tconst result = await compute()',
				'\texpect(result).toBe(testCase.expected)',
				'}',
				'runTestCases.withoutExport({ testCases, act })',
			],
		},
		'table-branch: a focus toggle on a case field around the per-case callback → not flagged': {
			rule: 'table-branch',
			controlled: true,
			body: [
				"const testCases = { 'a widget': { only: true } }",
				'for (const [title, testCase] of Object.entries(testCases))',
				'\t(testCase.only ? it.only : it)(title, () => {',
				'\t\texpect(1).toBe(1)',
				'\t})',
			],
		},
		'table-branch: an if on a local value that is not from the case → not flagged': {
			rule: 'table-branch',
			controlled: true,
			body: [
				"const testCases = { 'a widget': { expected: 'a' } }",
				'async function act({ testCase }) {',
				'\tconst local = await compute()',
				'\tif (local) {',
				'\t\texpect(local).toBe(testCase.expected)',
				'\t}',
				'}',
				'runTestCases.withoutExport({ testCases, act })',
			],
		},
		'without-export-xml: an act calling assertExpectedElementQueries → flagged at the call': {
			rule: 'without-export-xml',
			body: [
				"const testCases = { 'a widget': { sourceXml: '<Widget/>' } }",
				'runTestCases.withoutExport({' + FLAG_MARK,
				'\ttestCases,',
				'\tact: async ({ source }) => {',
				'\t\tawait assertExpectedElementQueries(source)',
				'\t},',
				'})',
			],
		},
		'without-export-xml: an act calling exportDocument → flagged': {
			rule: 'without-export-xml',
			body: [
				"const testCases = { 'a widget': { sourceXml: '<Widget/>' } }",
				'runTestCases.withoutExport({' + FLAG_MARK,
				'\ttestCases,',
				'\tact: async ({ source }) => {',
				'\t\tconst xml = await exportDocument(source)',
				'\t\texpect(xml).toBeDefined()',
				'\t},',
				'})',
			],
		},
		'without-export-xml: an act asking getSnapshot for xml → flagged': {
			rule: 'without-export-xml',
			body: [
				"const testCases = { 'a widget': { sourceXml: '<Widget/>' } }",
				'runTestCases.withoutExport({' + FLAG_MARK,
				'\ttestCases,',
				'\tact: async ({ source }) => {',
				"\t\tconst xml = await source.getSnapshot({ as: 'xml' })",
				'\t\texpect(xml).toBeDefined()',
				'\t},',
				'})',
			],
		},
		'without-export-xml: an act asking getSnapshot for a tree → not flagged': {
			rule: 'without-export-xml',
			controlled: true,
			body: [
				"const testCases = { 'a widget': { sourceXml: '<Widget/>' } }",
				'runTestCases.withoutExport({',
				'\ttestCases,',
				'\tact: async ({ source }) => {',
				"\t\tconst tree = await source.getSnapshot({ as: 'tree' })",
				'\t\texpect(tree).toBeDefined()',
				'\t},',
				'})',
			],
		},
		'without-export-xml: an act using toMatchSnapshot → not flagged': {
			rule: 'without-export-xml',
			controlled: true,
			body: [
				"const testCases = { 'a widget': { sourceXml: '<Widget/>' } }",
				'runTestCases.withoutExport({',
				'\ttestCases,',
				'\tact: async ({ source }) => {',
				'\t\texpect(source).toMatchSnapshot()',
				'\t},',
				'})',
			],
		},
		'without-export-xml: a withExport act calling exportXml → not flagged': {
			rule: 'without-export-xml',
			controlled: true,
			body: [
				"const testCases = { 'a widget': { sourceXml: '<Widget/>', expectedQueries: ['//Widget'] } }",
				'runTestCases.withExport({',
				'\ttestCases,',
				'\tact: async ({ source }) => {',
				'\t\tawait exportXml(source)',
				'\t},',
				'})',
			],
		},
		'without-export-xml: an act passed by identifier that calls no export → not flagged': {
			rule: 'without-export-xml',
			controlled: true,
			body: [
				"const testCases = { 'a widget': { sourceXml: '<Widget/>' } }",
				'async function actOn({ source }) {',
				'\texpect(source).toBeDefined()',
				'}',
				'runTestCases.withoutExport({ testCases, act: actOn })',
			],
		},
		'export-without-queries: a case without queries and one with an empty list → both flagged at their keys':
			{
				rule: 'export-without-queries',
				body: [
					'const testCases = {',
					"\t'a widget without queries': { sourceXml: '<Widget/>' }," + FLAG_MARK,
					"\t'a widget with empty queries': { sourceXml: '<Widget/>', expectedQueries: [] }," +
						FLAG_MARK,
					"\t'a widget with a query': { sourceXml: '<Widget/>', expectedQueries: ['//Widget'] },",
					'}',
					'runTestCases.withExport({ testCases, act: async () => {} })',
				],
			},
		'export-without-queries: a case with unexpectedQueries only → not flagged': {
			rule: 'export-without-queries',
			controlled: true,
			body: [
				'const testCases = {',
				"\t'a widget': { sourceXml: '<Widget/>', unexpectedQueries: ['//Widget'] },",
				'}',
				'runTestCases.withExport({ testCases, act: async () => {} })',
			],
		},
		'export-without-queries: a table built by assignments, two cases lacking queries → both flagged at their keys':
			{
				rule: 'export-without-queries',
				body: [
					'const testCases: Record<string, unknown> = {}',
					"testCases['a widget without queries'] = { sourceXml: '<Widget/>' }" + FLAG_MARK,
					"testCases['a widget with empty queries'] = { sourceXml: '<Widget/>', expectedQueries: [] }" +
						FLAG_MARK,
					"testCases['a widget with a query'] = { sourceXml: '<Widget/>', expectedQueries: ['//Widget'] }",
					'runTestCases.withExport({ testCases, act: async () => {} })',
				],
			},
		'export-without-queries: a case spreading an unknown value → not judged': {
			rule: 'export-without-queries',
			controlled: true,
			body: [
				"import { base } from './base.ts'",
				'const testCases = {',
				"\t'a widget': { ...base },",
				'}',
				'runTestCases.withExport({ testCases, act: async () => {} })',
			],
		},
		'export-without-queries: a table without queries used only with withoutExport → not flagged': {
			rule: 'export-without-queries',
			controlled: true,
			body: [
				'const testCases = {',
				"\t'a widget': { sourceXml: '<Widget/>' },",
				'}',
				'runTestCases.withoutExport({ testCases, act: async () => {} })',
			],
		},
		'fixture-builder: a function returning a template with a substitution in a test-fixtures file → flagged':
			{
				file: 'src/lib/widget.test-fixtures.ts',
				rule: 'fixture-builder',
				body: [
					'export function buildWidgetXml(name: string) {' + FLAG_MARK,
					'\treturn `<Widget name="${name}"/>`',
					'}',
				],
			},
		'fixture-builder: the same function in a test file → flagged': {
			rule: 'fixture-builder',
			body: [
				'function buildWidgetXml(name: string) {' + FLAG_MARK,
				'\treturn `<Widget name="${name}"/>`',
				'}',
			],
		},
		'fixture-builder: a string concatenation holding XML and a substitution → flagged': {
			rule: 'fixture-builder',
			body: [
				'function buildWidgetXml(name: string) {' + FLAG_MARK,
				'\treturn "<Widget name=\'" + name + "\'/>"',
				'}',
			],
		},
		'fixture-builder: a join of strings with a substitution → flagged': {
			rule: 'fixture-builder',
			body: [
				'function buildWidgetXml(name: string) {' + FLAG_MARK,
				"\treturn ['<Widget>', name, '</Widget>'].join('')",
				'}',
			],
		},
		'fixture-builder: a function whose element name is the substitution → flagged': {
			rule: 'fixture-builder',
			body: ['function buildXml(tag: string) {' + FLAG_MARK, '\treturn `<${tag} name="x"/>`', '}'],
		},
		'fixture-builder: an inline XML constant without a substitution → not flagged': {
			rule: 'fixture-builder',
			controlled: true,
			body: ['const WIDGET = `<Widget name="a"/>`'],
		},
		'fixture-builder: a function returning a generic type in a template → not flagged': {
			rule: 'fixture-builder',
			controlled: true,
			body: ['function typeOf(type: string) {', '\treturn `Record<string, ${type}>`', '}'],
		},
		'fixture-builder: a template with a substitution but no XML → not flagged': {
			rule: 'fixture-builder',
			controlled: true,
			body: ['function describeSize(size: number) {', '\treturn `${size} < 3 and 5 <= 6`', '}'],
		},
		'table-branch: a destructured for-of loop variable over a house-style table → flagged': {
			rule: 'table-branch',
			body: [
				"const testCases = { 'a widget': { kind: 'a' } }",
				'for (const [title, testCase] of Object.entries(testCases))',
				'\tit(title, () => {',
				'\t\tif (testCase.kind) {' + FLAG_MARK,
				'\t\t\texpect(testCase).toBeDefined()',
				'\t\t}',
				'\t})',
			],
		},
		'table-branch: a const arrow act passed as shorthand → flagged': {
			rule: 'table-branch',
			body: [
				"const testCases = { 'a widget': { naming: true } }",
				'const act = async ({ testCase }) => {',
				'\tif (testCase.naming) {' + FLAG_MARK,
				'\t\treturn 1',
				'\t}',
				'\treturn 2',
				'}',
				'runTestCases.withoutExport({ testCases, act })',
			],
		},
		'table-branch: a case field || a call as a statement → flagged': {
			rule: 'table-branch',
			body: [
				"const testCases = { 'a widget': { flag: true } }",
				'async function act({ testCase }) {',
				'\ttestCase.flag || doIt()' + FLAG_MARK,
				'}',
				'runTestCases.withoutExport({ testCases, act })',
			],
		},
		'without-export-xml: an act passed by identifier that calls an export → flagged': {
			rule: 'without-export-xml',
			body: [
				'async function actOn({ source }) {',
				'\tawait assertExpectedElementQueries(source)',
				'}',
				'runTestCases.withoutExport({ testCases: {}, act: actOn })' + FLAG_MARK,
			],
		},
		'without-export-xml: a shorthand act that calls an export → flagged': {
			rule: 'without-export-xml',
			body: [
				'async function act({ source }) {',
				'\tawait assertExpectedElementQueries(source)',
				'}',
				'runTestCases.withoutExport({ testCases: {}, act })' + FLAG_MARK,
			],
		},
		'without-export-xml: an act calling toXml → flagged': {
			rule: 'without-export-xml',
			body: [
				'runTestCases.withoutExport({' + FLAG_MARK,
				'\ttestCases: {},',
				'\tact: async ({ source }) => {',
				'\t\texpect(toXml(source)).toBeDefined()',
				'\t},',
				'})',
			],
		},
		'export-without-queries: an inline table in the runner call → flagged on its key': {
			rule: 'export-without-queries',
			body: [
				'runTestCases.withExport({',
				'\ttestCases: {',
				"\t\t'a widget': { sourceXml: '<Widget/>' }," + FLAG_MARK,
				'\t},',
				'\tact: async () => {},',
				'})',
			],
		},
		'export-without-queries: a case with an empty unexpectedQueries alone → flagged': {
			rule: 'export-without-queries',
			body: [
				'const testCases = {',
				"\t'a widget': { sourceXml: '<Widget/>', unexpectedQueries: [] }," + FLAG_MARK,
				'}',
				'runTestCases.withExport({ testCases, act: async () => {} })',
			],
		},
		'fixture-builder: a function returning XML without a substitution → not flagged': {
			rule: 'fixture-builder',
			controlled: true,
			body: ['function widgetXml() {', '\treturn `<Widget name="a"/>`', '}'],
		},
		'plan-tag: a test file whose name carries a round → flagged at line 1': {
			file: 'src/lib/widget-round1.test.ts',
			rule: 'plan-tag',
			lines: [1],
			body: ["describe('widget guards', () => {", "\tit('keeps the widget', () => {})", '})'],
		},
		'plan-tag: a describe title with a capitalised round word and a number → flagged': {
			rule: 'plan-tag',
			body: [
				"describe('widget extraction Round 1 guards', () => {" + FLAG_MARK,
				"\tit('keeps the widget', () => {})",
				'})',
			],
		},
		'plan-tag: an it title starting with a letter-number-dash-number code → flagged': {
			rule: 'plan-tag',
			body: ["it('R1-1 keeps the widget', () => {})" + FLAG_MARK],
		},
		'plan-tag: a test title with a step word and a number → flagged': {
			rule: 'plan-tag',
			body: ["test('step 3 of the ladder resolves', () => {})" + FLAG_MARK],
		},
		'plan-tag: an it.each title with a round word and a number → flagged': {
			rule: 'plan-tag',
			body: ["it.each([1, 2])('a round 2 of retries', () => {})" + FLAG_MARK],
		},
		'plan-tag: a describe.skip title with an underscored round word → flagged': {
			rule: 'plan-tag',
			body: ["describe.skip('round_4 retries', () => {})" + FLAG_MARK],
		},
		'plan-tag: a key of a table object literal → flagged': {
			rule: 'plan-tag',
			body: [
				'const testCases = {',
				"\t'R1-2 drops the gadget': { sourceXml: '<Gadget/>', expectedQueries: ['//Gadget'] }," +
					FLAG_MARK,
				'}',
				'runTestCases.withExport({ testCases, act: async () => {} })',
			],
		},
		'plan-tag: a key of a house-style table iterated into its tests → flagged': {
			rule: 'plan-tag',
			body: [
				'const testCases = {',
				"\t'R1-2 drops the gadget': { kind: 'a' }," + FLAG_MARK,
				'}',
				'for (const [title, testCase] of Object.entries(testCases))',
				'\tit(title, () => {',
				'\t\texpect(testCase).toBeDefined()',
				'\t})',
			],
		},
		'plan-tag: a key of an object that is not a table → not flagged': {
			rule: 'plan-tag',
			controlled: true,
			body: ["const LABELS = { 'R1-2 x': 1 }"],
		},
		'plan-tag: a test.each title carrying a tag → flagged': {
			rule: 'plan-tag',
			body: ["test.each([1, 2])('R1-1 keeps the widget', () => {})" + FLAG_MARK],
		},
		'plan-tag: an it.only title carrying a tag → flagged': {
			rule: 'plan-tag',
			body: ["it.only('R1-1 keeps the widget', () => {})" + FLAG_MARK],
		},
		'plan-tag: a template title with a substitution carrying a tag → flagged': {
			rule: 'plan-tag',
			body: ['it(`R1-1 ${name}`, () => {})' + FLAG_MARK],
		},
		'plan-tag: a template key assigned to a table → flagged': {
			rule: 'plan-tag',
			body: [
				'const testCases: Record<string, unknown> = {}',
				"testCases[`R1-3 moves it`] = { sourceXml: '<Gadget/>', expectedQueries: ['//Gadget'] }" +
					FLAG_MARK,
				'runTestCases.withExport({ testCases, act: async () => {} })',
			],
		},
		'plan-tag: round-trip, steps and rounding titles → not flagged': {
			rule: 'plan-tag',
			controlled: true,
			body: [
				"it('round-trip of the export', () => {})",
				"it('steps of a ladder', () => {})",
				"it('a rounding error', () => {})",
			],
		},
	}

	const flaggedCases = Object.entries(testCases).filter(([, testCase]) => !testCase.controlled)
	const controlledCases = Object.entries(testCases).filter(([, testCase]) => testCase.controlled)

	for (const [title, testCase] of flaggedCases)
		it(title, () => {
			expect(
				checkCodeRules({
					file: testCase.file ?? 'src/lib/widget.test.ts',
					text: moduleOf(testCase.body),
					referencePatterns: GENERIC_REFERENCE_PATTERNS,
				})
					.filter((finding) => finding.rule === testCase.rule)
					.map((finding) => finding.line)
					.sort((left, right) => left - right),
			).toEqual(
				[...(testCase.lines ?? markedLinesOf(testCase.body))].sort((left, right) => left - right),
			)
		})

	for (const [title, testCase] of controlledCases)
		it(title, () => {
			const body = [...testCase.body, ...CONTROL_LINES[testCase.rule]]
			expect(
				checkCodeRules({
					file: testCase.file ?? 'src/lib/widget.test.ts',
					text: moduleOf(body),
					referencePatterns: GENERIC_REFERENCE_PATTERNS,
				})
					.filter((finding) => finding.rule === testCase.rule)
					.map((finding) => finding.line)
					.sort((left, right) => left - right),
			).toEqual(markedLinesOf(body))
		})
})

describe('checkCodeRules test-shape: messages', () => {
	const messageCases: Record<string, MessageCase> = {
		'table-branch → names the field and the fix': {
			rule: 'table-branch',
			severity: 'error',
			messages: [
				'`testCase.naming` steers the act: one table per behaviour, no branch on a case field',
			],
			body: [
				'async function act({ testCase }) {',
				'\tif (testCase.naming) {' + FLAG_MARK,
				'\t\treturn 1',
				'\t}',
				'}',
				'runTestCases.withoutExport({ testCases: {}, act })',
			],
		},
		'without-export-xml → names the fix': {
			rule: 'without-export-xml',
			severity: 'error',
			messages: ['the act reads exported XML: use withExport with expectedQueries'],
			body: [
				'runTestCases.withoutExport({' + FLAG_MARK,
				'\ttestCases: {},',
				'\tact: async ({ source }) => {',
				'\t\tawait assertExpectedElementQueries(source)',
				'\t},',
				'})',
			],
		},
		'fixture-builder → a warning naming the function': {
			rule: 'fixture-builder',
			severity: 'warning',
			messages: ['`buildWidgetXml` builds fixture XML: write each fixture as inline XML'],
			body: [
				'function buildWidgetXml(name: string) {' + FLAG_MARK,
				'\treturn `<Widget name="${name}"/>`',
				'}',
			],
		},
		'plan-tag → names the title': {
			rule: 'plan-tag',
			severity: 'error',
			messages: ['title `R1-1 keeps the widget` carries a plan tag: say what the case checks'],
			body: ["it('R1-1 keeps the widget', () => {})" + FLAG_MARK],
		},
	}

	for (const [title, messageCase] of Object.entries(messageCases))
		it(title, () => {
			expect(
				checkCodeRules({
					file: messageCase.file ?? 'src/lib/widget.test.ts',
					text: moduleOf(messageCase.body),
					referencePatterns: GENERIC_REFERENCE_PATTERNS,
				})
					.filter((finding) => finding.rule === messageCase.rule)
					.map((finding) => ({ severity: finding.severity, message: finding.message })),
			).toEqual(
				messageCase.messages.map((message) => ({ severity: messageCase.severity, message })),
			)
		})

	it('a branch on a method of a string case row → the message names the row, not the method', () => {
		const text = moduleOf([
			"it.each(['a', 'b'])('a row', (row) => {",
			"\tif (row.startsWith('a')) {",
			'\t\texpect(row).toBeDefined()',
			'\t}',
			'})',
		])

		expect(
			checkCodeRules({
				file: 'src/lib/widget.test.ts',
				text,
				referencePatterns: GENERIC_REFERENCE_PATTERNS,
			})
				.filter((finding) => finding.rule === 'table-branch')
				.map((finding) => ({
					namesRow: finding.message.startsWith('`row` '),
					namesMethod: finding.message.includes('row.startsWith'),
				})),
		).toEqual([{ namesRow: true, namesMethod: false }])
	})

	it('export-without-queries → the message names the case key', () => {
		const text = moduleOf([
			'const testCases = {',
			"\t'a widget without queries': { sourceXml: '<Widget/>' },",
			"\t'a widget with empty queries': { sourceXml: '<Widget/>', expectedQueries: [] },",
			'}',
			'runTestCases.withExport({ testCases, act: async () => {} })',
		])
		expect(
			checkCodeRules({
				file: 'src/lib/widget.test.ts',
				text,
				referencePatterns: GENERIC_REFERENCE_PATTERNS,
			})
				.filter((finding) => finding.rule === 'export-without-queries')
				.map((finding) => finding.severity),
		).toEqual(['error', 'error'])
		expect(
			checkCodeRules({
				file: 'src/lib/widget.test.ts',
				text,
				referencePatterns: GENERIC_REFERENCE_PATTERNS,
			})
				.filter((finding) => finding.rule === 'export-without-queries')
				.map((finding) => finding.message),
		).toEqual([
			expect.stringContaining('a widget without queries'),
			expect.stringContaining('a widget with empty queries'),
		])
	})
})

describe('checkCodeRules test-shape: plan tag in an implementation comment', () => {
	it('the same words in a test title are flagged and in a source comment are not', () => {
		const words = 'handles R1-1 like the rule says'
		const testText = moduleOf([`it('${words}', () => {})`])
		const sourceText = ['// ' + words, 'export function run() {}', ''].join('\n')
		expect(
			checkCodeRules({
				file: 'src/lib/widget.test.ts',
				text: testText,
				referencePatterns: GENERIC_REFERENCE_PATTERNS,
			})
				.filter((finding) => finding.rule === 'plan-tag')
				.map((finding) => finding.line),
		).toEqual([4])
		expect(
			checkCodeRules({
				file: 'src/lib/run-widget.ts',
				text: sourceText,
				referencePatterns: GENERIC_REFERENCE_PATTERNS,
			}).filter((finding) => finding.rule === 'plan-tag'),
		).toEqual([])
	})
})

describe('checkCodeRules test-shape: plan tag in an implementation file name', () => {
	it('a test file named with a round is flagged and an implementation file named so is not', () => {
		const text = moduleOf(["it('keeps the widget', () => {})"])
		expect(
			checkCodeRules({
				file: 'src/lib/widget-round1.test.ts',
				text,
				referencePatterns: GENERIC_REFERENCE_PATTERNS,
			})
				.filter((finding) => finding.rule === 'plan-tag')
				.map((finding) => finding.line),
		).toEqual([1])
		expect(
			checkCodeRules({
				file: 'src/lib/widget-round1.ts',
				text: 'export function run() {}\n',
				referencePatterns: GENERIC_REFERENCE_PATTERNS,
			}).filter((finding) => finding.rule === 'plan-tag'),
		).toEqual([])
	})
})

describe('checkCodeRules test-shape: code rules skip test-shaped files', () => {
	const mutationText = [
		'export function record(calls: string[]) {',
		"\tcalls.push('a')",
		'}',
		'',
	].join('\n')
	const longText = [
		'export function longRun() {',
		...Array.from({ length: 70 }, (_unused, index) => `\tstep${index}()`),
		'}',
		'',
	].join('\n')

	const testShapedFiles: Record<string, string> = {
		'a -fixtures.ts file': 'src/lib/widget-fixtures.ts',
		'a .test-fixtures.ts file': 'src/lib/widget.test-fixtures.ts',
		'a file in the top-level test folder': 'test/spy.ts',
	}

	for (const [title, file] of Object.entries(testShapedFiles))
		it(`${title} → no argument-mutation, the same text in an implementation file is flagged`, () => {
			expect(
				checkCodeRules({
					file: 'src/lib/record.ts',
					text: mutationText,
					referencePatterns: GENERIC_REFERENCE_PATTERNS,
				}).filter((finding) => finding.rule === 'argument-mutation'),
			).toHaveLength(1)
			expect(
				checkCodeRules({
					file,
					text: mutationText,
					referencePatterns: GENERIC_REFERENCE_PATTERNS,
				}).filter((finding) => finding.rule === 'argument-mutation'),
			).toEqual([])
		})

	it('a long function in a -fixtures.ts file → no long-function, in an implementation file it is flagged', () => {
		expect(
			checkCodeRules({
				file: 'src/lib/long-run.ts',
				text: longText,
				referencePatterns: GENERIC_REFERENCE_PATTERNS,
			}).filter((finding) => finding.rule === 'long-function'),
		).toHaveLength(1)
		expect(
			checkCodeRules({
				file: 'src/lib/widget-fixtures.ts',
				text: longText,
				referencePatterns: GENERIC_REFERENCE_PATTERNS,
			}).filter((finding) => finding.rule === 'long-function'),
		).toEqual([])
	})
})
