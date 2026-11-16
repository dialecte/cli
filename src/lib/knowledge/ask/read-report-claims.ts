import { REPORT_VERDICTS } from './ask.constants.ts'
import {
	faultsOf,
	fieldOf,
	readInteger,
	readList,
	readObjectItem,
	readString,
	readWord,
} from './read-report-fields.ts'

import type {
	ClaimOf,
	ClaimsReadParams,
	FieldReadParams,
	FieldResult,
	OutsideCite,
	ReportCite,
} from './ask.types.ts'

/** The claims of a report, each read with the cite reader of its kind; every fault named at its path. */
export function readClaims<Cite>(params: ClaimsReadParams<Cite>): FieldResult<ClaimOf<Cite>[]> {
	return readList({
		...params,
		readItem: (item) => readClaim({ ...item, readCite: params.readCite }),
	})
}

/** One claim: text, supports, cites. */
function readClaim<Cite>(params: ClaimsReadParams<Cite>): FieldResult<ClaimOf<Cite>> {
	const object = readObjectItem(params)
	if ('faults' in object) return object
	const { read: record } = object
	const text = readString(fieldOf({ ...params, record, field: 'text' }))
	const supports = readWord({
		...fieldOf({ ...params, record, field: 'supports' }),
		allowed: REPORT_VERDICTS,
	})
	const cites = readList({
		...fieldOf({ ...params, record, field: 'cites' }),
		readItem: params.readCite,
	})
	if ('faults' in text || 'faults' in supports || 'faults' in cites)
		return { faults: faultsOf({ results: [text, supports, cites] }) }
	return { read: { text: text.read, supports: supports.read, cites: cites.read } }
}

/** A file cite of a document report: file, from, to, quote. */
export function readFileCite(params: FieldReadParams): FieldResult<ReportCite> {
	const object = readObjectItem(params)
	if ('faults' in object) return object
	const { read: record } = object
	const file = readString(fieldOf({ ...params, record, field: 'file' }))
	const from = readInteger(fieldOf({ ...params, record, field: 'from' }))
	const to = readInteger(fieldOf({ ...params, record, field: 'to' }))
	const quote = readString(fieldOf({ ...params, record, field: 'quote' }))
	if ('faults' in file || 'faults' in from || 'faults' in to || 'faults' in quote)
		return { faults: faultsOf({ results: [file, from, to, quote] }) }
	return { read: { file: file.read, from: from.read, to: to.read, quote: quote.read } }
}

/** A web cite of an outside report: url, quote, retrieved. */
export function readWebCite(params: FieldReadParams): FieldResult<OutsideCite> {
	const object = readObjectItem(params)
	if ('faults' in object) return object
	const { read: record } = object
	const url = readString(fieldOf({ ...params, record, field: 'url' }))
	const quote = readString(fieldOf({ ...params, record, field: 'quote' }))
	const retrieved = readString(fieldOf({ ...params, record, field: 'retrieved' }))
	if ('faults' in url || 'faults' in quote || 'faults' in retrieved)
		return { faults: faultsOf({ results: [url, quote, retrieved] }) }
	return { read: { url: url.read, quote: quote.read, retrieved: retrieved.read } }
}
