/**
 * Where a lot's design stands (DESIGN-GATE section 2), pure over its `design.jsonl` lines, the recorded file's hash now
 * and the current need. Approval is keyed by the recorded content's hash, not its path; an approval or a waiver holds
 * only for the need it was given against. The last recorded content decides: once recorded, the design gates the lot
 * whatever its need.
 */
import { uncoveredReasonsOf } from './design-need.ts'

import type {
	DesignApprovedLine,
	DesignLine,
	DesignNeed,
	DesignRecordedLine,
	DesignSourceHash,
	DesignStanding,
	DesignWaivedLine,
} from './design.types.ts'

/**
 * The standing of a lot's design: `stale` when its last recorded content was approved and the source still exists with
 * other bytes (a source gone is not stale: the stored copy rules); `approved` by the newest approval of that content
 * covering the need; else `waived` by a covering waiver when the lot needs a design or one is recorded; else
 * `unapproved`. With nothing recorded: `waived`, `missing` or `not-required`. `uncovered` names what the newest
 * go-ahead was not given against.
 *
 * @intent tell whether a lot's design lets it go on, and why not
 * @internal
 */
export function designStateOf(params: {
	need: DesignNeed
	lines: readonly DesignLine[]
	source: DesignSourceHash
}): DesignStanding {
	const { need, lines } = params
	const last = lines.filter(isRecorded).at(-1)
	const waiver = lines.filter(isWaived).at(-1)
	const waiverGap =
		waiver === undefined
			? undefined
			: uncoveredReasonsOf({ current: need.reasons, given: waiver.need })
	// a waiver covers a lot that needs a design, and a recorded design whatever the need: it gates the lot either way
	const waivedStanding: DesignStanding | undefined =
		(need.required || last !== undefined) && waiver !== undefined && waiverGap?.length === 0
			? { need, state: 'waived', by: waiver.by, uncovered: [] }
			: undefined
	if (last === undefined) {
		if (waivedStanding !== undefined) return waivedStanding
		if (!need.required) return { need, state: 'not-required', uncovered: [] }
		return { need, state: 'missing', uncovered: waiverGap ?? [] }
	}
	const recorded = { file: last.file, hash: last.hash }
	const approvals = lines.filter(isApproved).filter(function ofTheContent(line) {
		return line.hash === last.hash
	})
	const newest = approvals.at(-1)
	if (newest !== undefined && params.source !== undefined && params.source !== last.hash)
		return { need, state: 'stale', by: newest.by, uncovered: [], ...recorded }
	const covering = approvals
		.filter(function coversTheNeed(line) {
			return uncoveredReasonsOf({ current: need.reasons, given: line.need }).length === 0
		})
		.at(-1)
	if (covering !== undefined)
		return { need, state: 'approved', by: covering.by, uncovered: [], ...recorded }
	if (waivedStanding !== undefined) return { ...waivedStanding, ...recorded }
	return {
		need,
		state: 'unapproved',
		uncovered:
			newest === undefined ? [] : uncoveredReasonsOf({ current: need.reasons, given: newest.need }),
		...recorded,
	}
}

function isRecorded(line: DesignLine): line is DesignRecordedLine {
	return line.kind === 'recorded'
}

function isApproved(line: DesignLine): line is DesignApprovedLine {
	return line.kind === 'approved'
}

function isWaived(line: DesignLine): line is DesignWaivedLine {
	return line.kind === 'waived'
}
