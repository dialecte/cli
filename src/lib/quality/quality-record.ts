import { readRecord, writeRecord } from '../gate-records/gate-records.ts'
import { computeStateHash } from '../gate-records/state-hash.ts'
/**
 * `dialecte-quality.json`: the base-aware run that judged the change (a bare `rules`, or the scoped gate step), its
 * tree, its base with where it came from, and what it found; a partial run (given files) records nothing.
 */
import { readGit } from '../git.ts'
import { QUALITY_RECORD_FILE, QUALITY_RECORD_SCHEMA } from './quality.constants.ts'

import type { QualityRecord, QualityResult } from './quality.types.ts'

/**
 * Records `result` for the worktree at `root`, with the opt-out counts, at `now`.
 *
 * @intent keep what the base-aware rules found on this tree for the card and the reviewer
 * @internal
 */
export function recordQuality(params: {
	root: string
	result: QualityResult
	allowed: Record<string, number>
	now: Date
}): void {
	const record: QualityRecord = {
		schema: QUALITY_RECORD_SCHEMA,
		at: params.now.toISOString(),
		head: readGit({ root: params.root, args: ['rev-parse', 'HEAD'] }).trim(),
		stateHash: computeStateHash(params.root),
		...params.result,
		allowed: params.allowed,
	}
	writeRecord({ root: params.root, name: QUALITY_RECORD_FILE, record })
}

/**
 * The quality record of the worktree at `root`; undefined when none, or of another schema.
 *
 * @intent read what the base-aware rules last found on a worktree
 * @internal
 */
export function readQualityRecord(root: string): QualityRecord | undefined {
	const record = readRecord<QualityRecord>({ root, name: QUALITY_RECORD_FILE })
	return record?.schema === QUALITY_RECORD_SCHEMA ? record : undefined
}
