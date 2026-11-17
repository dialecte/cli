import type { StoreEntry } from '../lib/handover/handover.types.ts'
import type { HealthFinding } from '../lib/health/health.types.ts'
import type { SkippedStore } from '../lib/health/walk-stores.types.ts'
import type { LotStatusJson } from './lot-status.types.ts'

/** What `runInbox` takes: where it runs, the words after `inbox`, and the seams the tests inject. */
export type InboxParams = {
	cwd: string
	/** The words after the command: the options. */
	argv: string[]
	seams?: InboxSeams
	/** The clock; the process's by default. */
	now?: Date
	/** The folder scratch folders are looked for in; the system's temporary folder by default. */
	tmp?: string
	/** Whether a process is alive; the machine's by default. */
	isAlive?: (pid: number) => boolean
}

/** The seams of the inbox's reads. */
export type InboxSeams = {
	/** Called with the registry's folder each time the inbox reads the hand-over registry of a repository. */
	onRegistryRead?: (registry: string) => void
	/** Called with the git common dir each time the inbox reads a repository for its health findings. */
	onHealthRead?: (common: string) => void
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
	skipped: SkippedStore[]
}

/** `inbox --json`. */
export type InboxJson = {
	waiting: LotStatusJson[]
	working: number
	simulated: number
	damaged: DamagedLot[]
	/** The stores of the store list that could not be listed; only when there is one. */
	skipped?: SkippedStore[]
	/** The health findings of the last 24 hours, red first, newest first; empty when none. */
	health: HealthFinding[]
}

/** What the inbox reads a store with: the options that filter it. */
export type InboxReading = {
	/** The basename the lots' repository folder must have; every repository when left out. */
	repository: string | undefined
	/** Whether simulated lots that wait are listed (they are counted either way). */
	withSimulated: boolean
	seams: InboxSeams | undefined
}

/** What one lot adds to the inbox: its lines, and whether it counts as working or simulated (0 or 1). */
export type LotListing = { items: InboxItem[]; working: number; simulated: number }

/** What one store gave the inbox: its git common dir, the registry entries it read, its lots and damaged folders. */
export type StoreReading = LotListing & {
	common: string
	entries: StoreEntry[]
	damaged: DamagedLot[]
}

/** What the inbox reads the health findings with: the stores read, the repository asked for, the clock and seams. */
export type InboxHealthReading = {
	stores: readonly StoreReading[]
	/** The repository name the findings must have; every repository and the scratch folders when left out. */
	repository: string | undefined
	now: Date
	/** The folder the scratch root is read from. */
	cwd: string
	/** The one folder earlier versions' scratch is read in (a test's own); every former root on the machine without. */
	tmp: string | undefined
	isAlive: (pid: number) => boolean
	seams: InboxSeams | undefined
}
