/**
 * A hand-over against what was reviewed: its lots file against `lots.sha256`, its files against the snapshot
 * (`files.sha256`: one `<sha256>  <path>` line per file the lots commit that existed), a file deleted since
 * differing too. The `lots` and `snapshot` guards of a run refuse on them; `handover show` counts them.
 */
import { join } from 'node:path'

import { isPresent } from '../file-system.ts'
import { HANDOVER_FILES } from './handover.constants.ts'
import { hashFile } from './write-handover.ts'

import type { HandoverFolder } from './handover.types.ts'

/** The folder's `lots.json` holds the bytes it held when the hand-over was written. */
export function isLotsFileAsReviewed(handover: HandoverFolder): boolean {
	return hashFile(join(handover.folder, HANDOVER_FILES.lots)) === handover.lotsHash
}

/** The snapshot lines whose file under `root` is gone or holds other bytes than reviewed. */
export function differingSnapshotLines(params: {
	root: string
	snapshotLines: readonly string[]
}): string[] {
	return params.snapshotLines.filter(function differs(line) {
		const path = join(params.root, snapshotPathOf(line))
		return !isPresent(path) || hashFile(path) !== line.split('  ')[0]
	})
}

/** The reviewed sha256 of each file of the snapshot, by its repository path. */
export function reviewedHashes(snapshotLines: readonly string[]): Map<string, string> {
	return new Map(snapshotLines.map((line) => [snapshotPathOf(line), line.split('  ')[0]]))
}

/** The repository path a snapshot line names (a path may hold two spaces itself). */
export function snapshotPathOf(line: string): string {
	return line.split('  ').slice(1).join('  ')
}
