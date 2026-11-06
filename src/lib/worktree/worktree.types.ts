import type { HandoverFolder } from '../handover/handover.types.ts'

/** How `node_modules` was copied, and the package links re-pointed so they still reach their target. */
export type NodeModulesCopy = {
	method: 'copy-on-write' | 'copy'
	relinked: string[]
}

/** What a worktree looked like when it was made: `gate --fast` compares with it. */
export type HygieneBaseline = {
	/**
	 * The commits of the stash entries when the worktree was made: any other entry is new, whichever
	 * entries another session drops meanwhile.
	 */
	stashCommits: string[]
	head: string
	/** ISO date. */
	writtenAt: string
}

/** The hygiene of a worktree against its baseline: failures fail the gate, warnings and notes do not. */
export type HygieneReport = {
	failures: string[]
	/** Read-only commands to look at what a failure found. */
	look: string[]
	warnings: string[]
	notes: string[]
}

/** What `worktree add` made. */
export type AddedWorktree = {
	repository: string
	worktree: string
	/** The index the worktree's folder starts with (`0007`). */
	index: string
	branch: string
	/** Where the branch started: the given ref, the base branch, or the existing branch. */
	from: string
	head: string
	/** The hooks folder copied from the main checkout, if any. */
	hooks: string | undefined
	/** Taken from the pool or copied; undefined when there was none to copy. */
	nodeModules: NodeModulesSource | undefined
	/** The links to sibling checkouts the `file:` and `link:` dependencies reach through `.worktrees/`. */
	siblingLinks: SiblingLink[]
	/** The copied `node_modules` read against the worktree's `package-lock.json`. */
	nodeModulesCheck: NodeModulesCheck
	/** How many packages of the lockfile `node_modules` was read against (0 without a lockfile). */
	lockedPackages: number
	baseline: HygieneBaseline
}

/** One `file:` or `link:` dependency whose path reaches a sibling of the worktree under `.worktrees/`. */
export type SiblingLink = {
	/** The dependency's name in package.json. */
	dependency: string
	/** Where the dependency's path leads from the worktree: the link made there. */
	link: string
	/** Where the same path leads from the main checkout: what the link points to. */
	target: string
	/** `created`, `present`, `skipped: <why>` or `kept: <why>`. */
	outcome: string
}

/** One package of the lockfile that `node_modules` does not hold as locked. */
export type NodeModulesProblem = {
	/** The package name, `<name> (under <parent>)` for a nested one. */
	package: string
	/** `missing`, `<installed> installed, lock <locked>`, `link to <resolved> missing` or `… points elsewhere`. */
	problem: string
}

/** One entry of the `packages` map of `package-lock.json` (lockfileVersion 2 or 3). */
export type LockfileEntry = {
	version?: string
	/** For a link: the folder it reaches, relative to the package root. */
	resolved?: string
	link?: boolean
	/** A platform may leave it out. */
	optional?: boolean
	/** The platforms it installs on (`!x`: every one but x). */
	os?: string[]
	/** The architectures it installs on (`!x`: every one but x). */
	cpu?: string[]
	/** Shipped inside its parent package, never installed on its own. */
	inBundle?: boolean
}

/** A package the lockfile installs: its key (`node_modules/a/node_modules/b`) and its entry. */
export type LockedPackage = { key: string; entry: LockfileEntry }

/** Why `node_modules` cannot be read against the lockfile. */
export type LockfileNotChecked = 'no lockfile' | 'unreadable' | 'has no packages map'

/** The packages the lockfile installs here, or why it cannot be read for them. */
export type LockfileRead = { packages: LockedPackage[] } | { notChecked: LockfileNotChecked }

/** `node_modules` read against `package-lock.json`. */
export type NodeModulesCheck = {
	/** Undefined: the worktree has no lockfile, nothing was checked. */
	lockfile: 'package-lock.json' | undefined
	/** The lockfile is there but could not be read for its packages: nothing was checked. */
	notChecked?: Exclude<LockfileNotChecked, 'no lockfile'>
	problems: NodeModulesProblem[]
	/** What puts `node_modules` back as locked, with its absolute `cd`; only when there are problems. */
	command?: string
}

/** One thing `worktree prune` removes, or keeps with why. */
export type PruneItem = {
	kind: 'worktree' | 'branch' | 'hand-over' | 'rehearsal clone'
	/** The worktree or hand-over path, the branch name. */
	name: string
	/** Absent: removed by `command`. */
	kept?: string
	/** The removal, with its absolute `cd`. */
	command?: string
}

/** A hand-over `worktree prune` read, with the common git folder of its repository (undefined: in none). */
export type PruneHandover = { handover: HandoverFolder; commonFolder: string | undefined }

/** A symbolic link prune found, and the real path it reaches. */
export type FolderLink = { link: string; target: string }

/** `worktree prune` for one repository. */
export type PrunePlan = {
	repository: string
	baseBranch: string
	items: PruneItem[]
	/** Why the repository was skipped as a whole. */
	skipped?: string
}

/** One entry of `git stash list`. */
export type StashEntry = {
	/** Its place in the stash: `stash@{index}`. */
	index: number
	commit: string
	/** `WIP on <branch>: <sha> <subject>` or `On <branch>: <message>`. */
	subject: string
	/** The branch the entry was pushed on, read from its subject. */
	branch?: string
}

/**
 * `worktree prune` for a workspace: each repository, the rehearsal clones left behind, and what prune never
 * touches: the pool entries by repository, the folders in the trash.
 */
export type WorkspacePrunePlan = {
	repositories: PrunePlan[]
	scratch: PruneItem[]
	/** The pool entries of each repository, by its folder name. */
	pool: { repository: string; entries: number }[]
	/** The `_pool-*` folders with no `pool.json` (a park that never finished): left for the person to look at. */
	poolLeftOver: string[]
	/** How many folders `.worktrees/_trash/` holds. */
	trash: number
}

/** How a `cp` ended: its exit status, or the signal that stopped it. */
export type CopyRun = { status: number | null; signal: NodeJS.Signals | null }

/**
 * Starts a command in the background and never waits for it (detached, its output ignored); the tests stand
 * in for it and record the calls.
 */
export type BackgroundSpawner = (params: { command: string; args: string[]; cwd?: string }) => void

/** What `pool.json` holds beside a pooled `node_modules`. */
export type PoolEntryFile = {
	/** The repository's folder name (`cli`). */
	repository: string
	/** sha256 (hex) of the `package-lock.json` the `node_modules` was checked against. */
	lockHash: string
	/** ISO time. */
	parkedAt: string
}

/** A `node_modules` parked in the pool. */
export type ParkedNodeModules = {
	/** The pool entry's folder name (`_pool-cli-1`). */
	entry: string
	/** The entries the park sent to the trash (the oldest of a repository past two), by folder name. */
	trashed: string[]
}

/** A pool entry of `.worktrees/`: its folder name and its `pool.json`. */
export type PoolEntry = { name: string; file: PoolEntryFile }

/** Where a new checkout's `node_modules` came from, and how long it took (seconds, one decimal). */
export type NodeModulesSource =
	| { method: 'pooled'; from: string; seconds: number }
	| (NodeModulesCopy & { seconds: number })

/** One worktree of `git worktree list --porcelain`: its path, its branch (none when detached), locked or not. */
export type ListedWorktree = { path: string; branch?: string; locked?: boolean }

/** A process and its working folder (a real path). */
export type ProcessFolder = { pid: number; folder: string }

/** What a take answered: the entry's name, or why nothing was taken. */
export type PoolTake =
	| { taken: string }
	| { notTaken: 'no match' | 'cross-device' | 'taken by another' }

/** A worktree or a folder sent to `.worktrees/_trash/`: where it is now. */
export type TrashedFolder = { trashed: string }
