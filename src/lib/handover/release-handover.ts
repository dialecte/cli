/** `handover write --release`: the lots file marked as a release hand-over's. */
import { readFileSync, writeFileSync } from 'node:fs'

import type { LotsFile } from './handover.types.ts'

/**
 * Marks the lots file at `lotsPath` `"release": true` (its other fields as written, a relative repository kept
 * relative) unless it holds the mark already; the lots file with the mark.
 */
export function markReleaseHandover(params: { lotsPath: string; lotsFile: LotsFile }): LotsFile {
	if (params.lotsFile.release === true) return params.lotsFile
	const written: unknown = JSON.parse(readFileSync(params.lotsPath, 'utf8'))
	const lotsFile = { ...params.lotsFile, release: true }
	// `readLotsFile` read it as an object already: anything else is written back as it read it
	const marked =
		typeof written === 'object' && written !== null ? { ...written, release: true } : lotsFile
	writeFileSync(params.lotsPath, `${JSON.stringify(marked, null, '\t')}\n`)
	return lotsFile
}
