/**
 * The words a contributor package's committed text never holds, from the machine only (never committed):
 * `git config dialecte.forbiddenWords` (a comma list) and the user file `$XDG_CONFIG_HOME/dialecte/forbidden-words`
 * (else `$HOME/.config/dialecte/forbidden-words`; one word per line, `#` comments, blank lines skipped), both read
 * and merged.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { errorReasonOf } from '../error-reason.ts'
import { readGitConfig } from '../git.ts'
import {
	REGEX_SPECIAL_PATTERN,
	WHOLE_WORD_END,
	WHOLE_WORD_START,
} from './committed-text.constants.ts'
import {
	COMMENT_MARK,
	CONFIG_HOME_VARIABLE,
	FORBIDDEN_WORD_LABEL,
	FORBIDDEN_WORDS_FILE,
	FORBIDDEN_WORDS_KEY,
	HOME_CONFIG_FOLDER,
	MISSING_FILE_CODE,
	UNREADABLE_LIST_MESSAGE,
	WORD_SEPARATOR,
} from './forbidden-words.constants.ts'

import type { ReferencePattern } from './committed-text.types.ts'

/** The user file of the list cannot be read (a folder at its path, no permission): never read as no list. */
export class ForbiddenWordsListError extends Error {
	override name = 'ForbiddenWordsListError'
	readonly file: string

	constructor(params: { file: string; why: string }) {
		super(UNREADABLE_LIST_MESSAGE.replace('{file}', params.file).replace('{why}', params.why))
		this.file = params.file
	}
}

/**
 * The words of the git config list, then those of the user file not in it already (compared whatever the case), in
 * their order. A missing user file is no list; one that cannot be read throws a `ForbiddenWordsListError`.
 */
export function readForbiddenWords(params: {
	/** The repository whose git config is read. */
	root: string
	/** Default: the process's environment. */
	environment?: Readonly<NodeJS.ProcessEnv>
}): string[] {
	const configured = (readGitConfig({ root: params.root, key: FORBIDDEN_WORDS_KEY }) ?? '')
		.split(WORD_SEPARATOR)
		.map((word) => word.trim())
	const listed = readUserFileWords(forbiddenWordsFileOf({ environment: params.environment }))
	const words: string[] = []
	const seen = new Set<string>()
	for (const word of [...configured, ...listed]) {
		const folded = word.toLowerCase()
		if (word === '' || seen.has(folded)) continue
		seen.add(folded)
		words.push(word)
	}
	return words
}

/** Where the user file is: the one `readForbiddenWords` reads, and the one the no-list line names. */
export function forbiddenWordsFileOf(params: {
	/** Default: the process's environment. */
	environment?: Readonly<NodeJS.ProcessEnv>
}): string {
	const environment = params.environment ?? process.env
	const configHome = environment[CONFIG_HOME_VARIABLE]
	const folder = configHome ? configHome : join(environment.HOME ?? homedir(), HOME_CONFIG_FOLDER)
	return join(folder, ...FORBIDDEN_WORDS_FILE)
}

/** The reference pattern of the words: whole words, matched whatever the case, each literally; none without a word. */
export function forbiddenWordPatterns(words: readonly string[]): ReferencePattern[] {
	if (words.length === 0) return []
	return [{ label: FORBIDDEN_WORD_LABEL, ...wholeWordsPatternOf({ words }), ignoreCase: true }]
}

/**
 * The source and flag of a pattern finding `words`, each literally and whole: no letter, mark, digit or `_` of any
 * script touches it on either side, whatever its own first and last characters are (`Ézorb`, `@zorb`, `zorb!`).
 * @intent find whole words of any script in committed text
 */
export function wholeWordsPatternOf(params: {
	words: readonly string[]
}): Pick<ReferencePattern, 'source' | 'unicode'> {
	const alternatives = params.words
		.map((word) => word.replace(REGEX_SPECIAL_PATTERN, '\\$&'))
		.join('|')
	return { source: `${WHOLE_WORD_START}(${alternatives})${WHOLE_WORD_END}`, unicode: true }
}

/** The words of the user file: one per line, trimmed, comments and blank lines skipped; none when it is missing. */
function readUserFileWords(file: string): string[] {
	let text: string
	try {
		text = readFileSync(file, 'utf8')
	} catch (error) {
		if (isMissing(error)) return []
		throw new ForbiddenWordsListError({ file, why: errorReasonOf(error) })
	}
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== '' && !line.startsWith(COMMENT_MARK))
}

/** A file that is not there (nor a folder on its way): no list. */
function isMissing(error: unknown): boolean {
	return errorReasonOf(error) === MISSING_FILE_CODE
}
