/** What the agent-facing verbs (`judge`, `record`, `drop`) share: the caps of a judge packet and of a record. */
import { MUTANTS_VERBS } from './mutation.constants.ts'

import type { MutantsJsonVerb, VerbOptions } from './mutation-agent.types.ts'
import type { MutationFamily } from './mutation.types.ts'

/** The lines kept above and below the mutated lines of a survivor's window. */
export const WINDOW_CONTEXT_LINES = 5

/** The most lines a survivor's window holds; the rest is counted in `more`. */
export const WINDOW_MAX_LINES = 21

/** The longest text of a window line, the cut ending `…`. */
export const WINDOW_LINE_MAX_CHARS = 160

/** The most covering tests a survivor names; the rest is counted in `testsMore`. */
export const PACKET_MAX_TESTS = 5

/** The longest name of a covering test, the cut ending `…`. */
export const TEST_NAME_MAX_CHARS = 200

/** The most survivors a packet holds; the rest is counted in `more`. */
export const PACKET_MAX_SURVIVORS = 10

/** Neither the JSON nor the text of a packet is longer than this many bytes (UTF-8). */
export const PACKET_MAX_BYTES = 12_000

/** The longest reason a record takes, in characters, once trimmed. */
export const RECORD_REASON_MAX_CHARS = 200

/** The cut mark of a window line and of a test name. */
export const CUT_MARK = '…'

/** The family placeholder of a command whose family the guess could not name. */
export const FAMILY_PLACEHOLDER = '<family>'

/** The reason placeholder of a record command. */
export const REASON_PLACEHOLDER = '<why no output can change>'

/** The follow-up placeholder of a schedule command. */
export const FOLLOW_UP_PLACEHOLDER = '<follow-up>'

/** A call or `new` whose callee ends like this builds an error or refuses (the classifier's error call). */
export const ERROR_CALL_CALLEE = /(Error|error|refus|fail|assert)\w*$/i

/** The property names whose string value is wording. */
export const WORDING_PROPERTY_NAMES = /^(detail|message|reason|hint|text)$/

/** What marks a `default:` clause as exhaustive. */
export const EXHAUSTIVE_DEFAULT_TEXT = /satisfies never|assertNever|: never/

/** The mutators whose mutant inside an error construction is its payload. */
export const ERROR_PAYLOAD_MUTATORS = /^(ObjectLiteral|ArrayDeclaration|ArrowFunction)$/

/** The mutator of a string literal mutant. */
export const STRING_LITERAL_MUTATOR = 'StringLiteral'

/** Why a family guess is `unclassified` when the mutated code cannot be found. */
export const COULD_NOT_LOCATE = 'could not locate the mutated code'

/** Why a family guess is `unclassified` when no rule matched. */
export const NO_RULE_MATCHED = 'no rule matched: a test (gap) or a family after reading the code'

/** The family of an unjudged record and of a guess no rule names: never a family a record takes (a gap gets a test). */
export const UNCLASSIFIED_FAMILY = 'unclassified' satisfies MutationFamily

/** A file of an errors/ folder (at the start of the path or after a `/`): the error catalogue. */
export const ERRORS_FOLDER_FILE = /(?:^|\/)errors\//

/** A constants file: values set once at load. */
export const CONSTANTS_FILE = /\.constants\.ts$/

/** The keys of a syntax node that hold no child node. */
export const NON_CHILD_KEYS: ReadonlySet<string> = new Set([
	'loc',
	'start',
	'end',
	'range',
	'extra',
	'comments',
	'leadingComments',
	'trailingComments',
	'innerComments',
	'tokens',
])

/** The verbs that print one JSON object with `--json`: every verb but `run`. */
export const MUTANTS_JSON_VERBS: readonly MutantsJsonVerb[] = MUTANTS_VERBS.filter(
	(verb): verb is MutantsJsonVerb => verb !== 'run',
)

/** The flag that asks a verb for one JSON object. */
export const JSON_FLAG = '--json'

/** A path separator: a run id never holds one. */
export const PATH_SEPARATOR = /[/\\]/

/** The `./` a package-relative file may be given with. */
export const LEADING_DOT_SLASH = /^\.\//

/** The options of `mutants judge`: what its parser reads, and the words no option takes as its value. */
export const JUDGE_OPTIONS: VerbOptions = { values: ['file'], flags: ['json'] }

/**
 * The options of `mutants record`: what its parser reads, and the words no option takes as its value. `key` is the
 * value option that takes several words.
 */
export const RECORD_OPTIONS: VerbOptions = {
	values: ['key', 'file', 'family', 'reason'],
	flags: ['removable', 'json'],
}

/** The value option of `mutants record` that takes every word after it up to the next option. */
export const RECORD_KEY_OPTION = 'key'

/** The prefix of an option word: `--<name>`. */
export const OPTION_PREFIX = '--'

/** The first half of a surrogate pair at the end of a text: a cut there would split a character. */
export const TRAILING_HIGH_SURROGATE = /[\uD800-\uDBFF]$/

/** The shortest a survivor's mutation text is cut to when a packet over the byte cap shrinks it. */
export const MUTATION_MIN_CHARS = 40
