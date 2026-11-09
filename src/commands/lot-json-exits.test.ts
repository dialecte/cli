/** `lot start` and `lot status` under `--json`: a usage error or a refusal answers JSON with `next: null` (E4). */
import { realpathSync } from 'node:fs'

import { briefWith, createBriefWorkspace, writeStoreLot } from '../../test/brief-workspace.ts'
import { createStartWorkspace, withJson } from '../../test/lot-start-workspace.ts'
import { START_NOW } from '../../test/lot-start.constants.ts'
import { createWorkspaceWithLots, writeStoreListFile } from '../../test/lot-stores.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The text as a pattern that matches it only. */
function escaped(text: string): string {
	return text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

type StartUsageRow = {
	title: string
	words: (briefPath: string) => string[]
	/** A token of the reason that `error` must hold. */
	token: (briefPath: string) => string
}

const START_USAGE_ROWS: StartUsageRow[] = [
	{ title: 'no brief', words: () => ['--json'], token: () => 'brief' },
	{
		title: 'two positionals',
		words: (briefPath) => [briefPath, `${briefPath}.more`, '--json'],
		token: (briefPath) => `${briefPath}.more`,
	},
	{
		title: 'a bad --effort',
		words: (briefPath) => [briefPath, '--effort', 'extreme', '--json'],
		token: () => 'extreme',
	},
	{
		title: 'an unknown option',
		words: (briefPath) => [briefPath, '--bogus', '--json'],
		token: () => '--bogus',
	},
]

describe('lot start --json, a usage error', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of START_USAGE_ROWS)
		it(`${row.title} -> exit 2, JSON { error, usage: the lot usage, next: null }`, () => {
			const start = createStartWorkspace()

			expect(
				withJson(
					runLot({
						cwd: start.cwd,
						argv: ['start', ...row.words(start.workspace.briefPath)],
						now: START_NOW,
					}),
				),
			).toEqual({
				exitCode: 2,
				json: {
					error: expect.stringMatching(
						new RegExp(`^[^\\n]*${escaped(row.token(start.workspace.briefPath))}[^\\n]*$`),
					),
					usage: renderLotUsage(),
					next: null,
				},
			})
		})
})

describe('lot start --json, a refused brief', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('exit 2, JSON { refused, next: null }', () => {
		const start = createStartWorkspace({ brief: briefWith({ schema: 2 }) })

		expect(
			withJson(
				runLot({
					cwd: start.cwd,
					argv: ['start', start.workspace.briefPath, '--json'],
					now: START_NOW,
				}),
			),
		).toEqual({
			exitCode: 2,
			json: {
				refused: [expect.objectContaining({ rule: 'shape', field: 'schema' })],
				next: null,
			},
		})
	})
})

const LOT = '0007-repo-feature'
const UNKNOWN_ID = '9999'

describe('lot status --json, a usage error', { timeout: STORE_CASE_TIMEOUT }, () => {
	const usageRows: Record<string, { argv: string[]; token: string }> = {
		'no id': { argv: ['status', '--json'], token: 'id' },
		'two ids': { argv: ['status', LOT, '0008', '--json'], token: '0008' },
		'an unknown option': { argv: ['status', LOT, '--bogus', '--json'], token: '--bogus' },
	}
	for (const [title, row] of Object.entries(usageRows))
		it(`${title} -> exit 2, JSON { error naming ${row.token}, usage: the lot usage, next: null }`, () => {
			const workspace = createBriefWorkspace()
			writeStoreLot({ workspace, name: LOT, scope: ['src/'] })

			expect(withJson(runLot({ cwd: workspace.repository, argv: row.argv }))).toEqual({
				exitCode: 2,
				json: {
					error: expect.stringMatching(new RegExp(`^[^\\n]*${escaped(row.token)}[^\\n]*$`)),
					usage: renderLotUsage(),
					next: null,
				},
			})
		})
})

describe('lot status --json, a refusal', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('an unknown id -> exit 2, JSON { error naming the id, next: null }', () => {
		const workspace = createBriefWorkspace()
		writeStoreLot({ workspace, name: LOT, scope: ['src/'] })

		expect(
			withJson(runLot({ cwd: workspace.repository, argv: ['status', UNKNOWN_ID, '--json'] })),
		).toEqual({
			exitCode: 2,
			json: {
				error: expect.stringMatching(new RegExp(`^[^\\n]*no lot ${UNKNOWN_ID}[^\\n]*$`)),
				next: null,
			},
		})
	})

	it('an index two stores of the list hold, asked from outside both -> exit 2, JSON { error: one line, next: null }', () => {
		const first = createWorkspaceWithLots({ names: ['0005-repo-b'] })
		const second = createWorkspaceWithLots({ names: ['0005-repo-c'] })
		writeStoreListFile({
			stores: [first, second].map((each) => realpathSync(each.workspace.store)),
		})

		expect(
			withJson(
				runLot({
					cwd: realpathSync(temporaryFolder('dialecte-outside-')),
					argv: ['status', '0005', '--json'],
				}),
			),
		).toEqual({
			exitCode: 2,
			json: { error: expect.stringMatching(/^0005 names several lots[^\n]*$/), next: null },
		})
	})

	it('a folder that is no lot (the store root) -> exit 2, JSON { error: one line, next: null }', () => {
		const workspace = createBriefWorkspace()
		writeStoreLot({ workspace, name: LOT, scope: ['src/'] })

		expect(
			withJson(
				runLot({
					cwd: workspace.repository,
					argv: ['status', realpathSync(workspace.store), '--json'],
				}),
			),
		).toEqual({
			exitCode: 2,
			json: { error: expect.stringMatching(/^[^\n]*is no lot folder[^\n]*$/), next: null },
		})
	})
})
