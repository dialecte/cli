import type { FactEffort } from '../facts/facts.types.ts'
import type { AskKind, KindShape, KindSlotNeed, RerunAnswer, SlotPlaceholder } from './ask.types.ts'

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

/** Where the asks outside a lot live, below the state folder. */
export const STATE_ASKS_SEGMENTS: readonly string[] = ['dialecte', 'asks']

/** The refusals of the ask folder (D16); `{...}` are filled in. */
export const ASK_FOLDER_REFUSALS = {
	stateInWorkTree:
		'{path} (the asks outside a lot, below XDG_STATE_HOME) is inside the git work tree {top}: set XDG_STATE_HOME to a folder outside every repository',
} as const

/** The kind and the effort of every question of the gold run (D21). */
export const GOLD_RUN_KIND: AskKind = 'semantic'
export const GOLD_RUN_EFFORT: FactEffort = 'medium'

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
} as const

/** The outcome of a rung the ladder went past. */
export const RUNG_PASSED = 'passed'

/** The line printed on standard error when an event cannot be written; the ask goes on, its exit code kept. */
export const EVENT_WRITE_FAILURE =
	'ask: the event was not written to {file} ({reason}): the ask goes on; make {file} a writable file to keep the events'

/** Line breaks in a reason printed on one line. */
export const LINE_BREAKS_PATTERN = /\s*[\r\n]+\s*/gu
export const LINE_BREAK_REPLACEMENT = ' '
