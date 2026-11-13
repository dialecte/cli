import { parseSourceFile } from './source-file-functions.ts'

import { describe, expect, it } from 'vitest'

describe('parseSourceFile', () => {
	it('a function declaration, an arrow const and a function-expression const → three entries at their lines', () => {
		const text = [
			'/** Reads the thing. */',
			'export function readThing(): void {}',
			'',
			'export const arrowThing = (): void => {}',
			'',
			'/** Written',
			' * over lines. */',
			'export const expressionThing = function (): void {}',
			'',
		].join('\n')

		expect(parseSourceFile({ file: 'src/a.ts', text }).note).toBeUndefined()
		expect(parseSourceFile({ file: 'src/a.ts', text }).entries).toEqual([
			{
				path: 'src/a.ts#readThing',
				root: 'source',
				entry: undefined,
				otherRoutes: [],
				signature: '(): void',
				summary: 'Reads the thing.',
				intents: [],
				declaredAt: 'src/a.ts:2',
				example: undefined,
			},
			{
				path: 'src/a.ts#arrowThing',
				root: 'source',
				entry: undefined,
				otherRoutes: [],
				signature: '(): void',
				summary: undefined,
				intents: [],
				declaredAt: 'src/a.ts:4',
				example: undefined,
			},
			{
				path: 'src/a.ts#expressionThing',
				root: 'source',
				entry: undefined,
				otherRoutes: [],
				signature: '(): void',
				summary: 'Written over lines.',
				intents: [],
				declaredAt: 'src/a.ts:8',
				example: undefined,
			},
		])
	})

	it.each([
		{
			state: 'a multi-line parameter list, whitespace collapsed',
			text: "export function readGit(params: {\n\troot: string\n\targs: string[]\n}): string {\n\treturn ''\n}\n",
			signature: '(params: { root: string; args: string[] }): string',
		},
		{
			state: 'a trailing comma after the last parameter is dropped',
			text: 'export function f(\n\troot: string,\n\tflag: boolean,\n): void {}\n',
			signature: '(root: string, flag: boolean): void',
		},
		{
			state: 'no return annotation → the parameter list alone',
			text: 'export function readGit(root: string, flag = true) {\n\treturn root\n}\n',
			signature: '(root: string, flag = true)',
		},
		{
			state: 'a generic function keeps its type parameters',
			text: 'export function first<T>(items: readonly T[]): T | undefined {\n\treturn items[0]\n}\n',
			signature: '<T>(items: readonly T[]): T | undefined',
		},
	])('signature, $state', ({ text, signature }) => {
		expect(
			parseSourceFile({ file: 'src/a.ts', text }).entries.map((entry) => entry.signature),
		).toEqual([signature])
	})

	it.each([
		{ state: 'a non-exported function', text: 'function hidden(): void {}\n' },
		{ state: 'an exported class', text: 'export class Thing {}\n' },
		{ state: 'an exported constant that is not a function', text: 'export const LIMIT = 3\n' },
		{ state: 'an exported type', text: 'export type Thing = { a: string }\n' },
		{ state: 'a re-export', text: "export { x } from './x.ts'\n" },
	])('$state → no entry', ({ text }) => {
		expect(parseSourceFile({ file: 'src/a.ts', text })).toEqual({ entries: [] })
	})

	it('the export of a local function → one entry at the function line', () => {
		const text = 'function y(): void {}\nexport { y }\n'

		const { entries } = parseSourceFile({ file: 'src/a.ts', text })

		expect(entries).toHaveLength(1)
		expect(entries[0]).toMatchObject({
			path: 'src/a.ts#y',
			signature: '(): void',
			declaredAt: 'src/a.ts:1',
		})
	})

	it('an overload set → one entry, declared at the first overload, with the signature of the implementation', () => {
		const text = [
			'export function f(a: string): string',
			'export function f(a: number): number',
			'export function f(a: unknown): unknown {',
			'\treturn a',
			'}',
			'',
		].join('\n')

		const { entries } = parseSourceFile({ file: 'src/a.ts', text })

		expect(entries).toHaveLength(1)
		expect(entries[0]).toMatchObject({
			path: 'src/a.ts#f',
			signature: '(a: unknown): unknown',
			declaredAt: 'src/a.ts:1',
		})
	})

	it('two declarators of one const on two lines → two entries, each at its own line', () => {
		const text = 'export const a = () => 1,\n\tb = function () {}\n'

		const { entries } = parseSourceFile({ file: 'src/a.ts', text })

		expect(entries.map((entry) => [entry.path, entry.declaredAt])).toEqual([
			['src/a.ts#a', 'src/a.ts:1'],
			['src/a.ts#b', 'src/a.ts:2'],
		])
	})

	it.each([
		{
			state: 'a summary and @intent a, b',
			text: '/** Reads the thing. More text here.\n * @intent a, b\n */\nexport function f(): void {}\n',
			summary: 'Reads the thing.',
			intents: ['a', 'b'],
		},
		{
			state: 'a tag-only JSDoc',
			text: '/** @internal */\nexport function f(): void {}\n',
			summary: undefined,
			intents: [],
		},
		{
			state: 'no JSDoc',
			text: 'export function f(): void {}\n',
			summary: undefined,
			intents: [],
		},
	])('JSDoc, $state', ({ text, summary, intents }) => {
		expect(parseSourceFile({ file: 'src/a.ts', text }).entries).toHaveLength(1)
		expect(parseSourceFile({ file: 'src/a.ts', text }).entries[0]?.summary).toBe(summary)
		expect(parseSourceFile({ file: 'src/a.ts', text }).entries[0]?.intents).toEqual(intents)
	})

	it('a syntax error → no entries and a note, never thrown', () => {
		const text = 'export function broken( {\n\treturn\n'

		expect(parseSourceFile({ file: 'src/x.ts', text }).entries).toEqual([])
		expect(parseSourceFile({ file: 'src/x.ts', text }).note).toMatch(
			/^src\/x\.ts: not parsed \(.+\)$/,
		)
	})
})
