/** The words, operators and messages of the check of a skill page's cli invocations. */
import type { GroupOpener } from './cli-invocations.types.ts'

/** The cli's package name: also a word an invocation starts with (`npx --no-install @dialecte/cli doctor`). */
export const CLI_PACKAGE = '@dialecte/cli'

/** The name of the cli's bin, in its package.json `bin`. */
export const CLI_BIN = 'dialecte'

/** The words an invocation starts with. */
export const CLI_WORDS: ReadonlySet<string> = new Set([CLI_BIN, CLI_PACKAGE])

/** The runner an invocation may follow, with its own `-`options. */
export const NPX_WORD = 'npx'

/** The options of `npx` that take the next word as their value (`npx -p @dialecte/cli dialecte gate`). */
export const NPX_OPTIONS_WITH_VALUE: ReadonlySet<string> = new Set(['-p', '--package'])

/** An environment assignment written before an invocation (`RUNS=5 dialecte bench`). */
export const ENVIRONMENT_ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=/

/** A shell prompt written before an invocation (`$ dialecte tdd status`). */
export const PROMPT_WORD = '$'

/** The word after which nothing is an option. */
export const END_OF_OPTIONS = '--'

/** The two-character shell operators that end an invocation. */
export const DOUBLE_OPERATORS: ReadonlySet<string> = new Set(['&&', '||'])

/** The one-character shell operators that end (or, for `(`, start) an invocation. */
export const SINGLE_OPERATORS: ReadonlySet<string> = new Set([';', '|', '&', '(', ')', '`'])

/** A subshell opener (an operator); right before a flag, it opens a flag group (`(--key | --file)`). */
export const SUBSHELL_OPEN = '('

/** What closes a flag group `(--key | --file)`; outside one, a subshell closer (an operator). */
export const SUBSHELL_CLOSE = ')'

/** What opens a process substitution (`<(dialecte gate)`, `>(sort)`): an operator, its `)` one too. */
export const PROCESS_SUBSTITUTION_OPENERS: ReadonlySet<string> = new Set(['<(', '>('])

/** What a flag starts with: a `(` right before it opens a flag group. */
export const FLAG_START = '-'

/** A long flag's leading dashes (`--fast` → `fast`). */
export const LONG_FLAG_PREFIX_PATTERN = /^--/

/** A blank between two words of an invocation. */
export const WHITESPACE_PATTERN = /\s/

/** Every character but a line break: a generated block's text, blanked with its line breaks kept. */
export const NOT_LINE_BREAK_PATTERN = /[^\n]/g

/** What opens a placeholder or an option group: a `|` inside it is no pipe. */
export const GROUP_OPENERS: readonly GroupOpener[] = ['<', '[']

/**
 * The opener each group closer closes, one depth per kind: a placeholder `<...>`, an option group `[...]`, a flag
 * group `(--a | --b)`. A closer of a kind with no group open closes nothing.
 */
export const GROUP_OPENER_OF_CLOSER: ReadonlyMap<string, GroupOpener> = new Map<
	string,
	GroupOpener
>([
	['>', '<'],
	[']', '['],
	[SUBSHELL_CLOSE, SUBSHELL_OPEN],
])

/** The quotes of a shell string: one word, never checked. */
export const QUOTES: ReadonlySet<string> = new Set(['"', "'"])

/** What starts a shell comment at the start of a word: it ends the invocation. */
export const COMMENT_START = '#'

/** What a placeholder word holds (`<command>`): its position is not checked. */
export const PLACEHOLDER_MARK = '<'

/** The fence tags of a shell script: every line of such a fence is read for invocations. */
export const SHELL_FENCE_TAGS: ReadonlySet<string> = new Set(['sh', 'bash', 'shell'])

/** The info string of a fence (group 1): the first word after its opening backticks, empty when untagged. */
export const FENCE_TAG_PATTERN = /^[ \t]*```[ \t]*([^\s`]*)/

/**
 * A line of an untagged fence read as an invocation: `dialecte ` then a word (group 1), read only when that word
 * is a command of the map; any other untagged line (a diagram label, a sample) is never read.
 */
export const UNTAGGED_FENCE_INVOCATION_PATTERN = new RegExp(`^\\s*${CLI_BIN}\\s+(\\S+)`)

/** A fenced line ending in a backslash continues on the next. */
export const LINE_CONTINUATION_PATTERN = /\\\s*$/

/**
 * The flag a word cites (group 1): `--name` of `--name=value`, of `--name]` or of `[--name` / `(--name` in a
 * quoted usage line.
 */
export const CITED_FLAG_PATTERN = /^[[(]*(--[A-Za-z0-9][\w-]*)/

/** The most closest forms a finding names. */
export const CLOSEST_LIMIT = 1

/** The finding messages; `{cited}` is the form as cited, after `dialecte`. */
export const INVOCATION_MESSAGES = {
	unknownCommand: '`dialecte {cited}`: no command `{word}`',
	unknownVerb: '`dialecte {cited}`: `dialecte {command}` has no verb `{word}`',
	unknownFlag: '`dialecte {cited}`: `dialecte {form}` has no flag `{word}`',
	unknownGlobalFlag: '`dialecte {cited}`: no flag `{word}` without a command',
	closest: '; did you mean `dialecte {form}`?',
	commandsListed: ' (`dialecte --help` lists the commands)',
	verbsListed: '; its verbs: {list}',
	flagsListed: '; its flags: {list}',
	globalFlagsListed: '; the flags without a command: {list}',
	renamedCommand: '`dialecte {cited}` was renamed: {forms}',
	renamedForm: '`dialecte {old}` is now `dialecte {new}`',
} as const

/** The separator of the forms or words a message lists. */
export const LIST_SEPARATOR = ', '

/** How long the installed cli may take to answer `--help --json`: a guard against a hang, wide slack. */
export const CLI_SURFACE_TIMEOUT_MS = 60_000

/** What the run prints, once, when the invocations cannot be checked: `{reason}`. */
export const NOT_CHECKED_LINE = 'cli invocations not checked: {reason}'

/** What the summary line of the run ends with when the invocations it found were not checked. */
export const NOT_CHECKED_SUMMARY = ' (cli invocations not checked)'

/** Why the invocations cannot be checked; `{version}` the installed cli's version. */
export const UNAVAILABLE_REASONS = {
	noCli: `no ${CLI_PACKAGE} installed in this package`,
	noBin: `the installed ${CLI_PACKAGE} {version} has no \`${CLI_BIN}\` bin`,
	failed: `the installed ${CLI_PACKAGE} {version} did not answer \`${CLI_BIN} --help --json\`: {detail}`,
	badManifest: `the installed ${CLI_PACKAGE} has a package.json that is no JSON`,
	noJson: `the installed ${CLI_PACKAGE} {version} answers \`--help --json\` with no JSON`,
	noMap: `the installed ${CLI_PACKAGE} {version} answers \`--help --json\` without the verbs and flags of its commands (a cli before the command map)`,
} as const
