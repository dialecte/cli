/**
 * The exits of the lot verbs that hold no lot (33S section 2 rule 5): a usage error, a refusal (exit 2), and the
 * failure of `lot answer` once its answer is recorded (exit 1). Under `--json` each answers JSON with `next: null`;
 * one rule for every verb.
 */
import { renderLotUsage } from '../command-map/render-help.ts'
import { LINE_SEPARATOR_PATTERN, REFUSAL_LINE_SEPARATOR } from './store.constants.ts'

import type { CommandResult } from '../command-result.types.ts'

/**
 * A usage error, exit 2: the lot usage as text; `{ error: <the reason's first line>, usage: <the lot usage>,
 * next: null }` with `--json`.
 */
export function lotUsageExit(params: { reason: string; json: boolean }): CommandResult {
	const usage = renderLotUsage()
	if (!params.json) return { exitCode: 2, output: usage }
	const [error] = params.reason.split(LINE_SEPARATOR_PATTERN)
	return { exitCode: 2, output: JSON.stringify({ error, usage, next: null }, null, 2) }
}

/**
 * A refusal, exit 2: its text as it is; `{ error, next: null }` with `--json`, the error on one line (the text's
 * lines trimmed and joined by `; `, so a listing of candidates stays in it).
 */
export function lotRefusalExit(params: { message: string; json: boolean }): CommandResult {
	return errorExit({ ...params, exitCode: 2 })
}

/**
 * A failure after the lot was written, exit 1 (an `onAnswered` hook that threw, the answer kept): its text as it
 * is; `{ error, next: null }` with `--json`, the error on one line as a refusal's.
 */
export function lotFailureExit(params: { message: string; json: boolean }): CommandResult {
	return errorExit({ ...params, exitCode: 1 })
}

/** The message as it is, or `{ error, next: null }` with its lines trimmed and joined by `; `, under `exitCode`. */
function errorExit(params: { message: string; json: boolean; exitCode: 1 | 2 }): CommandResult {
	const { exitCode } = params
	if (!params.json) return { exitCode, output: params.message }
	const error = params.message
		.split(LINE_SEPARATOR_PATTERN)
		.map((line) => line.trim())
		.filter((line) => line !== '')
		.join(REFUSAL_LINE_SEPARATOR)
	return { exitCode, output: JSON.stringify({ error, next: null }, null, 2) }
}
