/** A lot's design (DESIGN-GATE): its records, its states and their words. */

/** The version of a lot folder's `base-declared.json`. */
export const BASE_DECLARED_SCHEMA = 1

/** The version of a `design.jsonl` line. */
export const DESIGN_LINE_SCHEMA = 1

/** The extension of a recorded content's copy. */
export const DESIGN_COPY_EXTENSION = '.md'

/** Why a design or review file is refused: it cannot be read, is empty, is not UTF-8, or lies where files are wiped. */
export const DESIGN_FILE_REFUSALS = ['unreadable', 'empty', 'not-text', 'in-scratch'] as const

/** How a review's last `Verdict:` line reads. */
export const VERDICT_WORDS = ['ready', 'not-ready', 'unrecognized'] as const

/** Why a review's verdict is unrecognized: its lines disagree, a fence is left open, or its word is neither. */
export const VERDICT_CAUSES = ['disagree', 'open-fence', 'word'] as const

/** Where the reviews of a recorded hash stand. */
export const VERDICT_STANDING_STATES = ['ready', 'missing', 'blocked'] as const

/** The key naming the design a review read (compared in lower case). */
export const REVIEW_DESIGN_KEY = 'design'

/** The key of a review's verdict (compared in lower case). */
export const REVIEW_VERDICT_KEY = 'verdict'

/** The verdict word that passes a design. */
export const VERDICT_READY = 'READY'

/** The verdict words that do not pass it. */
export const VERDICT_NOT_READY = 'NOT READY'

/** What may follow `READY` (after optional spaces) and keep it READY: notes, a stop, a dash. */
export const VERDICT_READY_FOLLOWERS: readonly string[] = [
	'(',
	'.',
	',',
	';',
	':',
	'-',
	'\u2013',
	'\u2014',
]

/** The markdown emphasis characters stripped around a review's key and removed from its value. */
export const REVIEW_EMPHASIS = /[*_`]/g

/** The emphasis characters at the start of a key. */
export const REVIEW_LEADING_EMPHASIS = /^[*_`]+/

/** The emphasis characters at the end of a key. */
export const REVIEW_TRAILING_EMPHASIS = /[*_`]+$/

/** A fence opening line after its indentation: a run of 3+ backticks or 3+ tildes, then its info string. */
export const REVIEW_FENCE_OPENING = /^(`{3,}|~{3,})(.*)$/

/** A fence closing line after its indentation: a run of 3+ backticks or 3+ tildes, then only whitespace. */
export const REVIEW_FENCE_CLOSING = /^(`{3,}|~{3,})\s*$/

/** The most spaces a fence line may be indented by; more makes it no fence. */
export const REVIEW_FENCE_MAX_INDENT = 3

/** The markers stripped before a key, repeatedly until none leads: a blockquote, a heading, a list item. */
export const REVIEW_LINE_MARKERS = {
	quote: /^>\s*/,
	heading: /^#{1,6}\s+/,
	list: /^(?:[-*+]|\d+[.)])\s+/,
} as const

/** The hex run that starts a `Design:` value. */
export const REVIEW_HEX_RUN = /^[0-9a-f]+/i

/** The shortest and longest hash prefix a `Design:` line may name. */
export const REVIEW_HASH_LENGTHS = { shortest: 12, longest: 64 } as const

/** A character that ends a hex run without spoiling it is no letter and no digit. */
export const REVIEW_HASH_SPOILER = /[\p{L}\p{N}]/u

/** The verdict as written of a review whose `Verdict:` lines disagree. */
export const VERDICT_DISAGREE = 'Verdict: lines that disagree'

/** The verdict a review gets when a fence is left open at its end (a quoted NOT READY could hide in it). */
export const VERDICT_UNCLOSED_FENCE = 'an unclosed code fence'

/** How many characters of a verdict as written a line shows. */
export const VERDICT_SHOWN_LENGTH = 60

/** The extension of a review file a design's folder holds, and of its copy in the lot folder. */
export const REVIEW_EXTENSION = '.md'

/** Where a lot's design stands; `approved`, `waived` and `not-required` let the lot go on. */
export const DESIGN_STATES = [
	'approved',
	'waived',
	'unapproved',
	'stale',
	'missing',
	'not-required',
] as const

/** The states that let a lot go on. */
export const DESIGN_PASSING_STATES: readonly string[] = ['approved', 'waived', 'not-required']

/** The plan entry kind that needs a design by its kind alone. */
export const DESIGN_ENTRY_KIND = 'lot'

/** The kinds of a plan entry whose spec may stand in for its lot's design, and that count as sharing it. */
export const DESIGN_SPEC_ENTRY_KINDS: readonly string[] = ['lot', 'fix']

/** How many characters of a hash a line shows. */
export const DESIGN_SHOWN_HASH_LENGTH = 12

/** Each state as a line says it, after `design `. */
export const DESIGN_STATE_WORDS = {
	approved: 'approved',
	waived: 'waived',
	unapproved: 'not approved',
	stale: 'stale since its approval',
	missing: 'missing',
	'not-required': 'not required',
} as const

/** A reason as a line names it: a shared one by its glob. */
export const DESIGN_REASON_WORDS = {
	shared: 'shared {glob}',
	entry: 'plan entry of kind lot',
} as const

/** Between two reasons of a line. */
export const DESIGN_REASON_SEPARATOR = ', '

/** The status line of a design: `{state}` its words and who gave its go-ahead, `{reasons}` ` · <reasons>` or nothing. */
export const DESIGN_STATUS_LINE = 'design {state}{reasons}'

/** The part of a status line naming who approved or waived, by kind. */
export const DESIGN_BY_PART = ' by {kind}'

/** The part of a status line naming the need's reasons. */
export const DESIGN_REASONS_PART = ' · {reasons}'

/** What to run next, by state (`{lot}` the lot's name, `{file}` the recorded file); none for a state that lets it go on. */
export const DESIGN_NEXT = {
	missing:
		'dialecte lot design {lot} --from <DESIGN.md>, then approve it from the main checkout: dialecte lot design {lot} --approve --by <who>',
	unapproved:
		'from the main checkout: dialecte lot design {lot} --approve --by <who> [--reason <text>]',
	stale:
		'the design changed since its approval: dialecte lot design {lot} --from {file}, then approve it again',
} as const

/** Before an unapproved state's next command, when the need rose since the last approval: `{reasons}` the new ones. */
export const DESIGN_ROSE_PART = 'the need rose ({reasons}) since its approval: '

/** The prefix of a next line. */
export const DESIGN_NEXT_PREFIX = 'next: '

/** The need as `lot start` says it: `{reasons}` the need's reasons. */
export const DESIGN_NEED_LINES = {
	required: 'design required ({reasons}): write it, then dialecte lot design <id> --from <file>',
	notRequired: 'design not required',
} as const

/** Each verb the design gate holds: its name in the refusal and what it leaves undone. */
export const DESIGN_GATE_VERBS = {
	tddRed: { name: 'tdd red', nothing: 'nothing run' },
	commit: { name: 'commit', nothing: 'nothing committed' },
	land: { name: 'lot land', nothing: 'nothing pushed' },
	handoverWrite: { name: 'handover write', nothing: 'nothing written' },
	approve: { name: 'lot approve', nothing: 'nothing recorded' },
	card: { name: 'handover run', nothing: 'nothing committed' },
} as const

/**
 * The gate's refusal: `{verb}` the verb, `{lot}` the lot, `{state}` the state, its go-ahead and its reasons, `{next}`
 * what to run, `{nothing}` what was left undone.
 */
export const DESIGN_GATE_REFUSAL = '{verb}: lot {lot} design {state}: {next}; {nothing}'

/** The gate's refusal of a lot that has no worktree (a simulated one): every refusing path reads its base there. */
export const DESIGN_GATE_WORKTREE_NONE =
	'{verb}: lot {lot} has no worktree: the design gate reads its base there; {nothing}'

/** The gate's refusal of a lot whose worktree is gone: every refusing path reads its base there. */
export const DESIGN_GATE_NO_WORKTREE =
	'{verb}: lot {lot} has no worktree at {root}: the design gate reads its base there; {nothing}'

/** The note of a lot read at the base recorded at its start, its worktree gone: `{commit}` that base. */
export const RECORDED_BASE_NOTE =
	'! the worktree is gone: the shared areas are read at the base recorded at the start, {commit}'

/** A reason `lot approve` names: `{state}` the design's state, its go-ahead and its reasons. */
export const DESIGN_APPROVE_REASON = 'design {state}'
