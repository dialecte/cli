/** What a scratch bench package is made of. */
export type BenchRepositoryParams = {
	/** The count the base commit holds. */
	baseCount: number
	/** The count a head commit on `feat/change` holds; none: HEAD is the base, on `main`. */
	headCount?: number
	/** More files the base commit holds. */
	baseFiles?: Record<string, string>
	/** More files the head commit holds. */
	headFiles?: Record<string, string>
	/** Files written after the commits, not committed: the working tree's own. */
	workingFiles?: Record<string, string>
	/** The left-pad version the base's lock installs; none: no lock at the base. */
	baseLock?: string
	/** The left-pad version the head's lock installs; none: no lock at the head. */
	headLock?: string
	/** The left-pad version the head's `node_modules` holds; default: the head's lock's. */
	installed?: string
	/** The head's `node_modules/.cache` is a file: method discovery fails at the head. */
	discoveryFailsAtHead?: boolean
	/** No generated definition at all: the package has no target. */
	withoutTargets?: boolean
}

/** A scratch bench package: its root, its commits, the log of its fake compiler, the scratch root of the test. */
export type BenchRepository = {
	root: string
	/** The base commit, on `main`. */
	base: string
	/** HEAD's commit. */
	head: string
	/** The log the fake compilers write: one line per run. */
	log: string
	/** The scratch root the run's base tree is made in. */
	scratch: string
	/** A clean environment for the run: no `CI`, the scratch root, the PATH and HOME. */
	environment: Record<string, string>
}

/** One run of a fake compiler, read from its log. */
export type CompilerRun = {
	/** `$0`: the compiler that ran, as invoked. */
	program: string
	/** `pwd`: the folder it ran in. */
	folder: string
	/** `$*`. */
	args: string
	/** Which fake ran: the head's, or the one an installer put in a base tree. */
	compiler: 'head' | 'other'
}
