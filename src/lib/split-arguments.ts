import type { SplitArguments } from './split-arguments.types.ts'

/**
 * A command's arguments split by the options it declares: `--name value` for an option taking a value, `--name`
 * alone for a flag, every other word positional. The answer is what is wrong when an option is unknown or a
 * value is missing (the next word is another option, or there is none).
 */
export function splitArguments(params: {
	argv: readonly string[]
	valueFlags: ReadonlySet<string>
	booleanFlags: ReadonlySet<string>
}): SplitArguments | string {
	const { argv, valueFlags, booleanFlags } = params
	const split: SplitArguments = { positionals: [], values: new Map(), flags: new Set() }
	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index]
		if (!argument.startsWith('--')) {
			split.positionals.push(argument)
			continue
		}
		const name = argument.slice(2)
		if (booleanFlags.has(name)) split.flags.add(name)
		else if (valueFlags.has(name)) {
			const value = argv[index + 1]
			if (value === undefined || value.startsWith('--')) return `--${name} needs a value`
			split.values.set(name, value)
			index++
		} else return `unknown option --${name}`
	}
	return split
}
