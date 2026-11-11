/**
 * What `lot close` keeps in `cards.log` around the move of a worktree (33L0 sections 2 and 8, D6): before it, the
 * lot's final record (the hand-over's own `card` line, else a catch-up one, read back) and the `removing` intent;
 * after it, the `removed` outcome. A failure before the move keeps the worktree; the outcome's failure only warns.
 */
import { randomUUID } from 'node:crypto'

import { readCardsLog, writeCard, writeRemoved, writeRemoving } from '../events/cards-log.ts'
import { warnOnStandardError } from '../events/record-step.ts'
import { freezeRecordTimes, readHookHead } from '../events/record-times.ts'
import { realPathOf } from '../file-system.ts'
import { readGit } from '../git.ts'
import { findCommittedLots } from './find-committed-lots.ts'
import { buildHandoverCard } from './handover-card.ts'
import {
	CARD_NOT_READ_BACK,
	FINAL_RECORD_NOT_KEPT,
	LOT_COMMIT_NOT_KNOWN,
	REMOVAL_ID_PREFIX,
	REMOVED_NOT_WRITTEN,
	SIBLING_KEPT,
} from './handover.constants.ts'
import { readHandoverFolder } from './read-handover-folder.ts'
import { buildCardLine, lotOfHandoverFolder } from './record-card-line.ts'

import type { CardInput } from '../events/cards-log.types.ts'
import type { CatchUpRole, HandoverCard, HandoverFolder, StoreEntry } from './handover.types.ts'

/**
 * Keeps the final record of every hand-over reaching the worktree (`entries`, its owner first), then writes the
 * `removing` line of the worktree under the owner's lot: the removal's id and log, or why the worktree stays (nothing
 * moved, the first that cannot be kept). A committed lot's final record is a `card` line of `(name, lot, state)` at
 * any head; a canceled lot's, one at the worktree's HEAD. Without one, a catch-up line (`recomputed`,
 * `by: lot-close`) is written and read back.
 */
export function keepFinalRecord(params: {
	entries: readonly StoreEntry[]
	/** The worktree about to move. */
	worktree: string
	/** The repository's `cards.log`. */
	file: string
}): { id: string; file: string } | { kept: string } {
	const { file } = params
	const [owner] = params.entries
	if (owner === undefined) return { kept: 'not decided' }
	const worktree = realPathOf(params.worktree)
	// the hook record names the worktree's last hooked commit: the owner's only when no other committed or abandoned
	// hand-over shares the worktree (either may have committed after the owner)
	const hookIsOwners = !params.entries.some(
		(entry) => entry !== owner && (entry.state === 'committed' || entry.state === 'abandoned'),
	)
	for (const entry of params.entries) {
		const sibling = entry !== owner
		const record = keptCardOf({
			entry,
			worktree,
			shown: params.worktree,
			file,
			role: sibling ? 'sibling' : hookIsOwners ? 'sole-owner' : 'owner',
		})
		// a sibling's reason names it: the worktree is kept for another hand-over than the one closed
		if (record !== undefined)
			return sibling
				? { kept: SIBLING_KEPT.replace('{name}', entry.name).replace('{reason}', record.kept) }
				: record
	}
	try {
		const { lot } = lotOfHandoverFolder({ folder: owner.folder })
		const id = `${REMOVAL_ID_PREFIX}${randomUUID()}`
		writeRemoving({
			file,
			line: {
				id,
				at: new Date().toISOString(),
				lot,
				item: 'worktree',
				path: worktree,
				branch: owner.branch,
				tip: headOf({ worktree }),
				records: freezeRecordTimes({ worktree }),
				by: 'lot-close',
			},
		})
		return { id, file }
	} catch (error) {
		return { kept: FINAL_RECORD_NOT_KEPT.replace('{reason}', (error as Error).message.trim()) }
	}
}

/** `keepCard`, why the worktree stays instead of a throw (`final record not kept: <reason>`). */
function keptCardOf(params: {
	entry: StoreEntry
	worktree: string
	shown: string
	file: string
	role: CatchUpRole
}): { kept: string } | undefined {
	try {
		return keepCard(params)
	} catch (error) {
		return { kept: FINAL_RECORD_NOT_KEPT.replace('{reason}', (error as Error).message.trim()) }
	}
}

/**
 * The hand-over's final record kept: nothing when its `card` line is there (a committed lot's at any head, a canceled
 * lot's at the worktree's HEAD), else a catch-up line written and read back; why the worktree stays when the owner's
 * commit is not known (a sibling's unknown commit writes `head: null`). A log that cannot be read or written throws.
 */
function keepCard(params: {
	entry: StoreEntry
	/** The worktree's real path. */
	worktree: string
	/** The worktree as the close names it, in the way out of a kept reason. */
	shown: string
	file: string
	role: CatchUpRole
}): { kept: string } | undefined {
	const { entry, worktree, file } = params
	const state: CardInput['state'] = entry.state === 'committed' ? 'committed' : 'canceled'
	const { lot } = lotOfHandoverFolder({ folder: entry.folder })
	// one final record per committed lot; a canceled lot gets a line at each HEAD it is closed at
	const head = state === 'canceled' ? headOf({ worktree }) : undefined
	if (hasCard({ file, name: entry.name, lot, state, head })) return undefined
	const line = catchUpLine({ entry, worktree, shown: params.shown, state, role: params.role })
	if ('kept' in line) return line
	writeCard({ file, line })
	if (!hasCard({ file, name: entry.name, lot, state, head: line.head }))
		throw new Error(CARD_NOT_READ_BACK.replace('{file}', file))
	return undefined
}

/**
 * The `removed` line of a removal: `trashed` with the trashed path, or `kept` with why the move failed. A line that
 * cannot be written prints one warning on standard error: the move is done, the next reader sees `unknown`.
 */
export function recordRemoved(params: {
	file: string
	id: string
	/** `trashed` undefined: moved, then something after the move failed (the trashed path is not known). */
	outcome: { trashed: string | undefined } | { kept: string }
}): void {
	const { outcome } = params
	try {
		writeRemoved({
			file: params.file,
			line: {
				id: params.id,
				at: new Date().toISOString(),
				...('trashed' in outcome
					? {
							outcome: 'trashed',
							// the real path, as the `removing` line's `path`
							...(outcome.trashed !== undefined && { trashed: realPathOf(outcome.trashed) }),
						}
					: { outcome: 'kept', reason: outcome.kept }),
			},
		})
	} catch (error) {
		warnOnStandardError(REMOVED_NOT_WRITTEN.replace('{reason}', (error as Error).message))
	}
}

/** Whether the log holds a `card` line of the key (any head unless `head` is given); a log that cannot be read throws. */
function hasCard(params: {
	file: string
	name: string
	lot: string | null
	state: CardInput['state']
	head?: string | null
}): boolean {
	return readCardsLog({ file: params.file }).cards.some(
		(card) =>
			card.name === params.name &&
			card.lot === params.lot &&
			card.state === params.state &&
			(params.head === undefined || card.head === params.head),
	)
}

/**
 * The catch-up `card` line: the card rebuilt (no probe) when the folder holds a written hand-over and the head is
 * known, else `null` (the usage then read from the folder). A
 * committed lot's head is the last of its lot commits when every lot is found (they name the lot exactly; a hook
 * record naming another commit is no reason to keep). Else the `sole-owner` takes the hook record's (no other
 * committed or abandoned lot shares the worktree: its last hooked commit is this lot's), a `sibling` writes `head: null` (its
 * commit is not the closed lot's concern), and an owner with neither keeps the worktree. A canceled lot's head is the
 * worktree's HEAD.
 */
function catchUpLine(params: {
	entry: StoreEntry
	worktree: string
	shown: string
	state: CardInput['state']
	role: CatchUpRole
}): CardInput | { kept: string } {
	const { entry, worktree, state, role } = params
	const read = readHandoverFolder(entry.folder)
	const handover = typeof read === 'string' ? undefined : read
	const commits = handover === undefined ? [] : lotCommitsOf({ handover, worktree })
	const located =
		handover !== undefined && commits.length === handover.lots.length ? commits.at(-1) : undefined
	const head =
		state === 'canceled'
			? headOf({ worktree })
			: (located ?? (role === 'sole-owner' ? readHookHead({ worktree }) : undefined))
	if (head === undefined && role !== 'sibling')
		return { kept: LOT_COMMIT_NOT_KNOWN.replaceAll('{worktree}', params.shown) }
	// a sibling whose commit is not known: its lots are not in this worktree's tree, no card to rebuild from it
	const card =
		handover === undefined || head === undefined
			? null
			: rebuiltCard({ handover, commits, canceled: state === 'canceled' })
	return buildCardLine({
		folder: entry.folder,
		card,
		name: entry.name,
		state,
		branch: entry.branch,
		head: head ?? null,
		base: handover?.lotsFile.head ?? null,
		recordsRoot: worktree,
		by: 'lot-close',
		recomputed: true,
	})
}

/** The commits of the hand-over's lots found on the worktree's HEAD above the lots file's head, the first lot first. */
function lotCommitsOf(params: { handover: HandoverFolder; worktree: string }): string[] {
	const { handover } = params
	return findCommittedLots({
		root: params.worktree,
		head: handover.lotsFile.head,
		tip: 'HEAD',
		lots: handover.lots,
	}).commits
}

/**
 * The hand-over's card rebuilt: done for a committed lot, abandoned and not done for a canceled one; both skip the
 * probe (no process of the repository's cli is started).
 */
function rebuiltCard(params: {
	handover: HandoverFolder
	commits: readonly string[]
	canceled: boolean
}): HandoverCard {
	const { lotsFile } = params.handover
	const card = buildHandoverCard({
		root: lotsFile.repository,
		folder: params.handover.folder,
		branch: lotsFile.branch,
		head: lotsFile.head,
		notes: undefined,
		lots: params.handover.lots,
		commits: params.commits,
		...(params.canceled ? { abandoned: true } : { done: true }),
		probe: function noProbe() {
			return false
		},
		release: lotsFile.release === true,
	})
	return params.canceled ? { ...card, done: false } : card
}

/** The worktree's HEAD, full sha. */
function headOf(params: { worktree: string }): string {
	return readGit({ root: params.worktree, args: ['rev-parse', 'HEAD'] }).trim()
}
