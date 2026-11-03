import { classifyLocated } from '../../../test/mutation-agent.ts'
import { SMALL_CASE_TIMEOUT } from '../../../test/mutation-package.constants.ts'
import { locationOfText } from '../../../test/mutation-package.ts'
import { classifyFamily } from './classify-family.ts'
import { MUTATION_FAMILIES } from './mutation.constants.ts'

import { describe, expect, it } from 'vitest'

import type { ClassifyCase } from '../../../test/mutation-agent.types.ts'
import type { MutationFamily } from './mutation.types.ts'

const FILE = 'src/engine/a.ts'

type Case = ClassifyCase & { label: string; family: MutationFamily }

/**
 * How a case tells the classifier where the mutant is: `range` gives the survivor's range (the smallest node
 * containing it decides), `text` gives only the start line (the original's first line, nearest that line, decides).
 */
const LOCATING = ['range', 'text'] as const

/*
 * The range's form is the one `exactRange` (judge.ts) writes and `--mutate` reads: both columns from 0, the end
 * exclusive. It matches @babel/parser's own locations, which the classifier compares it with: lines from 1
 * (`startLine: 1`, node_modules/@babel/parser/lib/index.js:405) and columns from 0 (`startColumn: 0`, :404;
 * `new Position(this.curLine, this.pos - this.lineStart, ...)`, :5172).
 */

/** A function holding one line, `body`. */
function inFunction(body: string): string {
	return `export function f() {\n\t${body}\n}\n`
}

function switchDefaultHolding(clause: string): string {
	return [
		"export function label(kind: 'a' | 'b'): string {",
		'\tswitch (kind) {',
		"\t\tcase 'a':",
		"\t\t\treturn 'A'",
		'\t\tdefault: {',
		`\t\t\t${clause}`,
		"\t\t\tthrow new Error('unreachable')",
		'\t\t}',
		'\t}',
		'}',
		'',
	].join('\n')
}

const CASES: Case[] = [
	// rule 4: an exhaustive default wins over the error wording inside it
	{
		label: 'a default clause holding `satisfies never`',
		source: switchDefaultHolding('kind satisfies never'),
		mutator: 'StringLiteral',
		original: "'unreachable'",
		family: 'exhaustive-default',
	},
	{
		label: 'a default clause holding `: never`',
		source: switchDefaultHolding('const unreachable: never = kind'),
		mutator: 'StringLiteral',
		original: "'unreachable'",
		family: 'exhaustive-default',
	},
	{
		label: 'a default clause calling assertNever',
		source: switchDefaultHolding('assertNever(kind)'),
		mutator: 'StringLiteral',
		original: "'unreachable'",
		family: 'exhaustive-default',
	},
	{
		label: 'a default clause that is not exhaustive (no never in it)',
		source: [
			"export function label(kind: 'a' | 'b'): string {",
			'\tswitch (kind) {',
			"\t\tcase 'a':",
			"\t\t\treturn 'A'",
			'\t\tdefault:',
			"\t\t\treturn 'other'",
			'\t}',
			'}',
			'',
		].join('\n'),
		mutator: 'StringLiteral',
		original: "'other'",
		family: 'unclassified',
	},
	// rule 5: a string in an error construction, a throw or a wording property
	{
		label: 'a string in `throw new Error(...)`',
		source: inFunction("throw new Error('boom')"),
		mutator: 'StringLiteral',
		original: "'boom'",
		family: 'wording',
	},
	{
		label: 'a template literal in `throw new Error(...)`',
		source: inFunction('throw new Error(`bad ${x}`)'),
		mutator: 'StringLiteral',
		original: '`bad ${x}`',
		family: 'wording',
	},
	{
		label: 'a template literal whatever its mutator is called',
		source: inFunction('throw new Error(`bad ${x}`)'),
		mutator: 'TemplateMutator',
		original: '`bad ${x}`',
		family: 'wording',
	},
	{
		label: 'a string thrown bare',
		source: inFunction("throw 'boom'"),
		mutator: 'StringLiteral',
		original: "'boom'",
		family: 'wording',
	},
	{
		label: 'a string in a call of `fail`',
		source: inFunction("fail('negative')"),
		mutator: 'StringLiteral',
		original: "'negative'",
		family: 'wording',
	},
	...['new ParseError', 'reportError', 'refuse', 'assertThat', 'console.error'].map(
		(callee): Case => ({
			label: `a string in a call of ${callee}`,
			source: inFunction(`${callee}('MSG')`),
			mutator: 'StringLiteral',
			original: "'MSG'",
			family: 'wording',
		}),
	),
	...['detail', 'message', 'reason', 'hint', 'text'].map((name): Case => ({
		label: `a string in a property named ${name}`,
		source: inFunction(`return { ${name}: 'MSG' }`),
		mutator: 'StringLiteral',
		original: "'MSG'",
		family: 'wording',
	})),
	{
		label: 'a string in a property named otherwise',
		source: inFunction("return { name: 'MSG' }"),
		mutator: 'StringLiteral',
		original: "'MSG'",
		family: 'unclassified',
	},
	{
		label: 'a string in a call that is no error call (log)',
		source: inFunction("log('MSG')"),
		mutator: 'StringLiteral',
		original: "'MSG'",
		family: 'unclassified',
	},
	{
		label: 'a string in a call whose callee only starts like an error call (errors.make)',
		source: inFunction("errors.make('MSG')"),
		mutator: 'StringLiteral',
		original: "'MSG'",
		family: 'unclassified',
	},
	{
		label: 'a string returned from a function',
		source: inFunction("return 'abc'"),
		mutator: 'StringLiteral',
		original: "'abc'",
		family: 'unclassified',
	},
	{
		label: 'a string compared in an if condition',
		source: inFunction("if (x === 'abc') return 1"),
		mutator: 'StringLiteral',
		original: "'abc'",
		family: 'unclassified',
	},
	{
		label: 'a non-string mutant inside an error call (the wording rule reads strings only)',
		source: inFunction('fail(x === 1)'),
		mutator: 'ConditionalExpression',
		original: 'x === 1',
		family: 'unclassified',
	},
	// rule 6: the payload of an error construction
	{
		label: 'an object literal thrown',
		source: inFunction('throw { code: 1 }'),
		mutator: 'ObjectLiteral',
		original: '{ code: 1 }',
		family: 'wording',
	},
	{
		label: 'an array in an error call',
		source: inFunction('fail([1, 2])'),
		mutator: 'ArrayDeclaration',
		original: '[1, 2]',
		family: 'wording',
	},
	{
		label: 'an arrow function in an error call',
		source: inFunction('reportError(() => 1)'),
		mutator: 'ArrowFunction',
		original: '() => 1',
		family: 'wording',
	},
	{
		label: 'an object literal returned from a function',
		source: inFunction('return { a: 1 }'),
		mutator: 'ObjectLiteral',
		original: '{ a: 1 }',
		family: 'unclassified',
	},
	{
		label: 'another mutator inside a throw (the payload rule reads three mutators)',
		source: inFunction('throw new Error(String(a === 1))'),
		mutator: 'ConditionalExpression',
		original: 'a === 1',
		family: 'unclassified',
	},
	// rule 7: module level
	{
		label: 'an expression of an exported module-level const',
		source: 'export const LIMIT = 10 * 2\n',
		mutator: 'ArithmeticOperator',
		original: '10 * 2',
		family: 'static-init',
	},
	{
		label: 'an expression of a module-level const that is not exported',
		source: 'const LIMIT = 10 * 2\n\nexport function f() {\n\treturn LIMIT\n}\n',
		mutator: 'ArithmeticOperator',
		original: '10 * 2',
		family: 'static-init',
	},
	{
		label: 'a string of a module-level const (not in an error)',
		source: "export const NAME = 'abc'\n",
		mutator: 'StringLiteral',
		original: "'abc'",
		family: 'static-init',
	},
	{
		label: 'an object literal of a module-level const',
		source: 'export const TABLE = { a: 1 }\n',
		mutator: 'ObjectLiteral',
		original: '{ a: 1 }',
		family: 'static-init',
	},
	{
		label: 'a module-level wording property (the wording rule comes first)',
		source: "export const MESSAGE = { message: 'hello' }\n",
		mutator: 'StringLiteral',
		original: "'hello'",
		family: 'wording',
	},
	{
		label: 'an expression of a const inside a function',
		source: 'export function f() {\n\tconst limit = 10 * 2\n\treturn limit\n}\n',
		mutator: 'ArithmeticOperator',
		original: '10 * 2',
		family: 'unclassified',
	},
	// rule 8
	{
		label: 'an if condition in a function',
		source: 'export function f(x: number) {\n\tif (x === 1) {\n\t\treturn 1\n\t}\n\treturn 2\n}\n',
		mutator: 'ConditionalExpression',
		original: 'x === 1',
		family: 'unclassified',
	},
]

describe('classifyFamily: the rules on real sources', { timeout: SMALL_CASE_TIMEOUT }, () => {
	describe.each(LOCATING)('located by %s', (locating) => {
		it.each(CASES)('$label → $family', (testCase) => {
			expect(classifyLocated({ testCase, locating })).toMatchObject({
				familyGuess: testCase.family,
				guessReason: expect.stringMatching(/\S/),
			})
		})
	})

	it('an unclassified guess says no rule matched', () => {
		const testCase = CASES.find(({ label }) => label === 'an if condition in a function')

		expect(testCase && classifyLocated({ testCase, locating: 'range' })).toMatchObject({
			guessReason: expect.stringMatching(/no rule matched/i),
		})
	})

	it('every guess is one of the families', () => {
		expect(
			CASES.map((testCase) => classifyLocated({ testCase, locating: 'range' }).familyGuess),
		).toSatisfy(function areFamilies(guesses: string[]) {
			return guesses.every((guess) => (MUTATION_FAMILIES as readonly string[]).includes(guess))
		})
	})
})

describe('classifyFamily: file rules and rule order', { timeout: SMALL_CASE_TIMEOUT }, () => {
	const SOURCE = inFunction('if (x === 1) return 1')
	const MUTATION = 'ConditionalExpression: x === 1 -> true'

	it.each([
		['a file in an errors/ folder', 'src/errors/parse.ts', SOURCE, 'wording'],
		['a file in a leading errors/ folder', 'errors/x.ts', SOURCE, 'wording'],
		[
			'a file in an errors/ folder whose source is gone',
			'src/errors/parse.ts',
			undefined,
			'wording',
		],
		[
			'a .constants.ts file in an errors/ folder (errors/ comes first)',
			'src/errors/x.constants.ts',
			SOURCE,
			'wording',
		],
		['a .constants.ts file', 'src/engine/limits.constants.ts', SOURCE, 'static-init'],
		[
			'a .constants.ts file whose source is gone',
			'src/engine/limits.constants.ts',
			undefined,
			'static-init',
		],
		['a folder that only ends like errors', 'src/myerrors/a.ts', SOURCE, 'unclassified'],
		['a file named like the folder', 'src/errors.ts', SOURCE, 'unclassified'],
	] as const)('%s → %s', (_label, file, source, family) => {
		expect(classifyFamily({ file, source, mutation: MUTATION, line: 2 })).toMatchObject({
			familyGuess: family,
		})
	})
})

describe('classifyFamily: a mutant that cannot be located', { timeout: SMALL_CASE_TIMEOUT }, () => {
	const SOURCE = inFunction('if (x === 1) return 1')

	it.each([
		['the file is gone', undefined, 'ConditionalExpression: x === 1 -> true'],
		['the source does not parse', 'export const = ;\n', 'ConditionalExpression: x === 1 -> true'],
		['the original is not in the source', SOURCE, 'ConditionalExpression: zzz() -> true'],
	])('%s → unclassified, "could not locate"', (_label, source, mutation) => {
		expect(classifyFamily({ file: FILE, source, mutation, line: 2 })).toMatchObject({
			familyGuess: 'unclassified',
			guessReason: expect.stringMatching(/could not locate/i),
		})
	})

	it('an unparsable source with a range → unclassified, "could not locate"', () => {
		expect(
			classifyFamily({
				file: FILE,
				source: 'export const = ;\n',
				mutation: 'ConditionalExpression: x === 1 -> true',
				line: 1,
				range: `${FILE}:1:13-1:14`,
			}),
		).toMatchObject({
			familyGuess: 'unclassified',
			guessReason: expect.stringMatching(/could not locate/i),
		})
	})
})

describe(
	'classifyFamily: two occurrences of the same text',
	{ timeout: SMALL_CASE_TIMEOUT },
	() => {
		// line 1 is a module-level const (static-init), line 4 a thrown error (wording)
		const SOURCE =
			"export const FIRST = 'same'\n\nexport function f(): never {\n\tthrow new Error('same')\n}\n"
		const MUTATION = 'StringLiteral: \'same\' -> ""'
		const FIRST = locationOfText({ file: FILE, source: SOURCE, text: "'same'", occurrence: 1 })
		const SECOND = locationOfText({ file: FILE, source: SOURCE, text: "'same'", occurrence: 2 })

		it.each([
			[
				'the range of the second occurrence, whatever line is given',
				{ line: 1, range: SECOND.range },
				'wording',
			],
			[
				'the range of the first occurrence, whatever line is given',
				{ line: 4, range: FIRST.range },
				'static-init',
			],
			['no range, the start line of the second', { line: 4 }, 'wording'],
			['no range, the start line of the first', { line: 1 }, 'static-init'],
			['no range, a line nearer the first (2)', { line: 2 }, 'static-init'],
			['no range, a line nearer the second (3)', { line: 3 }, 'wording'],
		] as const)('%s → %s', (_label, where, family) => {
			expect(
				classifyFamily({ file: FILE, source: SOURCE, mutation: MUTATION, ...where }),
			).toMatchObject({
				familyGuess: family,
			})
		})
	},
)
