import { checkClaim } from '../src/lib/knowledge/ask/check-claim.ts'
import {
	QUESTION_POSITIVE,
	REPORT_VOCABULARY,
	SUBJECT_TAG_D,
} from './ask-report-fixtures.constants.ts'
import { citeOf, verifiedCiteOf } from './ask-report-fixtures.ts'

import type { CheckedClaim } from '../src/lib/knowledge/ask/ask.types.ts'
import type { ClaimCaseParams } from './ask-check-claim-helper.types.ts'

/** Checks one claim backed by one verified cite of `quote`; the verdict is `yes` and the question positive unless said. */
export function checkedClaimOf(params: ClaimCaseParams): CheckedClaim {
	const cite = citeOf({ quote: params.quote })
	return checkClaim({
		claim: { text: params.text, supports: params.supports ?? 'yes', cites: [cite] },
		cites: [verifiedCiteOf({ cite, slice: params.slice })],
		verdict: params.verdict ?? 'yes',
		value: params.value ?? null,
		question: params.question ?? QUESTION_POSITIVE,
		subject: params.subject ?? SUBJECT_TAG_D,
		vocabulary: REPORT_VOCABULARY,
	})
}
