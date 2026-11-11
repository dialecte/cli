import type { WorktreeCli } from '../src/lib/events/event.types.ts'

/** A station run: its times as `10:05` (or `null` for a side the run lacks) and the fields of each side. */
export type StationRunParams = {
	run: string
	station: string
	start: string | null
	end: string | null
	startFields?: Record<string, unknown>
	endFields?: Record<string, unknown>
}

/** A step run: as `StationRunParams`, the worktree (the lot's unless said), a throwaway, the envelope's `worktreeCli`. */
export type StepRunParams = {
	run: string
	step: string
	start: string | null
	end: string | null
	worktree?: string
	throwaway?: boolean
	worktreeCli?: { worktreeCli: WorktreeCli | null }
	startFields?: Record<string, unknown>
	endFields?: Record<string, unknown>
}
