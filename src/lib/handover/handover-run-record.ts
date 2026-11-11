/** The run record of a hand-over folder: written when a run ends, read by the card (a DONE card says a sleep). */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { HANDOVER_FILES } from './handover.constants.ts'

import type { HandoverRunRecord } from './handover-run-record.types.ts'

/** Writes the record of a run that ended into the hand-over `folder`, over the record of its previous run. */
export function writeHandoverRunRecord(params: {
	folder: string
	record: HandoverRunRecord
}): void {
	writeFileSync(
		join(params.folder, HANDOVER_FILES.lastRun),
		`${JSON.stringify(params.record, null, 2)}\n`,
	)
}

/** The record of the folder's last run; undefined when it has none or it cannot be read. */
export function readHandoverRunRecord(folder: string): HandoverRunRecord | undefined {
	let parsed: unknown
	try {
		parsed = JSON.parse(readFileSync(join(folder, HANDOVER_FILES.lastRun), 'utf8'))
	} catch {
		return undefined
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
	const sleptMs = 'sleptMs' in parsed ? parsed.sleptMs : undefined
	return typeof sleptMs === 'number' && Number.isFinite(sleptMs) && sleptMs > 0 ? { sleptMs } : {}
}
