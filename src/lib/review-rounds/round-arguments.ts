/** The command-line words the review-round commands share: a round, the options they know, `--`. */
import { ROUND_PATTERN } from './review-rounds.constants.ts'

import type { RoundArguments } from './review-rounds.types.ts'

/** A round given as a positive integer (`1`, `12`); undefined for anything else (`0`, `-1`, `1.5`, `x`). */
export function parseRound(value: string | undefined): number | undefined {
	return value !== undefined && ROUND_PATTERN.test(value) ? Number(value) : undefined
}

/**
 * A subcommand's words split by the options it knows: `--name value` for a value option, `--name` for a
 * flag, every other word positional. `--` ends the options: every word after it is positional, so a
 * finding or a reason may start with `--`. Answers the unknown option, or a value option given last
 * without its value.
 */
export function readArguments(params: {
	argv: readonly string[]
	valueOptions: readonly string[]
	flags?: readonly string[]
	/** Options that may be given several times: their values are collected into `lists`, never `values`. */
	repeatable?: readonly string[]
}): RoundArguments | string {
	const read: RoundArguments = { values: new Map(), flags: new Set(), lists: new Map(), words: [] }
	const repeatable = params.repeatable ?? []
	for (let index = 0; index < params.argv.length; index++) {
		const argument = params.argv[index]
		if (argument === '--') {
			read.words.push(...params.argv.slice(index + 1))
			break
		}
		if (!argument.startsWith('--')) {
			read.words.push(argument)
			continue
		}
		const name = argument.slice(2)
		const takesValue = params.valueOptions.includes(name) || repeatable.includes(name)
		if (params.flags?.includes(name)) read.flags.add(name)
		else if (takesValue && index + 1 < params.argv.length) {
			const value = params.argv[++index]
			if (repeatable.includes(name)) read.lists.set(name, [...(read.lists.get(name) ?? []), value])
			else read.values.set(name, value)
		} else return takesValue ? `${argument} needs a value` : `unknown option ${argument}`
	}
	return read
}
