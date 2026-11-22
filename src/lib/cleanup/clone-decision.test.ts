/**
 * The one rehearsal-clone decision: `whyKeepClone`'s rules, one row per rule in order, each the only rule that holds;
 * `cloneOwnerOf`'s owner read from the marker, a present store lot folder (in the reads or read on the spot), a store
 * child gone, or a done registry entry naming the lot's worktree and branch.
 */
import { chmodSync, mkdirSync, realpathSync, renameSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { deadPid } from '../../../test/dead-pid.ts'
import { keptTextOf, writeKeepLine } from '../../../test/keep-decision-workspace.ts'
import { landingLotOf } from '../../../test/landing-lot.ts'
import {
	addHandoverFolderOf,
	addPendingHandoverFolderOf,
	addRehearsalFolder,
	addRehearsalFolderWithMarker,
} from '../../../test/lot-prune-workspace.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readStoreEntries } from '../handover/handover-store-read.ts'
import {
	handoverStoreOf,
	recordHandoverState,
	registerHandover,
} from '../handover/handover-store.ts'
import { REHEARSAL_RUN_UNKNOWN } from '../handover/live-handover-run.constants.ts'
import { probeCaseInsensitive } from '../store/brief.ts'
import { cloneOwnerOf, handoverWorkspaceOf, whyKeepClone } from './clone-decision.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../../test/landing-lot.types.ts'
import type { LotRecord } from '../store/lot-items.types.ts'
import type { CloneFacts, CloneKeep, CloneOwner, OwnerReads } from './clone-decision.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The pid a case says works in a clone. */
const WORKING_PID = 4242

/** The start time a case's live owner runs with, as its marker holds it and the reader reads it back. */
const OWNER_START_TIME = 'Sat Nov 21 04:00:00 2026'

/** A hand-over folder no store and no registry knows. */
const UNKNOWN_HANDOVER = '/nowhere/_commit-plan/topic'

/** A lot whose clones a case's owner is: not kept. */
const OWNER: CloneOwner = {
	lot: '0002-repo-alpha',
	lotFolder: '/store/0002-repo-alpha',
	main: '/ws/repo',
}

/** A dead clone in a scratch root of its own, its marker naming `handover` (an unknown one by default). */
function deadClone(handover: string = UNKNOWN_HANDOVER): string {
	return addRehearsalFolder({
		scratchRoot: temporaryFolder('dialecte-clone-decision-'),
		name: 'dialecte-rehearse-case',
		pid: deadPid(),
		handover,
	})
}

/** The facts of `clone` under which no rule holds: no owner, not kept, no process, no link. */
function freeFactsOf(clone: string): CloneFacts {
	return { clone, owner: undefined, kept: undefined, processes: [], links: [] }
}

/** The record the holds reader gives the landing lot `lot`: its folder, worktree, branch, open. */
function recordOf(lot: LandingLot): LotRecord {
	return {
		name: lot.name,
		lotFolder: lot.lotFolder,
		worktree: lot.worktree,
		branch: lot.branch,
		state: 'working',
		main: lot.workspace.repository,
	}
}

/** The registry entries of the lot's repository, as read once for a plan. */
function entriesOf(lot: LandingLot): OwnerReads['entries'] {
	return readStoreEntries(handoverStoreOf(lot.workspace.repository))
}

/** A whyKeepClone row: the facts it builds, the keep expected (undefined: the clone may go). */
type KeepRow = {
	title: string
	build: () => { facts: CloneFacts; expected: CloneKeep | undefined }
}

const KEEP_ROWS: KeepRow[] = [
	{
		title: 'the clone is itself a symbolic link to a dead clone → kept, the link named',
		build: function linkedClone() {
			const clone = join(temporaryFolder('dialecte-clone-decision-'), 'dialecte-rehearse-link')
			symlinkSync(deadClone(), clone)
			return { facts: freeFactsOf(clone), expected: { tag: 'link', link: clone } }
		},
	},
	{
		title: 'its owner could not be read → kept, unreadable with why',
		build: function unreadOwner() {
			const reason = 'EACCES: permission denied, scandir'
			return {
				facts: { ...freeFactsOf(deadClone()), owner: { unread: reason } },
				expected: { tag: 'unreadable', reason },
			}
		},
	},
	{
		title: 'its owner not single → kept, unknown naming the lots',
		build: function notSingleOwner() {
			const lots = '0002-repo-alpha, 0009-repo-twin'
			return {
				facts: { ...freeFactsOf(deadClone()), owner: { notSingle: lots } },
				expected: { tag: 'unknown', why: `owner not single: ${lots}` },
			}
		},
	},
	{
		title: 'its owning lot kept on purpose → kept with the keep text',
		build: function keptOwner() {
			return {
				facts: { ...freeFactsOf(deadClone()), owner: OWNER, kept: keptTextOf() },
				expected: { tag: 'kept', kept: keptTextOf() },
			}
		},
	},
	{
		title: 'its owner runs with the start time its marker holds → kept, alive with the pid',
		build: function aliveOwner() {
			const clone = addRehearsalFolder({
				scratchRoot: temporaryFolder('dialecte-clone-decision-'),
				name: 'dialecte-rehearse-alive',
				pid: process.pid,
				handover: UNKNOWN_HANDOVER,
				startTime: OWNER_START_TIME,
			})
			return {
				facts: {
					...freeFactsOf(clone),
					readStartTime: function sameStart() {
						return OWNER_START_TIME
					},
				},
				expected: { tag: 'alive', pid: process.pid },
			}
		},
	},
	{
		title: 'its marker does not parse → kept, unknown with the reader’s why',
		build: function unparsableMarker() {
			const clone = addRehearsalFolderWithMarker({
				scratchRoot: temporaryFolder('dialecte-clone-decision-'),
				name: 'dialecte-rehearse-unparsable',
				marker: '{"pid": 12',
			})
			return {
				facts: freeFactsOf(clone),
				expected: { tag: 'unknown', why: REHEARSAL_RUN_UNKNOWN.unparsable },
			}
		},
	},
	{
		title: 'the processes not known → kept, unknown with why',
		build: function processesUnknown() {
			const why = 'the processes cannot be listed: lsof failed'
			return {
				facts: { ...freeFactsOf(deadClone()), processes: why },
				expected: { tag: 'unknown', why },
			}
		},
	},
	{
		title: 'a process working inside the clone → kept, the process with its pid',
		build: function processInside() {
			const clone = deadClone()
			return {
				facts: {
					...freeFactsOf(clone),
					processes: [{ pid: WORKING_PID, folder: join(realpathSync(clone), 'repo') }],
				},
				expected: { tag: 'process', pid: WORKING_PID },
			}
		},
	},
	{
		title: 'the links not read → kept, unknown with why',
		build: function linksUnknown() {
			const why = 'the links cannot be read: EACCES'
			return {
				facts: { ...freeFactsOf(deadClone()), links: why },
				expected: { tag: 'unknown', why },
			}
		},
	},
	{
		title: 'a link reaching inside the clone → kept, the link named',
		build: function linkReaching() {
			const clone = deadClone()
			const link = join(temporaryFolder('dialecte-clone-decision-links-'), 'to-the-clone')
			return {
				facts: {
					...freeFactsOf(clone),
					links: [{ link, target: join(realpathSync(clone), 'repo') }],
				},
				expected: { tag: 'link', link },
			}
		},
	},
	{
		title: 'the link walk throwing once the run rule passed → kept, unreadable with why',
		build: function throwingWalk() {
			const reason = 'the clone went while it was looked at'
			const throwing = {
				link: join(temporaryFolder('dialecte-clone-decision-links-'), 'racing'),
				get target(): string {
					throw new Error(reason)
				},
			}
			return {
				facts: { ...freeFactsOf(deadClone()), links: [throwing] },
				expected: { tag: 'unreadable', reason },
			}
		},
	},
	{
		title: 'a dead clone, no owner, no process, no link → may go',
		build: function free() {
			return { facts: freeFactsOf(deadClone()), expected: undefined }
		},
	},
]

describe(
	'whyKeepClone: each rule, the only one that holds',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of KEEP_ROWS)
			it(row.title, () => {
				const { facts, expected } = row.build()

				expect(whyKeepClone(facts)).toEqual(expected)
			})
	},
)

/** A cloneOwnerOf row: the clone and the reads it builds, the owner expected. */
type OwnerRow = {
	title: string
	build: () => {
		clone: string
		reads: OwnerReads
		expected: ReturnType<typeof cloneOwnerOf> | Record<string, unknown>
	}
}

const OWNER_ROWS: OwnerRow[] = [
	{
		title: 'no marker → no owner',
		build: function noMarker() {
			const clone = addRehearsalFolderWithMarker({
				scratchRoot: temporaryFolder('dialecte-clone-decision-'),
				name: 'dialecte-rehearse-bare',
				marker: undefined,
			})
			return { clone, reads: { lots: [], entries: [] }, expected: undefined }
		},
	},
	{
		title: 'a marker that does not parse → no owner',
		build: function unparsable() {
			const clone = addRehearsalFolderWithMarker({
				scratchRoot: temporaryFolder('dialecte-clone-decision-'),
				name: 'dialecte-rehearse-unparsable',
				marker: '{"pid": 1, "handover": ',
			})
			return { clone, reads: { lots: [], entries: [] }, expected: undefined }
		},
	},
	{
		title: 'a marker naming no hand-over → no owner',
		build: function noHandover() {
			const clone = addRehearsalFolderWithMarker({
				scratchRoot: temporaryFolder('dialecte-clone-decision-'),
				name: 'dialecte-rehearse-no-handover',
				marker: JSON.stringify({ pid: deadPid(), startedAt: '2026-11-18T09:00:00.000Z' }),
			})
			return { clone, reads: { lots: [], entries: [] }, expected: undefined }
		},
	},
	{
		title: 'a marker naming a store lot folder among the reads → that lot',
		build: function lotAmongReads() {
			const lot = landingLotOf()
			return {
				clone: deadClone(lot.lotFolder),
				reads: { lots: [recordOf(lot)], entries: entriesOf(lot) },
				expected: expect.objectContaining({ lot: lot.name, lotFolder: lot.lotFolder }),
			}
		},
	},
	{
		title:
			'a marker naming a store lot folder among the reads, its record kept → that lot with its keep',
		build: function keptAmongReads() {
			const lot = landingLotOf()
			return {
				clone: deadClone(lot.lotFolder),
				reads: { lots: [{ ...recordOf(lot), kept: keptTextOf() }], entries: entriesOf(lot) },
				expected: expect.objectContaining({ lot: lot.name, kept: keptTextOf() }),
			}
		},
	},
	{
		title:
			'a marker naming a present store lot folder outside the reads, kept on purpose → that lot, its keep read on the spot',
		build: function keptOutsideReads() {
			const lot = landingLotOf()
			writeKeepLine({ lotFolder: lot.lotFolder })
			return {
				clone: deadClone(lot.lotFolder),
				reads: { lots: [], entries: [] },
				expected: expect.objectContaining({
					lot: lot.name,
					lotFolder: lot.lotFolder,
					kept: keptTextOf(),
				}),
			}
		},
	},
	{
		title: 'a marker naming a store lot folder moved out of the store → no owner',
		build: function goneFromStore() {
			const lot = landingLotOf()
			renameSync(lot.lotFolder, join(temporaryFolder('dialecte-moved-aside-'), lot.name))
			return {
				clone: deadClone(lot.lotFolder),
				reads: { lots: [], entries: entriesOf(lot) },
				expected: undefined,
			}
		},
	},
	{
		title:
			'a marker naming a committed hand-over registered for the lot’s worktree and branch → that lot',
		build: function committedEntry() {
			const lot = landingLotOf()
			const handover = addHandoverFolderOf(lot)
			return {
				clone: deadClone(handover),
				reads: { lots: [recordOf(lot)], entries: entriesOf(lot) },
				expected: expect.objectContaining({ lot: lot.name, lotFolder: lot.lotFolder }),
			}
		},
	},
	{
		title:
			'a marker naming a pending hand-over registered for the lot’s worktree and branch → no owner',
		build: function pendingEntry() {
			const lot = landingLotOf()
			const handover = addPendingHandoverFolderOf(lot)
			return {
				clone: deadClone(handover),
				reads: { lots: [recordOf(lot)], entries: entriesOf(lot) },
				expected: undefined,
			}
		},
	},
	{
		title:
			'a marker naming a committed hand-over registered for the lot’s worktree on another branch → no owner',
		build: function otherBranchEntry() {
			const lot = landingLotOf()
			const handover = realpathSync(temporaryFolder('dialecte-handover-'))
			const store = handoverStoreOf(lot.workspace.repository)
			registerHandover({
				root: lot.worktree,
				folder: handover,
				branch: 'feat/other',
				now: new Date(),
			})
			recordHandoverState({ store, folder: handover, state: 'committed' })
			return {
				clone: deadClone(handover),
				reads: { lots: [recordOf(lot)], entries: entriesOf(lot) },
				expected: undefined,
			}
		},
	},
]

describe('cloneOwnerOf: the lot a clone belongs to', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of OWNER_ROWS)
		it(row.title, () => {
			const { clone, reads, expected } = row.build()

			expect(cloneOwnerOf({ clone, reads })).toEqual(expected)
		})

	it('a clone folder that cannot be read → its owner unread, with why', () => {
		const clone = deadClone()
		chmodSync(clone, 0o000)
		try {
			expect(cloneOwnerOf({ clone, reads: { lots: [], entries: [] } })).toEqual({
				unread: expect.stringContaining('EACCES'),
			})
		} finally {
			chmodSync(clone, 0o755)
		}
	})

	it('a committed hand-over registered for two lots’ worktree and branch → owner not single, both lots named in the reads’ order', () => {
		const lot = landingLotOf()
		const handover = addHandoverFolderOf(lot)
		const twinFolder = join(temporaryFolder('dialecte-twin-lot-'), '0009-repo-twin')
		mkdirSync(twinFolder)
		const twin: LotRecord = { ...recordOf(lot), name: '0009-repo-twin', lotFolder: twinFolder }
		const clone = deadClone(handover)

		expect(
			cloneOwnerOf({ clone, reads: { lots: [recordOf(lot), twin], entries: entriesOf(lot) } }),
		).toEqual({ notSingle: `${lot.name}, 0009-repo-twin` })
	})
})

/** Whether the scratch folders sit on a case-insensitive volume (the case-folding row needs one). */
const CASE_INSENSITIVE_SCRATCH = probeCaseInsensitive({ path: realpathSync(tmpdir()) })

describe(
	'cloneOwnerOf: a worktree gone, spelled in another case (runs on a case-insensitive volume only: there two spellings are one folder)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it.runIf(CASE_INSENSITIVE_SCRATCH)(
			'a committed hand-over whose registered worktree, gone, names its missing folders in another case than the lot does → that lot',
			() => {
				const lot = landingLotOf()
				const handover = addHandoverFolderOf(lot)
				const gone = join(temporaryFolder('dialecte-gone-worktree-'), 'Gone', 'Worktree')
				const record: LotRecord = { ...recordOf(lot), worktree: gone }
				const entries = entriesOf(lot).map((entry) =>
					entry.branch === lot.branch ? { ...entry, worktree: gone.toLowerCase() } : entry,
				)

				expect(
					cloneOwnerOf({ clone: deadClone(handover), reads: { lots: [record], entries } }),
				).toEqual(expect.objectContaining({ lot: lot.name }))
			},
		)
	},
)

/** A handoverWorkspaceOf row: a hand-over path on a platform, and the workspace expected. */
type WorkspaceRow = {
	title: string
	handover: string
	platform: NodeJS.Platform
	expected: string | undefined
}

const WORKSPACE_ROWS: WorkspaceRow[] = [
	{
		title:
			'a Windows hand-over in a drive root’s _commit-plan → no workspace (a bare drive is relative)',
		handover: 'C:\\_commit-plan\\fix',
		platform: 'win32',
		expected: undefined,
	},
	{
		title: 'a Windows hand-over in a workspace’s _commit-plan → that workspace',
		handover: 'C:\\work\\_commit-plan\\fix',
		platform: 'win32',
		expected: 'C:\\work',
	},
]

describe('handoverWorkspaceOf: the workspace a hand-over sits in', () => {
	for (const row of WORKSPACE_ROWS)
		it(row.title, () => {
			expect(handoverWorkspaceOf({ handover: row.handover, platform: row.platform })).toBe(
				row.expected,
			)
		})
})
