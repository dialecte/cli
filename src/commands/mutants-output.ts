/** What the `mutants` verbs print: a text, or with `--json` exactly one JSON object, a refusal included. */
import { resultOf } from '../lib/command-result.ts'
import { JSON_FLAG, OPTION_PREFIX } from '../lib/mutation/mutation-agent.constants.ts'
import { MUTANTS_USAGE, MUTANTS_USAGE_LINES } from '../lib/mutation/mutation.constants.ts'
import { jsonOf } from '../lib/print/print.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { VerbJsonFields, VerbOptions } from '../lib/mutation/mutation-agent.types.ts'

/** The words ask for JSON: `--json` before any `--`. */
export function asksJson(argv: readonly string[]): boolean {
	const end = argv.indexOf('--')
	return (end < 0 ? argv : argv.slice(0, end)).includes(JSON_FLAG)
}

/** A verb's answer: its lines, or `{ "verb", "ok": true, ...fields }`. */
export function answered(params: {
	verb: string
	json: boolean
	lines: readonly string[]
	fields: VerbJsonFields
}): CommandResult {
	const { verb, json, lines, fields } = params
	if (json) return { exitCode: 0, output: jsonOf({ verb, ok: true, ...fields }) }
	return resultOf({ exitCode: 0, lines })
}

/** A verb's refusal: `mutants <verb>: <reason>`, or `{ "verb", "ok": false, "reason" }`, with its exit code. */
export function refused(params: {
	verb: string
	json: boolean
	reason: string
	exitCode?: number
}): CommandResult {
	const { verb, json, reason, exitCode = 1 } = params
	if (json) return { exitCode, output: jsonOf({ verb, ok: false, reason }) }
	return resultOf({ exitCode, lines: [`mutants ${verb}: ${reason}`] })
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
	const [first, ...rest] = MUTANTS_USAGE_LINES
	const last = rest.pop()
	const lines =
		last === undefined
			? [`mutants: ${first}${reason}`]
			: [`mutants: ${first}`, ...rest, `${last}${reason}`]
	return resultOf({ exitCode: 2, lines })
}

/** The option words of a verb, `--<name>`: none is ever taken as an option's value. */
export function optionWordsOf(options: VerbOptions): string[] {
	return [...options.values, ...options.flags].map((name) => `${OPTION_PREFIX}${name}`)
}
