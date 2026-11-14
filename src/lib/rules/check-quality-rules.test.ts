import { checkCodeRules } from './check-code-rules.ts'
import { GENERIC_REFERENCE_PATTERNS } from './committed-text.constants.ts'

import { describe, expect, it } from 'vitest'

import type { CheckCodeRulesParams, RuleFinding, RuleName } from './check-code-rules.types.ts'

const CHECKED_RULES: readonly RuleName[] = ['argument-mutation', 'long-function']

type TestCase = {
	file: string
	text: string
	expected: { rule: RuleName; line: number }[]
	only?: boolean
}

type DetailCase = {
	file: string
	text: string
	expected: Pick<RuleFinding, 'rule' | 'line' | 'severity' | 'message' | 'functionLine'>[]
	only?: boolean
}

function paramsOf(testCase: { file: string; text: string }): CheckCodeRulesParams {
	return {
		file: testCase.file,
		text: testCase.text,
		referencePatterns: GENERIC_REFERENCE_PATTERNS,
	}
}

function checkedOf(findings: RuleFinding[]): RuleFinding[] {
	return findings.filter((finding) => CHECKED_RULES.includes(finding.rule))
}

function positionsOf(findings: RuleFinding[]): { rule: RuleName; line: number }[] {
	return checkedOf(findings).map((finding) => ({
		rule: finding.rule,
		line: finding.line,
	}))
}

function detailsOf(findings: RuleFinding[]): DetailCase['expected'] {
	return checkedOf(findings).map((finding) => ({
		rule: finding.rule,
		line: finding.line,
		severity: finding.severity,
		message: finding.message,
		functionLine: finding.functionLine,
	}))
}

/** `count` statements, one per line, each a call that is neither blank nor a comment. */
function codeLines(count: number): string[] {
	return Array.from({ length: count }, (_, index) => `\tstep(${index})`)
}

function moduleOf(lines: string[]): string {
	return [...lines, ''].join('\n')
}

function longFunction(params: { name: string; body: string[] }): string {
	return moduleOf([`export function ${params.name}() {`, ...params.body, '}'])
}

const SELECT_THINGS = moduleOf([
	'export function selectThings(params: Params) {',
	'\tconst { warnings } = params',
	"\tparams.leaveOut.add('a')",
	"\tparams.leaveOut.add('b')",
	"\twarnings.push('w')",
	'}',
])

describe('checkCodeRules quality: argument-mutation and long-function', () => {
	const testCases: Record<string, TestCase> = {
		'a method call on a property path and on a body-destructured binding → one finding per target, at the first mutation':
			{
				file: 'src/lib/select-things.ts',
				text: SELECT_THINGS,
				expected: [
					{ rule: 'argument-mutation', line: 3 },
					{ rule: 'argument-mutation', line: 5 },
				],
			},
		'a parameter destructured in the parameter list, mutated → reported': {
			file: 'src/lib/add-item.ts',
			text: moduleOf(['export function addItem({ items }: Params) {', '\titems.push(1)', '}']),
			expected: [{ rule: 'argument-mutation', line: 2 }],
		},
		'a property assigned on the parameter → reported': {
			file: 'src/lib/rename-it.ts',
			text: moduleOf(['export function renameIt(params: Params) {', '\tparams.x = 1', '}']),
			expected: [{ rule: 'argument-mutation', line: 2 }],
		},
		'a compound assignment on an index of the parameter → reported': {
			file: 'src/lib/bump-it.ts',
			text: moduleOf([
				'export function bumpIt(target: number[], index: number) {',
				'\ttarget[index] += 1',
				'}',
			]),
			expected: [{ rule: 'argument-mutation', line: 2 }],
		},
		'a delete of a property of the parameter → reported': {
			file: 'src/lib/drop-it.ts',
			text: moduleOf(['export function dropIt(params: Params) {', '\tdelete params.x', '}']),
			expected: [{ rule: 'argument-mutation', line: 2 }],
		},
		'an increment of a property of the parameter → reported': {
			file: 'src/lib/count-it.ts',
			text: moduleOf(['export function countIt(params: Params) {', '\tparams.count++', '}']),
			expected: [{ rule: 'argument-mutation', line: 2 }],
		},
		'an Object.assign with the parameter first → reported': {
			file: 'src/lib/fill-it.ts',
			text: moduleOf([
				'export function fillIt(params: Params, other: Other) {',
				'\tObject.assign(params, other)',
				'}',
			]),
			expected: [{ rule: 'argument-mutation', line: 2 }],
		},
		'a sort in place of a list held by the parameter → reported': {
			file: 'src/lib/order-it.ts',
			text: moduleOf(['export function orderIt(params: Params) {', '\tparams.list.sort()', '}']),
			expected: [{ rule: 'argument-mutation', line: 2 }],
		},
		'a class method mutating its parameter → reported': {
			file: 'src/lib/store.ts',
			text: moduleOf([
				'export class Store {',
				'\tfill(list: number[]) {',
				'\t\tlist.push(1)',
				'\t}',
				'}',
			]),
			expected: [{ rule: 'argument-mutation', line: 3 }],
		},
		'a function expression mutating its parameter → reported': {
			file: 'src/lib/make-filler.ts',
			text: moduleOf([
				'export function makeFiller() {',
				'\treturn function fill(list: number[]) {',
				'\t\tlist.push(1)',
				'\t}',
				'}',
			]),
			expected: [{ rule: 'argument-mutation', line: 3 }],
		},
		'an arrow callback mutating its own parameter → reported': {
			file: 'src/lib/fill-rows.ts',
			text: moduleOf([
				'export function fillRows(rows: number[][]) {',
				'\trows.forEach((row) => {',
				'\t\trow.push(1)',
				'\t})',
				'}',
			]),
			expected: [{ rule: 'argument-mutation', line: 3 }],
		},
		'a second mutation of the same target → still one finding': {
			file: 'src/lib/add-twice.ts',
			text: moduleOf([
				'export function addTwice(params: Params) {',
				'\tparams.leaveOut.add(1)',
				'\tparams.leaveOut.add(2)',
				'}',
			]),
			expected: [{ rule: 'argument-mutation', line: 2 }],
		},
		'the parameter rebound → nothing': {
			file: 'src/lib/trim-it.ts',
			text: moduleOf([
				'export function trimIt(value: string) {',
				'\tvalue = value.trim()',
				'\treturn value',
				'}',
			]),
			expected: [],
		},
		'a copied list changed → nothing': {
			file: 'src/lib/copy-it.ts',
			text: moduleOf([
				'export function copyIt(params: Params, extra: number) {',
				'\tconst copy = [...params.items]',
				'\tcopy.push(extra)',
				'\treturn copy',
				'}',
			]),
			expected: [],
		},
		'the accumulator of a reduce callback changed → nothing': {
			file: 'src/lib/collect-it.ts',
			text: moduleOf([
				'export function collectIt(items: number[]) {',
				'\treturn items.reduce((acc, item) => {',
				'\t\tacc.push(item)',
				'\t\treturn acc',
				'\t}, [])',
				'}',
			]),
			expected: [],
		},
		'writes through a transaction or query binding → nothing': {
			file: 'src/lib/write-it.ts',
			text: moduleOf([
				'export function writeIt(tx: Tx, query: Query, context: Context, params: Params) {',
				'\tparams.tx.delete(params.ref)',
				'\ttx.add(params.ref)',
				'\tquery.set(params.ref)',
				'\tcontext.query.any.set(params.ref)',
				'}',
			]),
			expected: [],
		},
		'an alias of a property of the parameter changed → nothing (aliases are not followed)': {
			file: 'src/lib/alias-it.ts',
			text: moduleOf([
				'export function aliasIt(params: Params) {',
				'\tconst alias = params.set',
				'\talias.add(1)',
				'}',
			]),
			expected: [],
		},
		'a binding shadowed in an inner block → the outer one is reported, the inner one is not': {
			file: 'src/lib/shadow-it.ts',
			text: moduleOf([
				'export function shadowIt(params: Params) {',
				'\tconst { leaveOut } = params',
				'\t{',
				'\t\tconst leaveOut = new Set<number>()',
				'\t\tleaveOut.add(1)',
				'\t}',
				'\tleaveOut.add(2)',
				'}',
			]),
			expected: [{ rule: 'argument-mutation', line: 7 }],
		},
		'only the shadowing binding changed → nothing': {
			file: 'src/lib/shadow-only.ts',
			text: moduleOf([
				'export function shadowOnly(params: Params) {',
				'\tconst { leaveOut } = params',
				'\t{',
				'\t\tconst leaveOut = new Set<number>()',
				'\t\tleaveOut.add(1)',
				'\t}',
				'\treturn leaveOut',
				'}',
			]),
			expected: [],
		},
		'a local list changed → nothing': {
			file: 'src/lib/local-list.ts',
			text: moduleOf([
				'export function localList() {',
				'\tconst list: number[] = []',
				'\tlist.push(1)',
				'\treturn list',
				'}',
			]),
			expected: [],
		},
		'a nested callback mutating the outer parameter → one finding on the mutation line': {
			file: 'src/lib/keep-seen.ts',
			text: moduleOf([
				'export function keepSeen(params: Params) {',
				'\tparams.items.forEach(function keep(item) {',
				'\t\tparams.seen.add(item)',
				'\t})',
				'}',
			]),
			expected: [{ rule: 'argument-mutation', line: 3 }],
		},
		'a deep property path of the parameter mutated → reported': {
			file: 'src/lib/push-deep.ts',
			text: moduleOf([
				'export function pushDeep(params: Params) {',
				'\tparams.state.items.push(1)',
				'}',
			]),
			expected: [{ rule: 'argument-mutation', line: 2 }],
		},
		'a catch parameter shadowing the binding → only the outer mutation is reported': {
			file: 'src/lib/catch-it.ts',
			text: moduleOf([
				'export function catchIt(params: Params) {',
				'\tconst { leaveOut } = params',
				'\ttry {',
				'\t\trun()',
				'\t} catch (leaveOut) {',
				'\t\tleaveOut.add(1)',
				'\t}',
				'\tleaveOut.add(2)',
				'}',
			]),
			expected: [{ rule: 'argument-mutation', line: 8 }],
		},
		'a loop variable shadowing the binding → only the outer mutation is reported': {
			file: 'src/lib/loop-it.ts',
			text: moduleOf([
				'export function loopIt(params: Params, lists: Set<number>[]) {',
				'\tconst { leaveOut } = params',
				'\tfor (const leaveOut of lists) {',
				'\t\tleaveOut.add(1)',
				'\t}',
				'\tleaveOut.add(2)',
				'}',
			]),
			expected: [{ rule: 'argument-mutation', line: 6 }],
		},
		'two different mutating methods on the same target → one finding at the first': {
			file: 'src/lib/add-then-delete.ts',
			text: moduleOf([
				'export function addThenDelete(params: Params) {',
				'\tparams.leaveOut.add(1)',
				'\tparams.leaveOut.delete(2)',
				'}',
			]),
			expected: [{ rule: 'argument-mutation', line: 2 }],
		},
		'an Object.assign into a new object → nothing': {
			file: 'src/lib/copy-params.ts',
			text: moduleOf([
				'export function copyParams(params: Params) {',
				'\treturn Object.assign({}, params)',
				'}',
			]),
			expected: [],
		},
		'a delete through params.transaction → nothing': {
			file: 'src/lib/drop-through.ts',
			text: moduleOf([
				'export function dropThrough(params: Params) {',
				'\tparams.transaction.delete(params.ref)',
				'}',
			]),
			expected: [],
		},
		'a class method of 61 code lines → one warning on the method name line': {
			file: 'src/lib/reader.ts',
			text: moduleOf(['export class Reader {', '\treadAll() {', ...codeLines(61), '\t}', '}']),
			expected: [{ rule: 'long-function', line: 2 }],
		},
		'a function of 61 code lines → one warning on its name line': {
			file: 'src/lib/read-everything.ts',
			text: longFunction({ name: 'readEverything', body: codeLines(61) }),
			expected: [{ rule: 'long-function', line: 1 }],
		},
		'a function of exactly 60 code lines → nothing': {
			file: 'src/lib/read-everything.ts',
			text: longFunction({ name: 'readEverything', body: codeLines(60) }),
			expected: [],
		},
		'55 code lines and 6 blank lines → nothing': {
			file: 'src/lib/read-everything.ts',
			text: longFunction({
				name: 'readEverything',
				body: [...codeLines(55), ...Array.from({ length: 6 }, () => '')],
			}),
			expected: [],
		},
		'55 code lines and 6 comment lines → nothing': {
			file: 'src/lib/read-everything.ts',
			text: longFunction({
				name: 'readEverything',
				body: [...codeLines(55), ...Array.from({ length: 6 }, () => '\t// a note')],
			}),
			expected: [],
		},
		'a block comment spanning lines counts as comment lines → nothing': {
			file: 'src/lib/read-everything.ts',
			text: longFunction({
				name: 'readEverything',
				body: [...codeLines(58), '\t/*', '\t * one', '\t * two', '\t * three', '\t */'],
			}),
			expected: [],
		},
		'an outer function of 70 lines holding an inner one of 65 → each judged on its own body': {
			file: 'src/lib/nested.ts',
			text: longFunction({
				name: 'outer',
				body: [
					'\tfunction inner() {',
					...codeLines(65).map((line) => `\t${line}`),
					'\t}',
					...codeLines(3),
				],
			}),
			expected: [
				{ rule: 'long-function', line: 1 },
				{ rule: 'long-function', line: 2 },
			],
		},
	}

	const detailCases: Record<string, DetailCase> = {
		'the message names the function, the argument, the method and the fix; the severity is an error':
			{
				file: 'src/lib/select-things.ts',
				text: SELECT_THINGS,
				expected: [
					{
						rule: 'argument-mutation',
						line: 3,
						severity: 'error',
						message:
							'`selectThings` changes its argument `leaveOut` (`.add`): return the new value instead',
						functionLine: 1,
					},
					{
						rule: 'argument-mutation',
						line: 5,
						severity: 'error',
						message:
							'`selectThings` changes its argument `warnings` (`.push`): return the new value instead',
						functionLine: 1,
					},
				],
			},
		'a method is named by its method name and carries the line of its first token': {
			file: 'src/lib/store.ts',
			text: moduleOf([
				'export class Store {',
				'\tfill(list: number[]) {',
				'\t\tlist.push(1)',
				'\t}',
				'}',
			]),
			expected: [
				{
					rule: 'argument-mutation',
					line: 3,
					severity: 'error',
					message: '`fill` changes its argument `list` (`.push`): return the new value instead',
					functionLine: 2,
				},
			],
		},
		'a nested callback mutation is owned by the outer function': {
			file: 'src/lib/keep-seen.ts',
			text: moduleOf([
				'export function keepSeen(params: Params) {',
				'\tparams.items.forEach(function keep(item) {',
				'\t\tparams.seen.add(item)',
				'\t})',
				'}',
			]),
			expected: [
				{
					rule: 'argument-mutation',
					line: 3,
					severity: 'error',
					message: '`keepSeen` changes its argument `seen` (`.add`): return the new value instead',
					functionLine: 1,
				},
			],
		},
		'a delete is labelled delete and names the object it is taken from': {
			file: 'src/lib/drop-it.ts',
			text: moduleOf(['export function dropIt(params: Params) {', '\tdelete params.x', '}']),
			expected: [
				{
					rule: 'argument-mutation',
					line: 2,
					severity: 'error',
					message:
						'`dropIt` changes its argument `params` (`delete`): return the new value instead',
					functionLine: 1,
				},
			],
		},
		'an increment is labelled ++': {
			file: 'src/lib/count-it.ts',
			text: moduleOf(['export function countIt(params: Params) {', '\tparams.count++', '}']),
			expected: [
				{
					rule: 'argument-mutation',
					line: 2,
					severity: 'error',
					message: '`countIt` changes its argument `params` (`++`): return the new value instead',
					functionLine: 1,
				},
			],
		},
		'an assignment is labelled = and names the last segment before the property': {
			file: 'src/lib/set-state.ts',
			text: moduleOf(['export function setState(params: Params) {', '\tparams.state.x = 1', '}']),
			expected: [
				{
					rule: 'argument-mutation',
					line: 2,
					severity: 'error',
					message: '`setState` changes its argument `state` (`=`): return the new value instead',
					functionLine: 1,
				},
			],
		},
		'a compound assignment is labelled += and names the indexed parameter': {
			file: 'src/lib/bump-it.ts',
			text: moduleOf([
				'export function bumpIt(target: number[], index: number) {',
				'\ttarget[index] += 1',
				'}',
			]),
			expected: [
				{
					rule: 'argument-mutation',
					line: 2,
					severity: 'error',
					message: '`bumpIt` changes its argument `target` (`+=`): return the new value instead',
					functionLine: 1,
				},
			],
		},
		'an Object.assign is labelled Object.assign and names its first argument': {
			file: 'src/lib/fill-it.ts',
			text: moduleOf([
				'export function fillIt(params: Params, other: Other) {',
				'\tObject.assign(params, other)',
				'}',
			]),
			expected: [
				{
					rule: 'argument-mutation',
					line: 2,
					severity: 'error',
					message:
						'`fillIt` changes its argument `params` (`Object.assign`): return the new value instead',
					functionLine: 1,
				},
			],
		},
		'a function held by an exported const carries the line of its const': {
			file: 'src/lib/read-all.ts',
			text: moduleOf(['export const readAll = function readAll() {', ...codeLines(61), '}']),
			expected: [
				{
					rule: 'long-function',
					line: 1,
					severity: 'warning',
					message: '`readAll` is 61 lines (over 60): split it',
					functionLine: 1,
				},
			],
		},
		'a long function is a warning carrying its count and its first line': {
			file: 'src/lib/read-everything.ts',
			text: moduleOf([
				'// a leading note',
				'',
				'export function readEverything() {',
				...codeLines(61),
				'}',
			]),
			expected: [
				{
					rule: 'long-function',
					line: 3,
					severity: 'warning',
					message: '`readEverything` is 61 lines (over 60): split it',
					functionLine: 3,
				},
			],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		(testCase.only ? it.only : it)(title, () => {
			expect(positionsOf(checkCodeRules(paramsOf(testCase)))).toEqual(testCase.expected)
		})

	for (const [title, detailCase] of Object.entries(detailCases))
		(detailCase.only ? it.only : it)(title, () => {
			expect(detailsOf(checkCodeRules(paramsOf(detailCase)))).toEqual(detailCase.expected)
		})

	it('a class property holding an arrow that changes its argument → the message names the property', () => {
		const text = moduleOf([
			'export class Store {',
			'\thandler = (params: Params) => {',
			'\t\tparams.x = 1',
			'\t}',
			'}',
		])

		expect(
			checkedOf(checkCodeRules(paramsOf({ file: 'src/lib/store.ts', text }))).map(
				(finding) => finding.message,
			),
		).toEqual(['`handler` changes its argument `params` (`=`): return the new value instead'])
	})

	it('a parameter mutation → reported in an implementation file, not in a test file', () => {
		const text = moduleOf(['export function addItem(items: number[]) {', '\titems.push(1)', '}'])
		expect(positionsOf(checkCodeRules(paramsOf({ file: 'src/lib/add-item.ts', text })))).toEqual([
			{ rule: 'argument-mutation', line: 2 },
		])
		expect(
			positionsOf(checkCodeRules(paramsOf({ file: 'src/lib/add-item.test.ts', text }))),
		).toEqual([])
	})

	it('a 200-line function → warned in an implementation file, not in a test file', () => {
		const text = longFunction({ name: 'readEverything', body: codeLines(200) })
		expect(
			positionsOf(checkCodeRules(paramsOf({ file: 'src/lib/read-everything.ts', text }))),
		).toEqual([{ rule: 'long-function', line: 1 }])
		expect(
			positionsOf(checkCodeRules(paramsOf({ file: 'src/lib/read-everything.test.ts', text }))),
		).toEqual([])
	})
})
