/**
 * The exits of the lot verbs that hold no lot (33S section 2 rule 5): a usage error, a refusal (exit 2), and the
 * failure of `lot answer` once its answer is recorded (exit 1). Under `--json` each answers JSON with `next: null`;
 * one rule for every verb.
 */
import { basename } from 'node:path'

import { lotUsageLine, renderLotUsage } from '../command-map/render-help.ts'
import { jsonOf, textOf } from '../print/print.ts'
import { exitCodeOfState } from './exit-code-of-state.ts'
import {
	DAMAGED_STATE,
	DAMAGED_TEXTS,
	LINE_SEPARATOR_PATTERN,
	NEXT_COMMANDS,
	REFUSAL_LINE_SEPARATOR,
} from './store.constants.ts'

import type { CommandResult } from '../command-result.types.ts'
import type { DamagedLotJson } from './store.types.ts'

/**
 * A usage error, exit 2: the lot usage as text; `{ error: <the reason's first line>, usage: <the lot usage>,
 * next: null }` with `--json`.
 */
export function lotUsageExit(params: { reason: string; json: boolean }): CommandResult {
	if (!params.json) return { exitCode: 2, output: renderLotUsage() }
	const [error] = params.reason.split(LINE_SEPARATOR_PATTERN)
	return { exitCode: 2, output: jsonOf({ error, usage: lotUsageLine(), next: null }, 2) }
}

/**
 * A refusal, exit 2: its lines, printed through the boundary; `{ error, next: null }` with `--json`, the lines
 * trimmed and joined by `; ` (a listing of candidates stays in it), each as written.
 */
export function lotRefusalExit(params: { lines: readonly string[]; json: boolean }): CommandResult {
	return errorExit({ ...params, exitCode: 2 })
}

/**
 * A failure after the lot was written, exit 1 (an `onAnswered` hook that threw, the answer kept): its lines;
 * `{ error, next: null }` with `--json`, the error on one line as a refusal's.
 */
export function lotFailureExit(params: { lines: readonly string[]; json: boolean }): CommandResult {
	return errorExit({ ...params, exitCode: 1 })
}

/**
 * A damaged lot (P2.3), exit 6 for `status`, `wait` and `result`: `<name> damaged: <reason>` then `next: dialecte lot
 * stop <name> --reason <text>`; `{ lot, state: "damaged", reason, next }` with `--json`. The lot is named by its
 * folder's name (its identity may not read); the reason is a fixed word of the store, never a field of a record.
 */
export function lotDamagedExit(params: {
	lotFolder: string
	damage: string
	json: boolean
}): CommandResult {
	const damaged = damagedLotJsonOf(params)
	const exitCode = exitCodeOfState({
		verb: 'result',
		state: DAMAGED_STATE,
		limit: false,
		timedOut: false,
	})
	if (params.json) return { exitCode, output: jsonOf(damaged, 2) }
	return {
		exitCode,
		output: textOf([
			DAMAGED_TEXTS.state.replace('{name}', damaged.lot).replace('{reason}', damaged.reason),
			DAMAGED_TEXTS.next.replace('{command}', damaged.next),
		]),
	}
}

/** What a reader answers of a damaged lot: its folder's name, the state, the reason and the stop to run. */
function damagedLotJsonOf(params: { lotFolder: string; damage: string }): DamagedLotJson {
	const lot = basename(params.lotFolder)
	return {
		lot,
		state: DAMAGED_STATE,
		reason: params.damage,
		next: NEXT_COMMANDS.stop.replace('{name}', lot),
	}
}

/** The lines printed, or `{ error, next: null }` with them trimmed and joined by `; `, under `exitCode`. */
function errorExit(params: {
	lines: readonly string[]
	json: boolean
	exitCode: 1 | 2
}): CommandResult {
	const { exitCode } = params
	if (!params.json) return { exitCode, output: textOf(params.lines) }
	// each line as written (a value it quotes kept whole, its own line feeds included); the lines joined
	const error = params.lines
		.map((line) => line.trim())
		.filter((line) => line !== '')
		.join(REFUSAL_LINE_SEPARATOR)
	return { exitCode, output: jsonOf({ error, next: null }, 2) }
}
