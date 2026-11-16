/** Each verb of `standard`: the options that take a value and the flags it knows. */
export const STANDARD_VERB_OPTIONS = {
	index: { valueOptions: ['standard', 'package'], flags: ['rebuild', 'json'] },
	find: { valueOptions: ['standard', 'package', 'about', 'limit'], flags: ['json'] },
	show: { valueOptions: [], flags: ['json'] },
	eval: {
		valueOptions: ['standard', 'package', 'effort', 'reports'],
		flags: ['angles', 'packs', 'json'],
	},
} as const

/** The command's name, the start of every usage error (`standard <verb>: ...`). */
export const STANDARD_COMMAND = 'standard'

/** The answers of the command; `{...}` are filled in. */
export const STANDARD_MESSAGES = {
	unknownVerb: 'expected a verb: index | find | show | eval',
	unexpectedWords: 'unexpected {words}',
	needsTerms: 'expected the terms to look for',
	badLimit: '--limit needs a positive whole number, not {value}',
	aboutNeedsDialecte: '--about needs an installed dialecte: none is installed in {cwd}',
	unknownTag: 'no installed dialecte declares the tag {tag}{closest}',
	packageNeedsDialecte: '--package needs an installed dialecte: none is installed in {cwd}',
	unknownPackage: 'no installed dialecte is named {name}{closest} - installed: {installed}',
	closest: ' - closest: {names}',
	nothingMatched: 'nothing matched "{query}"',
	noIndexableFile: 'no indexable file',
	showExpected: 'expected <file id>:<from>-<to>, not {argument}',
	unknownFile: 'no file {id} in the standard {standard} - known: {known}',
	fromAfterTo: 'the range {argument} starts after its end',
	beyondLastLine: '{id} has {lines} lines: the range {argument} ends after its last line',
	nothingToShow: '{argument} holds only blank or dropped lines',
	evalExpected: 'expected <gold.jsonl>',
	unknownEffort: '--effort {effort} is no effort: pass one of {efforts}',
	effortNeedsPacks: '--effort applies to --packs only: add --packs, or leave --effort out',
} as const

/** The schema of `eval --json`. */
export const EVAL_JSON_SCHEMA = 1

/** The first words of the `packs` and `reports` lines of `eval`, and what the rate of nothing judged prints. */
export const PACKS_LINE_PREFIX = 'packs'
export const REPORTS_LINE_PREFIX = 'reports'
export const NO_RATE_TEXT = '-'

/** The place of a column's value in its label. */
export const COLUMN_VALUE_PLACEHOLDER = '{value}'

/** The labelled columns of the `packs` line (I-13): `{value}` is the recall, at RECALL_DECIMALS. */
export const PACKS_LINE_COLUMNS = {
	readerAAt5: 'reader A recall@5 {value}',
	readerAAt10: 'recall@10 {value}',
	unionAt5: 'union recall@5 {value}',
	unionAt10: 'recall@10 {value}',
} as const

/** The labelled columns of the `reports` line (I-13): `{value}` is the count, or the rate. */
export const REPORTS_LINE_COLUMNS = {
	agreed: 'agreed {value}',
	wrong: 'wrong {value}',
	unjudged: 'unjudged {value}',
	rate: 'rate {value}',
} as const

/** A `show` argument: `<file id>:<from>-<to>`, the file id holding its standard. */
export const RANGE_ARGUMENT_PATTERN = /^([^/:]+\/[^:]+):(\d+)-(\d+)$/u

/** A `--limit` value: a positive whole number. */
export const LIMIT_PATTERN = /^[1-9]\d*$/u

/** The line of `eval --angles` naming how many items only the slices the angles added hold (D27). */
export const ADDED_LINE_PREFIX = 'added +'

/** How a slice's logical lines are joined before a gold quote is looked for in them (as `evaluateGold` does). */
export const QUOTE_LINE_SEPARATOR = ' '

/** The find a miss of `eval` is placed with: its rank in a wider answer. */
export const WIDE_FIND_LIMIT = 50

/** How many closest names an unknown `--about` tag or `--package` name gets. */
export const CLOSEST_NAME_LIMIT = 5

/** How many repeated-line candidates `index` lists per file, and where it cuts their text. */
export const REPEATED_LINES_SHOWN = 10
export const REPEATED_TEXT_CUT = 60

/** How many hex characters of the manifest hash the `index` line prints. */
export const SHORT_MANIFEST_LENGTH = 12

/** The decimals of a recall and of a noise ratio. */
export const RECALL_DECIMALS = 2
export const NOISE_RATIO_DECIMALS = 4
export const NOISE_PERCENT_DECIMALS = 1

/**
 * The first line of the text answer of `index`, `find` and `eval`: the dialectes whose definition is the
 * vocabulary, as `name@version` joined by the separator, or none.
 */
export const VOCABULARY_LINE = {
	prefix: 'vocabulary ',
	separator: ', ',
	none: 'vocabulary none (no dialecte installed)',
} as const

/** The separator of the columns of a text answer. */
export const COLUMN_SEPARATOR = '  '

/** The state of a standard folder with no `.md` file, in `index --json`. */
export const SKIPPED_STATE = 'skipped' as const
