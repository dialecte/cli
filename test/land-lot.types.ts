import type { HostAdapter } from '../src/lib/host/host.types.ts'

/** A repository to land a lot from: its main checkout, its bare origin, the lot's worktree and store folder. */
export type LandingRepository = {
	root: string
	origin: string
	worktree: string
	lotFolder: string
}

/** A fake host, the calls it was asked in order, and the body of each pull request it opened. */
export type RecordingHost = { host: HostAdapter; calls: string[]; bodies: string[] }
