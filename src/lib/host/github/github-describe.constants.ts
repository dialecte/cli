/** The help parser's constants. */

/** The headings of the sections that list flags: gh's own, and cobra's (gh's extensions). */
export const HELP_FLAG_SECTIONS = ['FLAGS', 'INHERITED FLAGS', 'Flags:'] as const

/** One flag line: an optional short form, then the long form, its `[=…]` suffix and argument name left after it. */
export const HELP_FLAG_LINE = /^\s+(?:(-[A-Za-z0-9]),\s+)?(--[A-Za-z0-9][\w-]*)/

/** One field of the list `gh <words> --json` prints on stderr: an indented name alone on its line. */
export const JSON_FIELD_LINE = /^\s+(\w+)\s*$/

/** What the introspection of one type asks: every field, deprecated ones too, its arguments, and its type unwrapped from up to three wrappers (`[X!]!`). */
export const INTROSPECTED_TYPE_SELECTION =
	'{name fields(includeDeprecated:true){name args{name} type{name ofType{name ofType{name ofType{name}}}}}}'

/** A version as gh and its extensions print it (`gh version 2.104.0 (…)`, `gh stack version 0.3.0`). */
export const VERSION_PATTERN = /\bversion\s+v?(\d+\.\d+\.\d+)/

/** What gh answers for a first word it does not know: an extension that is not installed. */
export const UNKNOWN_COMMAND_PATTERN = /unknown command "([^"]+)" for "/

/** The flag that asks gh, or one of its commands, for its version. */
export const VERSION_FLAG = '--version'

/** The flag that asks a gh command for its help. */
export const HELP_FLAG = '--help'

/** The flag that, given no value, makes gh list a command's fields. */
export const JSON_FLAG = '--json'

/** The flag `gh api` takes a raw string field with (the GraphQL query). */
export const QUERY_FIELD_FLAG = '-f'

/** The version selector of gh itself; any other selector is the first word of a part's commands (`stack`). */
export const TOOL_SELECTOR = 'cli'

/** The flag `gh` filters a JSON answer with. */
export const FILTER_FLAG = '--jq'
