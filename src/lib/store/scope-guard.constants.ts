/** The name the scope guard goes by, as the hook's step and the hand-over's guard line name it. */
export const SCOPE_GUARD_NAME = 'scope'

/** The texts of the scope guard (`scope-guard.ts`): `{lot}` the lot's name. */
export const SCOPE_GUARD_TEXTS = {
	outside: "{count} path(s) outside lot {lot}'s scope: {paths}",
	next: 'dialecte lot scope {lot} {adds} --by lot-session --reason "<why>"',
	unreadable:
		'{lot}: scope-changes.jsonl has {count} unreadable line(s): repair it before committing',
	damaged: '{lot} is damaged ({reason}): repair its records by hand; nothing to add',
	/** The damage reason of a brief whose scope does not read (missing, not parsing, or no list of texts). */
	briefScope: 'brief.json is missing, does not parse or holds no scope list of texts',
	/** `lot scope --drop` whose lot base cannot be read: the committed work cannot be checked (SAFE Q5). */
	dropBase:
		'lot scope: {name}: the lot base cannot be read ({failure}): a drop is checked against the committed work; nothing written',
	/** A path holding a glob character (`*`, `?`, `[`) is no literal entry: it gets no `--add`. */
	globPath: '{path} holds a glob character: name it in the brief through a glob or its folder',
} as const

/** How a verb that is no gate step (`lot land`, the hand-over guards) prints a refusal: its reason, then the add to run. */
export const SCOPE_REFUSAL_LINES = {
	reason: '✗ scope  {reason}',
	next: '  next: {next}',
	globPath: '  {line}',
} as const
