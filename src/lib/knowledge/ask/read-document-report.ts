import {
	NOT_KNOWN_VERDICT,
	REPORT_FAULTS,
	REPORT_PATH_ROOT,
	REPORT_VERDICTS,
} from './ask.constants.ts'
import { readClaims, readFileCite } from './read-report-claims.ts'
import {
	faultOf,
	faultsOf,
	isRecord,
	readInteger,
	readNullableString,
	readString,
	readStringList,
	readTier,
	readWord,
	rootFieldOf,
} from './read-report-fields.ts'

import type {
	DocumentReport,
	FieldReadParams,
	FieldResult,
	ReadReport,
	ReadReportParams,
	ReportVerdict,
} from './ask.types.ts'

/**
 * Reads a document reader's report from its parsed JSON into a typed report, or refuses it `schema` with every
 * fault named at once. A report carrying `source`, or a `not-known` verdict, is an outside report: refused.
 */
export function readDocumentReport(params: ReadReportParams): ReadReport<DocumentReport> {
	const { value } = params
	if (!isRecord(value))
		return {
			refused: 'schema',
			faults: [faultOf({ path: REPORT_PATH_ROOT, wording: REPORT_FAULTS.notObject })],
		}
	const fields = documentFieldsOf({ record: value })
	const { ask, round, reader, nonce, verdict, valueField, answer, claims } = fields
	const { notFound, familiesRead, session, tier } = fields
	const sourceFaults =
		value.source === undefined
			? []
			: [
					faultOf({
						path: rootFieldOf({ record: value, field: 'source' }).path,
						wording: REPORT_FAULTS.sourceInDocumentReport,
					}),
				]
	if (
		'faults' in ask ||
		'faults' in round ||
		'faults' in reader ||
		'faults' in nonce ||
		'faults' in verdict ||
		'faults' in valueField ||
		'faults' in answer ||
		'faults' in claims ||
		'faults' in notFound ||
		'faults' in familiesRead ||
		'faults' in session ||
		'faults' in tier ||
		sourceFaults.length > 0
	)
		return {
			refused: 'schema',
			faults: [...faultsOf({ results: Object.values(fields) }), ...sourceFaults],
		}
	return {
		report: {
			ask: ask.read,
			round: round.read,
			reader: reader.read,
			nonce: nonce.read,
			verdict: verdict.read,
			value: valueField.read,
			answer: answer.read,
			claims: claims.read,
			notFound: notFound.read,
			familiesRead: familiesRead.read,
			session: session.read,
			...(tier.read === undefined ? {} : { tier: tier.read }),
		},
	}
}

/** Each field of a document report read, in the order the faults are named. */
function documentFieldsOf(params: { record: Record<string, unknown> }) {
	const { record } = params
	return {
		ask: readString(rootFieldOf({ record, field: 'ask' })),
		round: readInteger(rootFieldOf({ record, field: 'round' })),
		reader: readString(rootFieldOf({ record, field: 'reader' })),
		nonce: readString(rootFieldOf({ record, field: 'nonce' })),
		verdict: readVerdict(rootFieldOf({ record, field: 'verdict' })),
		valueField: readNullableString(rootFieldOf({ record, field: 'value' })),
		answer: readString(rootFieldOf({ record, field: 'answer' })),
		claims: readClaims({ ...rootFieldOf({ record, field: 'claims' }), readCite: readFileCite }),
		notFound: readStringList(rootFieldOf({ record, field: 'notFound' })),
		familiesRead: readStringList(rootFieldOf({ record, field: 'familiesRead' })),
		session: readNullableString(rootFieldOf({ record, field: 'session' })),
		tier: readTier({ record }),
	}
}

/** A verdict of a document report: one of its five words; `not-known` belongs to an outside report. */
function readVerdict(params: FieldReadParams): FieldResult<ReportVerdict> {
	if (params.value === NOT_KNOWN_VERDICT)
		return {
			faults: [faultOf({ path: params.path, wording: REPORT_FAULTS.notKnownInDocumentReport })],
		}
	return readWord({ ...params, allowed: REPORT_VERDICTS })
}
