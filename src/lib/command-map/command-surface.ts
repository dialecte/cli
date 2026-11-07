/** What a command accepts (its verbs and flags), derived from the usage lines of the command map. */
import {
	USAGE_FLAG_PATTERN,
	USAGE_PREFIX,
	VERB_SHAPE_PATTERN,
	ZERO_CONFIG_FLAGS,
	ZERO_CONFIG_USAGE,
} from './command-map.constants.ts'

import type { CommandEntry, CommandSurface } from './command-map.types.ts'

/**
 * The verbs and flags of one command, derived from its usage lines: a verb is the bare word right after the
 * command's name, a flag every `--name` of a line (`[zero-config flags]` expanded), each once, in first-seen
 * order.
 */
export function commandSurfaceOf(params: { name: string; entry: CommandEntry }): CommandSurface {
	const { name, entry } = params
	const verbs = entry.usage.map((line) => verbOf({ name, line }))
	const flags = entry.usage.flatMap((line) => flagsOf(line))
	return {
		name,
		verbs: unique(verbs.filter((verb): verb is string => verb !== undefined)),
		flags: unique(flags),
	}
}

/** The bare word after `dialecte <name> ` of a usage line, when it has a verb's shape. */
function verbOf(params: { name: string; line: string }): string | undefined {
	const prefix = `${USAGE_PREFIX}${params.name} `
	if (!params.line.startsWith(prefix)) return undefined
	const word = params.line.slice(prefix.length).split(' ')[0]
	return VERB_SHAPE_PATTERN.test(word) ? word : undefined
}

/** The flags of a usage line in order, the zero-config flags where it writes them. */
function flagsOf(line: string): string[] {
	return line
		.split(ZERO_CONFIG_USAGE)
		.flatMap((part, index) => [...(index > 0 ? zeroConfigFlags() : []), ...flagNamesIn(part)])
}

/** The names of the zero-config flags, without their values. */
function zeroConfigFlags(): string[] {
	return [...ZERO_CONFIG_FLAGS.overrides, ...ZERO_CONFIG_FLAGS.formatting].flatMap(flagNamesIn)
}

function flagNamesIn(text: string): string[] {
	return [...text.matchAll(USAGE_FLAG_PATTERN)].map((match) => match[0])
}

function unique(words: string[]): string[] {
	return [...new Set(words)]
}
