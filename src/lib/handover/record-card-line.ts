/**
 * The `card` line of a lot's final record in the repository's `cards.log` (33L0 section 8): the one builder of
 * `handover run` (D5, once every lot is committed) and `lot close` (D6, the catch-up before a move), and the line
 * `handover run` appends.
 */
import { join } from 'node:path'

import { CARDS_LOG_FILE } from '../events/cards-log.constants.ts'
import { writeCard } from '../events/cards-log.ts'
import { readHandoverUsage } from '../events/handover-usage.ts'
import { warnOnStandardError } from '../events/record-step.ts'
import { freezeRecordTimes } from '../events/record-times.ts'
import { realPathOf } from '../file-system.ts'
import { mainCheckoutOf, tryReadGit } from '../git.ts'
import { readIdentity } from '../store/identity.ts'
import { lotFolderOf, lotNameOfPath } from '../store/lot-folder.ts'
import { handoverCardData } from './handover-card.ts'
import { findHandoverStore } from './handover-store.ts'
import { CARD_LINE_NOT_WRITTEN } from './handover.constants.ts'

import type { CardBy, CardInput } from '../events/cards-log.types.ts'
import type { HandoverCard, HandoverFolder } from './handover.types.ts'

/**
 * Appends the committed hand-over's `card` line (`by: handover-run`): `head` the last lot commit, `base` the lots
 * file's head. A line that cannot be written prints one warning naming `cards.log` on standard error and changes
 * nothing else.
 */
export function recordCardLine(params: {
	handover: HandoverFolder
	card: HandoverCard
	/** Where the lots were committed: its git folder holds the records the line freezes. */
	commitRoot: string
}): void {
	const { handover, card } = params
	try {
		const store = findHandoverStore(handover.lotsFile.repository)
		if (store === undefined) throw new Error('the repository has no git folder')
		writeCard({
			file: join(store, CARDS_LOG_FILE),
			line: buildCardLine({
				folder: handover.folder,
				card,
				name: card.name ?? null,
				state: 'committed',
				branch: handover.lotsFile.branch,
				head: card.tip ?? null,
				base: handover.lotsFile.head,
				recordsRoot: params.commitRoot,
				by: 'handover-run',
			}),
		})
	} catch (error) {
		warnOnStandardError(CARD_LINE_NOT_WRITTEN.replace('{reason}', (error as Error).message))
	}
}

/**
 * The lot a hand-over folder is: its full name from its path when it sits directly under a store (a folder gone since
 * keeps its lot), its feature from its identity when it is a lot folder still; `null` else.
 */
export function lotOfHandoverFolder(params: { folder: string }): {
	lot: string | null
	feature: string | null
} {
	const lotFolder = lotFolderOf({ folder: params.folder })
	const identity = lotFolder === undefined ? undefined : readIdentity({ lotFolder })
	return {
		lot: lotNameOfPath({ folder: params.folder }) ?? null,
		feature: identity?.feature ?? null,
	}
}

/**
 * A `card` line's fields: the key `(name, lot, state, head)`, the repository (the real path of `recordsRoot`'s main
 * checkout: it outlives the worktree), the base as a full sha (as given when git does not know it), the card data
 * (`null` without a card), the lot's usage (the card's; without a card, the lot folder's events), the records frozen
 * from `recordsRoot`. Written now.
 */
export function buildCardLine(params: {
	/** The hand-over folder: its lot (a lot folder) or none. */
	folder: string
	card: HandoverCard | null
	name: string | null
	state: CardInput['state']
	branch: string
	head: string | null
	base: string | null
	/** The worktree top whose git folder holds the records the line freezes; git runs there. */
	recordsRoot: string
	by: CardBy
	/** A line `lot close` recomputed (the hand-over's own run wrote none). */
	recomputed?: true
}): CardInput {
	const { card } = params
	const usage = card === null ? readHandoverUsage({ folder: params.folder }) : card.usage
	return {
		at: new Date().toISOString(),
		...lotOfHandoverFolder({ folder: params.folder }),
		name: params.name,
		state: params.state,
		repository: realPathOf(mainCheckoutOf(params.recordsRoot)),
		branch: params.branch,
		head: params.head,
		base: params.base === null ? null : fullShaOf({ root: params.recordsRoot, rev: params.base }),
		card: card === null ? null : handoverCardData(card),
		usage: usage ?? null,
		records: freezeRecordTimes({ worktree: params.recordsRoot }),
		by: params.by,
		...(params.recomputed && { recomputed: true }),
	}
}

/** The full sha of the commit `rev` names in `root`; `rev` as given when git does not know it. */
function fullShaOf(params: { root: string; rev: string }): string {
	const sha = tryReadGit({
		root: params.root,
		args: ['rev-parse', '--verify', '--quiet', `${params.rev}^{commit}`],
	})
	return sha?.trim() || params.rev
}
