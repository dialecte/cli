/**
 * `handover abandon` marks a hand-over folder that will not run (`abandoned.json`: when it was abandoned).
 * The marker stays: the folder's state is `abandoned`, `run` refuses it, `show` prints it ABANDONED, and
 * `run` without a folder skips it. Its commits, when some lots were committed, stay. The marker is read by the
 * process-free `handover-marker-read.ts`.
 */
import { writeFileSync } from 'node:fs'

import { abandonedMarkerPath } from './handover-marker-read.ts'

import type { HandoverAbandonedMarker } from './handover.types.ts'

export { abandonedMarkerPath, readAbandonedMarker } from './handover-marker-read.ts'

export function writeAbandonedMarker(params: { folder: string; now: Date }): void {
	const marker: HandoverAbandonedMarker = { at: params.now.toISOString() }
	writeFileSync(abandonedMarkerPath(params.folder), `${JSON.stringify(marker)}\n`)
}
