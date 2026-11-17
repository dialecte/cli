/**
 * The independent review as `lot verify`'s record (FIX-review-verify): a `verify.jsonl` line written after the last
 * review round snapshot, read the same way in a lot's folder and in a hand-over folder that is no lot.
 */
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { snapshotTimeOf } from '../store/station-records.ts'
import { readVerifyLines } from './late-fixes.ts'
import { INDEPENDENT_VERIFY_DETAIL } from './review-rounds.constants.ts'

import type { ReviewLinePart } from '../gate-records/gate-records.types.ts'

/**
 * The review line's independent part from the last `verify.jsonl` line strictly after round `lastRound`'s snapshot time
 * (`round-<n>.state`'s `at`, else `round-<n>.base`'s mtime; a tie is not after, as for a station end): passed, naming
 * its `--by`. Undefined when no line is after it, or the snapshot has no time.
 */
export function independentVerifyPart(params: {
	folder: string
	lastRound: number
}): ReviewLinePart | undefined {
	const snapshotTime = snapshotTimeOf({ lotFolder: params.folder, round: params.lastRound })
	if (snapshotTime === null) return undefined
	const after = Date.parse(snapshotTime)
	const last = readVerifyLines({ folder: params.folder })
		.filter(function isAfterSnapshot(line) {
			return Date.parse(line.at) > after
		})
		.at(-1)
	if (last === undefined) return undefined
	return {
		status: 'passed',
		detail: fillMessage({ template: INDEPENDENT_VERIFY_DETAIL, values: { by: last.by } }),
	}
}
