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
}): RoundArguments | string {
	const read: RoundArguments = { values: new Map(), flags: new Set(), words: [] }
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
		if (params.flags?.includes(name)) read.flags.add(name)
		else if (params.valueOptions.includes(name) && index + 1 < params.argv.length)
			read.values.set(name, params.argv[++index])
		else
			return params.valueOptions.includes(name)
				? `${argument} needs a value`
				: `unknown option ${argument}`
	}
	return read
}
