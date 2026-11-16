import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { recordText, replaceWhole } from '../../store/publish.ts'
import { fillMessage } from '../standard/fill-message.ts'
import { ACCEPTED_REPORTS_FILE, ACCEPTED_REPORTS_REFUSALS } from './ask.constants.ts'
import { isRecord } from './read-report-fields.ts'

import type { AcceptedReport, AcceptedReportsRecord } from './ask.types.ts'

/**
 * Keeps the accepted reports of a round closed for the adjudicator, with their check results, in the round's
 * folder (written whole): the next pack writes the adjudicator's brief from them (D38).
 */
export function writeAcceptedReports(params: {
	folder: string
	ask: string
	round: number
	reports: AcceptedReport[]
}): void {
	const record: AcceptedReportsRecord = {
		schema: 1,
		ask: params.ask,
		round: params.round,
		reports: params.reports,
	}
	replaceWhole({ path: join(params.folder, ACCEPTED_REPORTS_FILE), text: recordText(record) })
}

/**
 * The accepted reports a round closed for the adjudicator kept: none when it kept no file (a high round with nothing
 * left, L-3: the brief holds no report); the refusal of a file damaged.
 */
export function readAcceptedReports(params: {
	folder: string
	ask: string
}): { reports: AcceptedReport[] } | { refused: string } {
	const path = join(params.folder, ACCEPTED_REPORTS_FILE)
	const values = { path, ask: params.ask }
	if (!existsSync(path)) return { reports: [] }
	let value: unknown
	try {
		value = JSON.parse(readFileSync(path, 'utf8'))
	} catch {
		value = undefined
	}
	if (isAcceptedReportsRecord(value)) return { reports: value.reports }
	return { refused: fillMessage({ template: ACCEPTED_REPORTS_REFUSALS.damaged, values }) }
}

/** Whether a value reads as an accepted reports file of schema 1: each report accepted, lettered, with its claims. */
function isAcceptedReportsRecord(value: unknown): value is AcceptedReportsRecord {
	if (!isRecord(value) || value.schema !== 1 || !Array.isArray(value.reports)) return false
	return value.reports.every(
		(report: unknown) =>
			isRecord(report) &&
			report.accepted === true &&
			typeof report.letter === 'string' &&
			isRecord(report.report) &&
			Array.isArray(report.claims),
	)
}
