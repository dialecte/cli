/**
 * The forbidden words in `dialecte rules` (the touched files) and `dialecte contrib` (its rules row): a word found
 * is an error of the file; no list configured prints one line and passes; a consumer package never gets the check.
 */
import {
	FIRST_WORD,
	FORBIDDEN_WORDS_KEY,
	NO_LIST_LINE_START,
	SECOND_WORD,
	USER_FILE_PATH,
	WORD_SOURCE_FILE,
} from '../../test/forbidden-words-workspace.constants.ts'
import { configureMachine, textHolding } from '../../test/forbidden-words-workspace.ts'
import { rulesOutcomeOf } from '../../test/rules-outcome.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { createContribPackage, parseContribJson, runContribIn } from '../../test/scratch-contrib.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { CLI_SOURCE } from '../../test/step4-cases.constants.ts'
import { CONSUMER_NAMES_KEY } from '../lib/rules/committed-text.constants.ts'
import { shellQuote } from '../lib/shell-quote.ts'
import { runGate } from './gate.ts'
import { runRules } from './rules.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

/** A package of `profile` whose source file is edited to hold `text`, its git config holding `list` when given. */
function editedWith(params: {
	profile: 'contributor' | 'consumer'
	text: string
	list?: string
}): string {
	const root = createContribPackage({ profile: params.profile, steps: [] })
	if (params.list !== undefined) git({ root, args: ['config', FORBIDDEN_WORDS_KEY, params.list] })
	writeFiles({ root, files: { [WORD_SOURCE_FILE]: params.text } })
	return root
}

afterEach(() => vi.unstubAllEnvs())

describe('dialecte rules: forbidden words', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('contributor, a word of the git config in a touched file → exit 1, an error line labelled forbidden word at its line, no no-list line', () => {
		configureMachine()
		const root = editedWith({
			profile: 'contributor',
			list: FIRST_WORD,
			text: textHolding(FIRST_WORD),
		})

		const result = runRules({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(result.output.split('\n')).toContainEqual(
			expect.stringMatching(
				new RegExp(`^src/a\\.ts:2:\\d+  error  \\S+  forbidden word \`${FIRST_WORD}\``),
			),
		)
		expect(result.output).not.toContain(NO_LIST_LINE_START)
	})

	it('contributor, a word of the user file, in capitals → found as written, case-insensitive', () => {
		configureMachine({ userFileLines: [SECOND_WORD] })
		const root = editedWith({
			profile: 'contributor',
			text: textHolding(SECOND_WORD.toUpperCase()),
		})

		const result = runRules({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(`forbidden word \`${SECOND_WORD.toUpperCase()}\``)
	})

	it('contributor, the word once inside a longer word and once alone → only the lone word is found', () => {
		configureMachine()
		const root = editedWith({
			profile: 'contributor',
			list: FIRST_WORD,
			text: `export {}\n// ${FIRST_WORD}s and un${FIRST_WORD}\n// ${FIRST_WORD}\n`,
		})

		const result = runRules({ cwd: root, argv: [] })

		expect(result.output.split('\n').filter((line) => line.includes('forbidden word'))).toEqual([
			expect.stringMatching(/^src\/a\.ts:3:\d+  error /),
		])
	})

	it('contributor, no list anywhere → exit 0, one line naming the git key and the user file', () => {
		const machine = configureMachine()
		const root = editedWith({ profile: 'contributor', text: textHolding('shipped') })

		const result = runRules({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(0)
		expect(result.output.split('\n').filter((line) => line.startsWith(NO_LIST_LINE_START))).toEqual(
			[`forbidden words: no list (git config dialecte.forbiddenWords or ${machine.userFile})`],
		)
	})

	it('contributor, no list, files given → the same one line', () => {
		const machine = configureMachine()
		const root = editedWith({ profile: 'contributor', text: textHolding('shipped') })

		const result = runRules({ cwd: root, argv: [WORD_SOURCE_FILE] })

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain(
			`forbidden words: no list (git config dialecte.forbiddenWords or ${machine.userFile})`,
		)
	})

	it('the same list and file: a contributor fails on the word, a consumer finds nothing and gets no no-list line', () => {
		configureMachine({ userFileLines: [FIRST_WORD] })
		const text = textHolding(FIRST_WORD)
		const contributor = editedWith({ profile: 'contributor', list: FIRST_WORD, text })
		const consumer = editedWith({ profile: 'consumer', list: FIRST_WORD, text })

		const ran = {
			contributor: runRules({ cwd: contributor, argv: [] }).exitCode,
			consumer: runRules({ cwd: consumer, argv: [] }),
		}

		expect(ran.contributor).toBe(1)
		expect(ran.consumer.exitCode).toBe(0)
		expect(ran.consumer.output).not.toContain('forbidden word')
	})

	it.each(['directory', 'unreadable'] as const)(
		'contributor, the user list file is a %s → an error line naming it, exit 1, never a silent no-list',
		(broken) => {
			const machine = configureMachine({ userFileBroken: broken })
			const root = editedWith({ profile: 'contributor', text: textHolding('shipped') })

			expect(rulesOutcomeOf({ cwd: root, argv: [] })).toMatchObject({
				threw: false,
				exitCode: 1,
				output: expect.stringContaining(machine.userFile),
			})
		},
	)

	it('contributor, the user list file is missing → no list: the one line, exit 0', () => {
		const machine = configureMachine()
		const root = editedWith({ profile: 'contributor', text: textHolding('shipped') })

		expect(rulesOutcomeOf({ cwd: root, argv: [] })).toMatchObject({
			threw: false,
			exitCode: 0,
			output: expect.stringContaining(
				`forbidden words: no list (git config dialecte.forbiddenWords or ${machine.userFile})`,
			),
		})
	})

	it('no list: a contributor gets the no-list line, a consumer none', () => {
		configureMachine()
		const text = textHolding('shipped')
		const contributor = editedWith({ profile: 'contributor', text })
		const consumer = editedWith({ profile: 'consumer', text })

		const lines = {
			contributor: runRules({ cwd: contributor, argv: [] }).output,
			consumer: runRules({ cwd: consumer, argv: [] }).output,
		}

		expect({
			contributor: lines.contributor.includes(NO_LIST_LINE_START),
			consumer: lines.consumer.includes(NO_LIST_LINE_START),
		}).toEqual({ contributor: true, consumer: false })
	})
})

describe('dialecte contrib: forbidden words', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('contributor, a word in a changed file → exit 1, the rules row failed on that file; the same file with no list passes', async () => {
		configureMachine()
		const text = textHolding(FIRST_WORD)
		const listed = editedWith({ profile: 'contributor', list: FIRST_WORD, text })
		const unlisted = editedWith({ profile: 'contributor', text })

		const failed = await runContribIn({ cwd: listed, argv: ['--json', '--no-reuse'] })
		const passed = await runContribIn({ cwd: unlisted, argv: ['--json', '--no-reuse'] })

		expect(failed.exitCode).toBe(1)
		expect(parseContribJson(failed.output).rows).toContainEqual({
			name: 'rules',
			status: 'failed',
			detail: expect.stringContaining('src/a.ts:2:'),
		})
		expect(parseContribJson(passed.output).rows).toContainEqual(
			expect.objectContaining({ name: 'rules', status: 'passed' }),
		)
	})
})

describe(
	'a list set after a green record: the rules step runs again and fails',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		/** A contributor package whose gate holds the rules step, its source file holding `word`. */
		function gatedWith(word: string): string {
			const root = createContribPackage({
				steps: [],
				gateFast: [{ name: 'rules', run: `node ${shellQuote(CLI_SOURCE)} rules` }],
			})
			writeFiles({ root, files: { [WORD_SOURCE_FILE]: textHolding(word) } })
			return root
		}

		it('gate --fast green, then the word is added to the git config list → the second run runs the step, exit 1, not reused', async () => {
			configureMachine()
			const root = gatedWith(FIRST_WORD)
			const first = await runGate({ cwd: root, argv: [] })
			git({ root, args: ['config', FORBIDDEN_WORDS_KEY, FIRST_WORD] })

			const second = await runGate({ cwd: root, argv: [] })

			expect({
				first: first.exitCode,
				second: second.exitCode,
				reused: second.output.includes('reused'),
			}).toEqual({ first: 0, second: 1, reused: false })
		})

		it('gate --fast green, then the word is added to the user file → the second run fails', async () => {
			const machine = configureMachine()
			const root = gatedWith(FIRST_WORD)
			const first = await runGate({ cwd: root, argv: [] })
			writeFiles({
				root: machine.configHome ?? '',
				files: { [USER_FILE_PATH]: `${FIRST_WORD}\n` },
			})

			const second = await runGate({ cwd: root, argv: [] })

			expect([first.exitCode, second.exitCode]).toEqual([0, 1])
		})

		it('contrib green, then the word is added to the list → the second contrib fails on the rules row', async () => {
			configureMachine()
			const root = gatedWith(FIRST_WORD)
			const first = await runContribIn({ cwd: root, argv: ['--json'] })
			git({ root, args: ['config', FORBIDDEN_WORDS_KEY, FIRST_WORD] })

			const second = await runContribIn({ cwd: root, argv: ['--json'] })

			expect({
				first: first.exitCode,
				second: second.exitCode,
				rules: parseContribJson(second.output).rows.find((row) => row.name === 'rules')?.status,
			}).toEqual({ first: 0, second: 1, rules: 'failed' })
		})

		it('gate --fast green, then the name is added to the consumer names → the second run fails', async () => {
			configureMachine()
			const root = gatedWith(FIRST_WORD)
			const first = await runGate({ cwd: root, argv: [] })
			git({ root, args: ['config', CONSUMER_NAMES_KEY, FIRST_WORD] })

			const second = await runGate({ cwd: root, argv: [] })

			expect([first.exitCode, second.exitCode]).toEqual([0, 1])
		})
	},
)
