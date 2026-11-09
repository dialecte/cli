import { existsSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { RELATIVE_REPOSITORY, VALID_BRIEF } from '../../../test/brief-workspace.constants.ts'
import { briefWith, refusalKeysOf } from '../../../test/brief-workspace.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { checkBriefFields, probeCaseInsensitive } from './brief.ts'

import { describe, expect, it } from 'vitest'

type FieldRow = {
	name: string
	overrides: Record<string, unknown>
	/** `<rule>:<field>` of every refusal; the exact set unless `partial`. */
	refused: string[]
	partial?: boolean
}

const STEP = VALID_BRIEF.steps as Record<string, unknown>[]
const GOOD_STEP = STEP[0]

/** A brief whose first step carries `changes`. */
function withStep(changes: Record<string, unknown>): Record<string, unknown> {
	return { steps: [{ ...GOOD_STEP, ...changes }] }
}

/** A brief with these behaviours in its one step. */
function withBehaviours(behaviours: unknown): Record<string, unknown> {
	return withStep({ behaviours })
}

/** `count` behaviours, each of the right form. */
function behavioursOf(count: number): string[] {
	return Array.from({ length: count }, (_, index) => `case ${index} -> outcome ${index}`)
}

/** A brief whose scope and one lot are these. */
function withScopeAndLots(params: {
	scope: unknown
	paths: unknown
	message?: unknown
}): Record<string, unknown> {
	return {
		scope: params.scope,
		lots: [{ paths: params.paths, message: params.message ?? 'feat: a lot' }],
	}
}

const FIELD_ROWS: FieldRow[] = [
	{ name: 'the valid brief', overrides: {}, refused: [] },
	// shape: unknown keys, case 1
	{
		name: 'a misspelt `scopes` for `scope`',
		overrides: { scope: undefined, scopes: ['src/dataflow/'] },
		refused: ['shape:scope', 'shape:scopes'],
	},
	{
		name: 'an unknown key beside the scope',
		overrides: { scopes: ['src/'] },
		refused: ['shape:scopes'],
	},
	// shape: each field
	{ name: 'schema 2', overrides: { schema: 2 }, refused: ['shape:schema'] },
	{ name: 'schema as a string', overrides: { schema: '1' }, refused: ['shape:schema'] },
	{ name: 'schema absent', overrides: { schema: undefined }, refused: ['shape:schema'] },
	{ name: 'feature absent', overrides: { feature: undefined }, refused: ['shape:feature'] },
	{ name: 'feature a number', overrides: { feature: 5 }, refused: ['shape:feature'] },
	{ name: 'feature in capitals', overrides: { feature: 'Dataflow' }, refused: ['shape:feature'] },
	{
		name: 'feature with a leading dash',
		overrides: { feature: '-flow' },
		refused: ['shape:feature'],
	},
	{
		name: 'feature with an underscore',
		overrides: { feature: 'data_flow' },
		refused: ['shape:feature'],
	},
	{ name: 'feature empty', overrides: { feature: '' }, refused: ['shape:feature'] },
	{ name: 'feature of 60 characters', overrides: { feature: 'a'.repeat(60) }, refused: [] },
	{
		name: 'feature of 61 characters',
		overrides: { feature: 'a'.repeat(61) },
		refused: ['shape:feature'],
	},
	{ name: 'feature starting with a digit', overrides: { feature: '3d-flow' }, refused: [] },
	{
		name: 'repository absent',
		overrides: { repository: undefined },
		refused: ['shape:repository'],
	},
	{ name: 'repository a number', overrides: { repository: 5 }, refused: ['shape:repository'] },
	{ name: 'branch absent', overrides: { branch: undefined }, refused: ['shape:branch'] },
	{ name: 'branch a number', overrides: { branch: 5 }, refused: ['shape:branch'] },
	{ name: 'base absent', overrides: { base: undefined }, refused: ['shape:base'] },
	{ name: 'base a number', overrides: { base: 5 }, refused: ['shape:base'] },
	{ name: 'plan absent', overrides: { plan: undefined }, refused: ['shape:plan'] },
	{ name: 'plan a number', overrides: { plan: 5 }, refused: ['shape:plan'] },
	{ name: 'goal absent', overrides: { goal: undefined }, refused: ['shape:goal'] },
	{ name: 'goal on two lines', overrides: { goal: 'one\ntwo' }, refused: ['shape:goal'] },
	{ name: 'goal of 200 characters', overrides: { goal: 'g'.repeat(200) }, refused: [] },
	{ name: 'goal of 201 characters', overrides: { goal: 'g'.repeat(201) }, refused: ['shape:goal'] },
	{ name: 'scope absent', overrides: { scope: undefined }, refused: ['shape:scope'] },
	{ name: 'scope not an array', overrides: { scope: 'src/' }, refused: ['shape:scope'] },
	{
		name: 'scope holding a number',
		overrides: withScopeAndLots({ scope: ['src/a', 5], paths: ['src/a'] }),
		refused: ['shape:scope'],
		partial: true,
	},
	{ name: 'steps absent', overrides: { steps: undefined }, refused: ['shape:steps'] },
	{ name: 'steps not an array', overrides: { steps: 'one' }, refused: ['shape:steps'] },
	{ name: 'a step that is not an object', overrides: { steps: ['one'] }, refused: ['shape:steps'] },
	{
		name: 'step title absent',
		overrides: withStep({ title: undefined }),
		refused: ['shape:steps'],
	},
	{
		name: 'step title on two lines',
		overrides: withStep({ title: 'a\nb' }),
		refused: ['shape:steps'],
	},
	{ name: 'step spec absent', overrides: withStep({ spec: undefined }), refused: ['shape:steps'] },
	{
		name: 'step behaviours absent',
		overrides: withBehaviours(undefined),
		refused: ['shape:steps'],
	},
	{
		name: 'step behaviours not an array',
		overrides: withBehaviours('a -> b'),
		refused: ['shape:steps'],
	},
	{ name: 'lots absent', overrides: { lots: undefined }, refused: ['shape:lots'] },
	{ name: 'lots not an array', overrides: { lots: 'one' }, refused: ['shape:lots'] },
	{
		name: 'lot message absent',
		overrides: { scope: ['src/a'], lots: [{ paths: ['src/a'] }] },
		refused: ['shape:lots'],
	},
	{
		name: 'lot message on two lines',
		overrides: withScopeAndLots({ scope: ['src/a'], paths: ['src/a'], message: 'a\nb' }),
		refused: ['shape:lots'],
	},
	{
		name: 'lot paths not an array',
		overrides: withScopeAndLots({ scope: ['src/a'], paths: 'src/a' }),
		refused: ['shape:lots'],
	},
	// effort
	{ name: 'effort low', overrides: { effort: 'low' }, refused: [] },
	{ name: 'effort medium', overrides: { effort: 'medium' }, refused: [] },
	{ name: 'effort high', overrides: { effort: 'high' }, refused: [] },
	{ name: 'effort absent', overrides: { effort: undefined }, refused: [] },
	{ name: 'effort extreme', overrides: { effort: 'extreme' }, refused: ['shape:effort'] },
	{ name: 'effort a number', overrides: { effort: 3 }, refused: ['shape:effort'] },
	// behaviours: count and form
	{ name: '0 behaviours', overrides: withBehaviours([]), refused: ['behaviour:steps'] },
	{ name: '1 behaviour', overrides: withBehaviours(behavioursOf(1)), refused: [] },
	{ name: '6 behaviours', overrides: withBehaviours(behavioursOf(6)), refused: [] },
	{
		name: '7 behaviours',
		overrides: withBehaviours(behavioursOf(7)),
		refused: ['behaviour:steps'],
	},
	{
		name: 'a behaviour without the arrow',
		overrides: withBehaviours(['a data set with no subscriber']),
		refused: ['behaviour:steps'],
	},
	{
		name: 'a behaviour with two arrows',
		overrides: withBehaviours(['a -> b -> c']),
		refused: ['behaviour:steps'],
	},
	{
		name: 'a behaviour with nothing before the arrow',
		overrides: withBehaviours([' -> an outcome']),
		refused: ['behaviour:steps'],
	},
	{
		name: 'a behaviour with nothing after the arrow',
		overrides: withBehaviours(['a state -> ']),
		refused: ['behaviour:steps'],
	},
	{
		name: 'a behaviour whose arrow has no spaces',
		overrides: withBehaviours(['a state->an outcome']),
		refused: ['behaviour:steps'],
	},
	// non-string items, empty values, empty arrays
	{ name: 'a non-string behaviour', overrides: withBehaviours([5]), refused: ['shape:steps'] },
	{
		name: 'a non-string lot path',
		overrides: withScopeAndLots({ scope: ['src/a'], paths: [5] }),
		refused: ['shape:lots'],
	},
	{ name: 'a non-string spec', overrides: withStep({ spec: 5 }), refused: ['shape:steps'] },
	{ name: 'goal empty', overrides: { goal: '' }, refused: ['shape:goal'] },
	{ name: 'steps empty', overrides: { steps: [] }, refused: ['shape:steps'] },
	{ name: 'scope empty', overrides: { scope: [] }, refused: ['shape:scope'] },
	{ name: 'lots empty', overrides: { lots: [] }, refused: ['shape:lots'] },
	{
		name: 'lot paths empty',
		overrides: withScopeAndLots({ scope: ['src/a'], paths: [] }),
		refused: ['shape:lots'],
	},
	// a glob in a lot path is a shape fault
	...['src/a/*.ts', 'src/a/?x', 'src/a/{b,c}', 'src/a/[bc]', 'src/a/**'].map(
		function globPathRow(path): FieldRow {
			return {
				name: `lot path ${path} holds a glob`,
				overrides: withScopeAndLots({ scope: ['src/a'], paths: [path] }),
				refused: ['shape:lots'],
			}
		},
	),
	// scope entries, cases 3 and 61: one fault, one refusal
	...['../core/src', '/abs', '.git/hooks', './.git/hooks', '.dialecte/', '**', '/'].map(
		function scopeFaultRow(entry): FieldRow {
			return {
				name: `scope entry ${entry}`,
				overrides: { scope: ['src/dataflow/', entry] },
				refused: ['scope:scope'],
			}
		},
	),
	// lots: inside the scope, covering it, case 4
	{
		name: 'a lot path outside the scope',
		overrides: withScopeAndLots({ scope: ['src/a'], paths: ['src/a', 'src/z'] }),
		refused: ['lots-outside-scope:lots'],
	},
	{
		name: 'a lot path wider than the scope entry',
		overrides: withScopeAndLots({ scope: ['src/a', 'src/b'], paths: ['src', 'src/a', 'src/b'] }),
		refused: ['lots-outside-scope:lots'],
	},
	{
		name: 'a lot path that only shares a string prefix with the scope entry is outside it, and covers nothing',
		overrides: withScopeAndLots({ scope: ['src/a'], paths: ['src/ab'] }),
		refused: ['lots-outside-scope:lots', 'scope-not-covered:scope'],
	},
	{
		name: 'scope lib/ with the lot path lib-other/x',
		overrides: withScopeAndLots({ scope: ['lib/'], paths: ['lib-other/x'] }),
		refused: ['lots-outside-scope:lots', 'scope-not-covered:scope'],
	},
	{
		name: 'scope lib/ with the lot path libx',
		overrides: withScopeAndLots({ scope: ['lib/'], paths: ['libx'] }),
		refused: ['lots-outside-scope:lots', 'scope-not-covered:scope'],
	},
	{
		name: 'a glob scope entry cut after a slash with the lot paths src/a and srcx: srcx is outside',
		overrides: withScopeAndLots({
			scope: ['src/a', 'src/**/*.test.ts'],
			paths: ['src/a', 'srcx'],
		}),
		refused: ['lots-outside-scope:lots'],
	},
	{
		name: 'a lot path above the repository',
		overrides: withScopeAndLots({ scope: ['src/a'], paths: ['src/a', '../x'] }),
		refused: ['lots-outside-scope:lots'],
	},
	{
		name: 'an absolute lot path',
		overrides: withScopeAndLots({ scope: ['src/a'], paths: ['src/a', '/abs'] }),
		refused: ['lots-outside-scope:lots'],
	},
	{
		name: 'a lot path deeper than its scope entry',
		overrides: withScopeAndLots({ scope: ['src/a'], paths: ['src/a/deep/x.ts'] }),
		refused: [],
	},
	{
		name: 'a lot path spelt with ./ and a trailing /',
		overrides: withScopeAndLots({ scope: ['src/a'], paths: ['./src//a/'] }),
		refused: [],
	},
	{
		name: 'a scope entry no lot covers',
		overrides: withScopeAndLots({ scope: ['src/a', 'src/b'], paths: ['src/a'] }),
		refused: ['scope-not-covered:scope'],
	},
	{
		name: 'a glob scope entry no lot covers',
		overrides: withScopeAndLots({ scope: ['src/a', 'lib/**/*.ts'], paths: ['src/a'] }),
		refused: ['scope-not-covered:scope'],
	},
	{
		name: 'a glob scope entry covered by a lot path that is a prefix of its literal part',
		overrides: withScopeAndLots({
			scope: ['src/dataflow/', 'src/dataflow/**/*.test.ts'],
			paths: ['src/dataflow'],
		}),
		refused: [],
	},
	{
		name: 'a lot path under a glob scope entry',
		overrides: withScopeAndLots({
			scope: ['src/**/*.test.ts'],
			paths: ['src/dataflow/a.test.ts'],
		}),
		refused: [],
	},
	// five faults, case 2
	{
		name: 'five faults in five fields',
		overrides: {
			feature: 'NOT OK',
			goal: 'two\nlines',
			steps: [{ ...GOOD_STEP, behaviours: [] }],
			scope: ['src/dataflow/', '/abs'],
			lots: [{ paths: ['src/dataflow/', 'lib/x'], message: 'feat: x' }],
		},
		refused: [
			'behaviour:steps',
			'lots-outside-scope:lots',
			'scope:scope',
			'shape:feature',
			'shape:goal',
		],
	},
]

describe('checkBriefFields: every refusal of the git-free fields, in one run', () => {
	it.each(FIELD_ROWS)('$name', (row) => {
		const value = briefWith(row.overrides)
		if (row.partial)
			expect(refusalKeysOf(checkBriefFields({ value }).refused)).toEqual(
				expect.arrayContaining(row.refused),
			)
		else expect(refusalKeysOf(checkBriefFields({ value }).refused)).toEqual(row.refused)
	})
})

const NOT_AN_OBJECT: unknown[] = [null, [], 'a brief', 5, true]

describe('checkBriefFields: a value that is not an object', () => {
	it.each(NOT_AN_OBJECT)('%j -> shape', (value) => {
		expect(checkBriefFields({ value }).refused.map((refusal) => refusal.rule)).toContain('shape')
	})
})

describe('checkBriefFields: what a refusal and the parsed brief hold', () => {
	it('a refusal names its field, its rule and what is wrong', () => {
		expect(checkBriefFields({ value: briefWith({ goal: 'one\ntwo' }) })).toEqual({
			refused: [{ field: 'goal', rule: 'shape', detail: expect.stringMatching(/\S/) }],
			brief: undefined,
		})
	})

	it('a valid brief gives its scope and lot paths normalised', () => {
		const value = briefWith({
			scope: ['./src//a/', 'src/b/**/*.test.ts'],
			lots: [{ paths: ['./src//a/', 'src/b/'], message: 'feat: both' }],
		})
		expect(checkBriefFields({ value })).toMatchObject({
			refused: [],
			brief: {
				scope: ['src/a', 'src/b/**/*.test.ts'],
				lots: [{ paths: ['src/a', 'src/b'], message: 'feat: both' }],
			},
		})
	})

	it('a valid brief keeps its other fields as given, the effort undefined when absent', () => {
		expect(checkBriefFields({ value: briefWith({ effort: undefined }) }).brief).toMatchObject({
			schema: 1,
			feature: 'dataflow-subscribe',
			repository: RELATIVE_REPOSITORY,
			branch: 'feat/dataflow-subscribe',
			base: 'main',
			goal: 'One sentence: what the lot delivers.',
			plan: 'plan.md',
			steps: VALID_BRIEF.steps,
			effort: undefined,
		})
	})

	it('the effort is kept when given', () => {
		expect(checkBriefFields({ value: briefWith({ effort: 'high' }) }).brief?.effort).toBe('high')
	})
})

describe(
	'probeCaseInsensitive: the volume of a path, found by statting it with its case swapped',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('agrees with a file system that finds the folder under the other case', () => {
			// the expectation is computed by the same probe (stat with the case swapped): the test can only check
			// that the code agrees with this machine's file system, never what another volume would answer
			// the folder's name holds letters of both cases (`dialecte-case-` and a random suffix)
			const folder = temporaryFolder('dialecte-case-')
			expect(probeCaseInsensitive({ path: folder })).toBe(sameFolderUnderOtherCase(folder))
		})
	},
)

function swapCase(letter: string): string {
	return letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase()
}

/** The folder is found under its own name with the last segment's case swapped, and is the same folder. */
function sameFolderUnderOtherCase(folder: string): boolean {
	const swapped = join(dirname(folder), basename(folder).replace(/./g, swapCase))
	if (swapped === folder || !existsSync(swapped)) return false
	return (
		realpathSync(swapped) === realpathSync(folder) || statSync(swapped).ino === statSync(folder).ino
	)
}
