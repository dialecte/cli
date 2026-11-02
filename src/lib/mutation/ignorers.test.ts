import { ignoreReason, strykerPlugins, strykerValidationSchema } from './ignorers.ts'

import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import { describe, expect, it } from 'vitest'

import type { NodePath } from '@babel/traverse'

const ERROR_FACTORIES = ['createSclError']

function parseCode(code: string) {
	return parse(code, { sourceType: 'module', plugins: ['typescript'] })
}

function allPaths(code: string): NodePath[] {
	const paths: NodePath[] = []
	traverse(parseCode(code), { enter: (path) => void paths.push(path) })
	return paths
}

/**
 * The node whose source text is `marker` and its ancestors: Stryker asks each path top-down and skips the whole
 * subtree of a path it ignores, so the node is skipped when any of them gets a reason.
 */
function chainOf(params: { code: string; marker: string }): NodePath[] {
	const { code, marker } = params
	const found = allPaths(code).find(
		(path) => code.slice(path.node.start ?? 0, path.node.end ?? 0) === marker,
	)
	if (found === undefined) throw new Error(`marker not found: ${marker}`)
	return [found, ...found.getAncestry().slice(1)]
}

describe('ignoreReason: ignored', () => {
	it.each([
		['a string thrown', `function f() { throw 'TARGET' }`, `'TARGET'`],
		['a template thrown bare', 'function f(x) { throw `TARGET ${x}` }', '`TARGET ${x}`'],
		['a string in new Error', `const e = new Error('TARGET')`, `'TARGET'`],
		['a string in new <Name>Error', `const e = new ParseError('TARGET')`, `'TARGET'`],
		['a template in new <Name>Error', 'const e = new SclError(`TARGET ${x}`)', '`TARGET ${x}`'],
		[
			'a detail value in new <Name>Error',
			`const e = new SclError({ detail: 'TARGET' })`,
			`'TARGET'`,
		],
		['a message value in a throw', `function f() { throw { message: 'TARGET' } }`, `'TARGET'`],
		['a reason value in a throw', `function f() { throw build({ reason: 'TARGET' }) }`, `'TARGET'`],
		[
			'a detail value in an error factory call',
			`const e = createSclError({ code: 'a', detail: 'TARGET' })`,
			`'TARGET'`,
		],
		[
			'a template under detail in an error factory call',
			'const e = createSclError({ code: 1, detail: `TARGET ${x}` })',
			'`TARGET ${x}`',
		],
		[
			'a string deep under detail in an error factory call',
			`const e = createSclError({ detail: cond ? 'TARGET' : 'other' })`,
			`'TARGET'`,
		],
		['a string argument of new FooError', `const e = new FooError('TARGET')`, `'TARGET'`],
		[
			'a detail value under a thrown call',
			`function f() { throw build({ detail: 'TARGET' }) }`,
			`'TARGET'`,
		],
		[
			'the body of a default arm holding satisfies never',
			`function f(k) { switch (k) { case 'a': return 1; default: { k satisfies never; return 'TARGET' } } }`,
			`'TARGET'`,
		],
		[
			'the body of a default arm calling assertNever',
			`function f(k) { switch (k) { case 'a': return 1; default: return assertNever(k, 'TARGET') } }`,
			`'TARGET'`,
		],
		[
			'a statement after assertNever in a default arm',
			`function f(k) { switch (k) { case 'a': return 1; default: assertNever(k); return 'TARGET' } }`,
			`'TARGET'`,
		],
	])('%s', (_label, code, marker) => {
		expect(
			chainOf({ code, marker }).some(
				(path) => ignoreReason({ path, errorFactories: ERROR_FACTORIES }) !== undefined,
			),
		).toBe(true)
	})

	it('every ignore carries a reason text', () => {
		const code = `function f() { throw new Error('TARGET') }`
		expect(
			allPaths(code).flatMap(
				(path) => ignoreReason({ path, errorFactories: ERROR_FACTORIES }) ?? [],
			),
		).toContainEqual(expect.stringMatching(/\S/))
		expect(
			allPaths(code)
				.flatMap((path) => ignoreReason({ path, errorFactories: ERROR_FACTORIES }) ?? [])
				.every((reason) => reason.trim() !== ''),
		).toBe(true)
	})
})

describe('ignoreReason: stays mutable', () => {
	it.each([
		['a string argument of an ordinary call', `query.getRecord({ tagName: 'LNode' })`, `'LNode'`],
		[
			'a defaults option of readAttribute',
			`readAttribute({ record, name: 'a', defaults: 'none' })`,
			`'none'`,
		],
		['a ?? [] fallback', `const x = map.get(key) ?? []`, `map.get(key) ?? []`],
		['an optional chain', `const x = ref?.id`, `ref?.id`],
		['a ?? empty-string fallback', `const x = value ?? ''`, `value ?? ''`],
		[
			'a detail property of an object that is not an error',
			`const entry = { detail: 'TARGET' }`,
			`'TARGET'`,
		],
		[
			'a message property of a returned report entry',
			`function f() { return { message: 'TARGET' } }`,
			`'TARGET'`,
		],
		[
			'a default arm without satisfies never or assertNever',
			`function f(k) { switch (k) { case 'a': return 1; default: return 'TARGET' } }`,
			`'TARGET'`,
		],
		[
			'a case arm of a switch that has an exhaustive default',
			`function f(k) { switch (k) { case 'a': return 'TARGET'; default: { k satisfies never; return 1 } } }`,
			`'TARGET'`,
		],
		['a call to an Error-like name without new', `const e = parseError('TARGET')`, `'TARGET'`],
		['a call to a name not in errorFactories', `const e = createOtherError('TARGET')`, `'TARGET'`],
		[
			'a string compared before a throw, in a function',
			`function f(kind) { if (kind === 'TARGET') throw new Error('x') }`,
			`kind === 'TARGET'`,
		],
		[
			'the string compared before a throw, in a function',
			`function f(kind) { if (kind === 'TARGET') throw new Error('x') }`,
			`'TARGET'`,
		],
		[
			'a comparison inside an error construction',
			`const e = new SclError({ code: a > b ? 'x' : 'y' })`,
			`a > b`,
		],
		[
			'a comparison inside a throw',
			`function f(a, b) { throw new SclError({ code: a > b ? 'x' : 'y' }) }`,
			`a > b`,
		],
		[
			'a comparison in the argument of an error factory',
			`const e = createSclError({ detail: 'd', count: x.length > 0 })`,
			`x.length > 0`,
		],
		[
			'a string argument of an error factory call',
			`const e = createSclError('TARGET')`,
			`'TARGET'`,
		],
		[
			'the first argument of a factory (an assertion code)',
			`const e = createSclError('ASSERTION_FAILED', { detail: 'd' })`,
			`'ASSERTION_FAILED'`,
		],
		[
			'a code of an error factory call',
			`const e = createSclError({ code: 'TARGET', detail: 'd' })`,
			`'TARGET'`,
		],
		[
			'a meta string of an error factory call',
			`const e = createSclError({ code: 'a', meta: { tagName: 'LNode' } })`,
			`'LNode'`,
		],
		[
			'a code of new <Name>Error with an options object',
			`const e = new SclError({ code: 'TARGET', detail: 'd' })`,
			`'TARGET'`,
		],
		[
			'a string argument of a call in a throw',
			`function f() { throw build('TARGET') }`,
			`'TARGET'`,
		],
		[
			'a template argument of a call in a throw',
			'function f(x) { throw build(`TARGET ${x}`) }',
			'`TARGET ${x}`',
		],
		[
			'a default arm whose assertNever sits in a nested function',
			`function f(k) { switch (k) { case 'a': return 1; default: { const g = () => assertNever(k); return 'TARGET' } } }`,
			`'TARGET'`,
		],
		[
			'a default arm whose satisfies never sits in a nested switch',
			`function f(k, j) { switch (k) { case 'a': return 1; default: { switch (j) { case 1: break; default: j satisfies never }; return 'TARGET' } } }`,
			`'TARGET'`,
		],
		['a string in a catch-all log', `log('TARGET')`, `'TARGET'`],
		[
			'a string argument of new on a non-error class',
			`const m = new Map([['TARGET', 1]])`,
			`'TARGET'`,
		],
	])('%s', (_label, code, marker) => {
		expect(
			chainOf({ code, marker }).some(
				(path) => ignoreReason({ path, errorFactories: ERROR_FACTORIES }) !== undefined,
			),
		).toBe(false)
	})
})

describe('strykerPlugins', () => {
	it('two Ignore factory plugins, named for the two rules', () => {
		expect(strykerPlugins.map(({ kind, name }) => ({ kind, name }))).toEqual([
			{ kind: 'Ignore', name: 'dialecte-error-text' },
			{ kind: 'Ignore', name: 'dialecte-exhaustive-default' },
		])
	})

	const ERROR_FACTORY_CODE = `const e = makeFailure({ detail: 'TARGET' })`
	const DEFAULT_ARM_CODE = `function f(k) { switch (k) { case 'a': return 1; default: { k satisfies never; return 'TARGET' } } }`

	function reasonsOf(params: { index: number; code: string; errorFactories: string[] }) {
		const { index, code, errorFactories } = params
		return allPaths(code).flatMap(
			(path) =>
				strykerPlugins[index]
					?.factory({ dialecteMutation: { errorFactories } })
					.shouldIgnore(path as never) ?? [],
		)
	}

	it('the module exports the validation schema of the dialecteMutation option', () => {
		expect(strykerValidationSchema).toMatchObject({
			properties: {
				dialecteMutation: {
					type: 'object',
					properties: { errorFactories: { type: 'array', items: { type: 'string' } } },
				},
			},
		})
	})

	it('each factory asks Stryker for the options', () => {
		expect(strykerPlugins.map(({ factory }) => factory.inject)).toEqual([['options'], ['options']])
	})

	it('error-text: skips a call to a factory named only in the injected options', () => {
		expect(
			reasonsOf({ index: 0, code: ERROR_FACTORY_CODE, errorFactories: ['makeFailure'] }),
		).toContainEqual(expect.stringMatching(/\S/))
		expect(reasonsOf({ index: 0, code: ERROR_FACTORY_CODE, errorFactories: [] })).toEqual([])
	})

	it('exhaustive-default: skips the default arm, not an error text; error-text does not skip the arm', () => {
		expect(
			reasonsOf({ index: 0, code: DEFAULT_ARM_CODE, errorFactories: ['makeFailure'] }),
		).toEqual([])
		expect(reasonsOf({ index: 1, code: DEFAULT_ARM_CODE, errorFactories: [] })).toContainEqual(
			expect.stringMatching(/\S/),
		)
		expect(
			reasonsOf({
				index: 1,
				code: `function f() { throw new Error('TARGET') }`,
				errorFactories: ['makeFailure'],
			}),
		).toEqual([])
		expect(
			reasonsOf({ index: 1, code: ERROR_FACTORY_CODE, errorFactories: ['makeFailure'] }),
		).toEqual([])
	})
})
