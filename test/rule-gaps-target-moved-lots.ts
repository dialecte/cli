/** A written hand-over folder made to look like one an earlier cli wrote: its lots file without a `target`. */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { HANDOVER_FILES } from '../src/lib/handover/handover.constants.ts'
import { hashFile } from '../src/lib/handover/write-handover.ts'

import type { LotsFile } from '../src/lib/handover/handover.types.ts'

/**
 * The folder's `lots.json` rewritten without its `target` (a hand-over written before the target was recorded), its
 * review hash taken again so the folder still reads as reviewed.
 */
export function dropTargetFromLotsFile(params: { folder: string }): void {
	const lotsPath = join(params.folder, HANDOVER_FILES.lots)
	const { target: _target, ...rest } = JSON.parse(readFileSync(lotsPath, 'utf8')) as LotsFile
	writeFileSync(lotsPath, `${JSON.stringify(rest, null, '\t')}\n`)
	writeFileSync(join(params.folder, HANDOVER_FILES.lotsHash), `${hashFile(lotsPath)}\n`)
}
