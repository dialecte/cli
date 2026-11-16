import { REPORT_REFUSAL_FAULTS } from './ask.constants.ts'
import { reportBodyHashOf } from './report-body-of.ts'
import { reportRefusal } from './report-refusal.ts'

import type {
	AcceptanceContext,
	DocumentReport,
	OutsideReport,
	RefusedReport,
} from './ask.types.ts'

/**
 * The first acceptance check a read report fails, in order: the ask, the round, the nonce (issued to that reader
 * for this round, unused), the session (one accepted report each), the body (its sha256 not that of an accepted one, R3-3);
 * null when it passes them all.
 */
export function acceptanceRefusalOf(params: {
	report: DocumentReport | OutsideReport
	acceptance: AcceptanceContext
}): RefusedReport | null {
	const { report, acceptance } = params
	if (report.ask !== acceptance.ask)
		return reportRefusal({
			refused: 'wrong-ask',
			templates: [REPORT_REFUSAL_FAULTS.wrongAsk],
			values: { found: report.ask, expected: acceptance.ask },
		})
	if (report.round !== acceptance.round)
		return reportRefusal({
			refused: 'wrong-round',
			templates: [REPORT_REFUSAL_FAULTS.wrongRound],
			values: {
				found: String(report.round),
				expected: String(acceptance.round),
				ask: acceptance.ask,
			},
		})
	const issued = acceptance.issued.some(
		(entry) => entry.reader === report.reader && entry.nonce === report.nonce,
	)
	if (!issued || acceptance.used.includes(report.nonce))
		return reportRefusal({
			refused: 'nonce',
			templates: [REPORT_REFUSAL_FAULTS.nonce],
			values: { reader: report.reader },
		})
	if (
		report.session !== null &&
		acceptance.accepted.some((accepted) => accepted.session === report.session)
	)
		return reportRefusal({
			refused: 'same-session',
			templates: [REPORT_REFUSAL_FAULTS.sameSession],
			values: {},
		})
	const bodyHash = reportBodyHashOf({ report })
	if (acceptance.accepted.some((accepted) => accepted.bodyHash === bodyHash))
		return reportRefusal({
			refused: 'duplicate',
			templates: [REPORT_REFUSAL_FAULTS.duplicate],
			values: {},
		})
	return null
}
