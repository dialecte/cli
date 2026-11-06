/** `record`, `review` and `recap` answer only that they were renamed: nothing runs, nothing is written. */
import { spawnSync } from 'node:child_process'
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import {
	createScratchRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { shellQuote } from '../lib/shell-quote.ts'

import { describe, expect, it } from 'vitest'

/** The cli's entry in the sources: Node runs it with its type stripping. */
const CLI_SOURCE = join(import.meta.dirname, '..', 'cli.ts')

const LEDGER =
	'# Findings ledger - lot\n\n| id | round | severity | file:line | finding | state |\n|---|---|---|---|---|---|\n| R1-1 | 1 | nit | a.ts:1 | first | open |\n'

/** Words the shell reads as themselves: written bare or quoted. */
const SAFE_WORD = /^[\w@%+:,./-][\w@%+=:,./-]*$/

/** The pattern of a command line holding `words`: a safe word bare or quoted, any other quoted. */
function commandPattern(words: string[]): RegExp {
	const alternatives = words.map((word) =>
		SAFE_WORD.test(word)
			? `(?:${escapeRegExp(word)}|${escapeRegExp(shellQuote(word))})`
			: escapeRegExp(shellQuote(word)),
	)
	return new RegExp(alternatives.join(' '))
}

/** The cli run as a process in an empty folder of its own. */
function runCli(argv: string[]) {
	return spawnSync(process.execPath, [CLI_SOURCE, ...argv], {
		encoding: 'utf8',
		cwd: temporaryFolder('dialecte-renamed-cli-'),
	})
}

/** The text read as JSON, or the text itself when it is none (the assertion then says what was printed). */
function jsonOrText(text: string): unknown {
	try {
		return JSON.parse(text)
	} catch {
		return text
	}
}

/** The usage line of `lot <verb>` in the declared map. */
function lotUsageLine(verb: string): string | undefined {
	return COMMAND_MAP.lot.usage.find((line) => line.startsWith(`dialecte lot ${verb}`))
}

/** `text` with every regular-expression character escaped. */
function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Every file of the folder with its text, or undefined when the folder does not exist. */
function treeOf(folder: string): Record<string, string> | undefined {
	if (!existsSync(folder)) return undefined
	return Object.fromEntries(
		readdirSync(folder)
			.sort()
			.map((name) => [name, readFileSync(join(folder, name), 'utf8')]),
	)
}

describe('the renamed commands', { timeout: 30_000 }, () => {
	const testCases: Record<
		string,
		{
			words: (folder: string) => string[]
			oldWords: string
			newWords: string
			/** The files the folder holds before the call, or undefined: it does not exist. */
			seeded?: Record<string, string>
		}
	> = {
		'record review': {
			words: (folder) => [
				'record',
				'review',
				folder,
				'--round',
				'1',
				'--severity',
				'nit',
				'--at',
				'a.ts:1',
				'x',
			],
			oldWords: 'record review',
			newWords: 'lot finding',
		},
		'record decision': {
			words: (folder) => ['record', 'decision', folder, 'R1-1', 'accepted', 'a reason'],
			oldWords: 'record decision',
			newWords: 'lot decide',
			seeded: { 'findings-ledger.md': LEDGER },
		},
		'record snapshot': {
			words: (folder) => ['record', 'snapshot', folder, '--round', '1'],
			oldWords: 'record snapshot',
			newWords: 'lot snapshot',
		},
		'record choice': {
			words: (folder) => ['record', 'choice', folder, '--by', 'user', 'keep it'],
			oldWords: 'record choice',
			newWords: 'lot choice',
		},
		'record standard': {
			words: (folder) => ['record', 'standard', folder, 'consulted', 'a note'],
			oldWords: 'record standard',
			newWords: 'lot standard',
		},
		'review delta': {
			words: (folder) => ['review', 'delta', folder, '--round', '2', '--json'],
			oldWords: 'review delta',
			newWords: 'lot delta',
			seeded: { 'round-1.base': 'abc\n' },
		},
		recap: {
			words: (folder) => ['recap', folder],
			oldWords: 'recap',
			newWords: 'lot recap',
			seeded: { 'lots.json': '{}' },
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(`${title} with valid arguments → exit 2, "renamed: dialecte ${testCase.oldWords} is now dialecte ${testCase.newWords}", the full new command, nothing written`, () => {
			const root = createScratchRepository({ 'a.ts': 'a\n' })
			writeFiles({ root, files: { 'a.ts': 'b\n' } })
			const folder = join(realpathSync(temporaryFolder('dialecte-renamed-')), 'lot')
			if (testCase.seeded) {
				mkdirSync(folder, { recursive: true })
				for (const [name, text] of Object.entries(testCase.seeded))
					writeFileSync(join(folder, name), text)
			}
			const before = treeOf(folder)
			const words = testCase.words(folder)

			const run = spawnSync(process.execPath, [CLI_SOURCE, ...words], {
				encoding: 'utf8',
				cwd: root,
			})

			expect(run.status).toBe(2)
			expect(run.stdout).toBe('')
			expect(run.stderr.split('\n')[0]).toBe(
				`renamed: dialecte ${testCase.oldWords} is now dialecte ${testCase.newWords}`,
			)
			const oldCount = testCase.oldWords.split(' ').length
			expect(run.stderr).toMatch(
				commandPattern(['dialecte', ...testCase.newWords.split(' '), ...words.slice(oldCount)]),
			)
			expect(treeOf(folder)).toEqual(before)
		})

	it('record alone → exit 2 naming every lot verb that replaced a record verb', () => {
		const run = spawnSync(process.execPath, [CLI_SOURCE, 'record'], {
			encoding: 'utf8',
			cwd: temporaryFolder('dialecte-renamed-alone-'),
		})

		expect(run.status).toBe(2)
		expect(run.stdout).toBe('')
		for (const verb of ['finding', 'decide', 'snapshot', 'choice', 'standard'])
			expect(run.stderr).toContain(`dialecte lot ${verb}`)
	})

	const helpCases: Record<string, { command: string; names: string[] }> = {
		'record --help': { command: 'record', names: ['lot finding', 'lot decide', 'lot snapshot'] },
		'review --help': { command: 'review', names: ['lot delta'] },
		'recap --help': { command: 'recap', names: ['lot recap'] },
	}
	for (const [title, helpCase] of Object.entries(helpCases))
		it(`${title} → the renamed answer on stdout, exit 0, nothing on stderr`, () => {
			const run = runCli([helpCase.command, '--help'])

			expect(run.status).toBe(0)
			expect(run.stdout.split('\n')[0]).toMatch(
				new RegExp(`^renamed: dialecte ${helpCase.command} is now `),
			)
			for (const name of helpCase.names) expect(run.stdout).toContain(`dialecte ${name}`)
			expect(run.stderr).toBe('')
		})

	it('record review x --help → the renamed answer naming lot finding, with the words before --help', () => {
		const run = runCli(['record', 'review', 'x', '--help'])

		expect(run.status).toBe(0)
		expect(run.stdout.split('\n')[0]).toBe(
			'renamed: dialecte record review is now dialecte lot finding',
		)
		expect(run.stdout).toMatch(commandPattern(['dialecte', 'lot', 'finding', 'x']))
	})

	const noWordsCases: Record<string, { argv: string[]; verb: string }> = {
		'recap with no words': { argv: ['recap'], verb: 'recap' },
		'record review with no words': { argv: ['record', 'review'], verb: 'finding' },
	}
	for (const [title, noWords] of Object.entries(noWordsCases))
		it(`${title} → exit 2, the new form's usage line, not a bare new command`, () => {
			const run = runCli(noWords.argv)

			expect(run.status).toBe(2)
			expect(lotUsageLine(noWords.verb)).toBeDefined()
			expect(run.stderr.split('\n')[1]?.trim()).toBe(lotUsageLine(noWords.verb))
		})

	it('record --help --json → { renamed: [{ old, new }] }: every old form of record with its lot form', () => {
		const run = runCli(['record', '--help', '--json'])

		expect(run.status).toBe(0)
		expect(jsonOrText(run.stdout)).toEqual({
			renamed: [
				{ old: 'record review', new: 'lot finding' },
				{ old: 'record decision', new: 'lot decide' },
				{ old: 'record snapshot', new: 'lot snapshot' },
				{ old: 'record choice', new: 'lot choice' },
				{ old: 'record standard', new: 'lot standard' },
			],
		})
	})

	it('review --help --json and recap --help --json → their one renamed form each', () => {
		const review = runCli(['review', '--help', '--json'])
		const recap = runCli(['recap', '--help', '--json'])

		expect([review.stdout, recap.stdout].map(jsonOrText)).toEqual([
			{ renamed: [{ old: 'review delta', new: 'lot delta' }] },
			{ renamed: [{ old: 'recap', new: 'lot recap' }] },
		])
	})

	it('a finding word starting with = → quoted in the new command (zsh expands =word)', () => {
		const folder = join(realpathSync(temporaryFolder('dialecte-renamed-equals-')), 'lot')

		const run = runCli([
			'record',
			'review',
			folder,
			'--round',
			'1',
			'--severity',
			'nit',
			'--at',
			'a.ts:1',
			'=x',
		])

		expect(run.status).toBe(2)
		expect(run.stderr).toContain("'=x'")
		expect(run.stderr).not.toMatch(/ =x(\s|$)/)
	})
})
