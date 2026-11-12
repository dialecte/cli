import type { SuiteFamily, TddEntryTime } from './unrecorded-steps.types.ts'

/**
 * The record times a line freezes (null for a record that does not exist; `tdd: null` for a ledger that could not be
 * read); `cut` when older tdd entries were dropped.
 */
export type FrozenRecords = {
	'gate-fast': string | null
	'gate-full': string | null
	'gate-release': string | null
	contrib: string | null
	'gate-hook': string | null
	tdd: TddEntryTime[] | null
	cut?: boolean
	/** The families whose gate record existed but could not be read when the line was written. */
	unreadable?: SuiteFamily[]
}

/** Who wrote a card line. */
export type CardBy = 'handover-run' | 'lot-close' | 'lot-prune'

/** What a caller gives to write a `card` line: the writer adds the schema and the kind. */
export type CardInput = {
	at: string
	lot: string | null
	name: string | null
	state: 'committed' | 'canceled'
	feature: string | null
	repository: string
	branch: string
	head: string | null
	base: string | null
	/** The hand-over's card data; only its `tdd` list is cut, after 40 entries. */
	card: Record<string, unknown> | null
	usage: Record<string, unknown> | null
	records: FrozenRecords | null
	by: CardBy
	recomputed?: boolean
}

/** A `card` line as read: `cut` is true when the writer cut a list. */
export type CardLine = CardInput & { schema: 1; kind: 'card'; cut?: boolean }

/** What a caller gives to write a `removing` line (the intent, before the move). */
export type RemovingInput = {
	id: string
	at: string
	lot: string | null
	item: 'worktree' | 'throwaway' | 'branch'
	path: string
	branch: string | null
	/** The full sha of the branch tip. */
	tip: string | null
	records: FrozenRecords | null
	by: 'lot-close' | 'lot-prune'
}

/** What a caller gives to write a `removed` line (the outcome, after the move). */
export type RemovedInput = {
	id: string
	at: string
	outcome: 'trashed' | 'deleted' | 'kept'
	trashed?: string
	reason?: string
}

/** One removal: its intent, joined by `id` to its outcome; `unknown` when no outcome line was written (a crash). */
export type Removal = RemovingInput & {
	outcome: 'trashed' | 'deleted' | 'kept' | 'unknown'
	trashed: string | null
	reason: string | null
}

/** What the reader found. Lines it cannot trust are skipped and counted. */
export type CardsLogRead = {
	/** The first card per key (name, lot, state, head), in file order. */
	cards: CardLine[]
	removals: Removal[]
	damaged: number
	unknownKinds: number
}

/** The lines of one lot. */
export type LotCardsLog = { cards: CardLine[]; removals: Removal[] }
