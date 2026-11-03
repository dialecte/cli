/** What the `mutants` verbs print: a text, or with `--json` exactly one JSON object, a refusal included. */
import { JSON_FLAG, OPTION_PREFIX } from '../lib/mutation/mutation-agent.constants.ts'
import { MUTANTS_USAGE } from '../lib/mutation/mutation.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { VerbJsonFields, VerbOptions } from '../lib/mutation/mutation-agent.types.ts'

/** The words ask for JSON: `--json` before any `--`. */
export function asksJson(argv: readonly string[]): boolean {
	const end = argv.indexOf('--')
	return (end < 0 ? argv : argv.slice(0, end)).includes(JSON_FLAG)
}

/** A verb's answer: its text, or `{ "verb", "ok": true, ...fields }`. */
export function answered(params: {
	verb: string
	json: boolean
	text: string
	fields: VerbJsonFields
}): CommandResult {
	const { verb, json, text, fields } = params
	return { exitCode: 0, output: json ? JSON.stringify({ verb, ok: true, ...fields }) : text }
}

/** A verb's refusal: `mutants <verb>: <reason>`, or `{ "verb", "ok": false, "reason" }`, with its exit code. */
export function refused(params: {
	verb: string
	json: boolean
	reason: string
	exitCode?: number
}): CommandResult {
	const { verb, json, reason, exitCode = 1 } = params
	return {
		exitCode,
		output: json ? JSON.stringify({ verb, ok: false, reason }) : `mutants ${verb}: ${reason}`,
	}
}

/** The usage, exit 2; `read` is the reason the words were refused when it is one (a string). */
export function usageResult(params: {
	verb?: string
	json?: boolean
	read?: unknown
}): CommandResult {
	const { verb, json = false, read } = params
	const reason = typeof read === 'string' ? ` (${read})` : ''
	if (json && verb !== undefined)
		return refused({ verb, json, reason: `${MUTANTS_USAGE}${reason}`, exitCode: 2 })
	return { exitCode: 2, output: `mutants: ${MUTANTS_USAGE}${reason}` }
}

/** The option words of a verb, `--<name>`: none is ever taken as an option's value. */
export function optionWordsOf(options: VerbOptions): string[] {
	return [...options.values, ...options.flags].map((name) => `${OPTION_PREFIX}${name}`)
}
