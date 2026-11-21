/** The name the scope guard goes by, as the hook's step and the hand-over's guard line name it. */
export const SCOPE_GUARD_NAME = 'scope'

/** The texts of the scope guard (`scope-guard.ts`): `{lot}` the lot's name, `{signer}` the signer a lot signs as. */
export const SCOPE_GUARD_TEXTS = {
	outside: "{count} path(s) outside lot {lot}'s scope: {paths}",
	next: 'dialecte lot scope {lot} {adds} --by {signer} --reason "<why>"',
	unreadable:
		'{lot}: scope-changes.jsonl has {count} unreadable line(s): repair it before committing',
	damaged: '{lot} is damaged ({reason}): repair its records by hand; nothing to add',
	/** The damage reason of a brief whose scope does not read (missing, not parsing, or no list of texts). */
	briefScope: 'brief.json is missing, does not parse or holds no scope list of texts',
	/** A path holding a glob character (`*`, `?`, `[`...) is no literal entry: it gets no `--add` of its own. */
	globPath:
		'{path} holds a glob character, which an add reads as a glob: add its folder, or a glob that matches it, with lot scope --add',
} as const

/** How a verb that is no gate step (`lot land`, the hand-over guards) prints a refusal: its reason, then the add to run. */
export const SCOPE_REFUSAL_LINES = {
	reason: '✗ scope  {reason}',
	next: '  next: {next}',
	globPath: '  {line}',
	noBase:
		'✗ scope  no base to check the scope against: the lot base reads as HEAD (no base branch found); fetch or set dialecte.baseBranch, then land again',
} as const
