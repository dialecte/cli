/** The options `lot keep` and `lot unkeep` read: one value each, and the JSON flag. */
export const KEEP_VERB_VALUE_OPTIONS: readonly string[] = ['by', 'reason']
export const KEEP_VERB_FLAGS: readonly string[] = ['json']

/** The kind of the event each written line is followed by (KEEP 3.3). */
export const KEEP_CHANGED_KIND = 'keep.changed'

/**
 * The lines `lot keep` and `lot unkeep` print (KEEP 3.3): `{verb}` `keep` or `unkeep`, `{name}` the lot's folder name.
 */
export const KEEP_VERB_TEXTS = {
	usage: 'lot {verb}: expected <id> --by <who> --reason <text> [--json]',
	overLimit:
		'lot {verb}: --reason holds {length} characters, over the limit of {limit}: nothing written',
	unreadableLines:
		'lot {verb}: {name}: {file} holds {count} line(s) that do not read: repair it by hand: nothing written',
	unreadableFile:
		'lot {verb}: {name}: {file} cannot be read ({code}): repair it by hand: nothing written',
	command: 'lot {verb}',
	kept: '{name} kept by decision: {reason}',
	keptAlready: '{name} is kept already: nothing written',
	unkept: '{name} no longer kept',
	notKept: '{name} is not kept: nothing written',
	next: 'next: {command}',
	writeFailure: 'lot {verb}: {name}: {message}: nothing written',
	eventFailure: 'lot {verb}: the event could not be written in {file}: {message}',
} as const
