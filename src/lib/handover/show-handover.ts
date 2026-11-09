/**
 * A hand-over's card recomputed from its folder (the lots file, the snapshot) and the records, nothing written:
 * the commits found from the lots file's HEAD to the tip of its branch, done when every lot is committed, the
 * lots file's notes while it is not. Also how many files changed since the review, among the lots still to
 * commit and the lots file. `handover show` prints both; `handover run` without a folder reads the verdict.
 */
import { readAbandonedMarker } from './handover-abandoned-marker.ts'
import { buildHandoverCard } from './handover-card.ts'
import { committedLotsOnBranch, revisionOf } from './list-handovers.ts'
import {
	differingSnapshotLines,
	isLotsFileAsReviewed,
	snapshotPathOf,
} from './reviewed-snapshot.ts'

import type { HandoverCard, HandoverFolder, HandoverProbe } from './handover.types.ts'

export function recomputeHandoverCard(params: {
	handover: HandoverFolder
	probe: HandoverProbe
	/** The cli named in the run line when the repository's own cannot run hand-overs; without it, `commit.sh`. */
	cliPath?: string
}): HandoverCard {
	const { folder, lotsFile, lots } = params.handover
	const root = lotsFile.repository
	const commits = committedLotsOnBranch(params.handover)?.commits ?? []
	const done = lots.length > 0 && commits.length === lots.length
	return buildHandoverCard({
		root,
		folder,
		branch: lotsFile.branch,
		head: revisionOf({ root, revision: `${lotsFile.head}^{commit}` }) ?? lotsFile.head,
		notes: done ? undefined : lotsFile.gates,
		lots,
		commits,
		cliPath: params.cliPath,
		probe: params.probe,
		done,
		abandoned: readAbandonedMarker(folder) !== undefined,
		release: lotsFile.release === true,
	})
}

/**
 * The files that differ from what was reviewed: those of the lots not committed yet against `files.sha256`
 * (a file deleted since counted), and `lots.json` against `lots.sha256`.
 */
export function countChangedSinceReview(params: {
	handover: HandoverFolder
	/** How many lots are committed already: their files are what the commits hold. */
	committed: number
}): number {
	const { handover } = params
	const pending = new Set(handover.lots.slice(params.committed).flatMap((lot) => lot.files))
	const differing = differingSnapshotLines({
		root: handover.lotsFile.repository,
		snapshotLines: handover.snapshotLines.filter((line) => pending.has(snapshotPathOf(line))),
	})
	return differing.length + (isLotsFileAsReviewed(handover) ? 0 : 1)
}
