import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { createScratchRepository, temporaryFolder } from '../../test/scratch-repository.ts'
import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { handoverFolderRefusal } from '../lib/review-rounds/worktree-state.ts'
import { runLot } from './lot.ts'
import { runRecord } from './record.ts'

import { describe, expect, it } from 'vitest'

/** Noon, local time: the same calendar day whichever clock the date is read with. */
const NOW = new Date('2026-11-01T12:00:00')

/** The usage `record choice` answers a refused call with, a reason in parentheses allowed after it. */
const CHOICE_USAGE_PATTERN = /^lot choice: expected <id\|folder> --by <who> <decision>( \(.+\))?$/

const DECISIONS_HEAD = '| decision | by | when |\n|---|---|---|\n'

/** A hand-over folder named `lot`, made, outside every repository. */
function handoverFolder(): string {
	const folder = join(realpathSync(temporaryFolder('dialecte-choice-')), 'lot')
	mkdirSync(folder, { recursive: true })
	return folder
}

function decisionsOf(folder: string): string {
	return join(folder, 'decisions.md')
}

/** The file as `record choice` first writes it for a folder named `lot`, then `rows`. */
function freshDecisions(rows: string[]): string {
	return `# Decisions - lot\n\n${DECISIONS_HEAD}${rows.map((row) => `${row}\n`).join('')}`
}

/** The call of `record choice` with `words` after the folder, run from the folder's parent at NOW. */
function choiceCall(params: { folder: string; words: string[] }) {
	return {
		cwd: dirname(params.folder),
		argv: ['choice', params.folder, ...params.words],
		now: NOW,
	}
}

describe('dialecte record choice', { timeout: 60_000 }, () => {
	it('no decisions.md yet → made with its title and table, the row | decision | who | yyyy-mm-dd |, the path printed', () => {
		const folder = handoverFolder()

		expect(
			runRecord(choiceCall({ folder, words: ['--by', 'Ada Lovelace', 'Keep the old flag'] })),
		).toEqual({
			exitCode: 0,
			output: `lot choice: by Ada Lovelace - ${decisionsOf(folder)}`,
		})
		expect(readFileSync(decisionsOf(folder), 'utf8')).toBe(
			freshDecisions(['| Keep the old flag | Ada Lovelace | 2026-11-01 |']),
		)
	})

	it('an existing file → the row goes right after the table’s last row, every other byte kept', () => {
		const folder = handoverFolder()
		const before = [
			'# Decisions - written by hand',
			'',
			'Intro text.',
			'',
			'| decision | by | when |',
			'|---|---|---|',
			'| Split the lot | Grace | 2026-10-30 |',
			'',
			'## Notes',
			'',
			'kept as is',
			'',
		]
		writeFileSync(decisionsOf(folder), before.join('\n'))

		expect(runRecord(choiceCall({ folder, words: ['--by', 'Ada', 'Keep the old flag'] }))).toEqual({
			exitCode: 0,
			output: `lot choice: by Ada - ${decisionsOf(folder)}`,
		})
		expect(readFileSync(decisionsOf(folder), 'utf8')).toBe(
			[...before.slice(0, 7), '| Keep the old flag | Ada | 2026-11-01 |', ...before.slice(7)].join(
				'\n',
			),
		)
	})

	it('a pipe in the decision or the name → escaped as in the ledger', () => {
		const folder = handoverFolder()

		expect(
			runRecord(choiceCall({ folder, words: ['--by', 'Ada|Grace', 'Split | merge later'] })),
		).toEqual({ exitCode: 0, output: `lot choice: by Ada|Grace - ${decisionsOf(folder)}` })
		expect(readFileSync(decisionsOf(folder), 'utf8')).toBe(
			freshDecisions(['| Split \\| merge later | Ada\\|Grace | 2026-11-01 |']),
		)
	})

	it('--by after the decision → read as well', () => {
		const folder = handoverFolder()

		expect(runRecord(choiceCall({ folder, words: ['Keep the old flag', '--by', 'Ada'] }))).toEqual({
			exitCode: 0,
			output: `lot choice: by Ada - ${decisionsOf(folder)}`,
		})
		expect(readFileSync(decisionsOf(folder), 'utf8')).toBe(
			freshDecisions(['| Keep the old flag | Ada | 2026-11-01 |']),
		)
	})

	it('-- ends the options → a decision starting with -- is written as is', () => {
		const folder = handoverFolder()

		expect(
			runRecord(choiceCall({ folder, words: ['--by', 'Ada', '--', '--force stays off'] })),
		).toEqual({ exitCode: 0, output: `lot choice: by Ada - ${decisionsOf(folder)}` })
		expect(readFileSync(decisionsOf(folder), 'utf8')).toBe(
			freshDecisions(['| --force stays off | Ada | 2026-11-01 |']),
		)
	})

	it.each([
		{ refused: 'no --by', words: ['Keep the old flag'] },
		{ refused: 'an empty --by', words: ['--by', '', 'Keep the old flag'] },
		{ refused: 'a blank --by', words: ['--by', '   ', 'Keep the old flag'] },
		{ refused: '--by without its value', words: ['Keep the old flag', '--by'] },
		{ refused: 'no decision', words: ['--by', 'Ada'] },
		{ refused: 'more than one decision word', words: ['--by', 'Ada', 'Keep', 'the', 'flag'] },
		{ refused: 'a line break in the decision', words: ['--by', 'Ada', 'Keep\nthe flag'] },
		{ refused: 'a line break in --by', words: ['--by', 'Ada\nGrace', 'Keep the flag'] },
		{ refused: 'an unknown option', words: ['--by', 'Ada', '--round', '1', 'Keep the flag'] },
	])('$refused → the usage, exit 2, no file written', ({ words }) => {
		const folder = handoverFolder()

		expect(runRecord(choiceCall({ folder, words }))).toEqual({
			exitCode: 2,
			output: expect.stringMatching(CHOICE_USAGE_PATTERN),
		})
		expect(existsSync(decisionsOf(folder))).toBe(false)
	})

	it('the folder given relative to the cwd → the absolute path of decisions.md printed', () => {
		const folder = handoverFolder()

		expect(
			runRecord({
				cwd: dirname(folder),
				argv: ['choice', 'lot', '--by', 'Ada', 'Keep the old flag'],
				now: NOW,
			}),
		).toEqual({ exitCode: 0, output: `lot choice: by Ada - ${decisionsOf(folder)}` })
		expect(readFileSync(decisionsOf(folder), 'utf8')).toBe(
			freshDecisions(['| Keep the old flag | Ada | 2026-11-01 |']),
		)
	})

	it('no folder at all → the usage, exit 2', () => {
		expect(runRecord({ cwd: handoverFolder(), argv: ['choice'], now: NOW })).toEqual({
			exitCode: 2,
			output: expect.stringMatching(CHOICE_USAGE_PATTERN),
		})
	})

	it('a folder inside a repository → the folder refusal of the other record subcommands, exit 1, nothing written', () => {
		const root = realpathSync(createScratchRepository())
		const folder = join(root, 'handover')

		expect(
			runRecord({
				cwd: root,
				argv: ['choice', folder, '--by', 'Ada', 'Keep the old flag'],
				now: NOW,
			}),
		).toEqual({ exitCode: 1, output: `lot choice: ${handoverFolderRefusal(folder)}` })
		expect(existsSync(decisionsOf(folder))).toBe(false)
	})

	it('the lot usage and the help name the new verb', () => {
		const declared =
			COMMAND_MAP.lot.usage.find((line) => line.startsWith('dialecte lot choice ')) ?? ''

		expect(runLot({ cwd: handoverFolder(), argv: [] })).toEqual({
			exitCode: 2,
			output: expect.stringContaining(declared.replace('dialecte lot ', '')),
		})
		expect(
			spawnSync(process.execPath, [join(import.meta.dirname, '..', 'cli.ts'), 'lot', '--help'], {
				encoding: 'utf8',
				cwd: handoverFolder(),
			}).stdout,
		).toContain(declared)
	})
})
