import {
	briefWith,
	checkArgumentsOf,
	createBriefWorkspace,
	refusalKeysOf,
	writeStoreLot,
} from '../../../test/brief-workspace.ts'
import { questionTransitionOf, transitionOf } from '../../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { checkBrief } from './brief.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../../test/brief-workspace.types.ts'
import type { StoreEntry } from '../handover/handover.types.ts'
import type { CheckBriefResult } from './brief.types.ts'
import type { Transition } from './store.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const LOT_NAME = '0007-repo-open'

/** The brief with this scope and one lot on these paths, checked: its refusals as keys, and their details joined. */
function overlapArgumentsOf(params: {
	workspace: BriefWorkspace
	scope: string[]
	paths: string[]
	caseInsensitive: boolean
}): ReturnType<typeof checkArgumentsOf> {
	return checkArgumentsOf({
		workspace: params.workspace,
		brief: briefWith({
			scope: params.scope,
			lots: [{ paths: params.paths, message: 'feat: x' }],
		}),
		caseInsensitive: params.caseInsensitive,
	})
}

/** The refusals of a check as keys, and their details joined. */
function overlapSummaryOf(result: CheckBriefResult): { keys: string[]; details: string } {
	return {
		keys: refusalKeysOf(result.refused),
		details: result.refused.map((refusal) => refusal.detail).join('\n'),
	}
}

/** What a store holds for the lot of a row: how it ends, beyond its `working` start. */
type LotRow = {
	name: string
	later?: Transition[]
	simulated?: boolean
	registry?: StoreEntry['state']
}

/** The new brief's scope, the open lot's scope, and whether the new brief is refused for overlapping it. */
type OverlapRow = LotRow & {
	scope: string[]
	/** The new brief's one lot's paths: literal; the first scope entry when absent. */
	paths?: string[]
	lotScope: string[]
	overlap: boolean
}

const OVERLAP_ROWS: OverlapRow[] = [
	// an open real lot overlapping -> overlap naming it
	{
		name: 'a working lot on the same directory',
		scope: ['src/dataflow/'],
		lotScope: ['src/dataflow'],
		overlap: true,
	},
	{
		name: 'case 61: ./src/dataflow/ against an open lot’s src/dataflow',
		scope: ['./src/dataflow/'],
		lotScope: ['src/dataflow'],
		overlap: true,
	},
	{
		name: 'a stored lot whose raw scope is ./src/dataflow/ (stored scopes are normalised too)',
		scope: ['src/dataflow'],
		lotScope: ['./src//dataflow/'],
		overlap: true,
	},
	{
		name: 'a glob cut inside a name: src/data* against src/dataflow',
		scope: ['src/data*'],
		paths: ['src/data'],
		lotScope: ['src/dataflow'],
		overlap: true,
	},
	{
		name: 'a parent directory of the lot’s scope',
		scope: ['src'],
		lotScope: ['src/dataflow'],
		overlap: true,
	},
	{
		name: 'a glob scope whose literal part is a prefix of the lot’s',
		scope: ['src/dataflow/**/*.test.ts'],
		paths: ['src/dataflow/x'],
		lotScope: ['src/dataflow/deep'],
		overlap: true,
	},
	{
		name: 'a ready lot',
		scope: ['src/dataflow/'],
		lotScope: ['src/dataflow'],
		later: [transitionOf({ seq: 2, state: 'ready', kind: 'ready' })],
		overlap: true,
	},
	{
		name: 'an input-required lot',
		scope: ['src/dataflow/'],
		lotScope: ['src/dataflow'],
		later: [questionTransitionOf({ seq: 2, number: 1 })],
		overlap: true,
	},
	{
		name: 'case 9: a failed lot that may have made a worktree (cause fail)',
		scope: ['src/dataflow/'],
		lotScope: ['src/dataflow'],
		later: [transitionOf({ seq: 2, state: 'failed', kind: 'fail' })],
		overlap: true,
	},
	// ignored lots
	{
		name: 'case 9: a committed lot',
		scope: ['src/dataflow/'],
		lotScope: ['src/dataflow'],
		registry: 'committed',
		overlap: false,
	},
	{
		name: 'case 9: a canceled lot',
		scope: ['src/dataflow/'],
		lotScope: ['src/dataflow'],
		later: [transitionOf({ seq: 2, state: 'canceled', kind: 'stop' })],
		overlap: false,
	},
	{
		name: 'case 9: an overlap-failed lot (it never made a worktree)',
		scope: ['src/dataflow/'],
		lotScope: ['src/dataflow'],
		later: [transitionOf({ seq: 2, state: 'failed', kind: 'overlap' })],
		overlap: false,
	},
	{
		name: 'case 9: a simulated lot',
		scope: ['src/dataflow/'],
		lotScope: ['src/dataflow'],
		simulated: true,
		overlap: false,
	},
	// disjoint
	{
		name: 'a disjoint directory of an open lot',
		scope: ['src/dataflow/'],
		lotScope: ['src/other'],
		overlap: false,
	},
	{
		name: 'a disjoint glob of an open lot',
		scope: ['src/dataflow/', 'src/dataflow/**/*.test.ts'],
		lotScope: ['lib/**/*.ts'],
		overlap: false,
	},
]

describe(
	'checkBrief: the overlap with the open real lots of the store',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it.each(OVERLAP_ROWS)('$name -> overlap: $overlap', (row) => {
			const workspace = createBriefWorkspace()
			writeStoreLot({
				workspace,
				name: LOT_NAME,
				scope: row.lotScope,
				later: row.later,
				simulated: row.simulated,
				registry: row.registry,
			})
			expect(
				overlapSummaryOf(
					checkBrief(
						overlapArgumentsOf({
							workspace,
							scope: row.scope,
							paths: row.paths ?? [row.scope[0]],
							caseInsensitive: false,
						}),
					),
				),
			).toEqual({
				keys: row.overlap ? ['overlap:scope'] : [],
				details: row.overlap ? expect.stringContaining(LOT_NAME) : '',
			})
		})
	},
)

describe(
	'checkBrief: the overlap with the case-insensitive flag',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it.each([
			{ caseInsensitive: false, overlap: false },
			{ caseInsensitive: true, overlap: true },
		])(
			'src/Dataflow against an open lot’s src/dataflow, insensitive: $caseInsensitive -> overlap: $overlap',
			(row) => {
				const workspace = createBriefWorkspace()
				writeStoreLot({ workspace, name: LOT_NAME, scope: ['src/dataflow'] })
				expect(
					overlapSummaryOf(
						checkBrief(
							overlapArgumentsOf({
								workspace,
								scope: ['src/Dataflow'],
								paths: ['src/Dataflow'],
								caseInsensitive: row.caseInsensitive,
							}),
						),
					).keys,
				).toEqual(row.overlap ? ['overlap:scope'] : [])
			},
		)
	},
)

describe(
	'checkBrief: a refused scope entry is not checked for overlap',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('an open lot on lib/x, a scope of src/dataflow/ and ** -> only scope:scope', () => {
			const workspace = createBriefWorkspace()
			writeStoreLot({ workspace, name: LOT_NAME, scope: ['lib/x'] })
			expect(
				overlapSummaryOf(
					checkBrief(
						overlapArgumentsOf({
							workspace,
							scope: ['src/dataflow/', '**'],
							paths: ['src/dataflow/'],
							caseInsensitive: false,
						}),
					),
				).keys,
			).toEqual(['scope:scope'])
		})
	},
)

describe('checkBrief: the overlap names the lot it meets', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('with two open lots, the one it overlaps is named, the other is not', () => {
		const workspace = createBriefWorkspace()
		writeStoreLot({ workspace, name: '0008-repo-elsewhere', scope: ['lib/x'] })
		writeStoreLot({ workspace, name: LOT_NAME, scope: ['src/dataflow'] })
		expect(
			overlapSummaryOf(
				checkBrief(
					overlapArgumentsOf({
						workspace,
						scope: ['src/dataflow/'],
						paths: ['src/dataflow/'],
						caseInsensitive: false,
					}),
				),
			),
		).toEqual({
			keys: ['overlap:scope'],
			details: expect.stringMatching(/^(?!.*0008-repo-elsewhere)[\s\S]*0007-repo-open/),
		})
	})

	it('a scope that overlaps two open lots names both in its refusals', () => {
		const workspace = createBriefWorkspace()
		writeStoreLot({ workspace, name: '0008-repo-first', scope: ['src/dataflow/a'] })
		writeStoreLot({ workspace, name: LOT_NAME, scope: ['src/dataflow/b'] })
		expect(
			overlapSummaryOf(
				checkBrief(
					overlapArgumentsOf({
						workspace,
						scope: ['src/dataflow/'],
						paths: ['src/dataflow/'],
						caseInsensitive: false,
					}),
				),
			).details,
		).toMatch(/0008-repo-first[\s\S]*0007-repo-open|0007-repo-open[\s\S]*0008-repo-first/)
	})
})
