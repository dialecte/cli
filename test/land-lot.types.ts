import type { HostAdapter } from '../src/lib/host/host.types.ts'

/** A repository to land a lot from: its main checkout, its bare origin, the lot's worktree and store folder. */
export type LandingRepository = {
	root: string
	origin: string
	worktree: string
	lotFolder: string
}

/** A fake host and the calls it was asked, in order. */
export type RecordingHost = { host: HostAdapter; calls: string[] }
