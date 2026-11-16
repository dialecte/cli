import type { HandoverFolder, StoreEntry } from '../handover/handover.types.ts'
import type { RunEntry } from '../mutation/mutation.types.ts'
import type {
	POOL_MISS_BUSY,
	POOL_MISS_CROSS_DEVICE,
	POOL_MISS_EMPTY,
	POOL_MISS_NO_ENTRY,
} from './worktree.constants.ts'

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
	/**
	 * The branch the worktree was cut from (`worktree add`'s start: `--from` as given, else the resolved base branch,
	 * `origin/<b>` when it starts on origin). Absent in a baseline written before it was recorded.
	 */
	from?: string
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
	/** Why origin could not be fetched before the base branch was read; absent when it was, or there is none. */
	fetchProblem?: string
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

/**
 * Where `worktree add` starts a new branch: the commit-ish, its name as the report says it (`main`,
 * `origin/develop`) and the options it is added with (`--no-track`).
 */
export type NewBranchStart = {
	ref: string
	name: string
	options: string[]
	/** Why origin could not be fetched first; absent when it was, or there is none. */
	fetchProblem?: string
}

/** `worktree prune` for one repository. */
export type PrunePlan = {
	repository: string
	/** The base branch's name (`findBaseBranchRef`); undefined when none was found (the repository is skipped). */
	baseBranch?: string
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
	/** The lock key (`computeLockKey`) of the `package-lock.json` text the `node_modules` was checked against. */
	lockKey: string
	/** ISO time. */
	parkedAt: string
	/** Who parked it (a lot's owner), when known. */
	owner?: string
	/**
	 * The version of each package that lock installs, by its lock key (`node_modules/x`), but those npm may leave out
	 * (`optional`, an `os` / `cpu` list), read from the lock alone: read by a near match.
	 */
	packages: Record<string, string>
}

/** The caches of a `node_modules` being parked, renamed aside until the park is sure: their folder and names. */
export type HeldCaches = {
	folder: string
	names: string[]
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

/**
 * A near pool entry taken and given up: the entry, how many packages it differed in from the lock, and why (the first
 * line of the incremental install's failure, or the first problem the check still listed).
 */
export type NearAttempt = { from: string; drift: number; reason: string }

/**
 * Where a new checkout's `node_modules` came from, and how long it took (seconds, one decimal): an exact pool entry, a
 * near one completed by `npm install`, `npm ci`, or a copy when `npm ci` failed.
 */
export type NodeModulesSource =
	| { method: 'pooled'; from: string; seconds: number }
	| {
			method: 'near'
			/** The pool entry's folder name. */
			from: string
			/** How many packages it differed in from the lock (by lock key), before the install. */
			drift: number
			seconds: number
	  }
	| {
			method: 'installed'
			seconds: number
			/** Why the pool gave nothing (a `CacheMiss` text); none when there was no pool to ask. */
			miss?: string
			/** The near entry tried first, when there was one. */
			near?: NearAttempt
	  }
	| (NodeModulesCopy & {
			seconds: number
			/** Why the pool gave nothing (a `CacheMiss` text); none when there was no pool to ask. */
			miss?: string
			/** Why `npm ci` did not install it (the first line of its failure); none when it did not run. */
			reason?: string
			/** The near entry tried first, when there was one. */
			near?: NearAttempt
	  })

/**
 * Runs npm with `args` in `checkout` and waits for it: its exit status and its output (stdout then stderr). The default
 * spawns `npm`; the tests stand in for it so no case ever runs npm.
 */
export type NpmRunner = (params: { checkout: string; args: string[] }) => {
	status: number
	output: string
}

/**
 * Spawns a command in `cwd` and waits for it (the default npm runner's seam; default `spawnSync`): its exit status (null
 * when a signal ended it), its stdout and its stderr.
 */
export type NpmSpawn = (params: { command: string; args: string[]; cwd: string }) => {
	status: number | null
	stdout: string
	stderr: string
}

/** One worktree of `git worktree list --porcelain`: its path, its branch (none when detached), locked or not. */
export type ListedWorktree = { path: string; branch?: string; locked?: boolean }

/** A process and its working folder (a real path). */
export type ProcessFolder = { pid: number; folder: string }

/** What a take answered: the entry's name, or why nothing was taken. */
export type PoolTake =
	| { taken: string }
	| { notTaken: 'no match' | 'cross-device' | 'taken by another' }

/** Why the dependency cache gave nothing: `pool empty`, `no entry for install <key, 8 chars>`, `entry busy`, `cross-device`. */
export type CacheMiss =
	| typeof POOL_MISS_EMPTY
	| `${typeof POOL_MISS_NO_ENTRY} ${string}`
	| typeof POOL_MISS_BUSY
	| typeof POOL_MISS_CROSS_DEVICE

/** What a restore answered: the entry taken, a near entry and its drift (packages that differ), or why none. */
export type CacheRestore = { taken: string } | { near: string; drift: number } | { miss: CacheMiss }

/** What a save answered: the entry parked and the entries it sent to the trash, or why it refused. */
export type CacheSave = { parked: string; trashed: string[] } | { refused: string }

/**
 * Where a checkout's `node_modules` comes from and goes back to, keyed on the lock key: the local store is the
 * pool of `.worktrees/` (`createPoolCache`); a CI or cloud cache is another adapter.
 */
export type DependencyCache = {
	/** Gives `checkout` a `node_modules` installing `lockText` (the checkout's lock), or says why not. */
	restore: (params: { checkout: string; lockText: string; owner?: string }) => CacheRestore
	/**
	 * Keeps `checkout`'s `node_modules`, stamped with the key of `lockText` (the lock it was checked against;
	 * none: the lock on disk, read with the check), or says why not.
	 */
	save: (params: { checkout: string; lockText?: string; owner?: string; now: Date }) => CacheSave
	/** The entries the store holds. */
	list: () => PoolEntry[]
}

/** A worktree or a folder sent to `.worktrees/_trash/`: where it is now. */
export type TrashedFolder = { trashed: string }

/**
 * What `worktree prune --reclaim` does with one worktree: its `node_modules` parked in the pool or sent to the trash
 * (the code stays), the whole worktree trashed (a `-round-<n>` throwaway whose lot is closed), or nothing.
 */
export type ReclaimAction = 'park' | 'trash' | 'trash whole' | 'keep'

/** One worktree of a reclaim plan. */
export type ReclaimItem = {
	/** The repository's main checkout. */
	repository: string
	/** The worktree's path, as `git worktree list` gives it, spelled under the workspace. */
	worktree: string
	action: ReclaimAction
	/** Why it is kept (`keep`), or why its node_modules goes to the trash (`trash`). */
	reason?: string
	/** What would move: the files (and links) of its node_modules, or of the whole worktree for `trash whole`; 0 when kept. */
	files: number
	/** Their size in bytes; 0 when kept. */
	bytes: number
}

/** `worktree prune --reclaim` for a workspace: every worktree of every repository, with what happens to it. */
export type ReclaimPlan = {
	/** Git activity after this time keeps a worktree. */
	cutoff: Date
	items: ReclaimItem[]
}

/** What a reclaim did with one worktree of its plan: its line, and whether something moved. */
export type ReclaimOutcome = { worktree: string; line: string; moved: boolean }

/**
 * What a reclaim reads once for a repository to decide each of its worktrees: files and one `git worktree list`, never
 * a git command that writes (an index refreshed would read as activity).
 */
export type ReclaimContext = {
	/** The repository's main checkout. */
	repository: string
	workspace: string
	/** Git activity after this time keeps a worktree. */
	cutoff: Date
	/** The lock key of the main checkout's `package-lock.json`; none without one. */
	mainLockKey: string | undefined
	/** `git worktree list`, the main checkout first. */
	listed: readonly ListedWorktree[]
	/** The worktrees open lots name, by real path, with their reason `lot <name> <state>`. */
	lotKeeps: ReadonlyMap<string, string>
	/** The worktrees any lot of the store names (open or closed), by real path. */
	lotWorktrees: ReadonlySet<string>
	/** The hand-over registry of the repository. */
	handovers: readonly StoreEntry[]
	/** The processes and their working folders, or why they are not known. */
	processes: readonly ProcessFolder[] | string
	/** The links around the workspace: what they reach is kept. */
	links: readonly FolderLink[]
	/** The repository's mutation runs that still run or died before reporting. */
	runs: readonly RunEntry[]
}

/** A `-round-<n>` throwaway's lot: open (kept, with why) or closed (trashed whole). */
export type ReclaimRound = { open: string } | 'closed'
