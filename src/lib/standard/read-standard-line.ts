/**
 * The card's `standard` line: whether a standard is configured and what the station recorded about it. A standard
 * is configured when `DIALECTE_STANDARD` names a file or folder that exists (the environment only: no committed
 * file names it). Configured and consulted passes; configured with no consultation recorded fails; none
 * configured warns, with the recorded not-consulted reason when there is one, and never blocks.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { DETAIL_SEPARATOR } from '../gate-records/gate-records.constants.ts'
import { shellQuote } from '../shell-quote.ts'
import { readStandardRoot } from './read-standard-root.ts'
import {
	STANDARD_CONSULTED_DETAIL,
	STANDARD_FILE,
	STANDARD_LINE_NAME,
	STANDARD_NOT_CONFIGURED_DETAIL,
	STANDARD_NOT_CONSULTED_DETAIL,
	STANDARD_NOT_RECORDED_DETAIL,
	STANDARD_RECORDED_NOT_CONSULTED_DETAIL,
	STANDARD_STATES,
} from './standard.constants.ts'

import type { CardGateLine } from '../gate-records/gate-records.types.ts'
import type { StandardRecord } from './standard.types.ts'

export function readStandardLine(params: { folder: string }): CardGateLine {
	const record = readStandardRecord(params.folder)
	if (!isStandardConfigured()) {
		return {
			name: STANDARD_LINE_NAME,
			status: 'warning',
			// the reason a station gave for not consulting one; a consulted note has nothing to add here
			detail: [STANDARD_NOT_CONFIGURED_DETAIL, record?.state === 'not-consulted' ? record.note : '']
				.filter(Boolean)
				.join(DETAIL_SEPARATOR),
		}
	}
	if (record?.state === 'consulted')
		return {
			name: STANDARD_LINE_NAME,
			status: 'passed',
			detail: STANDARD_CONSULTED_DETAIL.replace('{note}', record.note),
		}
	return {
		name: STANDARD_LINE_NAME,
		status: 'failed',
		detail: STANDARD_NOT_CONSULTED_DETAIL.replace('{folder}', shellQuote(params.folder)),
	}
}

/**
 * A committed (DONE) card's standard line: the state recorded on the lot, never one recomputed from the
 * environment of the shell that ran the hand-over. Consulted passes; not consulted, or nothing recorded, warns.
 */
export function readRecordedStandardLine(params: { folder: string }): CardGateLine {
	const record = readStandardRecord(params.folder)
	if (record?.state === 'consulted')
		return {
			name: STANDARD_LINE_NAME,
			status: 'passed',
			detail: STANDARD_CONSULTED_DETAIL.replace('{note}', record.note),
		}
	return {
		name: STANDARD_LINE_NAME,
		status: 'warning',
		detail: record
			? STANDARD_RECORDED_NOT_CONSULTED_DETAIL.replace('{note}', record.note)
			: STANDARD_NOT_RECORDED_DETAIL,
	}
}

/** `DIALECTE_STANDARD` names a file or a folder that exists; a path that does not counts as none configured. */
function isStandardConfigured(): boolean {
	const path = readStandardRoot()
	return path !== undefined && existsSync(path)
}

/** The folder's `standard.json`; undefined when there is none or it holds no record of a known state. */
function readStandardRecord(folder: string): StandardRecord | undefined {
	const path = join(folder, STANDARD_FILE)
	if (!existsSync(path)) return undefined
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
		return isStandardRecord(parsed) ? parsed : undefined
	} catch {
		// a file broken by hand records nothing
		return undefined
	}
}

function isStandardRecord(entry: unknown): entry is StandardRecord {
	if (typeof entry !== 'object' || entry === null) return false
	const record = entry as Record<string, unknown>
	return (
		STANDARD_STATES.some((state) => state === record.state) &&
		typeof record.note === 'string' &&
		typeof record.at === 'string'
	)
}
