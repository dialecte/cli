/** The texts and options of `dialecte config` (33CF section 4). A `{name}` is filled by the command. */
/** The usage lines every usage fault prints (exit 2). */
export const CONFIG_USAGE: readonly string[] = [
	'usage: dialecte config list [--json]',
	'       dialecte config get <key> [--json]',
	'       dialecte config set <key> <value> --project|--personal|--repo',
	'       dialecte config check [--json]',
]

/** The flags `config` takes, without the dashes. */
export const CONFIG_FLAGS = ['json', 'project', 'personal', 'repo'] as const

/** A key outside the registry (`get`, `set`; exit 2): `{key}` the key as given. */
export const CONFIG_UNKNOWN_KEY = "config: unknown key '{key}'"

/** A key with no value (`get`; exit 1): `{key}` the key as given. */
export const CONFIG_NOT_SET = '{key}: not set'

/** No file anywhere (`list`): `{projectFile}`, `{personalFile}`. */
export const CONFIG_NO_SETTINGS = 'no settings (project {projectFile}, personal {personalFile})'

/** `check` without a finding: `{projectFile}`, `{personalFile}`. */
export const CONFIG_CHECK_OK = 'config check: ok ({projectFile}, {personalFile})'

/** The mark of a `check` finding line. */
export const CONFIG_CHECK_MARK = '✗'

/** The mark of a `list` finding line and of a note. */
export const CONFIG_NOTE_MARK = '!'

/** A value of a key of the other layer (`set`; exit 2): `{key}`, `{layer}` the key's layer, `{target}` the flag. */
export const CONFIG_SET_WRONG_LAYER =
	'config set: {key} is a {layer} key and cannot be set with --{target}'

/** A key no `repos:` entry may hold (`set --repo`; exit 2): `{key}`. */
export const CONFIG_SET_NOT_PER_REPOSITORY =
	'config set: {key} cannot be set per repository (--repo)'

/** A value failing the key's check (`set`; exit 2): `{key}` as given, `{problem}` the check's. */
export const CONFIG_SET_BAD_VALUE = 'config set: {key}: {problem}'

/** A value holding a word of the forbidden list (`set`; exit 2); never names the word. */
export const CONFIG_SET_FORBIDDEN_WORD =
	'config set: the value holds a word of your forbiddenWords list; nothing written'

/** A written project value: `{key}`, `{file}`. */
export const CONFIG_SET_PROJECT_WRITTEN =
	'config set: {key} written to {file}: a committed file, the cli never commits it'

/** A written personal value: `{key}`, `{file}`. */
export const CONFIG_SET_PERSONAL_WRITTEN = 'config set: {key} written to {file}'

/** A written per-repository value: `{key}`, `{file}`, `{repo}`. */
export const CONFIG_SET_REPO_WRITTEN = 'config set: {key} written to {file} (repos {repo})'

/** The flags naming the file `set` writes, without the dashes. */
export const CONFIG_TARGET_FLAGS = ['project', 'personal', 'repo'] as const

/** The flag asking for JSON, without the dashes. */
export const CONFIG_JSON_FLAG = 'json'

/** The version of the JSON answers (`config-list.schema.json`). */
export const CONFIG_JSON_SCHEMA_VERSION = 1

/** The words each verb takes, the verb included. */
export const CONFIG_VERB_WORDS: Readonly<Record<'list' | 'get' | 'set' | 'check', number>> = {
	list: 1,
	get: 2,
	set: 3,
	check: 1,
}

/** The separator of a value line's three columns: the key, the value as compact JSON, the source. */
export const CONFIG_COLUMN_SEPARATOR = '  '

/** A source in a file: `{file}`, `{line}`. */
export const CONFIG_FILE_SOURCE = '{file}:{line}'

/** A source in a `repos:` entry: `{file}`, `{line}`, `{repo}`. */
export const CONFIG_REPO_SOURCE = '{file}:{line} (repos {repo})'

/** A source in the environment: `{variable}`. */
export const CONFIG_ENVIRONMENT_SOURCE = 'env {variable}'

/** A finding line: `{mark}`, `{file}`, `{line}`, `{key}`, `{problem}`. */
export const CONFIG_FINDING_LINE = '{mark} {file}:{line}: {key}: {problem}'

/** A finding line without a key: `{mark}`, `{file}`, `{line}`, `{problem}`. */
export const CONFIG_FINDING_LINE_NO_KEY = '{mark} {file}:{line}: {problem}'

/** A note line: `{mark}`, `{note}`. */
export const CONFIG_NOTE_LINE = '{mark} {note}'

/** A value text that is not YAML (`set`): `{why}` the parser's first line. */
export const CONFIG_SET_NOT_YAML_PROBLEM = 'the value is not valid YAML: {why}'

/** A target file `set` cannot edit (D22; exit 2): `{file}`, `{line}`, `{problem}` the reader's. */
export const CONFIG_SET_UNUSABLE_FILE =
	'config set: {file}:{line}: {problem}; fix the file first, nothing written'

/** A value text YAML cuts at an unquoted ` #` (`set`, under CONFIG_SET_BAD_VALUE; exit 2). */
export const CONFIG_SET_COMMENT_DROPPED =
	'the value holds " #", which YAML reads as a comment and drops: quote the value (\'"code #wait"\'), nothing written'

/** What starts a comment token of YAML's lexer. */
export const YAML_COMMENT_MARK = '#'
