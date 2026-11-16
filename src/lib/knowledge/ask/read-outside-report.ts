import {
	OUTSIDE_SOURCES,
	OUTSIDE_VERDICTS,
	REPORT_FAULTS,
	REPORT_PATH_ROOT,
} from './ask.constants.ts'
import { readClaims, readWebCite } from './read-report-claims.ts'
import {
	faultOf,
	faultsOf,
	isRecord,
	readInteger,
	readNullableString,
	readString,
	readStringList,
	readText,
	readTier,
	readWord,
	rootFieldOf,
} from './read-report-fields.ts'

import type { OutsideReport, ReadReport, ReadReportParams } from './ask.types.ts'

/**
 * Reads an outside reader's report from its parsed JSON into a typed report, or refuses it `schema` with every
 * fault named at once: a `source` of `model` or `web`, a `not-known` verdict allowed, web cites as `url`, `quote`
 * and `retrieved`. A session absent is read as null: acceptance refuses it.
 */
export function readOutsideReport(params: ReadReportParams): ReadReport<OutsideReport> {
	const { value } = params
	if (!isRecord(value))
		return {
			refused: 'schema',
			faults: [faultOf({ path: REPORT_PATH_ROOT, wording: REPORT_FAULTS.notObject })],
		}
	const fields = outsideFieldsOf({ record: value })
	const { ask, round, reader, nonce, source, verdict, valueField, answer } = fields
	const { claims, notFound, familiesRead, session, tier } = fields
	if (
		'faults' in ask ||
		'faults' in round ||
		'faults' in reader ||
		'faults' in nonce ||
		'faults' in source ||
		'faults' in verdict ||
		'faults' in valueField ||
		'faults' in answer ||
		'faults' in claims ||
		'faults' in notFound ||
		'faults' in familiesRead ||
		'faults' in session ||
		'faults' in tier
	)
		return {
			refused: 'schema',
			faults: faultsOf({ results: Object.values(fields) }),
		}
	return {
		report: {
			ask: ask.read,
			round: round.read,
			reader: reader.read,
			nonce: nonce.read,
			source: source.read,
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

/** Each field of an outside report read, in the order the faults are named; a session absent reads as null. */
function outsideFieldsOf(params: { record: Record<string, unknown> }) {
	const { record } = params
	return {
		ask: readString(rootFieldOf({ record, field: 'ask' })),
		round: readInteger(rootFieldOf({ record, field: 'round' })),
		reader: readString(rootFieldOf({ record, field: 'reader' })),
		nonce: readString(rootFieldOf({ record, field: 'nonce' })),
		source: readWord({ ...rootFieldOf({ record, field: 'source' }), allowed: OUTSIDE_SOURCES }),
		verdict: readWord({ ...rootFieldOf({ record, field: 'verdict' }), allowed: OUTSIDE_VERDICTS }),
		valueField: readNullableString(rootFieldOf({ record, field: 'value' })),
		answer: readText(rootFieldOf({ record, field: 'answer' })),
		claims: readClaims({ ...rootFieldOf({ record, field: 'claims' }), readCite: readWebCite }),
		notFound: readStringList(rootFieldOf({ record, field: 'notFound' })),
		familiesRead: readStringList(rootFieldOf({ record, field: 'familiesRead' })),
		session:
			record.session === undefined
				? { read: null }
				: readNullableString(rootFieldOf({ record, field: 'session' })),
		tier: readTier({ record }),
	}
}
