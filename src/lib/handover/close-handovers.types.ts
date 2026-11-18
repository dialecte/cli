import type { ProcessFolder } from '../worktree/worktree.types.ts'
import type { ListedWorktree, NodeModulesCheck } from '../worktree/worktree.types.ts'
import type { CloseSettle } from './close-targets.types.ts'
import type { CloseTarget, StoreEntry } from './handover.types.ts'

/** The lot's own declaration to archive into its lot folder before the worktree moves: where, and its bytes. */
export type DeclarationArchive = { path: string; bytes: string }

/** What `whyKeep` lets go: the worktree, the commits only its branch's reflog holds once it goes, the archive to write. */
export type Kept = {
	worktree: ListedWorktree
	/** The branch the worktree is on: the target's, compared before it is let go. */
	branch: string
	dropped: string | undefined
	archive: DeclarationArchive | undefined
}

/**
 * One target's decision before anything moves: kept with why, closed already (nothing to move), or let go with the
 * check of its `node_modules` made where it is.
 */
export type Decision =
	| { kept: string }
	| { alreadyClosed: true }
	| (Kept & { check: NodeModulesCheck | undefined; checkedLockText: string | undefined })

/** What a close's decisions read: the targets and where they are, read once. */
export type CloseDecisionParams = {
	/** Where the registry is looked for (a worktree or the main checkout of the repository). */
	cwd: string
	/** The folder the command runs from: a worktree holding it is kept. */
	runFrom: string
	settled: CloseSettle
	/** Lists the processes and their working folders; a throw is "not known". Default: the system's. */
	listProcesses?: () => ProcessFolder[] | string
	/** Where rehearsal clones are made: their links are read with the workspace's. Default: none. */
	scratchRoots?: readonly string[]
	/**
	 * The registry's entries as the caller reads them: a dry plan passes a merged lot's entry as committed, since its
	 * acts commit it before anything moves. Default: the registry read now.
	 */
	registered?: readonly StoreEntry[]
}

/** What the decisions read once and the acts use: the repository, the registry, the targets and their keys. */
export type CloseContext = {
	main: string
	store: string | undefined
	worktreesFolder: string
	registered: readonly StoreEntry[]
	targets: CloseTarget[]
	keys: string[]
	lotOwners: Map<string, string>
	cardsLog: string
}
