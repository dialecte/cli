/** A command line checked against the options the command map's usage lines give its verb. */
import { jsonOf, linesOf, textOf } from '../print/print.ts'
import { readArguments } from '../review-rounds/round-arguments.ts'
import { COMMAND_MAP, USAGE_FLAG_PATTERN } from './command-map.constants.ts'
import { commandSurfaceOf, expandedUsageLine, verbOf } from './command-surface.ts'
import { renderCommandSection } from './render-help.ts'
import {
	END_OF_OPTIONS,
	JSON_OPTION,
	USAGE_END_OF_OPTIONS,
	VALUE_AFTER_FLAG_PATTERN,
} from './verb-options.constants.ts'

import type { CommandResult } from '../command-result.types.ts'
import type { ListedCommandName, UsageOption, VerbOptions } from './command-map.types.ts'

/**
 * The usage refusal (exit 2) of a command line holding an option its verb's usage lines do not name, a value
 * option given last without its value, or `--` where no usage line of the verb writes one (the verbs read their
 * flags over the whole line: an option after `--` would still act); undefined when every option is known. With
 * `--json`, when the verb takes it, the refusal is `{ error, usage, next: null }`, as `health` and `inbox` answer
 * theirs.
 */
export function unknownOptionRefusal(params: {
	name: ListedCommandName
	/** The words after the command's name, its verb first when it has one. */
	argv: readonly string[]
	/** The verb the lines without one stand for too (`handover <lots.json>` is `handover write`). */
	defaultVerb?: string
	/** Per verb, options no usage line names that the verb still accepts. */
	hidden?: Readonly<Record<string, readonly string[]>>
}): CommandResult | undefined {
	const { name, argv } = params
	const entry = COMMAND_MAP[name]
	const verbs = commandSurfaceOf({ name, entry }).verbs
	const verb = verbs.includes(argv[0] ?? '') ? argv[0] : undefined
	const options = verbOptionsOf({
		name,
		usage: entry.usage,
		accepted: verb === undefined ? [undefined, params.defaultVerb] : [verb],
	})
	const words = verb === undefined ? argv : argv.slice(1)
	const hidden = verb === undefined ? [] : (params.hidden?.[verb] ?? [])
	const read =
		words.includes(END_OF_OPTIONS) && !options.endsOptions
			? `unknown option ${END_OF_OPTIONS}`
			: readArguments({
					argv: words,
					valueOptions: options.valueOptions,
					flags: [...options.flags, ...hidden],
				})
	if (typeof read !== 'string') return undefined
	const usage = renderCommandSection({ name, entry })
	if (options.flags.includes(JSON_OPTION) && argv.includes(`--${JSON_OPTION}`))
		return { exitCode: 2, output: jsonOf({ error: read, usage, next: null }, 2) }
	return { exitCode: 2, output: textOf([`${name}: ${read}`, '', ...linesOf(usage)]) }
}

/**
 * The options of the usage lines whose verb is one of `accepted` (undefined: a line without a verb): a value option
 * when its flag is followed by a placeholder or a value word (`--base <ref>`, `--effort low|medium|high`), a flag
 * otherwise; the zero-config flags expanded where a line writes them; whether a line writes `--`.
 */
function verbOptionsOf(params: {
	name: string
	usage: readonly string[]
	accepted: ReadonlyArray<string | undefined>
}): VerbOptions {
	const lines = params.usage
		.filter((line) => params.accepted.includes(verbOf({ name: params.name, line })))
		.map(expandedUsageLine)
	const options = lines.flatMap(usageOptionsOf)
	return {
		valueOptions: unique(options.filter((option) => option.takesValue).map(nameOf)),
		flags: unique(options.filter((option) => !option.takesValue).map(nameOf)),
		endsOptions: lines.some((line) => line.includes(USAGE_END_OF_OPTIONS)),
	}
}

/** Each `--name` of an expanded usage line, without its dashes, and whether a value follows it. */
function usageOptionsOf(line: string): UsageOption[] {
	return [...line.matchAll(USAGE_FLAG_PATTERN)].map(function optionOf(match): UsageOption {
		const after = line.slice(match.index + match[0].length)
		return { name: match[0].slice(2), takesValue: VALUE_AFTER_FLAG_PATTERN.test(after) }
	})
}

function nameOf(option: UsageOption): string {
	return option.name
}

function unique(words: readonly string[]): string[] {
	return [...new Set(words)]
}
