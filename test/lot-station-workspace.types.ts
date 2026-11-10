import type { LotEvent } from '../src/lib/events/event.types.ts'
import type { BriefWorkspace } from './brief-workspace.types.ts'

/** A lot of a scratch store the station tests record into. */
export type StationLot = {
	workspace: BriefWorkspace
	name: string
	lotFolder: string
	/** The folder the verbs run from: the lot's repository. */
	cwd: string
	/** Where the lot's events go (it may not exist yet). */
	eventsFile: string
	/** The path the lot's identity names as its worktree (it does not exist unless a test makes it). */
	worktree: string
}

/** What one call answered: its exit, its output and the output read as JSON (undefined when it is not). */
export type StationAnswer = { exitCode: number; output: string; json: any }

/** The answers of the calls in order, and the events the lot's file holds after them. */
export type StationRecording = { answers: StationAnswer[]; events: LotEvent[] }
