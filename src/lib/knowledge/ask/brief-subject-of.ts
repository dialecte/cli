import { aboutOf } from './parse-subject.ts'
import { subjectTermsOf } from './subject-terms-of.ts'

import type { AskRecordView, AskRequestRecord, AskSubjectTerms } from './ask.types.ts'

/**
 * The subject a brief names and a report is checked against: the ask's recorded subject, else (a record holding
 * none) the one its request names (`--about`, `--code`, `--method`).
 */
export function briefSubjectOf(params: {
	request: AskRequestRecord
	record: AskRecordView
}): AskSubjectTerms {
	const { request, record } = params
	if (record.subject !== null) return subjectTermsOf({ subject: record.subject })
	const about = aboutOf({ about: request.about ?? undefined })
	return {
		tags: about.tag === undefined ? [] : [about.tag.tag],
		attributes: about.attribute === undefined ? [] : [about.attribute],
		terms: [request.code, request.method].filter((term) => term !== null),
	}
}
