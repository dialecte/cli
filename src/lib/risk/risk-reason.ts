/** The text of a risk reason, one shape for `lot risk`, the snapshot's `!` line and the card's effort line (33L1 D24). */
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { RISK_DECLARED_WORD, RISK_GO_AHEAD_PART, RISK_NO_GO_AHEAD_PART } from './risk.constants.ts'

import type { RiskEffortLine, RiskReason } from './risk.types.ts'

/**
 * A reason as text: `<file>:<line>: <detail>`, `<file>: <detail>` or `<detail>`; a declared reason names its kind,
 * `<file>: declared` when its glob is the file itself, else `<file>: declared <glob>` (its record keeps the glob).
 */
export function riskReasonText(reason: RiskReason): string {
	if (reason.kind === 'declared' && reason.file !== undefined)
		return reason.detail === reason.file
			? `${reason.file}: ${RISK_DECLARED_WORD}`
			: `${reason.file}: ${RISK_DECLARED_WORD} ${reason.detail}`
	if (reason.file === undefined) return reason.detail
	if (reason.line === undefined) return `${reason.file}: ${reason.detail}`
	return `${reason.file}:${reason.line}: ${reason.detail}`
}

/**
 * The go-ahead of an effort below its class, one shape for `lot risk`, `lot status` and the card (33L1 D30):
 * ` (by <who>: <reason>)` from an effort line holding a reason, else ` (no go-ahead recorded)` (an effort line without
 * one, or the identity's effort alone).
 */
export function goAheadText(params: { effortLine: RiskEffortLine | undefined }): string {
	const { effortLine } = params
	if (effortLine?.reason === undefined) return RISK_NO_GO_AHEAD_PART
	return fillMessage({
		template: RISK_GO_AHEAD_PART,
		values: { by: effortLine.by, reason: effortLine.reason },
	})
}
