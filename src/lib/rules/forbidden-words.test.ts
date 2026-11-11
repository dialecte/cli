/**
 * The forbidden words: where the list is read from (git config, the user file under the config folder or the home),
 * and the reference pattern a contributor package gets from it (mirrors consumer-names.test.ts).
 */
import {
	CAPITAL_WORD,
	DOTTED_LOOKALIKE,
	DOTTED_WORD,
	FIRST_WORD,
	FORBIDDEN_WORDS_KEY,
	SECOND_WORD,
	THIRD_WORD,
} from '../../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../../test/forbidden-words-workspace.ts'
import { createScratchRepository, git } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { findReferences, readReferencePatterns } from './committed-text.ts'
import { forbiddenWordsFileOf, readForbiddenWords } from './forbidden-words.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

/** A package of `profile` in a scratch repository whose git config holds `list` (unset when undefined). */
function packageWithList(params: { profile: 'contributor' | 'consumer'; list?: string }): string {
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({ name: '@dialecte/demo', dialecte: { profile: params.profile } })}\n`,
	})
	if (params.list !== undefined) git({ root, args: ['config', FORBIDDEN_WORDS_KEY, params.list] })
	return root
}

/** The patterns of the package that are the forbidden words'. */
function wordPatternsOf(root: string) {
	return readReferencePatterns(root).filter((pattern) => pattern.label === 'forbidden word')
}

afterEach(() => vi.unstubAllEnvs())

describe('readForbiddenWords', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('nothing configured → no word', () => {
		configureMachine()
		const root = packageWithList({ profile: 'contributor' })

		expect(readForbiddenWords({ root })).toEqual([])
	})

	it('a git config comma list → its words, trimmed, empty entries dropped', () => {
		configureMachine()
		const root = packageWithList({
			profile: 'contributor',
			list: ` ${FIRST_WORD} , ${SECOND_WORD},, `,
		})

		expect(readForbiddenWords({ root })).toEqual([FIRST_WORD, SECOND_WORD])
	})

	it('the user file under XDG_CONFIG_HOME → one word per line, comments and blank lines skipped', () => {
		configureMachine({
			userFileLines: [
				`# a comment`,
				FIRST_WORD,
				'',
				`  ${SECOND_WORD}  `,
				`   `,
				`# ${THIRD_WORD}`,
			],
		})
		const root = packageWithList({ profile: 'contributor' })

		expect(readForbiddenWords({ root })).toEqual([FIRST_WORD, SECOND_WORD])
	})

	it('XDG_CONFIG_HOME unset → the file under the home .config is read', () => {
		const machine = configureMachine({ configHome: 'unset', userFileLines: [THIRD_WORD] })
		const root = packageWithList({ profile: 'contributor' })

		expect({
			words: readForbiddenWords({ root }),
			file: forbiddenWordsFileOf({}),
		}).toEqual({ words: [THIRD_WORD], file: machine.userFile })
	})

	it('XDG_CONFIG_HOME set → the home .config file is not read', () => {
		const machine = configureMachine({
			userFileLines: [FIRST_WORD],
			homeFileLines: [THIRD_WORD],
		})
		const root = packageWithList({ profile: 'contributor' })

		expect({
			words: readForbiddenWords({ root }),
			file: forbiddenWordsFileOf({}),
		}).toEqual({ words: [FIRST_WORD], file: machine.userFile })
	})

	it('the git config and the user file both set → both read, merged, the git config first, a word once', () => {
		configureMachine({ userFileLines: [SECOND_WORD, THIRD_WORD] })
		const root = packageWithList({
			profile: 'contributor',
			list: `${FIRST_WORD},${SECOND_WORD}`,
		})

		expect(readForbiddenWords({ root })).toEqual([FIRST_WORD, SECOND_WORD, THIRD_WORD])
	})

	it('an environment given → read from it, not from the process', () => {
		const given = configureMachine({ userFileLines: [FIRST_WORD] })
		// the process's own environment now names another file
		configureMachine({ userFileLines: [THIRD_WORD] })
		const root = packageWithList({ profile: 'contributor' })

		expect(
			readForbiddenWords({ root, environment: { XDG_CONFIG_HOME: given.configHome } }),
		).toEqual([FIRST_WORD])
	})
})

describe('forbidden words as reference patterns', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('contributor with a list → one pattern labelled forbidden word: whole words, case-insensitive', () => {
		configureMachine({ userFileLines: [SECOND_WORD] })
		const root = packageWithList({ profile: 'contributor', list: FIRST_WORD })
		const patterns = readReferencePatterns(root)

		expect(wordPatternsOf(root)).toHaveLength(1)
		expect(
			findReferences({ text: `a ${FIRST_WORD} and a ${SECOND_WORD.toUpperCase()}`, patterns }).map(
				(match) => [match.label, match.text],
			),
		).toEqual([
			['forbidden word', FIRST_WORD],
			['forbidden word', SECOND_WORD.toUpperCase()],
		])
		expect(
			findReferences({
				text: `${FIRST_WORD.toUpperCase()} in capitals, ${FIRST_WORD}s, un${FIRST_WORD}`,
				patterns,
			}).map((match) => match.text),
		).toEqual([FIRST_WORD.toUpperCase()])
	})

	it('a word holding a regular expression character → matched literally, never as a pattern', () => {
		configureMachine()
		const root = packageWithList({ profile: 'contributor', list: DOTTED_WORD })
		const patterns = readReferencePatterns(root)

		expect(findReferences({ text: `made by ${DOTTED_WORD}`, patterns })).toHaveLength(1)
		expect(findReferences({ text: `made by ${DOTTED_LOOKALIKE}`, patterns })).toEqual([])
	})

	it('a word written in capitals in the list → found in lowercase text', () => {
		configureMachine()
		const root = packageWithList({ profile: 'contributor', list: CAPITAL_WORD })
		const patterns = readReferencePatterns(root)

		expect(
			findReferences({ text: `a ${CAPITAL_WORD.toLowerCase()} here`, patterns }).map(
				(match) => match.text,
			),
		).toEqual([CAPITAL_WORD.toLowerCase()])
	})

	it('the same list: a contributor gets the pattern, a consumer never does (the app writes freely), a contributor without a list has none', () => {
		configureMachine({ userFileLines: [SECOND_WORD] })
		const contributor = packageWithList({ profile: 'contributor', list: FIRST_WORD })
		const consumer = packageWithList({ profile: 'consumer', list: FIRST_WORD })

		expect({
			contributor: wordPatternsOf(contributor).length,
			consumer: wordPatternsOf(consumer).length,
		}).toEqual({ contributor: 1, consumer: 0 })
	})

	it('a contributor with no list anywhere, next to one with a list → only the second gets a pattern', () => {
		configureMachine()
		const withList = packageWithList({ profile: 'contributor', list: FIRST_WORD })
		const withoutList = packageWithList({ profile: 'contributor' })

		expect({
			withList: wordPatternsOf(withList).length,
			withoutList: wordPatternsOf(withoutList).length,
		}).toEqual({ withList: 1, withoutList: 0 })
	})
})
