/** The shape check of a mutation run file, pure: shared by the run store and the report's git-free reader. */
import type { RunEntry } from './mutation.types.ts'

/** True for a value holding a run entry's identity: its id, pid, start and state. */
export function isRunEntry(value: unknown): value is RunEntry {
	if (typeof value !== 'object' || value === null) return false
	const entry = value as Record<string, unknown>
	return (
		typeof entry.runId === 'string' &&
		typeof entry.pid === 'number' &&
		typeof entry.startedAt === 'string' &&
		typeof entry.state === 'string'
	)
}
