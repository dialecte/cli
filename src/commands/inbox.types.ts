import type { LotStatusJson } from './lot-status.types.ts'

/** What `runInbox` takes: where it runs, the words after `inbox`, and the seams the tests inject. */
export type InboxParams = {
	cwd: string
	/** The words after the command: the options. */
	argv: string[]
	seams?: InboxSeams
}

/** The seams of the inbox's reads. */
export type InboxSeams = {
	/** Called with the registry's folder each time the inbox reads the hand-over registry of a repository. */
	onRegistryRead?: (registry: string) => void
}

/** What the inbox lists a waiting lot for, in the order the groups print. */
export type InboxGroup = 'person' | 'caller' | 'ready' | 'failed'

/** One line of the inbox: a lot waiting on someone (one per open question), with what sorts it. */
export type InboxItem = {
	group: InboxGroup
	index: string
	name: string
	/** The question's place among the lot's open questions; 0 for a lot without one. */
	order: number
	/** The columns of the line, agent text already escaped. */
	columns: string[]
	status: LotStatusJson
}

/** A folder of a store that holds no readable lot, and why. */
export type DamagedLot = { folder: string; reason: string }

/** What the inbox found across the stores. */
export type InboxListing = {
	items: InboxItem[]
	working: number
	simulated: number
	damaged: DamagedLot[]
}

/** `inbox --json`. */
export type InboxJson = {
	waiting: LotStatusJson[]
	working: number
	simulated: number
	damaged: DamagedLot[]
}

/** What the inbox reads a store with: the options that filter it and the listing it adds to. */
export type InboxReading = {
	/** The basename the lots' repository folder must have; every repository when left out. */
	repository: string | undefined
	/** Whether simulated lots that wait are listed (they are counted either way). */
	withSimulated: boolean
	seams: InboxSeams | undefined
	listing: InboxListing
}
