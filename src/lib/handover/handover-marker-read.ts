/**
 * The readers of a hand-over folder's markers (`running.json`, `abandoned.json`), process-free: file reads and
 * `isProcessAlive` only, so the store's read verbs reach no child process through them.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { isProcessAlive } from '../process-alive.ts'
import { HANDOVER_FILES, HANDOVER_RUN_MARKER_FILE } from './handover.constants.ts'

import type { HandoverAbandonedMarker, HandoverRunMarker } from './handover.types.ts'

/** The run in progress in `folder`: its marker when it names a live process; undefined otherwise. */
export function readRunMarker(folder: string): HandoverRunMarker | undefined {
	const path = join(folder, HANDOVER_RUN_MARKER_FILE)
	if (!existsSync(path)) return undefined
	let marker: Partial<HandoverRunMarker>
	try {
		marker = JSON.parse(readFileSync(path, 'utf8')) as Partial<HandoverRunMarker>
	} catch {
		return undefined
	}
	if (typeof marker.pid !== 'number' || !isProcessAlive(marker.pid)) return undefined
	return { pid: marker.pid, startedAt: String(marker.startedAt ?? '') }
}

/** The path of the abandoned marker of `folder`. */
export function abandonedMarkerPath(folder: string): string {
	return join(folder, HANDOVER_FILES.abandoned)
}

/** The marker of `folder`, or undefined when it is not abandoned; a marker that does not parse still marks it. */
export function readAbandonedMarker(folder: string): HandoverAbandonedMarker | undefined {
	const path = abandonedMarkerPath(folder)
	if (!existsSync(path)) return undefined
	try {
		const marker = JSON.parse(readFileSync(path, 'utf8')) as Partial<HandoverAbandonedMarker>
		return { at: String(marker.at ?? '') }
	} catch {
		return { at: '' }
	}
}
