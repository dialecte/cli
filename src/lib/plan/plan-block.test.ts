import { resolve } from 'node:path'

import { parsePlanBlock } from './plan-block.ts'

import { describe, expect, it } from 'vitest'

import type { PlanFault } from './plan-block.types.ts'

const PLAN_FOLDER = resolve('/work/ws/plans')

/** An entry value as the JSON holds it; a key given as `undefined` is left out. */
function lot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return withoutUndefined({
		id: 'A',
		title: 'a title',
		kind: 'lot',
		scope: { cli: ['src/a/'] },
		match: { branch: 'feat/a' },
		...overrides,
	})
}

/** A spec entry: the one kind that needs no repository, scope or match. */
function specEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return withoutUndefined({ id: 'S', title: 'a spec', kind: 'spec', ...overrides })
}

/** A block value; a key given as `undefined` is left out. */
function blockValue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return withoutUndefined({
		schema: 1,
		repositories: { cli: '../cli', core: '../core' },
		lots: [lot()],
		...overrides,
	})
}

function withoutUndefined(value: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined))
}

/** The `at` of each fault, sorted: what a table row compares. */
function atsOf(faults: readonly PlanFault[]): string[] {
	return faults.map((fault) => fault.at).sort()
}

function detailsOf(faults: readonly PlanFault[]): string {
	return faults.map((fault) => fault.detail).join('\n')
}

const LONG_TITLE = 'a'.repeat(121)

type EntryFaultRow = { name: string; lots: Record<string, unknown>[]; at: string[] }

const ENTRY_FAULT_ROWS: EntryFaultRow[] = [
	{ name: 'a misspelt key (dependOn)', lots: [lot({ dependOn: ['B'] })], at: ['lots[0].dependOn'] },
	{
		name: 'an unknown key in match',
		lots: [lot({ match: { branch: 'feat/a', dependOn: ['x'] } })],
		at: ['lots[0].match.dependOn'],
	},
	{ name: 'an id starting with a dash', lots: [lot({ id: '-a' })], at: ['lots[0].id'] },
	{ name: 'an id with a space', lots: [lot({ id: 'a b' })], at: ['lots[0].id'] },
	{ name: 'an empty id', lots: [lot({ id: '' })], at: ['lots[0].id'] },
	{ name: 'an id of 41 characters', lots: [lot({ id: 'a'.repeat(41) })], at: ['lots[0].id'] },
	{ name: 'a missing id', lots: [lot({ id: undefined })], at: ['lots[0].id'] },
	{
		name: 'a duplicate id',
		lots: [lot({ id: 'A' }), lot({ id: 'A', match: { branch: 'feat/b' } })],
		at: ['lots[1].id'],
	},
	{
		name: 'a group equal to an entry id',
		lots: [lot({ id: 'A', group: 'B' }), lot({ id: 'B', match: { branch: 'feat/b' } })],
		at: ['lots[0].group'],
	},
	{ name: 'a group that is not id-shaped', lots: [lot({ group: 'a b' })], at: ['lots[0].group'] },
	{ name: 'a title on two lines', lots: [lot({ title: 'one\ntwo' })], at: ['lots[0].title'] },
	{ name: 'a title of 121 characters', lots: [lot({ title: LONG_TITLE })], at: ['lots[0].title'] },
	{ name: 'a missing title', lots: [lot({ title: undefined })], at: ['lots[0].title'] },
	{ name: 'an unknown kind', lots: [lot({ kind: 'epic' })], at: ['lots[0].kind'] },
	{ name: 'a missing kind', lots: [lot({ kind: undefined })], at: ['lots[0].kind'] },
	{ name: 'a lot without scope', lots: [lot({ scope: undefined })], at: ['lots[0].scope'] },
	{
		name: 'a fix without scope',
		lots: [lot({ kind: 'fix', scope: undefined })],
		at: ['lots[0].scope'],
	},
	{
		name: 'a spec entry with a scope',
		lots: [specEntry({ scope: { cli: ['src/'] } })],
		at: ['lots[0].scope'],
	},
	{
		name: 'a person entry with a scope',
		lots: [specEntry({ kind: 'person', scope: { cli: ['src/'] } })],
		at: ['lots[0].scope'],
	},
	{ name: 'an empty scope list', lots: [lot({ scope: { cli: [] } })], at: ['lots[0].scope.cli'] },
	{
		name: 'a scope naming an unknown repository',
		lots: [lot({ scope: { zzz: ['src/'] } })],
		at: ['lots[0].scope.zzz'],
	},
	{
		name: 'an absolute scope entry',
		lots: [lot({ scope: { cli: ['/abs/src'] } })],
		at: ['lots[0].scope.cli[0]'],
	},
	{
		name: 'a scope entry with a .. segment',
		lots: [lot({ scope: { cli: ['../core/src'] } })],
		at: ['lots[0].scope.cli[0]'],
	},
	{
		name: 'a scope entry under .git/',
		lots: [lot({ scope: { cli: ['.git/hooks'] } })],
		at: ['lots[0].scope.cli[0]'],
	},
	{
		name: 'a scope entry under .dialecte/',
		lots: [lot({ scope: { cli: ['.dialecte/lot'] } })],
		at: ['lots[0].scope.cli[0]'],
	},
	{
		name: 'a scope entry that is not a string',
		lots: [lot({ scope: { cli: [5] } })],
		at: ['lots[0].scope.cli[0]'],
	},
	{ name: 'an unknown heavy kind', lots: [lot({ heavy: ['gpu'] })], at: ['lots[0].heavy[0]'] },
	{ name: 'heavy that is not a list', lots: [lot({ heavy: 'mutation' })], at: ['lots[0].heavy'] },
	{ name: 'a lot without match', lots: [lot({ match: undefined })], at: ['lots[0].match'] },
	{
		name: 'a fix without match',
		lots: [lot({ kind: 'fix', match: undefined })],
		at: ['lots[0].match'],
	},
	{
		name: 'a match without branch',
		lots: [lot({ match: { handover: '../h' } })],
		at: ['lots[0].match.branch'],
	},
	{
		name: 'a dependsOn naming an unknown id',
		lots: [lot({ dependsOn: ['Z'] })],
		at: ['lots[0].dependsOn[0]'],
	},
	{ name: 'a spec that is not a string', lots: [lot({ spec: 3 })], at: ['lots[0].spec'] },
]

describe('parsePlanBlock: one entry refused, the fault says where', () => {
	it.each(ENTRY_FAULT_ROWS)('$name', ({ lots, at }) => {
		expect(
			atsOf(parsePlanBlock({ value: blockValue({ lots }), planFolder: PLAN_FOLDER }).faults),
		).toEqual(at)
	})
})

type BlockFaultRow = { name: string; overrides: Record<string, unknown>; at: string[] }

const BLOCK_FAULT_ROWS: BlockFaultRow[] = [
	{ name: 'an unknown top-level key', overrides: { bogus: 1 }, at: ['bogus'] },
	{ name: 'schema 2', overrides: { schema: 2 }, at: ['schema'] },
	{ name: 'a missing schema', overrides: { schema: undefined }, at: ['schema'] },
	{ name: 'missing repositories', overrides: { repositories: undefined }, at: ['repositories'] },
	{
		name: 'a repository path that is not a string',
		overrides: { repositories: { cli: 3 } },
		at: ['repositories.cli'],
	},
	{ name: 'missing lots', overrides: { lots: undefined }, at: ['lots'] },
	{ name: 'lots that is not a list', overrides: { lots: {} }, at: ['lots'] },
	{
		name: 'a shared path with a glob',
		overrides: { shared: { cli: ['src/*.ts'] } },
		at: ['shared.cli[0]'],
	},
	{
		name: 'shared naming an unknown repository',
		overrides: { shared: { zzz: ['CHANGELOG.md'] } },
		at: ['shared.zzz'],
	},
	{
		name: 'shared that is not a list',
		overrides: { shared: { cli: 'CHANGELOG.md' } },
		at: ['shared.cli'],
	},
]

describe('parsePlanBlock: the block itself refused', () => {
	it.each(BLOCK_FAULT_ROWS)('$name', ({ overrides, at }) => {
		const value = blockValue({ lots: [specEntry()], ...overrides })
		expect(atsOf(parsePlanBlock({ value, planFolder: PLAN_FOLDER }).faults)).toEqual(at)
	})

	it('a value that is not an object -> one fault at block', () => {
		expect(atsOf(parsePlanBlock({ value: null, planFolder: PLAN_FOLDER }).faults)).toEqual([
			'block',
		])
	})

	it('a refused block gives no block', () => {
		expect(
			parsePlanBlock({ value: blockValue({ bogus: 1 }), planFolder: PLAN_FOLDER }).block,
		).toBeUndefined()
	})
})

describe('parsePlanBlock: every fault is listed at once', () => {
	it('five faults in four places -> five faults', () => {
		const value = blockValue({
			bogus: 1,
			lots: [
				lot({ id: '-bad', dependOn: [] }),
				lot({
					id: 'B',
					match: { branch: 'feat/b' },
					scope: { cli: ['/abs'] },
					dependsOn: ['Z'],
				}),
			],
		})
		expect(atsOf(parsePlanBlock({ value, planFolder: PLAN_FOLDER }).faults)).toEqual([
			'bogus',
			'lots[0].dependOn',
			'lots[0].id',
			'lots[1].dependsOn[0]',
			'lots[1].scope.cli[0]',
		])
	})
})

type CrossRow = { name: string; lots: Record<string, unknown>[]; at: string[]; detail?: RegExp }

const HANDOVER_A = '../h/A'
const HANDOVER_B = '../h/B'

/** An entry on its own branch `feat/<id>`. */
function own(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
	return lot({ id, match: { branch: `feat/${id.toLowerCase()}` }, ...extra })
}

/** An entry on the shared branch `feat/x`, with its handover. */
function onShared(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
	return lot({ id, match: { branch: 'feat/x', handover: `../h/${id}` }, ...extra })
}

const CROSS_ROWS: CrossRow[] = [
	{
		name: 'a 3-cycle -> one fault naming all three',
		lots: [
			own('A', { dependsOn: ['B'] }),
			own('B', { dependsOn: ['C'] }),
			own('C', { dependsOn: ['A'] }),
		],
		at: ['block'],
		detail: /A -> B -> C -> A/,
	},
	{
		name: 'a self-dependency -> one fault naming the cycle',
		lots: [own('A', { dependsOn: ['A'] })],
		at: ['block'],
		detail: /A -> A/,
	},
	{
		name: 'a cycle through a group -> one fault',
		lots: [own('A', { group: 'G', dependsOn: ['B'] }), own('B', { dependsOn: ['G'] })],
		at: ['block'],
		detail: /A -> B -> A/,
	},
	{
		name: 'a shared branch ordered only transitively (C -> B -> A, B elsewhere)',
		lots: [onShared('A'), own('B', { dependsOn: ['A'] }), onShared('C', { dependsOn: ['B'] })],
		at: [],
	},
	{
		name: 'a shared branch ordered through a group',
		lots: [onShared('A', { group: 'G' }), onShared('C', { dependsOn: ['G'] })],
		at: [],
	},
	{
		name: 'two entries on one branch, both after a third, not ordered to each other',
		lots: [own('A'), onShared('B', { dependsOn: ['A'] }), onShared('C', { dependsOn: ['A'] })],
		at: ['block'],
		detail: /shared branch without order/,
	},
	{
		name: 'an id of exactly 40 characters is accepted',
		lots: [own('a'.repeat(40))],
		at: [],
	},
	{ name: 'an id with a dot and a dash is accepted', lots: [own('L0.a-1')], at: [] },
	{
		name: 'a title of exactly 120 characters is accepted',
		lots: [own('A', { title: 'a'.repeat(120) })],
		at: [],
	},
	{ name: 'heavy browser is accepted', lots: [own('A', { heavy: ['browser'] })], at: [] },
	{
		name: 'a glob in a lot scope is accepted',
		lots: [own('A', { scope: { cli: ['src/**/*.test.ts'] } })],
		at: [],
	},
	{
		name: 'a dependsOn cycle -> one fault naming the cycle',
		lots: [
			lot({ id: 'A', dependsOn: ['B'] }),
			lot({ id: 'B', dependsOn: ['A'], match: { branch: 'feat/b' } }),
		],
		at: ['block'],
		detail: /A -> B -> A/,
	},
	{
		name: 'two entries on one branch with no order between them',
		lots: [
			lot({ id: 'A', match: { branch: 'feat/x', handover: HANDOVER_A } }),
			lot({ id: 'B', match: { branch: 'feat/x', handover: HANDOVER_B } }),
		],
		at: ['block'],
		detail: /shared branch without order/,
	},
	{
		name: 'two ordered entries on one branch, each with its handover',
		lots: [
			lot({ id: 'A', match: { branch: 'feat/x', handover: HANDOVER_A } }),
			lot({ id: 'B', dependsOn: ['A'], match: { branch: 'feat/x', handover: HANDOVER_B } }),
		],
		at: [],
	},
	{
		name: 'two ordered entries on one branch, no handover on either',
		lots: [
			lot({ id: 'A', match: { branch: 'feat/x' } }),
			lot({ id: 'B', dependsOn: ['A'], match: { branch: 'feat/x' } }),
		],
		at: ['lots[0].match.handover', 'lots[1].match.handover'],
	},
	{
		name: 'two entries on two branches, no order needed',
		lots: [lot({ id: 'A' }), lot({ id: 'B', match: { branch: 'feat/b' } })],
		at: [],
	},
	{
		name: 'a dependsOn naming a group',
		lots: [
			lot({ id: 'A', group: 'G' }),
			lot({ id: 'B', dependsOn: ['G'], match: { branch: 'feat/b' } }),
		],
		at: [],
	},
	{
		name: 'a parked entry others depend on',
		lots: [
			lot({ id: 'A', parked: 'the person parked it' }),
			lot({ id: 'B', dependsOn: ['A'], match: { branch: 'feat/b' } }),
		],
		at: [],
	},
	{
		name: 'two entries with the same match.handover: a record realizes one entry',
		lots: [
			own('A', { match: { branch: 'feat/a', handover: HANDOVER_A } }),
			own('B', { match: { branch: 'feat/b', handover: HANDOVER_A } }),
		],
		at: ['lots[1].match.handover'],
		detail: /is the match\.handover of A/,
	},
	{
		name: 'two match.handover spellings of one resolved path are the same',
		lots: [
			own('A', { match: { branch: 'feat/a', handover: HANDOVER_A } }),
			own('B', { match: { branch: 'feat/b', handover: '../h/./A' } }),
		],
		at: ['lots[1].match.handover'],
		detail: /is the match\.handover of A/,
	},
	{
		name: 'two entries with the same match.feature: a record realizes one entry',
		lots: [
			own('A', { match: { branch: 'feat/a', feature: 'shared-feature' } }),
			own('B', { match: { branch: 'feat/b', feature: 'shared-feature' } }),
		],
		at: ['lots[1].match.feature'],
		detail: /is the match\.feature of A/,
	},
]

describe('parsePlanBlock: faults between entries', () => {
	it.each(CROSS_ROWS)('$name', ({ lots, at }) => {
		expect(
			atsOf(parsePlanBlock({ value: blockValue({ lots }), planFolder: PLAN_FOLDER }).faults),
		).toEqual(at)
	})

	it.each(CROSS_ROWS.filter((row) => row.detail !== undefined))(
		'$name: the detail',
		({ lots, detail }) => {
			expect(
				detailsOf(parsePlanBlock({ value: blockValue({ lots }), planFolder: PLAN_FOLDER }).faults),
			).toMatch(detail as RegExp)
		},
	)
})

describe('parsePlanBlock: the block read', () => {
	it('paths resolved against the plan folder, scope normalised, defaults filled', () => {
		const value = blockValue({
			shared: { cli: ['CHANGELOG.md', 'README.md'] },
			lots: [
				lot({
					id: 'L0a1',
					group: 'L0',
					title: 'events and the lot station',
					dependsOn: ['L0-0'],
					spec: '33L0-EVENTS-REPORT.md',
					scope: { cli: ['./src//a/', 'src/b/x.ts'], core: ['.'] },
					heavy: ['mutation', 'release'],
					brief: 'L0a1/brief.json',
					match: { branch: 'feat/events', handover: '../h/L0a1', feature: 'events' },
					parked: 'the person parked it',
				}),
				lot({ id: 'L0-0', group: 'L0', match: { branch: 'feat/events', handover: '../h/L0-0' } }),
			],
		})
		expect(parsePlanBlock({ value, planFolder: PLAN_FOLDER }).block).toEqual({
			schema: 1,
			repositories: { cli: resolve(PLAN_FOLDER, '../cli'), core: resolve(PLAN_FOLDER, '../core') },
			shared: { cli: ['CHANGELOG.md', 'README.md'] },
			lots: [
				{
					id: 'L0a1',
					group: 'L0',
					title: 'events and the lot station',
					kind: 'lot',
					dependsOn: ['L0-0'],
					spec: resolve(PLAN_FOLDER, '33L0-EVENTS-REPORT.md'),
					scope: { cli: ['src/a', 'src/b/x.ts'], core: ['.'] },
					heavy: ['mutation', 'release'],
					brief: resolve(PLAN_FOLDER, 'L0a1/brief.json'),
					match: {
						branch: 'feat/events',
						handover: resolve(PLAN_FOLDER, '../h/L0a1'),
						feature: 'events',
					},
					parked: 'the person parked it',
				},
				{
					id: 'L0-0',
					group: 'L0',
					title: 'a title',
					kind: 'lot',
					dependsOn: [],
					scope: { cli: ['src/a'] },
					heavy: [],
					match: { branch: 'feat/events', handover: resolve(PLAN_FOLDER, '../h/L0-0') },
				},
			],
		})
	})

	it('a spec entry and a person entry need no scope, match or repository', () => {
		const value = blockValue({
			lots: [specEntry({ spec: '33N-PLAN-NEXT.md' }), specEntry({ id: 'K0', kind: 'person' })],
		})
		expect(
			parsePlanBlock({ value, planFolder: PLAN_FOLDER }).block?.lots.map((entry) => entry.kind),
		).toEqual(['spec', 'person'])
	})

	it('"." in a scope is accepted and kept as the whole repository', () => {
		const value = blockValue({ lots: [lot({ scope: { cli: ['.'] } })] })
		expect(parsePlanBlock({ value, planFolder: PLAN_FOLDER }).block?.lots[0].scope).toEqual({
			cli: ['.'],
		})
	})

	it('"." next to other entries is accepted too', () => {
		const value = blockValue({ lots: [lot({ scope: { cli: ['src/a/', '.'] } })] })
		expect(parsePlanBlock({ value, planFolder: PLAN_FOLDER }).faults).toEqual([])
	})
})
