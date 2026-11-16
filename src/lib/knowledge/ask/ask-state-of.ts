import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { fillMessage } from '../standard/fill-message.ts'
import { askRoundsOf } from './ask-rounds-of.ts'
import {
	ANSWER_RECORD_FILE,
	ASK_RECORD_FILE,
	ASK_STATES,
	CLAIM_MESSAGES,
	CONFIRM_RECORD_FILE,
	NAME_SEPARATOR,
} from './ask.constants.ts'
import { isAskState } from './read-ask-record.ts'
import { isRecord } from './read-report-fields.ts'

import type { AskState, AskStateOfParams, AskStateRead } from './ask.types.ts'

/**
 * An ask's state now (D6): the latest of its `ask.json`, its rounds' `verdict.json` and its `answer.json`, the fact
 * it holds, where its readers read, and whether a person answered an ask that went outside. Throws (naming the file
 * and the fix) on a record that does not read: the caller reads the ask's record first.
 */
export function askStateOf(params: AskStateOfParams): AskStateRead {
	const { askFolder } = params
	const record = recordValueOf({ path: join(askFolder, ASK_RECORD_FILE) })
	if (!isRecord(record) || typeof record.state !== 'string') throw damagedError({ askFolder })
	if (!isAskState(record.state))
		throw new Error(
			fillMessage({
				template: CLAIM_MESSAGES.askUnknownState,
				values: {
					path: join(askFolder, ASK_RECORD_FILE),
					state: record.state,
					states: ASK_STATES.join(NAME_SEPARATOR),
				},
			}),
		)
	const recordState = record.state
	const source = sourceOf({ value: record })
	const answer = recordValueOf({ path: join(askFolder, ANSWER_RECORD_FILE) })
	if (isRecord(answer) && typeof answer.fact === 'string')
		return { state: 'answered', fact: answer.fact, source, confirmed: source === 'outside' }
	// an outside answer a person confirmed (U17): answered, by the person's fact
	const confirm = recordValueOf({ path: join(askFolder, CONFIRM_RECORD_FILE) })
	if (isRecord(confirm) && typeof confirm.fact === 'string')
		return { state: 'answered', fact: confirm.fact, source, confirmed: true }
	const rounds = askRoundsOf({ askFolder })
	if ('refused' in rounds) throw new Error(rounds.refused)
	// the rounds in round order: the last verdict, or skipped round (J-15: the person), written is the latest
	const latest = rounds.rounds
		.flatMap(function closedOf(round): { state: AskState; fact: string | null }[] {
			if (round.verdict !== null) return [{ state: round.verdict.state, fact: round.verdict.fact }]
			if (round.skipped !== null) return [{ state: round.skipped.state, fact: null }]
			return []
		})
		.at(-1)
	if (latest !== undefined) return { ...latest, source, confirmed: false }
	return {
		state: recordState,
		fact: typeof record.fact === 'string' ? record.fact : null,
		source,
		confirmed: false,
	}
}

/**
 * Where the ask's readers read, as its record says: documents, outside, or none (rungs 0-2, `--person-only`); a
 * re-ask's record names no source and is a documents ask (it is made only when documents are read).
 */
function sourceOf(params: { value: Record<string, unknown> }): AskStateRead['source'] {
	const { value } = params
	if (!('source' in value)) return 'documents'
	return value.source === 'documents' || value.source === 'outside' ? value.source : null
}

/** A record's parsed JSON; undefined when it is absent or does not parse. */
function recordValueOf(params: { path: string }): unknown {
	if (!existsSync(params.path)) return undefined
	try {
		return JSON.parse(readFileSync(params.path, 'utf8')) as unknown
	} catch {
		return undefined
	}
}

function damagedError(params: { askFolder: string }): Error {
	return new Error(
		fillMessage({
			template: CLAIM_MESSAGES.askDamaged,
			values: { path: join(params.askFolder, ASK_RECORD_FILE) },
		}),
	)
}
