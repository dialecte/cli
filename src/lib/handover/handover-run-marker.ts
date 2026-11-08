/**
 * A real `handover run` marks its hand-over folder while it runs (`running.json`: its pid and when it
 * started), so a gate does not run under a hand-over committing at that moment. The marker goes at the
 * run's end, on a failure, and on Ctrl-C or a termination received while a child of the run works (a
 * commit with its hook, an install); a run stopped at another moment leaves it, and a marker whose process
 * is gone counts as no run. A gate it refuses names the marker, so a person can tell a pid reused by
 * another process. The marker is read by the process-free `handover-marker-read.ts`.
 */
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { onSignalExit } from '../progress/interrupt-forwarding.ts'
import { HANDOVER_RUN_MARKER_FILE } from './handover.constants.ts'

import type { HandoverRunMarker } from './handover.types.ts'

export { readRunMarker } from './handover-marker-read.ts'

/** Marks `folder` as running in this process; the answer removes the marker (also run on a forwarded signal). */
export function writeRunMarker(params: { folder: string; now: Date }): () => void {
	const path = join(params.folder, HANDOVER_RUN_MARKER_FILE)
	const marker: HandoverRunMarker = { pid: process.pid, startedAt: params.now.toISOString() }
	writeFileSync(path, `${JSON.stringify(marker)}\n`)
	function removeMarker(): void {
		rmSync(path, { force: true })
	}
	const removeSignalHook = onSignalExit(removeMarker)
	return function release() {
		removeSignalHook()
		removeMarker()
	}
}

/** A refusal while the run `running` of `folder` is in progress: `template` with its folder, pid, start and marker. */
export function runningRefusal(params: {
	template: string
	folder: string
	running: HandoverRunMarker
}): string {
	return params.template
		.replace('{folder}', params.folder)
		.replace('{pid}', String(params.running.pid))
		.replace('{startedAt}', params.running.startedAt)
		.replace('{marker}', join(params.folder, HANDOVER_RUN_MARKER_FILE))
}
