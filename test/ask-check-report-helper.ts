import { checkReport } from '../src/lib/knowledge/ask/check-report.ts'
import { DEFAULT_REPORT_CITES } from './ask-check-report-helper.constants.ts'
import {
	ACCEPTANCE,
	REPORT_QUESTION,
	REPORT_VOCABULARY,
	SUBJECT_TAG_D,
} from './ask-report-fixtures.constants.ts'

import type { CheckedReport } from '../src/lib/knowledge/ask/ask.types.ts'
import type { ReportCaseParams } from './ask-check-report-helper.types.ts'

/** Checks one report value as a reader's report of ask A-0007, round 1, unless said. */
export function checkedReportOf(params: ReportCaseParams): CheckedReport {
	return checkReport({
		value: params.value,
		outside: params.outside ?? false,
		question: params.question ?? REPORT_QUESTION,
		subject: SUBJECT_TAG_D,
		vocabulary: REPORT_VOCABULARY,
		cites: params.cites ?? DEFAULT_REPORT_CITES,
		acceptance: params.acceptance ?? ACCEPTANCE,
	})
}
