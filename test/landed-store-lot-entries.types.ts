import type { StoreEntry } from '../src/lib/handover/handover.types.ts'
import type { LotIdentity } from '../src/lib/store/store.types.ts'

/** One registry entry of a row of the entry table, described by what matters to the rule. */
export type EntrySpec = {
	/** The entry's registry name: what a row names as the answer. */
	name: string
	state: StoreEntry['state']
	/** Registers the lot's own folder, or a folder elsewhere (default). */
	at?: 'lot-folder' | 'elsewhere'
	/** The worktree it names: the lot's (default), the lot's reached through a symbolic link, or another one. */
	worktree?: 'lot' | 'link' | 'other'
	/** The branch it names: the lot's (default) or another. */
	branch?: 'lot' | 'other'
	/** When it was written (ISO 8601); a fixed early time by default. */
	written?: string
}

/** The folders and the identity the entries of a row are resolved against. */
export type EntryScene = {
	identity: LotIdentity
	lotFolder: string
	worktree: string
	/** A second spelling of the lot's worktree. */
	link: string
	otherWorktree: string
}
