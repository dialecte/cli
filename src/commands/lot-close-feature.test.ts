/**
 * `dialecte lot close --feature <name>` (DESIGN 3.8, tests 33, 34, 35, 47; DELTA items 1-2): a pipeline's last step.
 * It is refused while a lot of the feature is open in any store; else every lot worktree and recorded throwaway of the
 * feature closes through `lot prune`'s plan, the branches untouched and not listed, and the feature's dead rehearsal
 * clones move to their scratch root's trash. A lot kept on purpose keeps every item.
 */
import { existsSync, realpathSync, symlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../test/brief-workspace.ts'
import { deadPid } from '../../test/dead-pid.ts'
import { keepTextOf, keptTextOf, writeKeepLine } from '../../test/keep-decision-workspace.ts'
import {
	addLandingLot,
	cancelLot,
	landingLotOf,
	lotBranchTipOf,
	writeLandedFact,
} from '../../test/landing-lot.ts'
import { mergeOnOrigin } from '../../test/landing-repository.ts'
import { putFolderAtLog } from '../../test/lot-close-final-record.ts'
import {
	CLOSED_FEATURE,
	PROCESSES_UNKNOWN,
	REUSED_PID_START_TIME,
	REHEARSAL_STARTED_AT,
	REVIVED_START_TIME,
	WORKING_PID,
	WORKTREE_PRUNE_COMMAND,
} from '../../test/lot-prune-workspace.constants.ts'
import {
	addCommittedFeatureLot,
	addHandoverFolderOf,
	addPendingHandoverFolderOf,
	addRehearsalFolder,
	addRehearsalFolderWithMarker,
	closedFeatureOf,
	closeFeatureArgumentsOf,
	cloneFateOf,
	recordedRoundOf,
	removalsOf,
} from '../../test/lot-prune-workspace.ts'
import { writeStoreListFile } from '../../test/lot-stores.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { transitionOf } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLotClose } from './lot-close.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'
import type { CloseFeatureParams } from '../../test/lot-prune-workspace.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The trash of a scratch root outside the workspace: its own `dialecte-trash`, on its own file system. */
function scratchTrashIn(scratchRoot: string): string {
	return join(scratchRoot, 'dialecte-trash')
}

/** A scratch root of its own, by real path, as `machineScratchRoots` names one outside the workspace. */
function newScratchRoot(): string {
	return realpathSync(temporaryFolder('dialecte-scratch-root-'))
}

/**
 * A workspace whose store holds the bystander lot of `landingLotOf` (of another feature, working) and one lot of the
 * feature, committed through its own hand-over entry, nothing pushed.
 */
function featureWorkspace(): { bystander: LandingLot; lot: LandingLot } {
	const bystander = landingLotOf()
	const lot = addCommittedFeatureLot({
		lot: bystander,
		name: '0002-repo-alpha',
		branch: 'feat/alpha',
		feature: CLOSED_FEATURE,
	})
	return { bystander, lot }
}

/** The run's answer, or the message of what it threw (a run must answer, never throw). */
function answerOrThrown(run: () => CommandResult): CommandResult | { thrown: string } {
	try {
		return run()
	} catch (error) {
		return { thrown: (error as Error).message }
	}
}

/** `lot close --feature <CLOSED_FEATURE>` over the workspace of `lot`, the clones looked for in `scratchRoot`. */
function closeFeature(params: {
	lot: LandingLot
	scratchRoot: string
	readStartTime?: CloseFeatureParams['readStartTime']
}) {
	return runLotClose(
		closeFeatureArgumentsOf({
			lot: params.lot,
			feature: CLOSED_FEATURE,
			scratchRoots: [params.scratchRoot],
			readStartTime: params.readStartTime,
		}),
	)
}

describe(
	'lot close --feature: which lots, the open-lot refusal',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('no store lot of the feature → exit 1 naming the feature, the other feature’s lot untouched', () => {
			const bystander = landingLotOf()

			const result = runLotClose(
				closeFeatureArgumentsOf({
					lot: bystander,
					feature: 'nothing-of-it',
					scratchRoots: [],
					json: false,
				}),
			)

			expect({
				exitCode: result.exitCode,
				named: result.output.includes('no lot of the feature nothing-of-it'),
				worktreeLeft: existsSync(bystander.worktree),
			}).toEqual({ exitCode: 1, named: true, worktreeLeft: true })
		})

		it('only a simulated lot of the feature → exit 1, as no lot of the feature', () => {
			const bystander = landingLotOf()
			writeStoreLot({
				workspace: bystander.workspace,
				name: '0002-repo-simulated',
				scope: ['src/simulated.ts'],
				simulated: true,
				feature: CLOSED_FEATURE,
				repository: bystander.workspace.repository,
			})

			const result = runLotClose(
				closeFeatureArgumentsOf({
					lot: bystander,
					feature: CLOSED_FEATURE,
					scratchRoots: [],
					json: false,
				}),
			)

			expect({
				exitCode: result.exitCode,
				named: result.output.includes(`no lot of the feature ${CLOSED_FEATURE}`),
			}).toEqual({ exitCode: 1, named: true })
		})

		it('a lot of the feature ready in another store of the list → exit 2 listing it, the committed lot’s worktree not moved', () => {
			const { lot } = featureWorkspace()
			const other = createBriefWorkspace()
			writeStoreLot({
				workspace: other,
				name: '0001-repo-alpha-ready',
				scope: ['src/ready.ts'],
				feature: CLOSED_FEATURE,
				later: [transitionOf({ seq: 2, state: 'ready', kind: 'ready' })],
			})
			writeStoreListFile({ stores: [other.store] })

			const run = closedFeatureOf(
				runLotClose(closeFeatureArgumentsOf({ lot, feature: CLOSED_FEATURE, scratchRoots: [] })),
			)

			expect({
				exitCode: run.exitCode,
				open: run.output?.open,
				worktreeLeft: existsSync(lot.worktree),
			}).toEqual({
				exitCode: 2,
				open: [{ lot: '0001-repo-alpha-ready', state: 'ready' }],
				worktreeLeft: true,
			})
		})

		it('a lot of the feature still working, without --json → exit 2, its name and state on a line', () => {
			const { bystander } = featureWorkspace()
			writeStoreLot({
				workspace: bystander.workspace,
				name: '0003-repo-alpha-working',
				scope: ['src/working.ts'],
				feature: CLOSED_FEATURE,
				repository: bystander.workspace.repository,
			})

			const result = runLotClose(
				closeFeatureArgumentsOf({
					lot: bystander,
					feature: CLOSED_FEATURE,
					scratchRoots: [],
					json: false,
				}),
			)

			expect({
				exitCode: result.exitCode,
				listed: result.output
					.split('\n')
					.some((line) => line.includes('0003-repo-alpha-working') && line.includes('working')),
			}).toEqual({ exitCode: 2, listed: true })
		})

		it('--feature followed by --json, no feature name → a usage error, exit 2', () => {
			const { lot } = featureWorkspace()

			const result = runLotClose({
				...closeFeatureArgumentsOf({ lot, feature: CLOSED_FEATURE, scratchRoots: [] }),
				argv: ['--feature', '--json'],
			})

			expect({ exitCode: result.exitCode, worktreeLeft: existsSync(lot.worktree) }).toEqual({
				exitCode: 2,
				worktreeLeft: true,
			})
		})

		it('--feature together with a lot name → a usage error, exit 2, nothing moved', () => {
			const { lot } = featureWorkspace()

			const result = runLotClose(
				closeFeatureArgumentsOf({
					lot,
					feature: CLOSED_FEATURE,
					scratchRoots: [],
					words: [lot.name],
				}),
			)

			expect({ exitCode: result.exitCode, worktreeLeft: existsSync(lot.worktree) }).toEqual({
				exitCode: 2,
				worktreeLeft: true,
			})
		})
	},
)

describe(
	'lot close --feature: worktrees and throwaways, branches untouched',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('two lots of the feature committed, nothing pushed, one with a recorded throwaway → every worktree and throwaway closed, exit 0, branches kept and not listed, the other feature’s lot untouched', () => {
			const { bystander, lot } = featureWorkspace()
			const round = recordedRoundOf({
				lot,
				round: 1,
				changed: { 'src/0002-repo-alpha.ts': 'export const x = 2\n' },
			})
			const second = addCommittedFeatureLot({
				lot: bystander,
				name: '0003-repo-alpha-two',
				branch: 'feat/alpha-two',
				feature: CLOSED_FEATURE,
			})
			const tips = { first: lotBranchTipOf(lot), second: lotBranchTipOf(second) }

			const run = closedFeatureOf(closeFeature({ lot, scratchRoot: newScratchRoot() }))

			expect({
				exitCode: run.exitCode,
				left: [lot.worktree, round.path, second.worktree, bystander.worktree].map((path) =>
					existsSync(path),
				),
				branches: { first: lotBranchTipOf(lot), second: lotBranchTipOf(second) },
				itemKinds: [
					...new Set(run.output?.lots.flatMap((one) => one.items.map((item) => item.item))),
				].sort(),
				lots: run.output?.lots.map((one) => one.lot).sort(),
			}).toEqual({
				exitCode: 0,
				left: [false, false, false, true],
				branches: tips,
				itemKinds: ['throwaway', 'worktree'],
				lots: [lot.name, second.name],
			})
		})

		it('a lot of the feature closed with its recorded throwaway → the removing line of each says lot-close, its outcome trashed', () => {
			const { lot } = featureWorkspace()
			const round = recordedRoundOf({
				lot,
				round: 1,
				changed: { 'src/0002-repo-alpha.ts': 'export const x = 2\n' },
			})

			closeFeature({ lot, scratchRoot: newScratchRoot() })

			expect(
				removalsOf(lot)
					.filter((removal) => removal.lot === lot.name)
					.map((removal) => ({
						item: removal.item,
						path: removal.path,
						by: removal.by,
						outcome: removal.outcome,
					}))
					.sort((one, other) => one.item.localeCompare(other.item)),
			).toEqual([
				{ item: 'throwaway', path: round.path, by: 'lot-close', outcome: 'trashed' },
				{ item: 'worktree', path: lot.worktree, by: 'lot-close', outcome: 'trashed' },
			])
		})

		it('a landed lot of the feature whose branch lot prune would delete, closed twice → its branch untouched and never listed', () => {
			const { lot } = featureWorkspace()
			mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
			const tip = lotBranchTipOf(lot)

			const runs = [1, 2].map(() =>
				closedFeatureOf(closeFeature({ lot, scratchRoot: newScratchRoot() })),
			)

			expect({
				branch: lotBranchTipOf(lot),
				listed: runs.flatMap((run) =>
					(run.output?.lots ?? []).flatMap((one) => one.items.map((item) => item.item)),
				),
				worktreeLeft: existsSync(lot.worktree),
			}).toEqual({ branch: tip, listed: ['worktree'], worktreeLeft: false })
		})

		it('a committed and a canceled lot of the feature → not refused, both worktrees closed, exit 0', () => {
			const { bystander, lot } = featureWorkspace()
			const canceled = addLandingLot({
				lot: bystander,
				name: '0003-repo-alpha-stopped',
				branch: 'feat/alpha-stopped',
				feature: CLOSED_FEATURE,
			})
			cancelLot(canceled)

			const result = closeFeature({ lot, scratchRoot: newScratchRoot() })

			expect({
				exitCode: result.exitCode,
				left: [lot.worktree, canceled.worktree].map((path) => existsSync(path)),
			}).toEqual({ exitCode: 0, left: [false, false] })
		})

		it('a lot of the feature kept on purpose, with a recorded throwaway and a dead clone of its own → its worktree, throwaway and clone kept with its kept text, nothing moved, exit 1', () => {
			const { lot } = featureWorkspace()
			const round = recordedRoundOf({
				lot,
				round: 1,
				changed: { 'src/0002-repo-alpha.ts': 'export const x = 2\n' },
			})
			writeKeepLine({ lotFolder: lot.lotFolder })
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-kept',
				pid: deadPid(),
				handover: lot.lotFolder,
			})

			const result = closeFeature({ lot, scratchRoot })
			const items = closedFeatureOf(result).output?.lots.find((one) => one.lot === lot.name)?.items

			expect({
				exitCode: result.exitCode,
				left: [lot.worktree, round.path, clone].map((path) => existsSync(path)),
				clone: cloneFateOf({ result, clone }),
				worktree: items?.find((item) => item.item === 'worktree')?.decision,
				throwaway: items?.find((item) => item.item === 'throwaway')?.decision,
			}).toEqual({
				exitCode: 1,
				left: [true, true, true],
				clone: { kept: keptTextOf() },
				worktree: { kept: keptTextOf() },
				throwaway: { kept: keptTextOf() },
			})
		})
	},
)

/** How a clone case's marker is made, from the feature's lot: its owner, hand-over folder and start time (`null`: none). */
type MarkerOf = (lot: LandingLot) => { pid: number; handover: string; startTime?: string | null }

/** A clone the run moves into its scratch root's trash. */
const MOVED_CLONES: { title: string; marker: MarkerOf }[] = [
	{
		title:
			'a dead clone whose marker names the lot’s folder → moved to its scratch root’s trash, exit 0',
		marker: (lot) => ({ pid: deadPid(), handover: lot.lotFolder }),
	},
	{
		title: 'a clone whose marker pid now runs another process (another start time) → moved, exit 0',
		marker: (lot) => ({
			pid: process.pid,
			handover: lot.lotFolder,
			startTime: REUSED_PID_START_TIME,
		}),
	},
]

/** A clone of the feature's lot the run keeps, listed with `worktree prune`'s command: exit 1. */
const KEPT_CLONES: {
	title: string
	marker: MarkerOf
	readStartTime?: CloseFeatureParams['readStartTime']
	exitCode: number
}[] = [
	{
		title: 'an alive clone of the lot → kept, listed with worktree prune’s command, exit 1',
		marker: (lot) => ({ pid: process.pid, handover: lot.lotFolder }),
		exitCode: 1,
	},
	{
		title:
			'a clone of the lot whose running owner’s marker holds no start time → kept as unknown, exit 1',
		marker: (lot) => ({ pid: process.pid, handover: lot.lotFolder, startTime: null }),
		exitCode: 1,
	},
	{
		title:
			'a clone of the lot whose running owner’s start time cannot be read → kept as unknown, never moved, exit 1',
		marker: (lot) => ({ pid: process.pid, handover: lot.lotFolder, startTime: 'any' }),
		readStartTime: function unreadable() {
			return undefined
		},
		exitCode: 1,
	},
]

describe(
	'lot close --feature: the feature’s rehearsal clones',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of MOVED_CLONES)
			it(row.title, () => {
				const { lot } = featureWorkspace()
				const scratchRoot = newScratchRoot()
				const clone = addRehearsalFolder({
					scratchRoot,
					name: 'dialecte-rehearse-case',
					...row.marker(lot),
				})

				const result = closeFeature({ lot, scratchRoot })
				const fate = cloneFateOf({ result, clone })

				expect({
					exitCode: result.exitCode,
					cloneLeft: existsSync(clone),
					removedIntoTrash:
						'removed' in fate && fate.removed.startsWith(`${scratchTrashIn(scratchRoot)}/`),
				}).toEqual({ exitCode: 0, cloneLeft: false, removedIntoTrash: true })
			})

		for (const row of KEPT_CLONES)
			it(row.title, () => {
				const { lot } = featureWorkspace()
				const scratchRoot = newScratchRoot()
				const clone = addRehearsalFolder({
					scratchRoot,
					name: 'dialecte-rehearse-case',
					...row.marker(lot),
				})

				const result = closeFeature({ lot, scratchRoot, readStartTime: row.readStartTime })

				expect({
					exitCode: result.exitCode,
					cloneLeft: existsSync(clone),
					fate: cloneFateOf({ result, clone }),
				}).toEqual({
					exitCode: row.exitCode,
					cloneLeft: true,
					fate: { kept: expect.stringContaining(WORKTREE_PRUNE_COMMAND) },
				})
			})

		it('a dead clone of the lot a link in the workspace reaches → kept naming the link, exit 1', () => {
			const { lot } = featureWorkspace()
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-linked',
				pid: deadPid(),
				handover: lot.lotFolder,
			})
			const link = join(lot.workspace.workspace, 'rehearsal-link')
			symlinkSync(clone, link)

			const result = closeFeature({ lot, scratchRoot })

			expect({
				exitCode: result.exitCode,
				cloneLeft: existsSync(clone),
				fate: cloneFateOf({ result, clone }),
			}).toEqual({ exitCode: 1, cloneLeft: true, fate: { kept: expect.stringContaining(link) } })
		})

		it('a landed lot of the feature handed over from a folder outside the store, a dead clone whose marker names that folder → moved, exit 0', () => {
			const bystander = landingLotOf()
			const lot = addLandingLot({
				lot: bystander,
				name: '0002-repo-alpha',
				branch: 'feat/alpha',
				feature: CLOSED_FEATURE,
			})
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-handover',
				pid: deadPid(),
				handover: addHandoverFolderOf(lot),
			})
			writeLandedFact({ lot, tip: lot.tip })

			const result = closeFeature({ lot, scratchRoot })
			const fate = cloneFateOf({ result, clone })

			expect({
				exitCode: result.exitCode,
				cloneLeft: existsSync(clone),
				removedIntoTrash:
					'removed' in fate && fate.removed.startsWith(`${scratchTrashIn(scratchRoot)}/`),
			}).toEqual({ exitCode: 0, cloneLeft: false, removedIntoTrash: true })
		})

		it('a dead clone of the other feature’s lot → not moved, listed with worktree prune’s command, exit 0', () => {
			const { bystander, lot } = featureWorkspace()
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-other',
				pid: deadPid(),
				handover: bystander.lotFolder,
			})

			const result = closeFeature({ lot, scratchRoot })

			expect({
				exitCode: result.exitCode,
				cloneLeft: existsSync(clone),
				fate: cloneFateOf({ result, clone }),
			}).toEqual({
				exitCode: 0,
				cloneLeft: true,
				fate: { kept: expect.stringContaining(WORKTREE_PRUNE_COMMAND) },
			})
		})

		it('a dead clone of the lot in the workspace’s own scratch root spelled by its real path, the command run through a link to the workspace → moved into the workspace’s .worktrees/_trash, no dialecte-trash beside it', () => {
			const { lot } = featureWorkspace()
			// the scratch root by its real path, the command's workspace through a link of its own: two spellings anywhere
			const realWorkspace = realpathSync(lot.workspace.workspace)
			const worktreesFolder = join(realWorkspace, '.worktrees')
			const scratchRoot = join(worktreesFolder, '_scratch')
			const linkedWorkspace = join(realpathSync(temporaryFolder('dialecte-workspace-link-')), 'ws')
			symlinkSync(realWorkspace, linkedWorkspace)
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-workspace',
				pid: deadPid(),
				handover: lot.lotFolder,
			})

			const result = runLotClose({
				...closeFeatureArgumentsOf({ lot, feature: CLOSED_FEATURE, scratchRoots: [scratchRoot] }),
				cwd: join(linkedWorkspace, basename(lot.workspace.repository)),
			})
			const fate = cloneFateOf({ result, clone })

			expect({
				cloneLeft: existsSync(clone),
				intoWorkspaceTrash:
					'removed' in fate &&
					realpathSync(dirname(fate.removed)) === realpathSync(join(worktreesFolder, '_trash')),
				besideIt: existsSync(join(scratchRoot, 'dialecte-trash')),
			}).toEqual({ cloneLeft: false, intoWorkspaceTrash: true, besideIt: false })
		})

		it('a dead clone at the plan whose owner runs again at the move (its start time read back equal) → kept, changed since the plan, no removing line, exit 1', () => {
			const { lot } = featureWorkspace()
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-revived',
				pid: process.pid,
				handover: lot.lotFolder,
				startTime: REVIVED_START_TIME,
			})
			let reads = 0
			// the plan reads another start time (a reused pid: dead), every later read the marker's own (alive)
			function startTimeOf(): string {
				reads += 1
				return reads === 1 ? REUSED_PID_START_TIME : REVIVED_START_TIME
			}

			const result = closeFeature({ lot, scratchRoot, readStartTime: startTimeOf })

			expect({
				exitCode: result.exitCode,
				cloneLeft: existsSync(clone),
				fate: cloneFateOf({ result, clone }),
				removals: removalsOf(lot).filter((removal) => removal.path === clone),
			}).toEqual({
				exitCode: 1,
				cloneLeft: true,
				fate: { kept: expect.stringContaining('changed since the plan') },
				removals: [],
			})
		})

		it('a symbolic link named as a rehearsal folder, reaching a dead clone of the lot → kept naming the link, the link and its target left', () => {
			const { lot } = featureWorkspace()
			const scratchRoot = newScratchRoot()
			const target = addRehearsalFolder({
				scratchRoot: newScratchRoot(),
				name: 'dialecte-rehearse-target',
				pid: deadPid(),
				handover: lot.lotFolder,
			})
			const link = join(scratchRoot, 'dialecte-rehearse-link')
			symlinkSync(target, link)

			const result = closeFeature({ lot, scratchRoot })

			expect({
				left: [link, target].map((path) => existsSync(path)),
				fate: cloneFateOf({ result, clone: link }),
			}).toEqual({ left: [true, true], fate: { kept: expect.stringContaining(link) } })
		})

		it('a dead clone of the lot moved, then lot report of the lot → the clone named nowhere in the report', () => {
			const { lot } = featureWorkspace()
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-reported',
				pid: deadPid(),
				handover: lot.lotFolder,
			})
			closeFeature({ lot, scratchRoot })

			const report = runLot({
				cwd: lot.workspace.repository,
				argv: ['report', lot.name, '--json'],
			})

			expect(report.output.includes(basename(clone))).toBe(false)
		})

		it('a keep written on the lot after the plan, before the move → its dead clone kept with the kept text, no removing line, exit 1', () => {
			const { lot } = featureWorkspace()
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-late-keep',
				pid: process.pid,
				handover: lot.lotFolder,
				startTime: REVIVED_START_TIME,
			})
			// the plan's read of the owner's start time: a reused pid (dead); the keep lands right after it
			function keepAfterThePlan(): string {
				if (keepTextOf(lot.lotFolder) === undefined) writeKeepLine({ lotFolder: lot.lotFolder })
				return REUSED_PID_START_TIME
			}

			const result = closeFeature({ lot, scratchRoot, readStartTime: keepAfterThePlan })

			expect({
				exitCode: result.exitCode,
				cloneLeft: existsSync(clone),
				fate: cloneFateOf({ result, clone }),
				removals: removalsOf(lot).filter((removal) => removal.path === clone),
			}).toEqual({
				exitCode: 1,
				cloneLeft: true,
				fate: { kept: expect.stringContaining(keptTextOf()) },
				removals: [],
			})
		})

		it('a link to a dead clone of the lot made after the plan, before the move → the clone kept naming the link, exit 1', () => {
			const { lot } = featureWorkspace()
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-late-link',
				pid: process.pid,
				handover: lot.lotFolder,
				startTime: REVIVED_START_TIME,
			})
			const link = join(lot.workspace.workspace, 'late-rehearsal-link')
			// every read of the owner's start time: a reused pid (dead); the link lands with the plan's read
			function linkAfterThePlan(): string {
				if (!existsSync(link)) symlinkSync(clone, link)
				return REUSED_PID_START_TIME
			}

			const result = closeFeature({ lot, scratchRoot, readStartTime: linkAfterThePlan })

			expect({
				exitCode: result.exitCode,
				cloneLeft: existsSync(clone),
				fate: cloneFateOf({ result, clone }),
			}).toEqual({ exitCode: 1, cloneLeft: true, fate: { kept: expect.stringContaining(link) } })
		})

		it('two stores each holding a lot of the feature by one name, a dead clone of one of them → moved, listed under one lot only', () => {
			const { lot: first } = featureWorkspace()
			const other = landingLotOf()
			const second = addCommittedFeatureLot({
				lot: other,
				name: first.name,
				branch: 'feat/alpha',
				feature: CLOSED_FEATURE,
			})
			writeStoreListFile({ stores: [first.workspace.store] })
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-one-name',
				pid: deadPid(),
				handover: first.lotFolder,
			})

			const run = closedFeatureOf(closeFeature({ lot: second, scratchRoot }))

			expect({
				cloneLeft: existsSync(clone),
				listed: (run.output?.lots ?? []).flatMap((one) =>
					one.items.filter((item) => item.item === 'clone').map(() => one.lot),
				),
			}).toEqual({ cloneLeft: false, listed: [first.name] })
		})

		it('the feature’s lot in another workspace of the store list, an alive clone of it, the command run from this workspace → kept, its worktree prune command in this workspace', () => {
			const { lot } = featureWorkspace()
			const here = landingLotOf()
			writeStoreListFile({ stores: [lot.workspace.store] })
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-elsewhere',
				pid: process.pid,
				handover: lot.lotFolder,
			})

			const fate = cloneFateOf({ result: closeFeature({ lot: here, scratchRoot }), clone })
			const kept = 'kept' in fate ? fate.kept : ''

			expect({
				here: [here.workspace.workspace, realpathSync(here.workspace.workspace)].some((path) =>
					kept.includes(`cd ${path} && dialecte worktree prune`),
				),
				there: [lot.workspace.workspace, realpathSync(lot.workspace.workspace)].some((path) =>
					kept.includes(`cd ${path} &&`),
				),
			}).toEqual({ here: true, there: false })
		})

		it('the feature’s lot in another workspace of the store list, a link at that workspace’s root reaching its dead clone, the command run from this workspace → kept naming the link', () => {
			const { lot } = featureWorkspace()
			const here = landingLotOf()
			writeStoreListFile({ stores: [lot.workspace.store] })
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-linked-elsewhere',
				pid: deadPid(),
				handover: lot.lotFolder,
			})
			const link = join(lot.workspace.workspace, 'rehearsal-link')
			symlinkSync(clone, link)

			const result = closeFeature({ lot: here, scratchRoot })

			expect({
				cloneLeft: existsSync(clone),
				fate: cloneFateOf({ result, clone }),
			}).toEqual({ cloneLeft: true, fate: { kept: expect.stringContaining('rehearsal-link') } })
		})

		it('one scratch root given twice, by its real path and through a link → its dead clone moved once, exit 0', () => {
			const { lot } = featureWorkspace()
			const scratchRoot = newScratchRoot()
			const linkedRoot = join(realpathSync(temporaryFolder('dialecte-scratch-link-')), 'root')
			symlinkSync(scratchRoot, linkedRoot)
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-twice',
				pid: deadPid(),
				handover: lot.lotFolder,
			})

			const result = runLotClose(
				closeFeatureArgumentsOf({
					lot,
					feature: CLOSED_FEATURE,
					scratchRoots: [scratchRoot, linkedRoot],
				}),
			)

			expect({
				exitCode: result.exitCode,
				cloneLeft: existsSync(clone),
				removals: removalsOf(lot).filter((removal) => removal.item === 'clone').length,
			}).toEqual({ exitCode: 0, cloneLeft: false, removals: 1 })
		})

		it('the feature’s lot in another workspace of the store list, a link in this workspace reaching its dead clone, the command run from this workspace → kept naming the link', () => {
			const { lot } = featureWorkspace()
			const here = landingLotOf()
			writeStoreListFile({ stores: [lot.workspace.store] })
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-linked-here',
				pid: deadPid(),
				handover: lot.lotFolder,
			})
			symlinkSync(clone, join(here.workspace.workspace, 'rehearsal-link-here'))

			const result = closeFeature({ lot: here, scratchRoot })

			expect({
				cloneLeft: existsSync(clone),
				fate: cloneFateOf({ result, clone }),
			}).toEqual({
				cloneLeft: true,
				fate: { kept: expect.stringContaining('rehearsal-link-here') },
			})
		})

		it('a committed hand-over entry of another lot’s worktree, its folder outside the store, a dead clone of it → listed with worktree prune’s command, not moved', () => {
			const { bystander, lot } = featureWorkspace()
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-other-entry',
				pid: deadPid(),
				handover: addHandoverFolderOf(bystander),
			})

			const run = closedFeatureOf(closeFeature({ lot, scratchRoot }))

			expect({
				cloneLeft: existsSync(clone),
				clones: run.output?.clones.filter((one) => one.clone === clone),
			}).toEqual({
				cloneLeft: true,
				clones: [{ clone, kept: expect.stringContaining(WORKTREE_PRUNE_COMMAND) }],
			})
		})

		it('a pending hand-over entry of the lot’s worktree and branch, its folder outside the store, a dead clone of it → kept with worktree prune’s command, not moved', () => {
			const { lot } = featureWorkspace()
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-pending-entry',
				pid: deadPid(),
				handover: addPendingHandoverFolderOf(lot),
			})

			const result = closeFeature({ lot, scratchRoot })

			expect({
				cloneLeft: existsSync(clone),
				fate: cloneFateOf({ result, clone }),
			}).toEqual({
				cloneLeft: true,
				fate: { kept: expect.stringContaining(WORKTREE_PRUNE_COMMAND) },
			})
		})

		it('a dead clone of the lot moved → its removed line is written before its background removal starts', () => {
			const { lot } = featureWorkspace()
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-ordered',
				pid: deadPid(),
				handover: lot.lotFolder,
			})
			const outcomesAtSpawn: string[] = []
			// the clone's removal reads its own record first; every other background command passes through
			function recordingOrder(command: { command: string; args: string[] }): void {
				if (command.args.some((arg) => arg.startsWith(`${scratchTrashIn(scratchRoot)}/`)))
					outcomesAtSpawn.push(
						removalsOf(lot).find((removal) => removal.path === clone)?.outcome ?? 'none',
					)
			}

			runLotClose({
				...closeFeatureArgumentsOf({ lot, feature: CLOSED_FEATURE, scratchRoots: [scratchRoot] }),
				spawner: recordingOrder,
			})

			expect({ cloneLeft: existsSync(clone), outcomesAtSpawn }).toEqual({
				cloneLeft: false,
				outcomesAtSpawn: ['trashed'],
			})
		})

		it('a dead clone of the lot a process works inside → kept naming the pid and worktree prune’s command, not moved, exit 1', () => {
			const { lot } = featureWorkspace()
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-worked-in',
				pid: deadPid(),
				handover: lot.lotFolder,
			})
			const shell = { pid: WORKING_PID, folder: join(realpathSync(clone), 'repo') }

			const result = runLotClose({
				...closeFeatureArgumentsOf({ lot, feature: CLOSED_FEATURE, scratchRoots: [scratchRoot] }),
				listProcesses: function shellInTheClone() {
					return [shell]
				},
			})
			const fate = cloneFateOf({ result, clone })

			expect({
				exitCode: result.exitCode,
				cloneLeft: existsSync(clone),
				pid: 'kept' in fate && fate.kept.includes(String(WORKING_PID)),
				command: 'kept' in fate && fate.kept.includes(WORKTREE_PRUNE_COMMAND),
			}).toEqual({ exitCode: 1, cloneLeft: true, pid: true, command: true })
		})

		it('a dead clone of the lot, the processes not known → kept with why, not moved, exit 1', () => {
			const { lot } = featureWorkspace()
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-processes-unknown',
				pid: deadPid(),
				handover: lot.lotFolder,
			})

			const result = runLotClose({
				...closeFeatureArgumentsOf({ lot, feature: CLOSED_FEATURE, scratchRoots: [scratchRoot] }),
				listProcesses: function unknown() {
					return PROCESSES_UNKNOWN
				},
			})

			expect({
				exitCode: result.exitCode,
				cloneLeft: existsSync(clone),
				fate: cloneFateOf({ result, clone }),
			}).toEqual({
				exitCode: 1,
				cloneLeft: true,
				fate: { kept: expect.stringContaining(PROCESSES_UNKNOWN) },
			})
		})

		it('a process starting inside a dead clone of the lot after the plan, before the move → kept, changed since the plan, exit 1', () => {
			const { lot } = featureWorkspace()
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-late-process',
				pid: process.pid,
				handover: lot.lotFolder,
				startTime: REVIVED_START_TIME,
			})
			let planned = false
			// the plan's read of the owner's start time: a reused pid (dead); a shell enters the clone right after it
			function planThenShell(): string {
				planned = true
				return REUSED_PID_START_TIME
			}

			const result = runLotClose({
				...closeFeatureArgumentsOf({
					lot,
					feature: CLOSED_FEATURE,
					scratchRoots: [scratchRoot],
					readStartTime: planThenShell,
				}),
				listProcesses: function shellOncePlannedOf() {
					return planned ? [{ pid: WORKING_PID, folder: realpathSync(clone) }] : []
				},
			})

			expect({
				exitCode: result.exitCode,
				cloneLeft: existsSync(clone),
				fate: cloneFateOf({ result, clone }),
			}).toEqual({
				exitCode: 1,
				cloneLeft: true,
				fate: { kept: expect.stringContaining('changed since the plan') },
			})
		})

		it('a cards.log that cannot be written, a dead clone of the lot → the run ends with its answer, the clone kept with why, exit 1', () => {
			const { lot } = featureWorkspace()
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-no-log',
				pid: deadPid(),
				handover: lot.lotFolder,
			})
			putFolderAtLog(lot.workspace)

			const answered = answerOrThrown(() => closeFeature({ lot, scratchRoot }))

			expect({
				answered: 'exitCode' in answered ? answered.exitCode : answered.thrown,
				cloneLeft: existsSync(clone),
				fate: 'exitCode' in answered ? cloneFateOf({ result: answered, clone }) : undefined,
			}).toEqual({ answered: 1, cloneLeft: true, fate: { kept: expect.any(String) } })
		})

		it('a dead clone of the lot moved → its removing line names the clone, by lot-close, its outcome trashed', () => {
			const { lot } = featureWorkspace()
			const scratchRoot = newScratchRoot()
			const clone = addRehearsalFolder({
				scratchRoot,
				name: 'dialecte-rehearse-recorded',
				pid: deadPid(),
				handover: lot.lotFolder,
			})

			closeFeature({ lot, scratchRoot })

			expect(removalsOf(lot).filter((removal) => removal.path === clone)).toEqual([
				expect.objectContaining({ item: 'clone', by: 'lot-close', outcome: 'trashed' }),
			])
		})
	},
)

/** A clone whose marker cannot name a live run of the feature: kept, listed with `worktree prune`'s command. */
const UNREADABLE_MARKERS: {
	title: string
	marker: (lot: LandingLot) => string | undefined
	exitCode: number
}[] = [
	{
		title:
			'a clone of the lot whose marker names no pid → kept with worktree prune’s command, exit 1',
		marker: (lot) => JSON.stringify({ startedAt: REHEARSAL_STARTED_AT, handover: lot.lotFolder }),
		exitCode: 1,
	},
	{
		title: 'a clone with no marker → kept with worktree prune’s command, exit 0',
		marker: () => undefined,
		exitCode: 0,
	},
	{
		title: 'a clone whose marker does not parse → kept with worktree prune’s command, exit 0',
		marker: () => '{"pid": 1, "handover": ',
		exitCode: 0,
	},
]

describe(
	'lot close --feature: clones whose marker cannot tell',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of UNREADABLE_MARKERS)
			it(row.title, () => {
				const { lot } = featureWorkspace()
				const scratchRoot = newScratchRoot()
				const clone = addRehearsalFolderWithMarker({
					scratchRoot,
					name: 'dialecte-rehearse-unreadable',
					marker: row.marker(lot),
				})

				const result = closeFeature({ lot, scratchRoot })

				expect({
					exitCode: result.exitCode,
					cloneLeft: existsSync(clone),
					fate: cloneFateOf({ result, clone }),
				}).toEqual({
					exitCode: row.exitCode,
					cloneLeft: true,
					fate: { kept: expect.stringContaining(WORKTREE_PRUNE_COMMAND) },
				})
			})
	},
)
