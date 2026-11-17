/**
 * Whether a lot needs a design (DESIGN-GATE section 1), pure: required when a path it reaches lies in a shared area its
 * repository declares (`dialecte.risk.high`), or one of its scope entries is broader than such an area, or the plan
 * entry it carries out is of kind `lot`. Never stored: every reader computes it from the records of that moment.
 */
import { declaredMatchesOf } from '../risk/derive-risk-class.ts'
import { DESIGN_ENTRY_KIND } from './design.constants.ts'

import type { DesignNeed, DesignNeedInput, DesignNeedReason } from './design.types.ts'

/**
 * The need of a lot from its plan entry's kind, the declared shared areas and the paths it reaches: the entry reason
 * first, then one shared reason per declared glob reached, naming the first path that reaches it.
 *
 * @intent decide whether a lot needs an approved design before its tests
 * @internal
 */
export function designNeedOf(params: DesignNeedInput): DesignNeed {
	const entry: DesignNeedReason[] =
		params.entryKind === DESIGN_ENTRY_KIND ? [{ kind: 'entry' }] : []
	const shared = new Map<string, DesignNeedReason>()
	for (const path of params.paths)
		for (const { glob } of declaredMatchesOf({ declaredHigh: params.declaredHigh, entry: path }))
			if (!shared.has(glob)) shared.set(glob, { kind: 'shared', glob, path })
	const reasons = [...entry, ...shared.values()]
	return { required: reasons.length > 0, reasons }
}

/**
 * Whether a go-ahead given against `given` covers `current`: every current reason is in it, two reasons the same by
 * their kind and glob (the same area reached through another path is the same reason).
 *
 * @intent tell whether an approval or a waiver still holds for the lot's need
 * @internal
 */
export function uncoveredReasonsOf(params: {
	current: readonly DesignNeedReason[]
	given: readonly DesignNeedReason[]
}): DesignNeedReason[] {
	const given = new Set(params.given.map(reasonKeyOf))
	return params.current.filter(function isUncovered(reason) {
		return !given.has(reasonKeyOf(reason))
	})
}

/** A reason's identity: its kind, and its glob for a shared one. */
function reasonKeyOf(reason: DesignNeedReason): string {
	return reason.kind === 'shared' ? `shared\n${reason.glob}` : reason.kind
}
