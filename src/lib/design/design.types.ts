import type { PlanEntryKind } from '../plan/plan-block.types.ts'
import type { DESIGN_STATES } from './design.constants.ts'

/**
 * Why a lot needs a design: a path of its scope (or of a commit) in a shared area its repository declares
 * (`dialecte.risk.high`), or a scope broader than one; or the plan entry it carries out is of kind `lot`.
 */
export type DesignNeedReason = { kind: 'shared'; glob: string; path: string } | { kind: 'entry' }

/** Whether a lot needs a design, and why. */
export type DesignNeed = { required: boolean; reasons: DesignNeedReason[] }

/** What the need is read from: the plan entry's kind, the declared shared areas, the paths the lot reaches. */
export type DesignNeedInput = {
	entryKind: PlanEntryKind | undefined
	declaredHigh: readonly string[]
	paths: readonly string[]
}

/** A design recorded: its real path, the sha256 of its bytes, and whether it came from a file or the plan's spec. */
export type DesignRecordedLine = {
	schema: 1
	kind: 'recorded'
	at: string
	file: string
	hash: string
	from: 'file' | 'plan'
}

/** An approval of one recorded content, for the need it was given against. */
export type DesignApprovedLine = {
	schema: 1
	kind: 'approved'
	at: string
	by: string
	reason?: string
	hash: string
	need: DesignNeedReason[]
}

/** A required lot let go without a design, for the need it was given against. */
export type DesignWaivedLine = {
	schema: 1
	kind: 'waived'
	at: string
	by: string
	reason: string
	need: DesignNeedReason[]
}

/** A line of a lot folder's `design.jsonl`. */
export type DesignLine = DesignRecordedLine | DesignApprovedLine | DesignWaivedLine

/** Where a lot's design stands. */
export type DesignStateName = (typeof DESIGN_STATES)[number]

/** The recorded file as it is now: the sha256 of its bytes, or undefined when it is gone. */
export type DesignSourceHash = string | undefined

/** A lot's design standing: the need, the state, who approved or waived, the reasons a go-ahead does not cover. */
export type DesignStanding = {
	need: DesignNeed
	state: DesignStateName
	/** The approver or the waiver's `--by` (private: a view renders its kind). */
	by?: string
	/** The current reasons the last approval of the recorded content, or the last waiver, was not given against. */
	uncovered: DesignNeedReason[]
	/** The last recorded design's real path and hash. */
	file?: string
	hash?: string
}

/** A lot's design standing as `--json` prints it: who approved or waived by kind only. */
export type DesignStatusJson = {
	required: boolean
	reasons: DesignNeedReason[]
	state: DesignStateName
	by: string | null
	uncovered: DesignNeedReason[]
}
