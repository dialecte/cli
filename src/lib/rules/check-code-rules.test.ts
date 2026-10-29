import { checkCodeRules } from './check-code-rules.ts'
import { GENERIC_REFERENCE_PATTERNS } from './committed-text.constants.ts'

import { describe, expect, it } from 'vitest'

import type { RuleName } from './check-code-rules.types.ts'

type TestCase = {
	file: string
	text: string
	expected: { rule: RuleName; line: number }[]
	only?: boolean
}

function findingsOf(testCase: TestCase): { rule: RuleName; line: number }[] {
	return checkCodeRules({
		file: testCase.file,
		text: testCase.text,
		referencePatterns: GENERIC_REFERENCE_PATTERNS,
	}).map((finding) => ({ rule: finding.rule, line: finding.line }))
}

describe('checkCodeRules', () => {
	const testCases: Record<string, TestCase> = {
		'an exported type declared in an implementation file → reported': {
			file: 'src/lib/read-name.ts',
			text: 'export type Name = { value: string }\n',
			expected: [{ rule: 'type-outside-types-file', line: 1 }],
		},
		'an arrow-function const → reported': {
			file: 'src/lib/read-name.ts',
			text: 'export function readName() {\n\tconst trim = (value: string) => value.trim()\n\treturn trim\n}\n',
			expected: [{ rule: 'function-as-const', line: 2 }],
		},
		'a .types.ts file with types → nothing': {
			file: 'src/lib/read-name.types.ts',
			text: 'export type Name = { value: string }\nexport interface Named { name: Name }\n',
			expected: [],
		},
		'a module constant in an implementation file → reported, a local constant is not': {
			file: 'src/lib/read-name.ts',
			text: 'const MAX_DEPTH = 3\nexport function readName() {\n\tconst LIMIT = 2\n\treturn LIMIT + MAX_DEPTH\n}\n',
			expected: [{ rule: 'constant-outside-constants-file', line: 1 }],
		},
		'an await inside an argument → reported, an await assigned first or inside a callback is not': {
			file: 'src/lib/read-name.ts',
			text: [
				'export async function readName(query: Query) {',
				'\tconst root = await query.getRoot()',
				'\tshow({ name: await query.getName(root) })',
				'\tawait Promise.all([root].map(async function read(record) { return await query.getName(record) }))',
				'}',
				'',
			].join('\n'),
			expected: [{ rule: 'await-in-argument', line: 3 }],
		},
		'two positional parameters → warned; a leading query, an inline callback and a symmetric pair are not':
			{
				file: 'src/lib/read-name.ts',
				text: [
					'export function repeatName(name: string, count: number) {',
					'\treturn [name].sort((left, right) => left.localeCompare(right))',
					'}',
					'export function readName(query: Query, params: { ref: Ref }) {',
					'\treturn query.getName(params.ref)',
					'}',
					'function compareNames(left: Name, right: Name): number {',
					'\treturn left.value.localeCompare(right.value)',
					'}',
					'',
				].join('\n'),
				expected: [{ rule: 'positional-parameters', line: 1 }],
			},
		'an abbreviated or one-letter name → warned; a full word and a name only containing the letters are not':
			{
				file: 'src/lib/read-name.ts',
				text: [
					'export function readNames(params: { records: Item[] }) {',
					'\tconst attrValue = params.records[0]',
					'\tconst elements = params.records.map((r) => r.name)',
					'\tconst relation = attrValue',
					'\treturn { elements, relation }',
					'}',
					'',
				].join('\n'),
				expected: [
					{ rule: 'abbreviation', line: 2 },
					{ rule: 'abbreviation', line: 3 },
				],
			},
		'a plan tag in a comment and a ticket number in a test title → reported': {
			file: 'src/lib/read-name.test.ts',
			text: [
				`// the cache added in ${'lot'} T5`,
				`it('keeps the name ${'#'}1234', check)`,
				'',
			].join('\n'),
			expected: [
				{ rule: 'committed-text-reference', line: 1 },
				{ rule: 'committed-text-reference', line: 2 },
			],
		},
		'a markdown page → only its references are checked, its code samples are prose': {
			file: 'doc/guide/names.md',
			text: ['    const read = (x) => x', '', `As ${'Table'} 4 says.`, ''].join('\n'),
			expected: [{ rule: 'committed-text-reference', line: 3 }],
		},
		'a stylesheet colour → not a ticket number': {
			file: 'doc/theme/custom.css',
			text: `.title { color: ${'#'}123456; }\n`,
			expected: [],
		},
		'a types.ts file → nothing': {
			file: 'src/v1/extensions/info/types.ts',
			text: 'export type Title = string\n',
			expected: [],
		},
		'a file in a types/ folder → nothing': {
			file: 'src/v1/extensions/info/types/title.ts',
			text: 'export type Title = string\n',
			expected: [],
		},
		'a file in a constants/ folder → nothing': {
			file: 'src/v1/extensions/info/constants/title.ts',
			text: "export const TITLE_FIELDS = ['name'] as const\n",
			expected: [],
		},
		'constant.ts → nothing': {
			file: 'src/v1/hooks/constant.ts',
			text: "export const ROOTS = ['a'] as const\n",
			expected: [],
		},
		'a registry of imported modules (shorthand properties only) → nothing; a literal table → reported':
			{
				file: 'src/v1/extensions/index.ts',
				text: [
					"import { cleanUp } from './clean-up'",
					'export const DEMO_EXTENSION_MODULES = { cleanUp, info: infoModule }',
					"export const LIMITS = { depth: 3, name: 'x' }",
					'',
				].join('\n'),
				expected: [{ rule: 'constant-outside-constants-file', line: 3 }],
			},
		'a types.<topic>.ts file → nothing': {
			file: 'src/document/types.extensions.ts',
			text: 'export type ExtensionGroup = Record<string, never>\n',
			expected: [],
		},
		'a fixture under __tests__/ → test support: no type or constant placement finding': {
			file: 'src/v1/extensions/dataflow/query/__tests__/dataflow-fixture.ts',
			text: "export const SENDER = 'sender'\nexport type Fixture = { name: string }\n",
			expected: [],
		},
		'a *.config.ts file: module constants stay, an exported type is still reported': {
			file: 'src/v1/config/dialecte.config.ts',
			text: "export const DEMO_CONFIG = { rootElementName: 'Root' }\nexport interface Config { name: string }\n",
			expected: [{ rule: 'type-outside-types-file', line: 2 }],
		},
		'an eval fixture under skills/*/evals → only its references are checked': {
			file: 'skills/demo/evals/case/files/src/render.ts',
			text: `export const LINK = () => 1\n// added in ${'lot'} T5\n`,
			expected: [{ rule: 'committed-text-reference', line: 2 }],
		},
		'a let reassigned later → not a function declared as a const': {
			file: 'src/lib/subscribe.ts',
			text: [
				'export function subscribe() {',
				'\tlet stop: () => void = () => {}',
				'\tstop = function stopListening() {}',
				'\treturn stop',
				'}',
				'',
			].join('\n'),
			expected: [],
		},
		'a *.cases.ts file → test support: no placement finding': {
			file: 'src/store/contract/store-contract.cases.ts',
			text: "export const CASES = ['a']\nexport type Case = string\n",
			expected: [],
		},
		'a *.fixtures.ts file → test support': {
			file: 'src/v1/test/import.fixtures.ts',
			text: "export const SOURCE = '<Root/>'\n",
			expected: [],
		},
		'a test listing os.tmpdir() itself, or using it as a project root → reported': {
			file: 'src/lib/doctor/diagnose.test.ts',
			text: [
				"import { tmpdir } from 'node:os'",
				"import os from 'node:os'",
				"it('finds the checkouts', () => {",
				'\tconst root = tmpdir()',
				'\tconst found = readdirSync(root)',
				'\tdiagnose({ cwd: os.tmpdir() })',
				'\tconst project = createProject({ root })',
				'})',
				'',
			].join('\n'),
			expected: [
				{ rule: 'temporary-root-shared', line: 5 },
				{ rule: 'temporary-root-shared', line: 6 },
				{ rule: 'temporary-root-shared', line: 7 },
			],
		},
		'a test making a folder of its own under os.tmpdir() → nothing': {
			file: 'src/lib/doctor/diagnose.test.ts',
			text: [
				"import { tmpdir } from 'node:os'",
				"it('finds the checkouts', () => {",
				"\tconst root = mkdtempSync(join(tmpdir(), 'doctor-'))",
				'\tconst found = readdirSync(root)',
				"\tdiagnose({ cwd: join(tmpdir(), 'fixed') })",
				'})',
				'',
			].join('\n'),
			expected: [],
		},
		'the same name bound to tmpdir() in one test and to a folder of its own in another → only the first reported':
			{
				file: 'src/lib/doctor/diagnose.test.ts',
				text: [
					"it('a', () => {",
					'\tconst root = tmpdir()',
					'\treaddirSync(root)',
					'})',
					"it('b', () => {",
					"\tconst root = mkdtempSync(join(tmpdir(), 'b-'))",
					'\treaddirSync(root)',
					'\tdiagnose({ root })',
					'})',
					'',
				].join('\n'),
				expected: [{ rule: 'temporary-root-shared', line: 3 }],
			},
		'tmpdir() through realpathSync or resolve, assigned later, or removed with rmSync → reported': {
			file: 'src/lib/doctor/diagnose.test.ts',
			text: [
				"it('a', () => {",
				'\tconst real = realpathSync(tmpdir())',
				'\treaddirSync(real)',
				'\tdiagnose({ cwd: resolve(tmpdir()) })',
				'\tlet later: string',
				'\tlater = os.tmpdir()',
				'\tlistFiles(later)',
				'\trmSync(tmpdir(), { recursive: true, force: true })',
				'})',
				'',
			].join('\n'),
			expected: [
				{ rule: 'temporary-root-shared', line: 3 },
				{ rule: 'temporary-root-shared', line: 4 },
				{ rule: 'temporary-root-shared', line: 7 },
				{ rule: 'temporary-root-shared', line: 8 },
			],
		},
		'a parameter named like an outer tmpdir() variable → the parameter, not reported': {
			file: 'src/lib/doctor/diagnose.test.ts',
			text: [
				'const root = tmpdir()',
				'function scan(root: string) {',
				'\treturn readdirSync(root)',
				'}',
				"it('a', () => [mkdtempSync(join(root, 'a-'))].map((root) => listFiles(root)))",
				'',
			].join('\n'),
			expected: [],
		},
		'os.tmpdir() as a root in an implementation file → not a test matter, nothing': {
			file: 'src/commands/run.ts',
			text: "import { tmpdir } from 'node:os'\nexport function scratch() {\n\treturn readdirSync(tmpdir())\n}\n",
			expected: [],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		(testCase.only ? it.only : it)(title, () => {
			expect(findingsOf(testCase)).toEqual(testCase.expected)
		})
})
