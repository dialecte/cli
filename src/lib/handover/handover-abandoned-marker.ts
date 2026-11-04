/**
 * `handover abandon` marks a hand-over folder that will not run (`abandoned.json`: when it was abandoned).
 * The marker stays: the folder's state is `abandoned`, `run` refuses it, `show` prints it ABANDONED, and
 * `run` without a folder skips it. Its commits, when some lots were committed, stay.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { HANDOVER_FILES } from './handover.constants.ts'

import type { HandoverAbandonedMarker } from './handover.types.ts'

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

export function writeAbandonedMarker(params: { folder: string; now: Date }): void {
	const marker: HandoverAbandonedMarker = { at: params.now.toISOString() }
	writeFileSync(abandonedMarkerPath(params.folder), `${JSON.stringify(marker)}\n`)
}
