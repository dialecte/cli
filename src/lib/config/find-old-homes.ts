import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { errorReasonOf } from '../error-reason.ts'
import { tryReadGit } from '../git.ts'
import {
	COMMENT_MARK,
	CONFIG_HOME_VARIABLE,
	FORBIDDEN_WORDS_FILE,
	HOME_CONFIG_FOLDER,
	WORD_SEPARATOR,
} from '../rules/forbidden-words.constants.ts'
import { CONFIG_KEYS } from './config-keys.constants.ts'
import {
	DIALECTE_JSON_FILE_NAME,
	DIALECTE_JSON_PROBLEM,
	FORBIDDEN_WORDS_CONFIG_KEY,
	FORBIDDEN_WORDS_FILE_NAME,
	FORBIDDEN_WORDS_FILE_NOTE,
	FORBIDDEN_WORDS_FILE_PROBLEM,
	FORBIDDEN_WORDS_FILE_UNREADABLE,
	GIT_CONFIG_FILE_LABEL,
	GIT_KEY_EMPTY_NOTE,
	GIT_KEY_NOTE,
	GIT_CONFIG_ENTRY_SEPARATOR,
	GIT_CONFIG_VALUE_SEPARATOR,
	GIT_KEY_PROBLEM,
	OLD_GIT_CONFIG_KEYS,
	OLD_GIT_KEYS_PATTERN,
	OLD_HOME_KEY_PREFIX,
	PACKAGE_JSON_FIELD,
	PACKAGE_JSON_FILE_NAME,
	PACKAGE_JSON_SETTING_PROBLEM,
	RENAMED_PACKAGE_JSON_KEYS,
} from './find-old-homes.constants.ts'
import { personalConfigFileOf } from './personal-config-file-of.ts'
import { readConfigFile } from './read-config-file.ts'

import { findNodeAtLocation, parseTree } from 'jsonc-parser'

import type { ConfigContext, ConfigEntry, ConfigFinding, ConfigLayer } from './config.types.ts'
import type { OldHomes } from './find-old-homes.types.ts'

/** The 1-based line of an offset in a text. */
function lineAt(params: { text: string; offset: number }): number {
	return params.text.slice(0, params.offset).split('\n').length
}

/** The `.dialecterc` key a package.json `"dialecte"` member moves to; undefined for a key that is no setting (D2). */
function dialectercKeyOf(params: { key: string; context: ConfigContext }): string | undefined {
	const renamed = RENAMED_PACKAGE_JSON_KEYS[params.key]
	if (renamed !== undefined) return renamed
	const keys = params.context.keys ?? CONFIG_KEYS
	const isProjectKey = keys.some((spec) => spec.key === params.key && spec.layer === 'project')
	return isProjectKey ? params.key : undefined
}

/** One refusal per settings key of package.json `"dialecte"` (C8, D1), on the key's own line. */
function packageJsonRefusals(context: ConfigContext): ConfigFinding[] {
	const file = join(context.root, PACKAGE_JSON_FILE_NAME)
	if (!existsSync(file)) return []
	const text = readFileSync(file, 'utf8')
	const tree = parseTree(text, [], { allowTrailingComma: true })
	const field = tree === undefined ? undefined : findNodeAtLocation(tree, [PACKAGE_JSON_FIELD])
	if (field === undefined || field.type !== 'object') return []
	const refusals: ConfigFinding[] = []
	for (const member of field.children ?? []) {
		const keyNode = member.children?.[0]
		if (keyNode === undefined || typeof keyNode.value !== 'string') continue
		const target = dialectercKeyOf({ key: keyNode.value, context })
		if (target === undefined) continue
		refusals.push({
			file,
			line: lineAt({ text, offset: keyNode.offset }),
			key: `${OLD_HOME_KEY_PREFIX}${keyNode.value}`,
			problem: PACKAGE_JSON_SETTING_PROBLEM.replace('{key}', keyNode.value).replace(
				'{target}',
				target,
			),
		})
	}
	return refusals
}

/** The refusal of a dialecte.json at the root (C8). */
function dialecteJsonRefusals(context: ConfigContext): ConfigFinding[] {
	const file = join(context.root, DIALECTE_JSON_FILE_NAME)
	if (!existsSync(file)) return []
	return [{ file, line: 1, key: DIALECTE_JSON_FILE_NAME, problem: DIALECTE_JSON_PROBLEM }]
}

/** The words of a comma list, trimmed, blanks dropped. */
function wordsOf(text: string): string[] {
	return text
		.split(WORD_SEPARATOR)
		.map((word) => word.trim())
		.filter((word) => word !== '')
}

/** The words of a config.yml value, folded to lower case (none when it is not a list of texts). */
function foldedWordsOf(value: unknown): Set<string> {
	const items = Array.isArray(value) ? value : []
	return new Set(items.filter((item) => typeof item === 'string').map((item) => item.toLowerCase()))
}

/** True when config.yml's top-level value already holds what git config holds (U2). */
function holdsGitValue(params: {
	shape: 'text' | 'list'
	gitValue: string
	value: unknown
}): boolean {
	if (params.shape === 'text') return params.value === params.gitValue
	const held = foldedWordsOf(params.value)
	return wordsOf(params.gitValue).every((word) => held.has(word.toLowerCase()))
}

/**
 * Every `dialecte.*` git key of `root` with its value, in one `git config --get-regexp` (the last value of a key
 * wins, as `git config --get` answers; a key without `=` reads as empty). Keys are lower-cased, as git prints them.
 * git runs with the process environment, so the suite's git isolation (`GIT_CONFIG_GLOBAL`) applies to it.
 */
function readOldGitKeys(root: string): Map<string, string> {
	const output = tryReadGit({ root, args: ['config', '--get-regexp', '-z', OLD_GIT_KEYS_PATTERN] })
	const values = new Map<string, string>()
	for (const record of (output ?? '').split(GIT_CONFIG_ENTRY_SEPARATOR)) {
		if (record === '') continue
		const separator = record.indexOf(GIT_CONFIG_VALUE_SEPARATOR)
		const name = separator === -1 ? record : record.slice(0, separator)
		const value = separator === -1 ? '' : record.slice(separator + 1)
		values.set(name.toLowerCase(), value.trim())
	}
	return values
}

/**
 * The four git keys (U2): a note for each config.yml already holds or that is empty (nothing to migrate, D17), a
 * refusal for each other.
 */
function gitKeyHomes(params: {
	context: ConfigContext
	entries: readonly ConfigEntry[]
	personalFile: string
}): OldHomes {
	const refusals: ConfigFinding[] = []
	const notes: string[] = []
	const gitValues = readOldGitKeys(params.context.root)
	for (const { key, shape } of OLD_GIT_CONFIG_KEYS) {
		const gitKey = `${OLD_HOME_KEY_PREFIX}${key}`
		const gitValue = gitValues.get(gitKey.toLowerCase())
		if (gitValue === undefined) continue
		if (gitValue === '') {
			notes.push(GIT_KEY_EMPTY_NOTE.replaceAll('{gitKey}', gitKey))
			continue
		}
		const value = params.entries.find((entry) => entry.key === key)?.value
		if (holdsGitValue({ shape, gitValue, value })) {
			notes.push(GIT_KEY_NOTE.replaceAll('{gitKey}', gitKey))
			continue
		}
		refusals.push({
			file: GIT_CONFIG_FILE_LABEL,
			line: 0,
			key: gitKey,
			problem: GIT_KEY_PROBLEM.replace('{file}', params.personalFile).replace('{key}', key),
		})
	}
	return { refusals, notes }
}

/** The words of the forbidden-words file with their 1-based line: trimmed, `#` comments and blank lines skipped. */
function fileWordsOf(text: string): { word: string; line: number }[] {
	return text
		.split(/\r?\n/)
		.map((line, index) => ({ word: line.trim(), line: index + 1 }))
		.filter(({ word }) => word !== '' && !word.startsWith(COMMENT_MARK))
}

/**
 * Where the old reader looked for the forbidden-words file, on every platform (win32 included):
 * `$XDG_CONFIG_HOME/dialecte/forbidden-words` when set and not empty, else `<$HOME or home>/.config/dialecte/
 * forbidden-words`, whatever folder config.yml lives in; joined as the old reader joined it, with the separators of
 * the running machine. Its twin is `forbiddenWordsFileOf` (lib/rules/forbidden-words.ts): both must name the same
 * file for one environment, `context.home` standing for the old reader's `homedir()`. The merge lot deletes the old
 * reader so one location remains (follow-up F6).
 */
function oldForbiddenWordsFileOf(context: ConfigContext): string {
	const { environment } = context
	const configHome = environment[CONFIG_HOME_VARIABLE]
	const folder = configHome
		? configHome
		: join(environment.HOME ?? context.home, HOME_CONFIG_FOLDER)
	return join(folder, ...FORBIDDEN_WORDS_FILE)
}

/** The forbidden-words file (U2): a note when config.yml `forbiddenWords` holds every word, else a refusal. */
function forbiddenWordsFileHomes(params: {
	context: ConfigContext
	entries: readonly ConfigEntry[]
	personalFile: string
}): OldHomes {
	const { context } = params
	const file = oldForbiddenWordsFileOf(context)
	if (!existsSync(file)) return { refusals: [], notes: [] }
	const key = FORBIDDEN_WORDS_FILE_NAME
	let text: string
	try {
		text = readFileSync(file, 'utf8')
	} catch (error) {
		const problem = FORBIDDEN_WORDS_FILE_UNREADABLE.replace('{why}', errorReasonOf(error))
		return { refusals: [{ file, line: 0, key, problem }], notes: [] }
	}
	const held = foldedWordsOf(
		params.entries.find((entry) => entry.key === FORBIDDEN_WORDS_CONFIG_KEY)?.value,
	)
	const missing = fileWordsOf(text).find(({ word }) => !held.has(word.toLowerCase()))
	if (missing === undefined)
		return { refusals: [], notes: [FORBIDDEN_WORDS_FILE_NOTE.replace('{file}', file)] }
	const problem = FORBIDDEN_WORDS_FILE_PROBLEM.replace('{file}', params.personalFile).replace(
		'{word}',
		missing.word,
	)
	return { refusals: [{ file, line: missing.line, key, problem }], notes: [] }
}

/** The personal old homes: the git keys, then the forbidden-words file, against config.yml's top level read once. */
function personalOldHomes(context: ConfigContext): OldHomes {
	const personalFile = personalConfigFileOf(context)
	const read = readConfigFile({ file: personalFile, layer: 'personal' })
	const entries = read.missing ? [] : read.entries
	const homes = [
		gitKeyHomes({ context, entries, personalFile }),
		forbiddenWordsFileHomes({ context, entries, personalFile }),
	]
	return {
		refusals: homes.flatMap((home) => home.refusals),
		notes: homes.flatMap((home) => home.notes),
	}
}

/**
 * The old homes of one layer (C8, U2). Project: each settings key of package.json `"dialecte"` (the project keys
 * and the old `allowReferences`, `referencePatterns`; never the manifest keys `stepEvents`, `standard`) on its line,
 * and a dialecte.json, each refused. Personal: the four `dialecte.*` git keys and the forbidden-words file where
 * the old reader looked, each noted when config.yml's top level already holds its value, refused otherwise.
 */
export function findOldHomes(params: { context: ConfigContext; layer: ConfigLayer }): OldHomes {
	const { context } = params
	if (params.layer === 'personal') return personalOldHomes(context)
	return {
		refusals: [...packageJsonRefusals(context), ...dialecteJsonRefusals(context)],
		notes: [],
	}
}
