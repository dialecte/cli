/**
 * The one decision on a rehearsal clone, shared by `worktree prune` and `lot close --feature`: the lot it belongs
 * to, read from its marker and the registries, then why it stays, every remover's safety rules in one order.
 */
import { lstatSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'

import { isPresent, realPathThroughAncestors } from '../file-system.ts'
import { entryOfFolder } from '../handover/handover-store-read.ts'
import { readRehearsalRun } from '../handover/live-handover-run.ts'
import { markedHandoverOf, rehearsalMarkerPath } from '../handover/rehearsal-marker.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { storeChildOf } from '../store/lot-items.ts'
import { keptByDecisionOf } from '../store/lot-keep.ts'
import { commonFolderOfLotFolder } from '../store/lot-records.ts'
import { linkReaching } from '../worktree/folder-links.ts'
import { processWorkingIn } from '../worktree/process-folders.ts'
import { OWNER_NOT_SINGLE } from '../worktree/worktree.constants.ts'
import { OWNING_ENTRY_STATES } from './clone-decision.constants.ts'

import type { LotRecord } from '../store/lot-items.types.ts'
import type {
	CloneFacts,
	CloneKeep,
	CloneOwner,
	CloneOwnerRead,
	OwnerReads,
} from './clone-decision.types.ts'

/**
 * The lot a rehearsal clone belongs to, from its marker and the registries read once; undefined for none. The marker's
 * hand-over is a store lot folder present now (its lot, read on the spot when it is not among the reads; one gone or
 * moved aside owns nothing), or a hand-over folder a done registry entry names for exactly one lot's own worktree and
 * branch (two or more: not single). A clone or a marker that cannot be read answers why.
 *
 * @intent read a clone's owning lot the same way for every remover
 * @internal
 */
export function cloneOwnerOf(params: { clone: string; reads: OwnerReads }): CloneOwnerRead {
	const { reads } = params
	let handover: string | undefined
	try {
		handover = markedHandoverOf(rehearsalMarkerPath(params.clone))
	} catch (error) {
		return { unread: (error as Error).message.trim() }
	}
	if (handover === undefined) return undefined
	const named = storeChildOf({ path: handover })
	if (named !== undefined) {
		// a lot folder gone or moved aside releases its clones (KEEP 3.7)
		if (!isPresent(named.child)) return undefined
		const record = reads.lots.find(
			(lot) => storeChildOf({ path: lot.lotFolder })?.child === named.child,
		)
		return record === undefined ? ownerReadNow(named.child) : ownerOfRecord(record)
	}
	const entry = entryOfFolder({ entries: reads.entries, folder: handover })
	if (entry === undefined || !OWNING_ENTRY_STATES.includes(entry.state)) return undefined
	const worktree = keyOf(entry.worktree)
	const owners = reads.lots.filter(
		(lot) =>
			lot.branch === entry.branch && lot.worktree !== undefined && keyOf(lot.worktree) === worktree,
	)
	if (owners.length > 1) return { notSingle: owners.map((lot) => lot.name).join(', ') }
	return owners.length === 0 ? undefined : ownerOfRecord(owners[0])
}

// dialecte-allow duplicate-read: whyKeep and whyKeepWorktree decide a worktree; this one is the rehearsal clone's own rules
/**
 * Why a rehearsal clone stays, or undefined when it may go: every remover's safety rules, in one order, each failing
 * closed. The clone a link; its owner not read or not single; its lot kept (`kept`); its run alive or not told dead;
 * the processes not known, or one working in it; the links not read, or one reaching it. The run read and the link
 * walk that throw keep it as unreadable.
 *
 * @intent never move a clone a process, a link, a run or a kept lot still needs
 * @internal
 */
export function whyKeepClone(params: CloneFacts): CloneKeep | undefined {
	const { clone, owner, processes, links } = params
	if (isLink(clone)) return { tag: 'link', link: clone }
	if (owner !== undefined && 'unread' in owner) return { tag: 'unreadable', reason: owner.unread }
	if (owner !== undefined && 'notSingle' in owner)
		return {
			tag: 'unknown',
			why: fillMessage({ template: OWNER_NOT_SINGLE, values: { lots: owner.notSingle } }),
		}
	if (params.kept !== undefined) return { tag: 'kept', kept: params.kept }
	try {
		const run = readRehearsalRun({
			markerPath: rehearsalMarkerPath(clone),
			readStartTime: params.readStartTime,
		})
		if (run.state === 'alive') return { tag: 'alive', pid: run.pid }
		if (run.state === 'unknown')
			return { tag: 'unknown', why: run.why, ...(run.pid !== undefined && { pid: run.pid }) }
		if (typeof processes === 'string') return { tag: 'unknown', why: processes }
		const working = processWorkingIn({ processes, folder: clone })
		if (working !== undefined) return { tag: 'process', pid: working.pid }
		if (typeof links === 'string') return { tag: 'unknown', why: links }
		const link = linkReaching({ folder: clone, links })
		return link === undefined ? undefined : { tag: 'link', link }
	} catch (error) {
		// the clone went, or cannot be read, while it was looked at: it stays
		return { tag: 'unreadable', reason: (error as Error).message.trim() }
	}
}

/** The owner a lot record of the reads names, with the keep read with it. */
function ownerOfRecord(record: LotRecord): CloneOwner {
	return {
		lot: record.name,
		lotFolder: record.lotFolder,
		main: record.main,
		...(record.kept !== undefined && { kept: record.kept }),
	}
}

/**
 * The owner of a present store lot folder outside the reads (a clone of another workspace's lot: scratch roots are
 * machine-wide), its keep read on the spot, files only: kept, damaged or gone keeps; never taken as unkept unread.
 */
function ownerReadNow(lotFolder: string): CloneOwner {
	const kept = keptByDecisionOf({ lotFolder })
	return {
		lot: basename(lotFolder),
		lotFolder,
		main: dirname(commonFolderOfLotFolder(lotFolder)),
		...(kept !== undefined && { kept }),
	}
}

/** The one key of a worktree path: its real path through its existing ancestors. */
function keyOf(path: string): string {
	return realPathThroughAncestors(resolve(path))
}

/** The path itself is a symbolic link (dangling or not). */
function isLink(path: string): boolean {
	try {
		return lstatSync(path).isSymbolicLink()
	} catch {
		return false
	}
}
