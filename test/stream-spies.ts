/** Spies that hold what a command prints on the streams across a whole test (restored by `vi.restoreAllMocks`). */
import { vi } from 'vitest'

import type { StreamSpies } from './stream-spies.types.ts'

/** Silences both streams and records their writes; a warning and an error both land on `stderr`. */
export function spyStreams(): StreamSpies {
	return {
		stdout: vi.spyOn(process.stdout, 'write').mockImplementation(() => true),
		stderr: vi.spyOn(process.stderr, 'write').mockImplementation(() => true),
	}
}

/** The lines written so far to a stream, in order: each chunk split at its line feeds, the one ending it dropped. */
export function linesWritten(spy: StreamSpies['stdout'] | StreamSpies['stderr']): string[] {
	return spy.mock.calls.flatMap(function linesOfChunk(call) {
		const chunk = String(call[0])
		return (chunk.endsWith('\n') ? chunk.slice(0, -1) : chunk).split('\n')
	})
}
