/**
 * Step events of `dialecte mutants run` (33L0 section 4 "Step events", "Which lot", "Heavy steps"; D10, D12): a
 * `mutation` step, heavy, whose whole run holds a marker; its lot comes from the worktree (`lotOfStep`), never from
 * the branch the mutation code files its runs under; its end follows the run file. Stryker never starts: the
 * package's runner is the fake the mutants tests use.
 */
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { isolateStateFolder } from '../../test/lot-handover-workspace.ts'
import { fakeStryker, reportOf, storedRuns } from '../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { commonGitDirOf } from '../../test/scratch-tree.ts'
import { STEP_LOT } from '../../test/step-events-lot.constants.ts'
import { eventsOfStep, markerFilesIn, stepEventsOf } from '../../test/step-events-lot.ts'
import { MUTATION_LOT_BRANCH } from '../../test/step-events-mutation.constants.ts'
import {
	createMutationLot,
	createPlainMutationCheckout,
	markerDocumentsIn,
} from '../../test/step-events-mutation.ts'
import { spyOnWarnings } from '../../test/step-events-tdd.ts'
import { writeEvent } from '../lib/events/write-event.ts'
import { STORE_FOLDER } from '../lib/store/store.constants.ts'
import { runMutants } from './mutants.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { StrykerRunner } from '../lib/mutation/mutation.types.ts'

const ALL_KILLED = reportOf({ mutants: [{ id: '1', status: 'Killed', replacement: 'false' }] })

/** What the spy saw at each `step.start` and `step.end` append: the state of the run file of the worktree's package then. */
const { endsSeen } = vi.hoisted(() => ({
	endsSeen: [] as { kind: unknown; step: unknown; runStates: string[] }[],
}))

vi.mock('node:fs', async (importOriginal) => {
	const { withCapturedStandardError } = await import('../../test/standard-error-capture.ts')
	const actual = await importOriginal<typeof import('node:fs')>()
	return withCapturedStandardError(actual)
})

vi.mock('../lib/events/write-event.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../lib/events/write-event.ts')>()
	return {
		...actual,
		writeEvent: vi.fn((params: Parameters<typeof actual.writeEvent>[0]) => {
			const { event } = params
			if (event.kind === 'step.start' || event.kind === 'step.end')
				endsSeen.push({
					kind: event.kind,
					step: event.step,
					runStates: storedRuns(String(event.worktree)).map((run) => run.state),
				})
			return actual.writeEvent(params)
		}),
	}
})

beforeEach(function clearSpy() {
	endsSeen.length = 0
	vi.mocked(writeEvent).mockClear()
})

afterEach(function restoreEnvironment() {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
})

/** What a runner saw while the run was going: the markers in the state folder and the lot's step kinds. */
type Seen = { markers: Record<string, unknown>[]; kinds: string[] }

/**
 * A runner that looks at the marker folder and the lot's events once, when Stryker would start, then answers as the
 * fake does (every mutant killed).
 */
function watchingRunner(params: {
	root: string
	markerFolder: string
	seen: Seen
	kindsOf: () => string[]
}): StrykerRunner {
	const fake = fakeStryker({ root: params.root, reports: { fast: ALL_KILLED }, calls: [] })
	return async function runWatching(call) {
		params.seen.markers = markerDocumentsIn(params.markerFolder)
		params.seen.kinds = params.kindsOf()
		return fake(call)
	}
}

describe('mutants run in a lot worktree', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a run that reports → one step.start and one step.end of mutation in the lot, heavy, by the cli, paired by run', async () => {
		const lot = createMutationLot()
		const seen: Seen = { markers: [], kinds: [] }

		const result = await runMutants({
			cwd: lot.worktree,
			argv: ['run'],
			dependencies: {
				runStryker: watchingRunner({
					root: lot.worktree,
					markerFolder: lot.markerFolder,
					seen,
					kindsOf: () => stepEventsOf(lot).map((event) => event.kind),
				}),
			},
		})
		const events = eventsOfStep({ lot, step: 'mutation' })

		expect({
			exitCode: result.exitCode,
			kinds: events.map((event) => event.kind),
			lots: events.map((event) => event.lot),
			by: events.map((event) => event.by),
			heavy: events.map((event) => event.heavy),
			paired: events[0]?.run === events[1]?.run && events[0]?.run !== undefined,
			startOnDiskBeforeStryker: seen.kinds,
		}).toEqual({
			exitCode: 0,
			kinds: ['step.start', 'step.end'],
			lots: [STEP_LOT, STEP_LOT],
			by: ['cli', 'cli'],
			heavy: [true, true],
			paired: true,
			startOnDiskBeforeStryker: ['step.start'],
		})
	})

	it('the end → exit 0, a duration, no state hash, no parts; the worktree real path, not a throwaway', async () => {
		const lot = createMutationLot()

		await runMutants({
			cwd: lot.worktree,
			argv: ['run'],
			dependencies: {
				runStryker: fakeStryker({ root: lot.worktree, reports: { fast: ALL_KILLED }, calls: [] }),
			},
		})
		const [start, end] = eventsOfStep({ lot, step: 'mutation' })

		expect({
			sameWorktree: start?.worktree === end?.worktree,
			startPlace: [start?.worktree, start?.throwaway],
			endPlace: [end?.worktree, end?.throwaway],
			exit: end?.exit,
			duration: typeof end?.durationMs,
			stateHash: end?.stateHash,
			parts: end?.parts ?? [],
		}).toEqual({
			sameWorktree: true,
			startPlace: [lot.worktree, false],
			endPlace: [lot.worktree, false],
			exit: 0,
			duration: 'number',
			stateHash: null,
			parts: [],
		})
	})

	it('the whole run holds one marker of the step (lot, repository, worktree, this pid) and it is gone after the run', async () => {
		const lot = createMutationLot()
		const seen: Seen = { markers: [], kinds: [] }

		await runMutants({
			cwd: lot.worktree,
			argv: ['run'],
			dependencies: {
				runStryker: watchingRunner({
					root: lot.worktree,
					markerFolder: lot.markerFolder,
					seen,
					kindsOf: () => [],
				}),
			},
		})

		expect({
			during: seen.markers.map((marker) => ({
				step: marker.step,
				lot: marker.lot,
				worktree: marker.worktree,
				repository: realpathSync(String(marker.repository)),
				pid: marker.pid,
			})),
			after: markerFilesIn(lot.markerFolder),
		}).toEqual({
			during: [
				{
					step: 'mutation',
					lot: STEP_LOT,
					worktree: lot.worktree,
					repository: realpathSync(lot.workspace.repository),
					pid: process.pid,
				},
			],
			after: [],
		})
	})

	it('the lot is the one of the worktree, not the branch the run is filed under → the events carry the lot name while the run file names the branch', async () => {
		const lot = createMutationLot()

		await runMutants({
			cwd: lot.worktree,
			argv: ['run'],
			dependencies: {
				runStryker: fakeStryker({ root: lot.worktree, reports: { fast: ALL_KILLED }, calls: [] }),
			},
		})

		expect({
			eventLots: eventsOfStep({ lot, step: 'mutation' }).map((event) => event.lot),
			runLots: storedRuns(lot.worktree).map((run) => run.lot),
			namedByBranch: stepEventsOf({ eventsFile: lot.namedByBranchEventsFile }),
		}).toEqual({
			eventLots: [STEP_LOT, STEP_LOT],
			runLots: [MUTATION_LOT_BRANCH],
			namedByBranch: [],
		})
	})

	it('the start is appended before the run file exists, the end after the run file is finished (reported)', async () => {
		const lot = createMutationLot()

		await runMutants({
			cwd: lot.worktree,
			argv: ['run'],
			dependencies: {
				runStryker: fakeStryker({ root: lot.worktree, reports: { fast: ALL_KILLED }, calls: [] }),
			},
		})

		expect(endsSeen).toEqual([
			{ kind: 'step.start', step: 'mutation', runStates: [] },
			{ kind: 'step.end', step: 'mutation', runStates: ['reported'] },
		])
	})
})

/** The ways a run that started fails: Stryker exits non-zero, or throws. */
const FAILING_RUNS = [
	{ title: 'Stryker exits 1', failure: { exitCode: 1 } },
	{ title: 'Stryker throws', failure: { throws: true } },
] as const

describe('mutants run that fails after its start', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	for (const row of FAILING_RUNS)
		it(`${row.title} → the step ran: its start and its end with a non-zero exit, the marker removed, nothing in the lot named by the branch`, async () => {
			const lot = createMutationLot()

			const result = await runMutants({
				cwd: lot.worktree,
				argv: ['run'],
				dependencies: {
					runStryker: fakeStryker({ root: lot.worktree, reports: {}, calls: [], ...row.failure }),
				},
			})
			const events = eventsOfStep({ lot, step: 'mutation' })

			expect({
				nonZero: result.exitCode !== 0,
				kinds: events.map((event) => event.kind),
				endExitNonZero: typeof events[1]?.exit === 'number' && events[1].exit !== 0,
				markers: markerFilesIn(lot.markerFolder),
				named: stepEventsOf({ eventsFile: lot.namedByBranchEventsFile }),
			}).toEqual({
				nonZero: true,
				kinds: ['step.start', 'step.end'],
				endExitNonZero: true,
				markers: [],
				named: [],
			})
		})
})

describe('mutants run refused before it runs', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a package declaring no mutation scope → exit 1, no step ran: not one event written, no marker', async () => {
		const lot = createMutationLot({ declared: false })
		vi.mocked(writeEvent).mockClear()

		const result = await runMutants({
			cwd: lot.worktree,
			argv: ['run'],
			dependencies: {
				runStryker: fakeStryker({ root: lot.worktree, reports: {}, calls: [] }),
			},
		})

		expect({
			exitCode: result.exitCode,
			writes: vi.mocked(writeEvent).mock.calls.length,
			events: stepEventsOf(lot),
			markers: markerFilesIn(lot.markerFolder),
		}).toEqual({ exitCode: 1, writes: 0, events: [], markers: [] })
	})
})

describe('mutants run in a plain checkout', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('outside any lot → the same result, no event and no store folder, but the machine-wide marker (lot null) while it runs', async () => {
		// the suite's state folder is shared by every file of the worker: this case lists markers in its own
		isolateStateFolder()
		const root = createPlainMutationCheckout()
		const stateFolder = join(process.env.XDG_STATE_HOME ?? '', 'dialecte', 'heavy')
		const seen: Seen = { markers: [], kinds: [] }
		const warnings = spyOnWarnings()
		vi.mocked(writeEvent).mockClear()

		const result = await runMutants({
			cwd: root,
			argv: ['run'],
			dependencies: {
				runStryker: watchingRunner({ root, markerFolder: stateFolder, seen, kindsOf: () => [] }),
			},
		})

		expect({
			exitCode: result.exitCode,
			eventWrites: vi.mocked(writeEvent).mock.calls.length,
			store: existsSync(join(commonGitDirOf(root), STORE_FOLDER)),
			markers: seen.markers.map((marker) => [marker.step, marker.lot]),
			markersAfter: markerFilesIn(stateFolder),
			warnings: warnings.lines,
		}).toEqual({
			exitCode: 0,
			eventWrites: 0,
			store: false,
			markers: [['mutation', null]],
			markersAfter: [],
			warnings: [],
		})
	})
})

describe(
	'mutants run: events that cannot be written',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a folder stands at events.jsonl, in place of a read-only file → the same exit, the run still reported, one warning line', async () => {
			const reference = createMutationLot()
			const blocked = createMutationLot()
			mkdirSync(blocked.eventsFile)
			const warnings = spyOnWarnings()

			const expected = await runMutants({
				cwd: reference.worktree,
				argv: ['run'],
				dependencies: {
					runStryker: fakeStryker({
						root: reference.worktree,
						reports: { fast: ALL_KILLED },
						calls: [],
					}),
				},
			})
			const result = await runMutants({
				cwd: blocked.worktree,
				argv: ['run'],
				dependencies: {
					runStryker: fakeStryker({
						root: blocked.worktree,
						reports: { fast: ALL_KILLED },
						calls: [],
					}),
				},
			})

			expect({
				sameExit: result.exitCode === expected.exitCode,
				exitCode: result.exitCode,
				reported: storedRuns(blocked.worktree).map((run) => run.state),
				warnings: warnings.lines.length,
			}).toEqual({ sameExit: true, exitCode: 0, reported: ['reported'], warnings: 1 })
		})
	},
)
