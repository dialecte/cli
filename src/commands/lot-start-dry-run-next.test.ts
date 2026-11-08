/** `lot start --dry-run`: the `next` command is the real start, the brief path as given and shell-quoted (E3). */
import { copyFileSync } from 'node:fs'
import { join } from 'node:path'

import { BRIEF_FILE, BRIEF_FOLDER } from '../../test/brief-workspace.constants.ts'
import {
	createdBy,
	createStartWorkspace,
	withJson,
	withLines,
} from '../../test/lot-start-workspace.ts'
import { LOT_NAME, START_NOW } from '../../test/lot-start.constants.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { shellQuote } from '../lib/shell-quote.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StartWorkspace } from '../../test/lot-start-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

type SpellingRow = {
	title: string
	/** The brief path as the person types it, from the workspace folder. */
	given: (start: StartWorkspace) => string
}

const QUOTED_BRIEF_FILE = "it's a brief.json"

const SPELLINGS: SpellingRow[] = [
	{ title: 'an absolute path', given: (start) => start.workspace.briefPath },
	{
		title: 'a path relative to the folder it runs from',
		given: () => `${BRIEF_FOLDER}/${BRIEF_FILE}`,
	},
	{
		title: 'a path holding a space and a single quote',
		given: (start) => {
			copyFileSync(start.workspace.briefPath, join(start.workspace.briefFolder, QUOTED_BRIEF_FILE))
			return join(start.workspace.briefFolder, QUOTED_BRIEF_FILE)
		},
	},
]

describe('lot start --dry-run, next', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const spelling of SPELLINGS) {
		it(`${spelling.title} -> --json: next is dialecte lot start <that path, shell-quoted>`, () => {
			const start = createStartWorkspace()
			const given = spelling.given(start)

			expect(
				withJson(
					runLot({ cwd: start.cwd, argv: ['start', given, '--dry-run', '--json'], now: START_NOW }),
				),
			).toMatchObject({
				exitCode: 0,
				json: { lot: LOT_NAME, next: `dialecte lot start ${shellQuote(given)}` },
			})
		})

		it(`${spelling.title} -> text: a next: line with the same command, nothing created`, () => {
			const start = createStartWorkspace()
			const given = spelling.given(start)

			expect(
				withLines(runLot({ cwd: start.cwd, argv: ['start', given, '--dry-run'], now: START_NOW })),
			).toMatchObject({
				exitCode: 0,
				lines: expect.arrayContaining([`next: dialecte lot start ${shellQuote(given)}`]),
			})
			expect(createdBy(start)).toEqual({
				claims: [],
				lots: [],
				worktrees: [],
				storeList: undefined,
			})
		})
	}
})
