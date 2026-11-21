import { readRecord, writeRecord } from '../gate-records/gate-records.ts'
import { computeStateHash } from '../gate-records/state-hash.ts'
/**
 * `dialecte-quality.json`: the base-aware run that judged the change (a bare `rules`, or the scoped gate step), its
 * tree, its base with where it came from, and what it found, each finding with its opt-out; a partial run (given
 * files) records nothing. A `--base` run carries the docs row of the last run that was not one.
 */
import { isAncestorCommit, readGit } from '../git.ts'
import { resolveRulesBaseSource } from '../rules-base.ts'
import { QUALITY_RECORD_FILE, QUALITY_RECORD_SCHEMA } from './quality.constants.ts'

import type {
	LotDocs,
	QualityBase,
	QualityDocs,
	QualityRecord,
	QualityStanding,
	QualityStandingPart,
	RecordedQuality,
} from './quality.types.ts'

/**
 * Records `recorded` for the worktree at `root`, with the opt-out counts, at `now`; a `flag` run keeps the docs row of
 * the last run that was not one (`lotDocs`), as it never sets nor clears it.
 *
 * @intent keep what the base-aware rules found on this tree for the card and the reviewer
 * @internal
 */
export function recordQuality(params: {
	root: string
	recorded: RecordedQuality
	allowed: Record<string, number>
	now: Date
}): void {
	const { root, recorded } = params
	const lotDocs = recorded.base.source === 'flag' ? lotDocsOf(readQualityRecord(root)) : undefined
	const record: QualityRecord = {
		schema: QUALITY_RECORD_SCHEMA,
		at: params.now.toISOString(),
		head: readGit({ root, args: ['rev-parse', 'HEAD'] }).trim(),
		stateHash: computeStateHash(root),
		...recorded,
		allowed: params.allowed,
		...(lotDocs !== undefined && { lotDocs }),
	}
	writeRecord({ root, name: QUALITY_RECORD_FILE, record })
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

/**
 * Where the quality record of the worktree at `root` stands for the tree `stateHash`: its lists and its docs row, each
 * current, of another tree, or none.
 *
 * @intent tell the card whether the last base-aware run judged this tree against the base the lot has now
 * @internal
 */
export function readQualityStanding(params: { root: string; stateHash: string }): QualityStanding {
	const { root, stateHash } = params
	const record = readQualityRecord(root)
	if (record === undefined) return { lists: { kind: 'none' }, docs: { kind: 'none' } }
	if (record.stateHash !== stateHash)
		return { lists: { kind: 'other-tree' }, docs: { kind: 'other-tree' } }
	const order = orderedBaseOf(root)
	const lists = { duplicates: record.duplicates, sharedExports: record.sharedExports }
	if (record.base.source !== 'flag') {
		const current = isOrderedBase({ base: record.base, order })
		return {
			lists: standingOf({ current, base: record.base, value: lists }),
			docs: standingOf({ current, base: record.base, value: { docs: record.docs } }),
		}
	}
	// a nearer base than the order's would miss changes; an older one only adds main's
	const listsCurrent =
		order !== undefined &&
		isAncestorCommit({ root, ancestor: record.base.commit, descendant: order.commit })
	return {
		lists: standingOf({ current: listsCurrent, base: record.base, value: lists }),
		docs: lotDocsStandingOf({ lotDocs: record.lotDocs, stateHash, order }),
	}
}

/** The docs row a `flag` run carries forward: the previous record's own, else the one it carried; none without. */
function lotDocsOf(previous: QualityRecord | undefined): LotDocs | undefined {
	if (previous === undefined) return undefined
	if (previous.base.source === 'flag') return previous.lotDocs
	return { stateHash: previous.stateHash, base: previous.base, docs: previous.docs }
}

// dialecte-allow duplicate-read: the quality record's docs row; readStoreLotStanding reads a store lot's state
/** The docs row of a `flag` record: the carried one when it judged this tree, current when its base still holds. */
function lotDocsStandingOf(params: {
	lotDocs: LotDocs | undefined
	stateHash: string
	order: QualityBase | undefined
}): QualityStandingPart<QualityDocs> {
	const { lotDocs } = params
	if (lotDocs === undefined || lotDocs.stateHash !== params.stateHash) return { kind: 'none' }
	return standingOf({
		current: isOrderedBase({ base: lotDocs.base, order: params.order }),
		base: lotDocs.base,
		value: { docs: lotDocs.docs },
	})
}

/** The lot or base-branch base the order answers now for `root`, as the run asked it; undefined for any other answer. */
function orderedBaseOf(root: string): QualityBase | undefined {
	const order = resolveRulesBaseSource({ root, emptyTreeRequest: true })
	if (order === undefined || 'failure' in order || order.source === 'release-tag') return undefined
	return { commit: order.commit, source: order.source }
}

/** Whether `base` is the base the order answers now: the same source and commit. */
function isOrderedBase(params: { base: QualityBase; order: QualityBase | undefined }): boolean {
	const { base, order } = params
	return order !== undefined && order.source === base.source && order.commit === base.commit
}

/** `value` current on `base`, else of another tree. */
function standingOf<Value>(params: {
	current: boolean
	base: QualityBase
	value: Value
}): QualityStandingPart<Value> {
	if (!params.current) return { kind: 'other-tree' }
	return { kind: 'current', base: params.base, ...params.value }
}
