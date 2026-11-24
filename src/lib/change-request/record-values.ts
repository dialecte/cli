/**
 * The review and tests rows checked against what their writers write, before the body shows them: a severity, a state,
 * a review station, a verdict, a model word, a gate mode or a case status outside its list, or a tests.json field of the wrong shape (`testsRecordFault`, the one
 * rule per field), is a forged row, refused
 * with its record and field, never shown.
 */
import {
	REVIEW_STATIONS,
	ROW_STATE_WORDS,
	VERDICT_WORD_PATTERN,
} from '../review-rounds/review-record.constants.ts'
import { FINDING_ID_PATTERN } from '../review-rounds/review-rounds.constants.ts'
import { testsRecordFault } from '../tdd/tests-record.ts'
import { PIECE_RECORDS, ROW_SEVERITIES, ROW_VERDICTS } from './change-request.constants.ts'

import type { FindingRow, VerdictRow } from '../review-rounds/review-record.types.ts'
import type { ChangeRequestSources } from './change-request.types.ts'

/** The record and field of the first row value outside its values; undefined when every row holds. */
export function recordValueFault(
	sources: ChangeRequestSources,
): { record: string; field: string } | undefined {
	const review = sources.review
	const field =
		review?.findings.map(findingFault).find((fault) => fault !== undefined) ??
		review?.verdicts.map(verdictFault).find((fault) => fault !== undefined)
	if (field !== undefined) return { record: PIECE_RECORDS.review, field }
	const testsField =
		sources.tests === undefined ? undefined : testsRecordFault({ record: sources.tests })
	if (testsField !== undefined) return { record: PIECE_RECORDS.tests, field: testsField }
	return undefined
}

function findingFault(row: FindingRow): string | undefined {
	if (!FINDING_ID_PATTERN.test(row.id)) return 'id'
	if (row.severity !== undefined && !ROW_SEVERITIES.includes(row.severity)) return 'severity'
	if (row.state !== undefined && !ROW_STATE_WORDS.includes(row.state)) return 'state'
	return undefined
}

function verdictFault(row: VerdictRow): string | undefined {
	if (row.by.kind === 'station' && !REVIEW_STATIONS.includes(row.by.station)) return 'station'
	if (!ROW_VERDICTS.includes(row.verdict)) return 'verdict'
	if (row.vendor !== undefined && !VERDICT_WORD_PATTERN.test(row.vendor)) return 'vendor'
	if (row.model !== undefined && !VERDICT_WORD_PATTERN.test(row.model)) return 'model'
	return undefined
}
