import type { FactEffort, HistoryEvent } from '../facts/facts.types.ts'
import type {
	AskKind,
	AskState,
	KindShape,
	KindSlotNeed,
	OutsideSource,
	ReaderLetter,
	RerunAnswer,
	ReportVerdict,
	SliceQuality,
	SlotPlaceholder,
} from './ask.types.ts'

/** An ordinary word: lowercase letters only, this many characters or more. */
export const ORDINARY_WORD_PATTERN = /^[a-z]{3,}$/u

/** A word shorter than this is ordinary unless it is an acronym. */
export const SHORT_WORD_LENGTH = 3

/** An acronym: two capitals or more. */
export const ACRONYM_PATTERN = /^[A-Z]{2,}$/u

/**
 * A token of a question: letters, digits and the characters kept inside a word (`@`, `=`, `_`, `/`, `:`, `-`);
 * every other character splits.
 */
export const TOKEN_PATTERN = /[\p{L}\p{N}_@=/:-]+/gu

/** The characters kept inside a word only: stripped from both ends of a token. */
export const TOKEN_EDGE_PATTERN = /^[/:-]+|[/:-]+$/gu

/** A quoted value after `=` (`attr="value"`, `attr='value'`): the quotes are dropped before the split. */
export const QUOTED_VALUE_PATTERN = /=(["'])([^"']*)\1/gu
export const QUOTED_VALUE_REPLACEMENT = '=$2'

/** How many words after its attribute an enumeration value is still a subject. */
export const VALUE_WINDOW = 3

/** The `--about` value: `[<Parent>/]<Tag>[@<attr>]`, or `@<attr>` alone. */
export const ABOUT_PATTERN = /^(?:(?<parent>[^/@]+)\/)?(?<tag>[^/@]+)?(?:@(?<attribute>[^/@]+))?$/u

/**
 * The kind table: each kind's shapes, matched case-insensitively on the fixed words and anchored at both ends
 * (trailing `?` and spaces allowed). `<T>` a tag, optionally `under <P>` / `in <P>`; `<A>` an attribute (`<T>@<a>`
 * or `<a> on <T>`); `<C>` a code; `<rest>` free words. `may` also matches `can`. The first shape that fits wins.
 */
export const KIND_SHAPES: readonly KindShape[] = [
	{ kind: 'children', shape: 'children of <T>' },
	{ kind: 'children', shape: 'what may <T> hold' },
	{ kind: 'children', shape: 'which children may <T> hold' },
	{ kind: 'parents', shape: 'parents of <T>' },
	{ kind: 'parents', shape: 'where may <T> appear' },
	{ kind: 'parents', shape: 'which elements may hold <T>' },
	{ kind: 'required', shape: 'required attributes of <T>' },
	{ kind: 'required', shape: 'is <A> required' },
	{ kind: 'required', shape: 'is <A> required on <T>' },
	{ kind: 'values', shape: 'values of <A>' },
	{ kind: 'values', shape: 'what values may <A> take' },
	{ kind: 'default', shape: 'default of <A>' },
	{ kind: 'default', shape: 'what is the default of <A>' },
	{ kind: 'fixed', shape: 'fixed value of <A>' },
	{ kind: 'type', shape: 'type of <T>' },
	{ kind: 'type', shape: 'type of <A>' },
	{ kind: 'variants', shape: 'variants of <T>' },
	{ kind: 'variants', shape: 'xsi:type variants of <T>' },
	{ kind: 'documentation', shape: 'documentation of <T>' },
	{ kind: 'code', shape: '<C>' },
	{ kind: 'code', shape: 'what does <C> mean' },
	{ kind: 'code', shape: 'explain <C>' },
	{ kind: 'method', shape: 'which method <rest>' },
	{ kind: 'method', shape: 'which function <rest>' },
]

/** The kind no shape fits. */
export const SEMANTIC_KIND: AskKind = 'semantic'

/** The fixed word that also matches its alternative. */
export const MAY_WORD = 'may'
export const MAY_PATTERN = '(?:may|can)'

/** A name in a slot: no space, no `?`, no `@`; a code: no space, no `?`; free words: anything. */
const SLOT_NAME = '[^\\s?@]+'
const SLOT_CODE = '[^\\s?]+'
const SLOT_REST = '.+?'

/**
 * Each placeholder's pattern; `#` is replaced by the placeholder's number so a shape holding two keeps its groups
 * apart (a group's slot is its name without the number).
 */
export const SLOT_PLACEHOLDER_PATTERNS: Readonly<Record<SlotPlaceholder, string>> = {
	'<T>': `(?<tag#>${SLOT_NAME})(?:\\s+(?:under|in)\\s+(?<parent#>${SLOT_NAME}))?`,
	'<A>': `(?:(?<tag#a>${SLOT_NAME})@(?<attribute#a>${SLOT_NAME})|@?(?<attribute#b>${SLOT_NAME})(?:\\s+on\\s+(?<tag#b>${SLOT_NAME}))?)`,
	'<C>': `(?<code#>${SLOT_CODE})`,
	'<rest>': `(?<rest#>${SLOT_REST})`,
}

/** The number mark in a placeholder pattern, and what a group name holds after its slot. */
export const PLACEHOLDER_NUMBER_MARK = /#/gu
export const GROUP_SLOT_PATTERN = /^(?<slot>[a-z]+)/u

/** What a shape may end with, and how its words are separated. */
export const SHAPE_START = '^\\s*'
export const SHAPE_END = '\\s*\\?*\\s*$'
export const SHAPE_WORD_SEPARATOR = '\\s+'
export const SHAPE_FLAGS = 'iu'

/** The characters a fixed word escapes in a shape pattern. */
export const REGEX_SPECIAL_PATTERN = /[.*+?^${}()|[\]\\]/gu
export const REGEX_SPECIAL_REPLACEMENT = '\\$&'

/** What a question's free words drop at their end (`which method <rest>` forced without a shape). */
export const QUESTION_END_PATTERN = /\s*\?*\s*$/u

/** What each kind needs from the subject when `--kind` forces it. */
export const KIND_SLOT_NEEDS: Readonly<Record<AskKind, KindSlotNeed>> = {
	children: 'tag',
	parents: 'tag',
	variants: 'tag',
	documentation: 'tag',
	required: 'tagOrAttribute',
	type: 'tagOrAttribute',
	values: 'attribute',
	default: 'attribute',
	fixed: 'attribute',
	code: 'code',
	method: 'rest',
	semantic: 'nothing',
}

/** The kinds rung 1 reads from the definition. */
export const STRUCTURAL_KINDS: readonly AskKind[] = [
	'children',
	'parents',
	'required',
	'values',
	'default',
	'fixed',
	'type',
	'variants',
	'documentation',
]

/** How many names a refusal suggests. */
export const ASK_SUGGESTION_LIMIT = 5

/** How a list of names is joined in an answer's value and a message. */
export const NAME_SEPARATOR = ', '

/** Refusals: what failed, where, and the fix; `{...}` are filled in. */
export const ASK_REFUSALS = {
	kindNeedsTag:
		'--kind {kind} needs a tag: the question names none: name it with --about <Tag> (or --about <Parent>/<Tag>)',
	kindNeedsAttribute:
		'--kind {kind} needs an attribute: the question names none: name it with --about <Tag>@<attribute> (or --about @<attribute>)',
	kindNeedsTagOrAttribute:
		'--kind {kind} needs a tag or an attribute: the question names neither: name one with --about <Tag> or --about <Tag>@<attribute>',
	kindNeedsCode: '--kind {kind} needs a code: the question names none: name it with --code <code>',
	unknownTag:
		'no element "{tag}" in {packages}{closest}: name a tag the dialecte declares with --about <Tag>',
	unknownAttribute:
		'no attribute "{attribute}" in {packages}{closest}: name an attribute the dialecte declares with --about <Tag>@<attribute>',
	parentNotAdmitted:
		'no {tag} under {parent} in {package} - its parents: {parents}: name one of them with --about <Parent>/{tag}',
	severalDialectes:
		'{tags} is declared by several installed dialectes: {packages}: choose one with --package <name>',
	noCommonDialecte:
		'no installed dialecte declares all of {tags} ({holders}): ask about the tags of one dialecte, or choose it with --package <name>',
	packageNotHolding:
		'--package {package} does not declare {tags}; the dialectes declaring it: {packages}: pass one of them to --package',
	packageNotInstalled:
		'--package {package} is not an installed dialecte; installed: {packages}: pass one of them to --package',
	noDialecteInstalled:
		'no dialecte package is installed here (only core), so {named} cannot be read: install the dialecte package that declares it, or ask again without naming it',
	attributeNotOnElement:
		'{subject} has no attribute "{attribute}" - its attributes: {attributes}: name one of them with --about {tag}@<attribute>',
} as const

/** What a question names that only a dialecte can read, as the `noDialecteInstalled` refusal names it. */
export const NAMED_WITHOUT_DIALECTE = {
	tag: 'the element "{name}"',
	attribute: 'the attribute "{name}"',
	package: '--package {name}',
} as const

/** A tag with the dialectes declaring it, and how such entries are joined. */
export const HOLDERS_TEMPLATE = '{tag}: {packages}'
export const HOLDERS_SEPARATOR = '; '

/** The ` - closest: ...` part of a refusal, when a name is close. */
export const CLOSEST_TEMPLATE = ' - closest: {names}'

/** How an element is named in an answer: alone, or under the parent that decided its declaration. */
export const ELEMENT_UNDER_TEMPLATE = '{tag} under {parent}'

/** The one sentence of a rung-1 answer, per kind; the `none` sentence when the list or value is empty. */
export const RUNG_ONE_SENTENCES = {
	children: '{subject} may hold {value}.',
	childrenWithAny: '{subject} may hold {value}, and elements of other namespaces.',
	childrenNone: '{subject} holds no child element.',
	childrenOnlyAny: '{subject} holds elements of other namespaces only.',
	parents: '{subject} may appear under {value}.',
	parentsNone: '{subject} is the root: no element holds it.',
	requiredList: 'The required attributes of {subject}: {value}.',
	requiredListNone: '{subject} requires no attribute.',
	requiredYes: '{attribute} is required on {subject}.',
	requiredNo: '{attribute} is optional on {subject}.',
	values: '{attribute} on {subject} admits {value}.',
	valuesNone: '{attribute} on {subject} admits no enumerated value.',
	default: '{attribute} on {subject} defaults to "{value}".',
	defaultNone: '{attribute} on {subject} has no default.',
	fixed: '{attribute} on {subject} is fixed to "{value}".',
	fixedNone: '{attribute} on {subject} has no fixed value.',
	typeOfElement: '{subject} has the type {value}.',
	typeOfElementNone: '{subject} has an anonymous type.',
	typeOfAttribute: '{attribute} on {subject} has the type {value}.',
	typeOfAttributeNone: '{attribute} on {subject} has no declared type (any string).',
	variants: '{subject} admits the xsi:type variants {value}.',
	variantsNone: '{subject} admits no xsi:type variant.',
	documentation: 'The documentation of {subject}: {value}',
	documentationNone: '{subject} has no documentation.',
} as const

/** The verdicts of a rung-1 answer. */
export const VERDICT_VALUE = 'value'

/** The suffix of a sentence's form for an empty list or no value. */
export const NONE_SUFFIX = 'None'
export const VERDICT_YES = 'yes'
export const VERDICT_NO = 'no'

/** The kind of a source read from a dialecte's catalogues or api indexes (rung 2). */
export const DIALECTE_SOURCE_KIND = 'dialecte'

/** The fact source of a rung-1 answer and of a rung-2 answer. */
export const RUNG_ONE_FACT_SOURCE = 'schema'
export const RUNG_TWO_FACT_SOURCE = 'dialecte'

/** How many method paths rung 2 lists when no method answers. */
export const METHOD_LIMIT = 5

/** The one sentence of a rung-2 method answer. */
export const METHOD_ANSWER_TEMPLATE = 'Use {path}.'

/** The prefixes of the ids of the angles (`a1`) and of the slices (`s1`). */
export const ANGLE_ID_PREFIX = 'a'
export const SLICE_ID_PREFIX = 's'

/** How many direct angle slices the merge adds after find's own list for the whole question (D27). */
export const ANGLE_ADDITIONS_LIMIT = 3

/** How the terms of an angle are joined into the query of its `find`. */
export const ANGLE_QUERY_SEPARATOR = ' '

/** The namespace part of a type name: a Clark `{uri}` or a `prefix:`, dropped to keep its local part. */
export const TYPE_NAMESPACE_PATTERN = /^(?:\{[^}]*\}|[^:{}]*:)/u

/**
 * A name met word-bounded in a text (`{name}` the name escaped): no letter, digit or underscore right before or
 * after it; the flags of a case-kept and of a case-insensitive match.
 */
export const BOUNDED_NAME_TEMPLATE = '(?<![\\p{L}\\p{N}_]){name}(?![\\p{L}\\p{N}_])'
export const BOUNDED_NAME_FLAGS = 'u'
export const BOUNDED_NAME_INSENSITIVE_FLAGS = 'iu'

/** How a definition's text lines are joined before a subject word is looked for in them. */
export const DEFINITION_TEXT_SEPARATOR = ' '

/** Why a fact of the key did not answer, when the read gave no reason of its own; `{...}` are filled in. */
export const CANDIDATE_REASONS = {
	lowerEffort:
		'{fact} was answered at {effort} effort, below the {asked} effort asked: the ladder answers again at {asked}',
	unchecked:
		'{fact} is an unchecked answer no document confirmed: the ladder answers again from the definition, the catalogues or the documents',
	stale:
		'{fact} is stale: a document it rests on moved since it was recorded: the ladder answers again',
	staleBecause: '{fact} is stale: {reason}: the ladder answers again',
	unverifiable: '{fact} cannot be checked against its documents now: the ladder answers again',
	forgotten: '{fact} was forgotten: the ladder answers again',
	definitionBoundary:
		'{fact} is the definition read as a fact: on a --decision ask the definition is the boundary of what is valid, never the answer: the prose answers inside it',
} as const

/** The kind of conflict a `--decision` ask flags when prose names what the definition rejects (D29). */
export const STANDARD_VS_XSD = 'standard-vs-xsd'

/**
 * The kinds whose boundary is a list (`required` of an element: its required attributes): prose naming an item
 * outside it is restricted to it (D29). A yes/no boundary (`required` of an attribute) is held by its verdict.
 */
export const BOUNDARY_LIST_KINDS: readonly AskKind[] = [
	'children',
	'parents',
	'variants',
	'values',
	'required',
]

/** The kinds whose boundary is one value: prose with another value takes the definition's (D29). */
export const BOUNDARY_VALUE_KINDS: readonly AskKind[] = ['default', 'fixed', 'type']

/** How the items of a list answer are split: on commas, with the spaces around them. */
export const LIST_ITEM_PATTERN = /\s*,\s*/u

/** How a prose answer holding no value is named among the items outside the boundary. */
export const NO_VALUE_ITEM = 'no value'

/** Why a fact the ladder re-ran is stale (D9); `{...}` are filled in. */
export const RECHECK_REASONS = {
	schemaChanged:
		'the definition of {package} changed and rung 1 now answers {now} where {fact} answered {was}: ask again to record the new answer',
	schemaUnanswered:
		'the definition of {package} changed and rung 1 no longer answers the question of {fact}: ask again, the documents answer it',
	dialecteChanged:
		'the catalogues or api indexes of {package} changed and rung 2 now answers {now} where {fact} answered {was}: ask again to record the new answer',
	dialecteUnanswered:
		'the catalogues or api indexes of {package} changed and rung 2 no longer answers the question of {fact}: ask again, the documents answer it',
} as const

/** A fact's rung asked again and answering nothing (D9). */
export const UNANSWERED_RERUN: RerunAnswer = { unanswered: true }

/** How an answer's value is named in a reason: quoted, or `nothing` when it holds none. */
export const ANSWER_VALUE_TEMPLATE = '"{value}"'
export const NO_ANSWER_VALUE = 'nothing'

/** The families of an angle, in the order the angles list them (D11). */
export const ANGLE_FAMILIES = [
	'subject',
	'type',
	'documentation',
	'parents',
	'children',
	'attributes',
	'variants',
	'values',
	'methods',
	'code',
	'definitions',
	'clauses',
	'tables',
	'question',
] as const

/** What a standard key keeps of a name once NFKC-folded and lowercased (D13): every other character is dropped. */
export const STANDARD_KEY_DROPPED_PATTERN = /[^a-z0-9]/gu
export const STANDARD_KEY_FORM = 'NFKC'

/** The lines and refusals of the standard selection (D13); `{...}` are filled in. */
export const STANDARD_SELECTION_MESSAGES = {
	noFolder: 'no folder for "{name}" ({key}); folders: {ids}',
	sameKey:
		'two standard folders of {root} have the key {key} of the standard "{name}": {ids}: keep one folder per standard under DIALECTE_STANDARD (rename or move the others)',
} as const

/** The refusal of `--no-standard` while the dialecte's documents are readable (D14, rev 10); `{folders}` filled in. */
export const NO_STANDARD_WITH_DOCUMENTS =
	'--no-standard refused: the documents {folders} under DIALECTE_STANDARD are readable for this dialecte, and outside readers run only when the documents cannot answer: ask again without --no-standard'

/** The reason of the `rechecked` line a re-ask writes once documents exist (D15). */
export const REASK_REASON = 'documents'

/** The history event a re-ask writes. */
export const REASK_EVENT = 'rechecked'

/** The start of the reason of a stale candidate, whatever made it stale (`{fact}` filled in). */
export const STALE_CANDIDATE_START = '{fact} is stale'

/** An ask's id: `A-` and its number on four digits or more; the pattern reads the number back. */
export const ASK_ID_PREFIX = 'A-'
export const ASK_ID_DIGITS = 4
export const ASK_ID_PATTERN = /^A-(\d{4,})$/u

/** The record of an ask in its folder: the `--json` object. */
export const ASK_RECORD_FILE = 'ask.json'

/** The request an ask was made with, beside its record: what `ask pack` rebuilds the ask's reading from (D2). */
export const REQUEST_RECORD_FILE = 'request.json'

/** The rounds of readers of an ask (D6): `rounds/round-<r>/` holding `pack.json`, the briefs and `verdict.json`. */
export const ROUNDS_FOLDER = 'rounds'
export const ROUND_FOLDER_PREFIX = 'round-'
export const ROUND_FOLDER_PATTERN = /^round-([1-9]\d*)$/u
export const PACK_RECORD_FILE = 'pack.json'
export const VERDICT_RECORD_FILE = 'verdict.json'

/** The record of a round a pack skipped for nothing left to give (J-15): `rounds/round-<r>/skipped.json`. */
export const SKIPPED_RECORD_FILE = 'skipped.json'

/** The rung of the readers of the documents or outside (section 8): a skipped round's state event names it (J-13). */
export const READERS_RUNG = 4

/** The files of a reader's brief in its round folder; `{letter}` is filled in. */
export const READER_BRIEF_FILES = {
	markdown: 'reader-{letter}.md',
	json: 'reader-{letter}.json',
} as const

/** The refusal of an ask's record that does not read; `{path}` is filled in. */
export const ASK_RECORD_REFUSALS = {
	damaged:
		'{path} does not read as a record of schema 1: put back the file this cli wrote, or ask the question again',
} as const

/** Why the pack cannot rebuild what the ask read; `{...}` are filled in. */
export const POOL_REFUSALS = {
	fileChanged:
		'file-changed: {file} is not as the ask read it ({how}): its cites could not be checked; ask again: dialecte ask "{question}"',
	moved: 'its sha256 moved',
	missing: 'it is no longer in the documents',
	added: 'it was added since',
	unknownPackage:
		'the package {name} the ask read is not installed here (installed: {installed}): run the pack where the ask ran, or ask again',
} as const

/** How many slices the pack's wider search asks of each find (D3): the ask's list first, then these. */
export const PACK_SEARCH_LIMIT = 50

/** Where the asks outside a lot live, below the state folder. */
export const STATE_ASKS_SEGMENTS: readonly string[] = ['dialecte', 'asks']

/** The refusals of the ask folder (D16); `{...}` are filled in. */
export const ASK_FOLDER_REFUSALS = {
	stateInWorkTree:
		'{path} (the asks outside a lot, below the state home: an absolute XDG_STATE_HOME, else ~/.local/state) is inside the git work tree {top}: set XDG_STATE_HOME to an absolute folder outside every repository',
} as const

/** The kind and the effort of every question of the gold run (D21). */
export const GOLD_RUN_KIND: AskKind = 'semantic'
export const GOLD_RUN_EFFORT: FactEffort = 'medium'

/**
 * A gold answer that starts with the word `yes` or `no` (`No.` and `no, it may not` do; `None of` and `nobody` do
 * not): the verdict the readers should have agreed on (D26 b).
 */
export const GOLD_POLARITY_ANSWER_PATTERN = /^(yes|no)(?![\p{L}\p{N}_])/iu

/** The refusals of the agreed-wrong measure; `{...}` are filled in. */
export const REPORT_MEASURE_REFUSALS = {
	noFolder:
		'no asks folder at {path}: pass the folder that holds the ask folders (each with its request.json and rounds/)',
} as const

/** The limit of the ask's list in the gold packs run (the default of an ask, D25). */
export const GOLD_PACK_LIMIT = 10

/** The refusals of the setup an ask reads; `{...}` are filled in. */
export const SETUP_REFUSALS = {
	noPackage:
		'no package.json in {cwd}: run ask in a package that has a dialecte installed (or in a dialecte repository)',
	apiIndexes: 'cannot read the api indexes from {cwd}: {reason}',
} as const

/** The hash of the catalogues and of an api index (D10): this digest of their stable JSON, in hex. */
export const SETUP_HASH_ALGORITHM = 'sha256'
export const SETUP_HASH_ENCODING = 'hex'

/** How the lines of a `--lot` resolution's refusal are joined into one refusal. */
export const REFUSAL_LINE_SEPARATOR = ' - '

/** The lot note (D18): its start, how the asks are joined, how one ask is named. */
export const NOTE_START = 'asks '
export const NOTE_SEPARATOR = ' · '
export const NOTE_PART_SEPARATOR = ' '

/** The state of an ask the note names with its fact. */
export const ANSWERED_STATE = 'answered'

/** The kinds of an ask's events (D17). */
export const ASK_EVENT_KINDS = {
	parsed: 'ask.parsed',
	rung: 'ask.rung',
	fact: 'ask.fact',
	state: 'ask.state',
	pack: 'ask.pack',
	answer: 'ask.answer',
	verdict: 'ask.verdict',
} as const

/** The outcome of a rung the ladder went past. */
export const RUNG_PASSED = 'passed'

/** The line printed on standard error when an event cannot be written; the ask goes on, its exit code kept. */
export const EVENT_WRITE_FAILURE =
	'ask: the event was not written to {file} ({reason}): the ask goes on; make {file} a writable file to keep the events'

/** Line breaks in a reason printed on one line. */
export const LINE_BREAKS_PATTERN = /\s*[\r\n]+\s*/gu
export const LINE_BREAK_REPLACEMENT = ' '

/** A cite holds at most this many non-noise lines; a quote is this many words at least and at most. */
export const CITE_MAX_COUNTED_LINES = 40
export const QUOTE_MIN_WORDS = 8
export const QUOTE_MAX_WORDS = 40

/** The kinds of logical line a quote may equal whole, whatever its length. */
export const WHOLE_LINE_KINDS: readonly string[] = ['table', 'code']

/** How the words of a folded text are split and joined, and the characters that make a word. */
export const WORD_SEPARATOR = ' '

/** One character of a word, as a quote's boundary reads it (R1-1): a letter, a digit or `_`. */
export const WORD_CHARACTER_PATTERN = /^[\p{L}\p{N}_]$/u

/** A hyphen between two letters inside a word (`non-empty`): folded away so a compound matches however split (D27). */
export const IN_WORD_HYPHEN_PATTERN = /(?<=\p{L})-(?=\p{L})/gu
export const REPORT_WORD_PATTERN = /[\p{L}\p{N}_]+/gu
export const WHITESPACE_PATTERN = /\s+/gu

/** The verdicts a report may hold, and the sources an outside report may name. */
export const REPORT_VERDICTS: readonly ReportVerdict[] = [
	'yes',
	'no',
	'depends',
	'value',
	'not-in-text',
]
export const OUTSIDE_SOURCES: readonly OutsideSource[] = ['model', 'web']
export const NOT_KNOWN_VERDICT = 'not-known'
export const OUTSIDE_VERDICTS: readonly (ReportVerdict | typeof NOT_KNOWN_VERDICT)[] = [
	...REPORT_VERDICTS,
	NOT_KNOWN_VERDICT,
]

/** Cardinality and normative words that are key terms wherever they stand (case-insensitive, word-bounded). */
export const KEY_TERM_WORDS_PATTERN =
	/(?<![\p{L}\p{N}_])(?:unbounded|optional|mandatory|shall|should|may)(?![\p{L}\p{N}_])/giu

/** A number, or a range of numbers (`0..1`), standing alone. */
export const KEY_TERM_NUMBER_PATTERN = /(?<![\p{L}\p{N}_.])\d+(?:\.\.\d+)?(?![\p{L}\p{N}_])/gu

/** A double-quoted passage: its words are key terms. */
export const QUOTED_PASSAGE_PATTERN = /"([^"]*)"/gu

/** The flags of a name pattern scanned for every match. */
export const NAME_SCAN_FLAGS = 'gu'

/** The marks that make an ordinary-word name a key term: `@name` and `name=`. */
export const ATTRIBUTE_MARK = '@'
export const ASSIGNMENT_MARK = '='

/** A key term holding an upper-case letter is looked for with its case kept, else without regard to case. */
export const UPPER_CASE_PATTERN = /\p{Lu}/u

/** How many words from the subject a negation or exception cue still counts. */
export const POLARITY_WINDOW = 8

/** Negation cues as words, longest first (`shall not` is one cue, never `shall` and `not`). */
export const NEGATION_CUES: readonly (readonly string[])[] = [
	['shall', 'not'],
	['must', 'not'],
	['may', 'not'],
	['should', 'not'],
	['cannot'],
	['not'],
	['no'],
	['never'],
	['prohibited'],
	['forbidden'],
]

/** Exception cues as words, longest first: never cancelled by a negation. */
export const EXCEPTION_CUES: readonly (readonly string[])[] = [
	['with', 'the', 'exception', 'of'],
	['apart', 'from'],
	['other', 'than'],
	['except'],
	['unless'],
	['only'],
]

/** The verdicts whose claims are compared with the question's wording, and the verdict a depends report holds. */
export const POLARITY_VERDICTS: readonly string[] = ['yes', 'no']
export const DEPENDS_VERDICT = 'depends'

/** Words that make an outside answer hedged: counted not known. */
export const HEDGE_PATTERN =
	/(?<![\p{L}\p{N}_])(?:probably|likely|perhaps|maybe|possibly|might|seems|i believe|i think|as far as i know)(?![\p{L}\p{N}_])/iu

/** What a fault of a report reads like; `{path}` is where, `{problem}` what failed and `{fix}` what to do. */
export const REPORT_FAULT_TEMPLATE = '{path}: {problem}; {fix}'
export const REPORT_FAULTS = {
	notObject: {
		problem: 'the report is not a JSON object',
		fix: 'write one object holding the fields of the brief',
	},
	missing: { problem: 'missing', fix: 'give it as the brief shows' },
	notString: { problem: 'not a string', fix: 'write it as text' },
	notText: { problem: 'not a non-empty string', fix: 'write it as text, never empty' },
	notNullableString: {
		problem: 'neither a string nor null',
		fix: 'write text, or null when there is none',
	},
	notInteger: { problem: 'not a whole number', fix: 'write the number the brief gives' },
	notList: { problem: 'not a list', fix: 'write a list (empty when there is nothing)' },
	notObjectItem: { problem: 'not an object', fix: 'write one object per item' },
	notWord: { problem: 'not one of the allowed words', fix: 'write one of: {allowed}' },
	sourceInDocumentReport: {
		problem: 'only an outside report carries a source',
		fix: 'drop it, or report through ask pack --outside',
	},
	notKnownInDocumentReport: {
		problem: 'not-known is for an outside report',
		fix: 'answer not-in-text when the documents do not say',
	},
} as const

/** The path of a field, of an item of a list, and of a field of an item. */
export const REPORT_PATH_ROOT = 'report'
export const REPORT_PATH_ITEM = '{path}[{index}]'
export const REPORT_PATH_FIELD = '{path}.{field}'

/** The optional field of a report naming the tier of the model its reader ran on (R1-19). */
export const REPORT_TIER_FIELD = 'tier'

/** Why a report is refused, as the fault the cli prints: what failed, where, the fix; `{...}` are filled in. */
export const REPORT_REFUSAL_FAULTS = {
	wrongAsk:
		'report.ask: names {found}, this is {expected}; check the report belongs to {expected} and write its id',
	wrongRound:
		'report.round: is {found}, the open round is {expected}; run ask pack {ask} again and answer the brief of round {expected}',
	nonce:
		"report.nonce: not issued to reader {reader} for this round, or already used; copy the nonce of that reader's brief",
	sameSession:
		'report.session: the session already gave an accepted report; send the brief to another agent session',
	sessionMissing: 'report.session: missing; an outside reader writes the id of its own session',
	duplicate:
		"report: the body equals an accepted report's; each reader reports its own reading, in its own words",
	noVerifiedClaim:
		'report.claims: no claim survived the checks for the verdict {verdict}; cite 8 to 40 words of a slice of the brief, naming the subject',
	documentCiteOutside:
		'report.claims[{index}].cites[{cite}]: a file cite in an outside report; cite a web page with url, quote and retrieved, or leave cites empty',
	webNotAllowed:
		'report.source: web, but this pack was made without --web; report source model, or make the pack with --web',
	urlInModelReport:
		'report.claims[{index}].cites[{cite}]: a url in a model report; set source to web, or drop the cite',
	quoteLength: 'report.claims[{index}].cites[{cite}].quote: {words} words; quote 8 to 40 words',
	claimRefused:
		'report.claims[{index}]: refused {reason}; fix the claim so it names a key term, the subject and the verdict it backs, each found in its quotes',
	citeRefused:
		'report.claims[{index}].cites[{cite}]: refused {reason}; check the file id, the lines and the quote against the slices of the brief',
	notInTextWithClaims:
		'report.claims: the verdict not-in-text holds claims; give no claim, or give the verdict the claims back',
} as const

/** The letters of the readers of a round. */
export const READER_LETTERS = ['A', 'B', 'C'] as const

/** What one reader is given at most: counted (non-noise) lines (section 8). */
export const READER_LINE_BUDGET = 1500

/** The verdicts of a block of the documents, the best first: a slice takes the worst its lines touch (D5). */
export const SLICE_QUALITY_ORDER: readonly SliceQuality[] = ['good', 'poor', 'unreadable']

/** The family of a slice no angle found (find's list for the whole question, D4). */
export const QUESTION_FAMILY = 'question'

/** The readers of a round at each effort: two, three at high (section 8; outside too, section 18). */
export const READERS_AT_EFFORT: Record<FactEffort, readonly ReaderLetter[]> = {
	low: ['A', 'B'],
	medium: ['A', 'B'],
	high: ['A', 'B', 'C'],
}

/** The letter given the family round-robin, and the letter given it without the top-ranked slice. */
export const RANK_READER: ReaderLetter = 'A'
export const TOP_LESS_READER: ReaderLetter = 'C'

/** The version of a reader brief's json (it starts at 1 and grows with a change of its members). */
export const READER_BRIEF_SCHEMA = 1

/** The lines of a reader's brief; `{...}` are filled in. */
export const BRIEF_TEXT = {
	title: '# Reader {letter}: ask {ask}, round {round}',
	question: 'Question: {question}',
	subject: 'Subject: tags {tags}; attributes {attributes}; terms {terms}',
	nonce: 'Nonce: {nonce}',
	outsideName: 'Standard: {name} (public name; no document of it is given)',
	unnamedStandard: 'the standard the question is about',
	none: '-',
	listSeparator: ', ',
	anglesHeading: '## Angles',
	angle: '- {id} ({family}): {terms}',
	slicesHeading: '## Slices',
	slice: '### {id}  {file} lines {from}-{to}{clause}{poor}',
	sliceClause: '  clause {clause}',
	slicePoor: '  [poor: noisy extraction, quote only words plainly readable]',
	sliceLine: '{margin} | {text}',
	sliceLineRange: '{from}-{to}',
	noSlice: 'No slice is given.',
	rulesHeading: '## Rules',
	reportHeading: '## Report (write this JSON, one object)',
	jsonFenceStart: '```json',
	fenceEnd: '```',
	verdictsLine: '"verdict" is one of: {verdicts}',
} as const

/** The rules of a documents reader (section 8). */
export const DOCUMENT_BRIEF_RULES: readonly string[] = [
	'- Cite only lines of the slices above: the file id and the original line numbers (from-to), at most 40 non-noise lines a cite.',
	'- Quote the words you rely on, 8 to 40 words copied from the cited lines; a whole table row or code line may be quoted whole.',
	'- Each claim names a key term (a tag, an attribute, a value, a number, shall, should, may) and the subject, and backs the verdict in "supports".',
	'- When the slices do not say, answer not-in-text with no claim rather than a guess.',
	'- List in notFound what you searched for and did not find, and in familiesRead the angle families you read.',
	'- Copy the nonce of this brief into "nonce"; write the id of your own session into "session".',
]

/** The rules of an outside reader (section 18); `{name}` is the standard's public name. */
export const OUTSIDE_BRIEF_RULES: readonly string[] = [
	'- No document is given: answer from what you know of {name}; never cite file lines.',
	'- When you do not know, answer not-known; never guess, and write no hedge (probably, likely, I think).',
	'- "answer" is required: one sentence stating the behaviour.',
	'- Copy the nonce of this brief into "nonce"; "session" is required: the id of your own session.',
	'- List in notFound what you looked for and did not find, and in familiesRead the angle families you used.',
]

/** The source line of an outside brief, with and without the web allowed by the pack. */
export const OUTSIDE_SOURCE_RULES = {
	model: '- "source" is "model": this pack allows no web search; leave every cites list empty.',
	web: '- "source" is "model", or "web" when you searched the web: cite each page as { "url", "quote" (8 to 40 words), "retrieved" }.',
} as const

/** The placeholders of the report schema shown in a brief. */
export const BRIEF_REPORT_PLACEHOLDERS = {
	answer: 'One sentence stating the behaviour.',
	claim: 'What the cited words say, naming the subject and a key term.',
	supports: '<the verdict this claim backs>',
	file: '<file id>',
	quote: '<the words relied on>',
	notFound: '<what was searched and missed>',
	familiesRead: '<angle family>',
	session: '<the id of your session>',
	source: '<model or web>',
	url: '<page url>',
	retrieved: '<date retrieved>',
} as const

/** The indentation of the report schema's JSON in a brief, and the width of the line-number margin. */
export const BRIEF_JSON_INDENT = 2
export const BRIEF_MARGIN_WIDTH = 6

/** Why a round is skipped: nothing left that no reader of a letter had, from an angle not yet verified. */
export const NOTHING_NEW_REASON =
	'nothing new to give: every slice left was given to a reader of the same letter, or comes only from angles a verified cite came from'

/** The most rounds one ask spends on readers, whatever the effort: the search-before-asking ceiling (section 8). */
export const ROUND_CEILING = 5

/** The folder of a round whose files claim its nonces, one empty file per nonce (D7). */
export const USED_NONCES_FOLDER = 'used'

/** The fewest readers with new slices a document round opens with: agreement needs two (D34). */
export const ROUND_READERS_MINIMUM = 2

/** Why a round is skipped when fewer than two readers have new slices (D34). */
export const ONE_READER_REASON =
	'only one reader has new slices: agreement needs two readers, so no round of one reader is opened'

/** The rounds of readers each effort spends before the adjudicator (high) or the person (section 8). */
export const ROUNDS_AT_EFFORT: Record<FactEffort, number> = { low: 1, medium: 2, high: 3 }

/** The effort whose readers go to the adjudicator, not the person, when they cannot agree (section 8). */
export const ADJUDICATOR_EFFORT: FactEffort = 'high'

/** The verdict of a reader the slices do not answer. */
export const NOT_IN_TEXT_VERDICT = 'not-in-text'

/** Why a round goes to the person (sections 8 and 18); `contradictsDefinition` is the reason's own name (D10). */
export const PERSON_REASONS = {
	noAgreement: 'the readers did not agree within the rounds of the effort: a person answers',
	polarityConflict:
		'a claim says the opposite of the question (a polarity conflict) and the effort has no adjudicator: a person reads it',
	nothingFound:
		'no reader found the answer in the documents and nothing is left to give: a person answers',
	ceiling:
		'no reader found the answer in the documents within the 5-round ceiling: a person answers',
	outsideNotKnown:
		'an outside reader does not know (not-known or a hedged answer): a person answers',
	outsideDisagree:
		'the outside readers did not all give the same verdict and value: a person answers',
	outsidePolarityConflict:
		'an outside claim says the opposite of the question (a polarity conflict), and no adjudicator reads outside answers: a person reads it',
	outsideMissing:
		'not every outside reader of the effort sent an accepted report, and outside readers answer in one round only: a person answers',
	contradictsDefinition: 'contradicts-definition',
	adjudicatorRefused: "the adjudicator's report was refused ({refused}): a person answers",
	adjudicatorRefusedCite: "the adjudicator's report holds a refused cite: a person answers",
	adjudicatorPolarityConflict:
		"a claim of the adjudicator's report says the opposite of the question (a polarity conflict): a person reads it",
	adjudicatorNotInText: 'the adjudicator found no answer in the cited ranges: a person answers',
} as const

/** The kind of a fact's source naming a standard folder and its files key (D9 of K2b). */
export const STANDARD_SOURCE_KIND = 'standard'

/** The order of an outside fact's sources: what the model knows, then the web pages (D37). */
export const OUTSIDE_SOURCE_ORDER: readonly OutsideSource[] = ['model', 'web']

/** The reader name of the adjudicator, in its brief and its report. */
export const ADJUDICATOR_READER = 'adjudicator'

/** The files of the adjudicator's brief in its round folder (D38). */
export const ADJUDICATOR_BRIEF_FILES = {
	markdown: 'adjudicator.md',
	json: 'adjudicator.json',
} as const

/**
 * The file a round closed for the adjudicator keeps its accepted reports in, with their check results: what the
 * adjudicator's brief is written from by the next pack (D38).
 */
export const ACCEPTED_REPORTS_FILE = 'accepted.json'

/** The refusals of a round's accepted reports file; `{path}` is filled in. */
export const ACCEPTED_REPORTS_REFUSALS = {
	damaged:
		"{path} does not read as the accepted reports of a round (schema 1): the adjudicator's brief cannot be written; restore the file, or a person answers the ask: dialecte ask answer {ask}",
} as const

/** The lines of the adjudicator's brief; `{...}` are filled in. */
export const ADJUDICATOR_BRIEF_TEXT = {
	title: '# Adjudicator: ask {ask}, round {round}',
	reportsHeading: '## Reports of the readers (they did not agree)',
	report: '### Reader {letter}: {verdict}{value}',
	reportValue: ' ({value})',
	answer: 'Answer: {answer}',
	claim: '- {text} (supports {supports}; {check})',
	claimVerified: 'verified',
	claimRefused: 'refused: {refused}',
	claimConflict: '; polarity conflict',
	cite: '  - {file} lines {from}-{to}: "{quote}"',
	rangesHeading: '## Cited ranges (cite only these lines)',
	range: '### {file} lines {from}-{to}',
} as const

/** The rules of the adjudicator, before a documents reader's own. */
export const ADJUDICATOR_BRIEF_RULES: readonly string[] = [
	'- The readers above did not agree: read the cited ranges and decide which reading they support.',
	'- Your report is checked as a reader report: cite only lines of the ranges above; any refused cite sends the ask to a person.',
	'- Write "adjudicator" into "reader".',
]

/** The person's answer to an ask (D6): `answer.json` beside its record. */
export const ANSWER_RECORD_FILE = 'answer.json'

/**
 * The record of an outside answer a person confirmed (U17): `<ask>/confirm.json`, schema 1, the ask, the person's
 * fact, who confirmed and when; written once.
 */
export const CONFIRM_RECORD_FILE = 'confirm.json'

/** The verdicts a person's answer may keep (U19): `ask answer --verdict`; without it the fact says `person`. */
export const PERSON_ANSWER_VERDICTS = ['yes', 'no', 'depends', 'value'] as const

/** The rung of a person's answer (section 3). */
export const PERSON_RUNG = 6

/** The verdict a person's fact carries: a free-text answer names no reader verdict. */
export const PERSON_VERDICT = 'person'

/** The lot note's claim (D12, U2): `<lot folder>/standard.json.lock`, holding the writer's process id. */
export const NOTE_LOCK_FILE = 'standard.json.lock'

/**
 * How old a claim (the note's, a round's) must be before it is taken over, and then only when the process it names is
 * gone. A writer holds the note's claim for milliseconds, a verdict run its round's for the time of its checks; the
 * held-claim cases hold one for 300 ms while the process is gone, so this stays well above that (10 s).
 */
export const NOTE_LOCK_STALE_MS = 10_000
export const ROUND_CLAIM_STALE_MS = NOTE_LOCK_STALE_MS

/** How often a note writer looks again at a claim held by another writer, and how long it waits at most. */
export const NOTE_LOCK_POLL_MS = 25
export const NOTE_LOCK_WAIT_LIMIT_MS = 60_000

/** The claim of a verdict run on its round (K3-c, D40 c): `rounds/round-<r>/verdict.claim`, holding its process id. */
export const ROUND_CLAIM_FILE = 'verdict.claim'

/**
 * The one claim on an ask (R1-6, D43 2): `<ask>/ask.claim`, holding its process id, taken by `ask verdict`, `ask
 * answer` and the answer hook before any fact; a claim whose process is gone is taken over after this many ms.
 */
export const ASK_CLAIM_FILE = 'ask.claim'
export const ASK_CLAIM_STALE_MS = 10_000

/**
 * The `answering` marker (R1-4, R2-7): a verdict's in its round before it claims a nonce (the nonces, then the fact
 * draft's key once answered), a person's answer's in the ask folder before its fact (the key); a retry that finds
 * one finishes on it, the key's fact taken as recorded.
 */
export const ANSWERING_MARKER_FILE = 'answering.json'

/** The history events that record a fact for an ask (R3-1): its creation, or its reuse by that ask. */
export const RECORDING_EVENTS: readonly HistoryEvent[] = ['created', 'reused']

/**
 * A claim file holds its holder's pid, then its start time in ms, one per line (I-14, L-2). A pid running under
 * another start time (beyond the tolerance: `ps` gives whole seconds) is a pid reused; a claim older than the cap is
 * taken over, live or not (runs are short).
 */
export const CLAIM_LINE_SEPARATOR = '\n'
export const CLAIM_START_TOLERANCE_MS = 2_000
export const CLAIM_MAX_HELD_MS = 10 * 60 * 1000

/** The one call that reads another process's start time: `ps -o lstart= -p <pid>`. */
export const PS_COMMAND = 'ps'
export const PS_START_ARGUMENTS = ['-o', 'lstart=', '-p'] as const
/** The locale `ps` runs in (J-7): its dates in the one form `Date.parse` reads. */
export const PS_LOCALE = { LC_ALL: 'C', LANG: 'C' } as const

/** The exclusive file a stale claim's takeover runs under (R2-4): `<claim>.takeover`, holding the taker's id. */
export const TAKEOVER_SUFFIX = '.takeover'

/** The suffix of a stale claim moved aside before it is removed: `<claim>.stale-<pid>-<uuid>`. */
export const STALE_CLAIM_SUFFIX = '.stale-{pid}-{id}'

/** The refusals and lines of the claims and the note; `{...}` are filled in. */
export const CLAIM_MESSAGES = {
	noteWaited:
		'{path} is still held by process {pid} after {seconds} s: the lot note was not rewritten; when no dialecte ask runs, remove {path} and run the ask command again',
	noteFailed: 'ask: the lot note {path} was not rewritten ({reason}): the command goes on',
	askDamaged:
		'{path} does not read as an ask record (a state): put back the file this cli wrote, or ask the question again',
	askInProgress:
		'ask {ask} is in progress: another ask verdict or ask answer holds {path} (process {pid}); nothing was recorded; run the command again once it ends (a claim whose process is gone is taken over after {seconds} s)',
	hookInProgress:
		'{refused}; the answer is kept on the lot: once that run ends, record it with dialecte ask answer {ask} "<answer>" --by <who>',
	askUnknownState:
		'{path} holds the state {state}, not one of {states}: put back the file this cli wrote, or ask the question again',
} as const

/** Every state an ask's record may hold (R1-17): a record holding another word is refused. */
export const ASK_STATES: readonly AskState[] = [
	'answered',
	'needs-readers',
	'needs-adjudicator',
	'needs-person',
]

/** The text of a question a person gets (R4-12): the ask then its question, on one line (line breaks folded). */
export const PERSON_QUESTION_TEMPLATE = '{ask}: {question}'

/** A question cut at a word keeps at least this many characters (D41); with less it is cut hard at the limit. */
export const QUESTION_CUT_FLOOR = 400

/** Who raises the question of an ask, and the station it names. */
export const ASK_QUESTION_RAISER = 'dialecte ask'
export const ASK_QUESTION_STATION = 'ask'

/** The refusals of a person's answer to an ask; `{...}` are filled in. */
export const PERSON_ANSWER_MESSAGES = {
	unknownAsk:
		'no ask {ask} in {folder}: name an ask id this folder holds (A-<n>), or pass --lot <id|folder> for an ask kept with a lot',
	noRequest:
		'ask {ask} was made before the readers (its folder holds no request.json): ask again: dialecte ask "{question}"',
	answered: 'ask {ask} is answered{fact}: nothing was recorded; dialecte facts list reads its fact',
	answeredFact: ' (fact {fact})',
	confirmed:
		'ask {ask} is confirmed already (fact {fact}, by a person): nothing was recorded; dialecte facts list reads its fact',
} as const

/**
 * The pointer the lot question's details give to the round's verdict (J-3, J-12: relative to the lot folder); never a
 * reader's text.
 */
export const QUESTION_VERDICT_POINTER = 'what the readers read and said: {path}'

/** The next command of a person in a store lot (I-7, J-1): the lot answer of the question raised for the ask. */
export const LOT_ANSWER_NEXT = 'dialecte lot answer {lot} {question}'

/** How the hand-off lines follow the question's full text in its details (I-5). */
export const DETAILS_LINE_SEPARATOR = '\n'

/** The line printed on standard error when an ask's question cannot be raised; the exit code is kept. */
export const QUESTION_RAISE_FAILURE =
	'ask: no question was raised on the lot for ask {ask} ({reason}): answer it with dialecte ask answer {ask} "<answer>" --by <who>'
