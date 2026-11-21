import type { HostAdapter } from '../lib/host/host.types.ts'
import type { LotIdentity, LotStateName } from '../lib/store/store.types.ts'
import type { BackgroundSpawner, ProcessFolder } from '../lib/worktree/worktree.types.ts'
import type { LotPruneLotOutput } from './lot-prune.types.ts'

/** What `dialecte lot close --feature` is called with: the command line, and the seams the tests stand in for. */
export type LotCloseFeatureParams = {
	cwd: string
	argv: string[]
	now?: Date
	/** Where lots land through pull requests; default: the repository's host. */
	host?: HostAdapter
	/** Lists the processes and their working folders; a throw is "not known". Default: the system's. */
	listProcesses?: () => ProcessFolder[] | string
	/** Starts the background removals; default: a detached process. */
	spawner?: BackgroundSpawner
	/** Where rehearsal clones are made; default: this machine's (`machineScratchRoots`). */
	scratchRoots?: readonly string[]
	/** Reads a pid's start time (a rehearsal marker's owner); default `processStartTime`. */
	readStartTime?: (pid: number) => string | undefined
}

/** A lot of the feature as the close reads it first: its name, folder, identity, state, and its keep. */
export type FeatureLot = {
	name: string
	lotFolder: string
	identity: LotIdentity | undefined
	state: LotStateName | 'damaged'
	simulated: boolean
	/** Why it is kept on purpose; absent when it is not. */
	kept?: string
}

/**
 * `lot close --feature --json`: the open lots that refuse the close (`{ lot, state }`), each lot with its worktree,
 * throwaways and clones, and the rehearsal clones of no lot of the feature, each kept with why. Every list is present,
 * empty when nothing is in it.
 */
export type LotCloseFeatureOutput = {
	open: { lot: string; state: string }[]
	lots: LotPruneLotOutput[]
	clones: { clone: string; kept: string }[]
}
