import { checkCodeRules } from './check-code-rules.ts'
import { GENERIC_REFERENCE_PATTERNS } from './committed-text.constants.ts'

import { describe, expect, it } from 'vitest'

import type { RuleFinding } from './check-code-rules.types.ts'

const FILE = 'src/lib/read-things.ts'

type TestCase = {
	lines: string[]
	/** The names of the file's classes a package entry exports. */
	entryClasses?: string[]
	expected: Pick<RuleFinding, 'rule' | 'line' | 'functionLine'>[]
	only?: boolean
}

function moduleOf(lines: string[]): string {
	return [...lines, ''].join('\n')
}

function classFindingsOf(testCase: { lines: string[]; entryClasses?: string[] }): RuleFinding[] {
	return checkCodeRules({
		file: FILE,
		text: moduleOf(testCase.lines),
		referencePatterns: GENERIC_REFERENCE_PATTERNS,
		...(testCase.entryClasses && { entryClasses: new Set(testCase.entryClasses) }),
	}).filter((finding) => finding.rule === 'class' || finding.rule === 'argument-mutation')
}

function positionsOf(findings: RuleFinding[]): TestCase['expected'] {
	return findings.map((finding) => ({
		rule: finding.rule,
		line: finding.line,
		functionLine: finding.functionLine,
	}))
}

const COUNTER = [
	'export class Counter {',
	'\tcount = 0',
	'\tconstructor() {',
	'\t\tthis.count = 1',
	'\t}',
	'\tincrement() {',
	'\t\tthis.count++',
	'\t\tthis.count++',
	'\t}',
	'}',
]

describe('checkCodeRules: the class rule', () => {
	const testCases: Record<string, TestCase> = {
		'a class a package entry exports → no finding, its writes through this kept': {
			lines: COUNTER,
			entryClasses: ['Counter'],
			expected: [],
		},
		'a class that implements an interface → no finding, its writes through this kept': {
			lines: [
				'export class MemoryStore implements Store {',
				'\titems: string[] = []',
				'\tadd(item: string) {',
				'\t\tthis.items.push(item)',
				'\t}',
				'}',
			],
			expected: [],
		},
		'a class no entry exports → a class error at its name; each path written through this outside the constructor once':
			{
				lines: COUNTER,
				entryClasses: ['Other'],
				expected: [
					{ rule: 'class', line: 1, functionLine: 1 },
					{ rule: 'argument-mutation', line: 7, functionLine: 6 },
				],
			},
		'a class that only extends another → refused: extending is no implements': {
			lines: ['export class Refusal extends Base {}'],
			expected: [{ rule: 'class', line: 1, functionLine: 1 }],
		},
		'a data-only Error subclass: fields, a constructor of super, locals and field assignments → no finding':
			{
				lines: [
					'export class QueryRefusal extends Error {',
					"\toverride name = 'QueryRefusal'",
					'\treadonly reason: string',
					'\tconstructor(params: { reason: string }) {',
					'\t\tconst { reason } = params',
					'\t\tsuper(`refused: ${reason}`)',
					'\t\tthis.reason = reason',
					'\t}',
					'}',
				],
				expected: [],
			},
		'a data-only class extending a *Error base, or a data-only error class declared later in the file → no finding':
			{
				lines: [
					'class Narrower extends Wider {}',
					'class Wider extends TypeError {}',
					'class Late extends errors.GateConfigError {}',
				],
				expected: [],
			},
		'an Error subclass with a method → refused as any class, its writes through this found': {
			lines: [
				'export class Refusal extends Error {',
				'\tcount = 0',
				'\tbump() {',
				'\t\tthis.count += 1',
				'\t}',
				'}',
			],
			expected: [
				{ rule: 'class', line: 1, functionLine: 1 },
				{ rule: 'argument-mutation', line: 4, functionLine: 3 },
			],
		},
		'an Error subclass with a getter, or a constructor doing more than building fields → refused': {
			lines: [
				'export class Refusal extends Error {',
				'\tget code() {',
				"\t\treturn 'R1'",
				'\t}',
				'}',
				'export class Noted extends Error {',
				'\tconstructor() {',
				"\t\tsuper('noted')",
				'\t\tregister(this)',
				'\t}',
				'}',
				'class Subclass extends Refusal {}',
			],
			expected: [
				{ rule: 'class', line: 1, functionLine: 1 },
				{ rule: 'class', line: 6, functionLine: 6 },
				{ rule: 'class', line: 12, functionLine: 12 },
			],
		},
		'a class expression a const holds → refused under the const name, the opt-out line at the const':
			{
				lines: ['', 'const Holder = class {', '\tread() {', '\t\treturn 1', '\t}', '}'],
				expected: [{ rule: 'class', line: 2, functionLine: 2 }],
			},
		'a class under a doc comment → the opt-out line is the export line': {
			lines: ['/** A thing. */', 'export class Thing {}'],
			expected: [{ rule: 'class', line: 2, functionLine: 2 }],
		},
		'a refused class: this written in a setter, an arrow property, an arrow inside a method → each reported':
			{
				lines: [
					'class Box {',
					'\tset value(next: number) {',
					'\t\tthis.held = next',
					'\t}',
					'\treset = () => {',
					'\t\tdelete this.held',
					'\t}',
					'\tfill(items: number[]) {',
					'\t\titems.forEach((item) => this.list.push(item))',
					'\t}',
					'}',
				],
				expected: [
					{ rule: 'class', line: 1, functionLine: 1 },
					{ rule: 'argument-mutation', line: 3, functionLine: 2 },
					{ rule: 'argument-mutation', line: 6, functionLine: 5 },
					{ rule: 'argument-mutation', line: 9, functionLine: 8 },
				],
			},
		"a refused class: this inside a nested function expression or class, or a static block → not the instance's":
			{
				lines: [
					'class Box {',
					'\tstatic {',
					'\t\tthis.made = true',
					'\t}',
					'\tread() {',
					'\t\treturn function inner() {',
					'\t\t\tthis.seen = true',
					'\t\t}',
					'\t}',
					'}',
				],
				expected: [{ rule: 'class', line: 1, functionLine: 1 }],
			},
		"a refused class: this inside an object literal's method or accessor → not the instance's": {
			lines: [
				'class Box {',
				'\tview() {',
				'\t\treturn {',
				'\t\t\treset() {',
				'\t\t\t\tthis.count = 0',
				'\t\t\t},',
				'\t\t\tget value() {',
				'\t\t\t\tthis.count = 1',
				'\t\t\t\treturn 1',
				'\t\t\t},',
				'\t\t}',
				'\t}',
				'}',
			],
			expected: [{ rule: 'class', line: 1, functionLine: 1 }],
		},
		'a refused class: an arrow the constructor creates writes this → reported under the constructor':
			{
				lines: [
					'class Ticker {',
					'\tconstructor() {',
					'\t\tthis.count = 0',
					'\t\tthis.onTick = () => {',
					'\t\t\tthis.count++',
					'\t\t}',
					'\t}',
					'}',
				],
				expected: [
					{ rule: 'class', line: 1, functionLine: 1 },
					{ rule: 'argument-mutation', line: 5, functionLine: 2 },
				],
			},
		'a refused class: a compound assignment, a #private field, optional chaining, a static method → each reported':
			{
				lines: [
					'class Tally {',
					'\t#seen = 0',
					'\tadd() {',
					'\t\tthis.total ??= 0',
					'\t\tthis.#seen += 1',
					'\t\tthis.items?.push(1)',
					'\t}',
					'\tstatic reset() {',
					'\t\tthis.instances = 0',
					'\t}',
					'}',
				],
				expected: [
					{ rule: 'class', line: 1, functionLine: 1 },
					{ rule: 'argument-mutation', line: 4, functionLine: 3 },
					{ rule: 'argument-mutation', line: 5, functionLine: 3 },
					{ rule: 'argument-mutation', line: 6, functionLine: 3 },
					{ rule: 'argument-mutation', line: 9, functionLine: 8 },
				],
			},
		'a function whose this is declared as a parameter → not judged as a class write nor an argument':
			{
				lines: ['export function mark(this: { seen: boolean }) {', '\tthis.seen = true', '}'],
				expected: [],
			},
	}

	for (const [title, testCase] of Object.entries(testCases))
		(testCase.only ? it.only : it)(title, () => {
			expect(positionsOf(classFindingsOf(testCase))).toEqual(testCase.expected)
		})

	it('a refused class → the error names the class and both ways to pass', () => {
		expect(classFindingsOf({ lines: ['export class Thing {}'] })[0]?.message).toBe(
			'class `Thing` is no public facade nor store: a class passes when a package entry exports it (`exports` in package.json, re-exports followed), it `implements` an interface, or it is an Error subclass holding only fields and a constructor; else write functions over explicit state, or keep it with `dialecte-allow class: <why>`',
		)
	})

	it('a write through this in a refused class → the message names the class member, the path and the write', () => {
		expect(
			classFindingsOf({ lines: COUNTER }).find((finding) => finding.rule === 'argument-mutation')
				?.message,
		).toBe(
			'`Counter.increment` changes `this.count` (`++`) in a class the class rule does not admit (no entry export, no interface, no data-only error): return the new value from a function over explicit state instead',
		)
	})

	it('a class in a test file → not judged', () => {
		expect(
			checkCodeRules({
				file: 'src/lib/read-things.test.ts',
				text: moduleOf(['class Held {}']),
				referencePatterns: GENERIC_REFERENCE_PATTERNS,
			}).filter((finding) => finding.rule === 'class'),
		).toEqual([])
	})
})
