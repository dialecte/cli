/** The repository-cli probes the card tests pass instead of starting `npx`: a repository with no cli, one with a cli. */
import type { HandoverProbe } from '../src/lib/handover/handover.types.ts'

/** A repository whose own cli cannot run hand-overs: answers false at once (the card names the writer's cli). */
export function noRepositoryCli(): boolean {
	return false
}

/** A repository whose own cli runs hand-overs: answers true at once (the card names `bash commit.sh`). */
export function repositoryCli(): boolean {
	return true
}

/** A probe that answers `answer` and keeps what it was asked, one entry per call. */
export function recordingProbe(params: { answer: boolean }): {
	probe: HandoverProbe
	calls: Array<Parameters<HandoverProbe>[0]>
} {
	const calls: Array<Parameters<HandoverProbe>[0]> = []
	return {
		probe: function recordedProbe(asked) {
			calls.push(asked)
			return params.answer
		},
		calls,
	}
}
