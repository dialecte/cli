/** The race of two `lot start` (case 8) by the step functions in a forced order, and the hard-link probe (D6). */
import { linkSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../test/brief-workspace.ts'
import { entriesOf, recordOf } from '../../test/lot-start-workspace.ts'
import { INJECTED_LINK_MESSAGE, LINK_REFUSAL_CODES } from '../../test/lot-start.constants.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { transitionOf } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { probeHardLinks, recheckOverlap } from './lot-start.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StoreEntry } from '../lib/handover/handover.types.ts'
import type { Transition } from '../lib/store/store.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

type Racer = 'A' | 'B'

const RACER_NAMES: Record<Racer, string> = { A: '0001-repo-first', B: '0002-repo-second' }

const SHARED_SCOPE = ['src/dataflow/']

type RaceStep =
	| { step: 'publish'; racer: Racer }
	| { step: 'recheck'; racer: Racer; overlapsWith: Racer | undefined }

type RaceRow = {
	title: string
	steps: RaceStep[]
	/** The racers whose lot ends `failed (overlap)`; the others keep their start as last transition. */
	failed: Racer[]
}

const RACE_ROWS: RaceRow[] = [
	{
		title: 'order 1: A publishes, B publishes, A re-checks, B re-checks',
		steps: [
			{ step: 'publish', racer: 'A' },
			{ step: 'publish', racer: 'B' },
			{ step: 'recheck', racer: 'A', overlapsWith: 'B' },
			{ step: 'recheck', racer: 'B', overlapsWith: undefined },
		],
		failed: ['A'],
	},
	{
		title: 'order 2: A publishes, A re-checks, B publishes, B re-checks',
		steps: [
			{ step: 'publish', racer: 'A' },
			{ step: 'recheck', racer: 'A', overlapsWith: undefined },
			{ step: 'publish', racer: 'B' },
			{ step: 'recheck', racer: 'B', overlapsWith: 'A' },
		],
		failed: ['B'],
	},
]

/** The last transition of a lot folder, read from its files. */
function lastTransitionOf(lotFolder: string): unknown {
	const names = entriesOf(join(lotFolder, 'transitions'))
	return recordOf({ folder: lotFolder, name: `transitions/${names.at(-1)}` })
}

describe(
	'case 8: two overlapping starts, "publish, then re-check" in both orders',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of RACE_ROWS)
			it(`${row.title} -> never both go on; the loser is failed (overlap) before any worktree`, () => {
				const workspace = createBriefWorkspace()

				for (const step of row.steps)
					if (step.step === 'publish')
						writeStoreLot({ workspace, name: RACER_NAMES[step.racer], scope: SHARED_SCOPE })
					else
						expect(
							recheckOverlap({
								lotFolder: join(workspace.store, RACER_NAMES[step.racer]),
								now: RECHECK_NOW,
								caseInsensitive: false,
							}),
						).toBe(step.overlapsWith === undefined ? undefined : RACER_NAMES[step.overlapsWith])
				for (const racer of ['A', 'B'] as const) {
					const other = racer === 'A' ? 'B' : 'A'
					expect(lastTransitionOf(join(workspace.store, RACER_NAMES[racer]))).toMatchObject(
						row.failed.includes(racer)
							? {
									seq: 2,
									at: RECHECK_NOW.toISOString(),
									lot: RACER_NAMES[racer],
									position: { step: 1, of: 3, station: null, round: null },
									state: 'failed',
									cause: {
										kind: 'overlap',
										by: 'engine',
										reason: `overlap with ${RACER_NAMES[other]}, started at the same time`,
									},
								}
							: { seq: 1, state: 'working', cause: { kind: 'start' } },
					)
				}
				expect(entriesOf(join(workspace.workspace, '.worktrees'))).toEqual([])
			})
	},
)

const RECHECK_NOW = new Date('2026-11-08T13:00:00.000Z')

type NeighbourRow = {
	title: string
	neighbour: {
		simulated?: boolean
		later?: Transition[]
		registry?: StoreEntry['state']
	}
	/** Whether the re-check names the neighbour (it is open and real, D12). */
	overlaps: boolean
}

const NEIGHBOUR_NAME = '0002-repo-neighbour'

const NEIGHBOUR_ROWS: NeighbourRow[] = [
	{ title: 'a working lot', neighbour: {}, overlaps: true },
	{
		title: 'a lot failed with cause fail (it may have made a worktree)',
		neighbour: { later: [transitionOf({ seq: 2, state: 'failed', kind: 'fail' })] },
		overlaps: true,
	},
	{
		title: 'a lot failed with cause overlap',
		neighbour: { later: [transitionOf({ seq: 2, state: 'failed', kind: 'overlap' })] },
		overlaps: false,
	},
	{ title: 'a committed lot', neighbour: { registry: 'committed' }, overlaps: false },
	{
		title: 'a canceled lot',
		neighbour: { later: [transitionOf({ seq: 2, state: 'canceled', kind: 'stop' })] },
		overlaps: false,
	},
	{ title: 'a simulated lot', neighbour: { simulated: true }, overlaps: false },
]

describe('recheckOverlap against the neighbours of D12', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of NEIGHBOUR_ROWS)
		it(`${row.title} on the same scope -> ${row.overlaps ? 'named' : 'ignored'}`, () => {
			const workspace = createBriefWorkspace()
			writeStoreLot({ workspace, name: NEIGHBOUR_NAME, scope: SHARED_SCOPE, ...row.neighbour })
			writeStoreLot({ workspace, name: RACER_NAMES.A, scope: SHARED_SCOPE })

			expect(
				recheckOverlap({
					lotFolder: join(workspace.store, RACER_NAMES.A),
					caseInsensitive: false,
					now: RECHECK_NOW,
				}),
			).toBe(row.overlaps ? NEIGHBOUR_NAME : undefined)
		})
})

describe('probeHardLinks (D6)', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a file system that links -> undefined, one link made inside the folder, both files removed', () => {
		const folder = temporaryFolder('dialecte-probe-')
		const calls: string[][] = []

		expect(
			probeHardLinks({
				folder,
				link: function recordLink(existingPath, newPath) {
					calls.push([existingPath, newPath])
					linkSync(existingPath, newPath)
				},
			}),
		).toBeUndefined()
		expect(calls).toHaveLength(1)
		expect(
			calls
				.flat()
				.every((path) => path.startsWith(folder) || path.startsWith(realpathSync(folder))),
		).toBe(true)
		expect(entriesOf(folder)).toEqual([])
	})

	for (const code of LINK_REFUSAL_CODES)
		it(`link failing with ${code} -> the reason, holding the message, nothing left in the folder`, () => {
			const folder = temporaryFolder('dialecte-probe-')

			expect(
				probeHardLinks({
					folder,
					link: function refuse() {
						throw Object.assign(new Error(INJECTED_LINK_MESSAGE), { code })
					},
				}),
			).toEqual(expect.stringContaining(INJECTED_LINK_MESSAGE))
			expect(entriesOf(folder)).toEqual([])
		})
})
