/**
 * Whole ask records written as the folders of an `asks` folder hold them: `ask.json`, each round's `verdict.json` and
 * pack, the person's `answer.json`; for the tests of the ask's state, the lot note and the reader miss.
 */
import { join } from 'node:path'

import {
	BASE_ASK_JSON,
	OUTCOME_OF_STATE,
	RECORD_AT,
	RECORD_FILE,
	RECORD_PERSON,
} from './ask-records-fixtures.constants.ts'
import { writeTextFile } from './standard-workspace.ts'

import type { AskJson } from '../src/commands/ask.types.ts'
import type { AnswerRecord, PackRecord, VerdictRecord } from '../src/lib/knowledge/ask/ask.types.ts'
import type { AskFolderSpec, GivenRange, VerdictSpec } from './ask-records-fixtures.types.ts'

/** A whole `ask.json` of ask `ask`: the base record with `changes` replacing whole members. */
export function askJsonOf(params: { ask: string; changes?: AskFolderSpec['json'] }): AskJson {
	return { ...BASE_ASK_JSON, ask: params.ask, ...params.changes }
}

/** A whole `verdict.json`: the round closed in `state`, naming the fact it recorded. */
export function verdictRecordOf(params: { ask: string; verdict: VerdictSpec }): VerdictRecord {
	const { ask, verdict } = params
	return {
		schema: 1,
		ask,
		round: verdict.round,
		adjudicator: false,
		reports: [],
		outcome: OUTCOME_OF_STATE[verdict.state],
		verifiedAngles: [],
		state: verdict.state,
		next: null,
		fact: verdict.fact,
		at: RECORD_AT,
	}
}

/** A whole `answer.json`: the person's answer, recorded as the fact `fact`. */
export function answerRecordOf(params: { ask: string; fact: string }): AnswerRecord {
	return {
		schema: 1,
		ask: params.ask,
		by: RECORD_PERSON,
		text: 'AA_1 holds AAA_1.',
		cite: null,
		citeRefused: null,
		miss: null,
		fact: params.fact,
		at: RECORD_AT,
	}
}

/** A whole `pack.json`: the round, and the slice ids each reader (A, then B) was given. */
export function packRecordOf(params: {
	ask: string
	round: number
	given: string[][]
	/** Where the slice ids lie (a placeholder range of the record file when an id is not named). */
	known?: GivenRange[]
}): PackRecord {
	return {
		schema: 1,
		ask: params.ask,
		round: params.round,
		outside: false,
		web: false,
		readers: params.given.map((slices, index) => ({
			letter: index === 0 ? 'A' : 'B',
			nonce: `nonce-${params.round}-${index}`,
			slices,
			ranges: slices.map((id) => ({
				file: RECORD_FILE,
				from: 1,
				to: 10,
				...params.known?.find((range) => range.id === id),
				id,
				clause: null,
				linked: false,
			})),
		})),
		at: RECORD_AT,
	}
}

/** Writes a whole JSON record as a file. */
function writeRecord(params: { path: string; record: unknown }): void {
	writeTextFile({ path: params.path, text: `${JSON.stringify(params.record, null, '\t')}\n` })
}

/** Writes the folder of an ask below `asksFolder`: its `ask.json`, each verdict and the answer the spec names. */
export function writeAskFolder(params: { asksFolder: string; spec: AskFolderSpec }): void {
	const { asksFolder, spec } = params
	const folder = join(asksFolder, spec.ask)
	writeRecord({
		path: join(folder, 'ask.json'),
		record: askJsonOf({ ask: spec.ask, changes: spec.json }),
	})
	for (const verdict of spec.verdicts ?? [])
		writeRecord({
			path: join(folder, 'rounds', `round-${verdict.round}`, 'verdict.json'),
			record: verdictRecordOf({ ask: spec.ask, verdict }),
		})
	if (spec.answer !== undefined)
		writeRecord({
			path: join(folder, 'answer.json'),
			record: answerRecordOf({ ask: spec.ask, fact: spec.answer.fact }),
		})
	if (spec.confirm !== undefined)
		writeRecord({
			path: join(folder, 'confirm.json'),
			record: {
				schema: 1,
				ask: spec.ask,
				fact: spec.confirm.fact,
				by: RECORD_PERSON,
				at: RECORD_AT,
			},
		})
}
