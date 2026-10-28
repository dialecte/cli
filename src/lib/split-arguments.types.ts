/** A command line split: the words that are not options, each option's value, the options standing alone. */
export type SplitArguments = {
	positionals: string[]
	values: Map<string, string>
	flags: Set<string>
}
