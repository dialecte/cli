import type { StartWorkspace } from './lot-start-workspace.types.ts'

/** A source lot written into a start workspace: where its records and its receipts are. */
export type CarrySourceLot = {
	start: StartWorkspace
	name: string
	lotFolder: string
	/** The source's worktree (real path); where it would be when the cases did not make it. */
	worktree: string
	/** Where the source's ledger is (or would be) in the worktree's git folder; undefined without a worktree. */
	ledgerFile: string | undefined
	/** The commit the ledger's production states were measured from. */
	base: string
}

/** The ledger a source lot is given: the default (valid, two red receipts), none, a text as is, or a variant of the valid one. */
export type CarryLedger =
	| 'default'
	| 'none'
	| { text: string }
	| { version: number }
	| { production: 'none' }
	| { bases: string[] }
