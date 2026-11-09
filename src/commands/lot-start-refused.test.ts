/** `lot start` refusing: a refused brief, `--dry-run`, a store list inside a work tree, a file system without hard links. */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { briefWith, refusalKeysOf, writeStoreLot } from '../../test/brief-workspace.ts'
import {
	createdBy,
	createStartWorkspace,
	withJson,
	withLines,
	withSortedLines,
} from '../../test/lot-start-workspace.ts'
import {
	BRIEF_BRANCH,
	INJECTED_LINK_MESSAGE,
	LINK_REFUSAL_CODES,
	LOT_NAME,
	START_NOW,
} from '../../test/lot-start.constants.ts'
import { git } from '../../test/scratch-repository.ts'
import { writeRecordFile } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { shellQuote } from '../lib/shell-quote.ts'
import { startLot } from './lot-start.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'
import type { StartWorkspace } from '../../test/lot-start-workspace.types.ts'
import type { Refusal } from '../lib/store/store.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const TAKEN_LOT = '0003-repo-taken'

type RefusedRow = {
	title: string
	/** What the workspace holds before the start. */
	prepare?: (workspace: BriefWorkspace) => void
	brief: Record<string, unknown>
	keys: string[]
	/** A text every refusal's detail together holds. */
	detail?: string
}

const REFUSED_ROWS: RefusedRow[] = [
	{
		title: 'a misspelt key -> shape, the scope missing too',
		brief: briefWith({ scope: undefined, scopes: ['src/dataflow/'] }),
		keys: ['shape:scope', 'shape:scopes'],
	},
	{
		title: 'a base that resolves to no commit -> base',
		brief: briefWith({ base: 'no-such-ref' }),
		keys: ['base:base'],
	},
	{
		title: 'case 5: a branch another real lot holds -> branch-exists naming that lot',
		prepare: function holdTheBranch(workspace) {
			git({ root: workspace.repository, args: ['branch', BRIEF_BRANCH] })
			writeStoreLot({
				workspace,
				name: TAKEN_LOT,
				scope: ['lib/other'],
				branch: BRIEF_BRANCH,
			})
		},
		brief: briefWith(),
		keys: ['branch-exists:branch'],
		detail: TAKEN_LOT,
	},
	{
		title: 'a scope entry an open real lot holds -> overlap naming that lot',
		prepare: function holdTheScope(workspace) {
			writeStoreLot({ workspace, name: TAKEN_LOT, scope: ['src/dataflow'] })
		},
		brief: briefWith(),
		keys: ['overlap:scope'],
		detail: TAKEN_LOT,
	},
]

const MODES: Array<{ title: string; flags: string[] }> = [
	{ title: 'lot start', flags: [] },
	{ title: 'lot start --dry-run', flags: ['--dry-run'] },
]

describe('a refused brief', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const mode of MODES)
		for (const row of REFUSED_ROWS)
			it(`${mode.title}, ${row.title} -> exit 2 with { refused }, nothing created`, () => {
				const start = createStartWorkspace({ brief: row.brief })
				row.prepare?.(start.workspace)
				const before = createdBy(start)

				expect(
					withJson(
						runLot({
							cwd: start.cwd,
							argv: ['start', start.workspace.briefPath, '--json', ...mode.flags],
							now: START_NOW,
						}),
					),
				).toMatchObject({ exitCode: 2, json: { refused: expect.any(Array) } })
				const { json } = withJson(
					runLot({
						cwd: start.cwd,
						argv: ['start', start.workspace.briefPath, '--json', ...mode.flags],
						now: START_NOW,
					}),
				)
				const refused = (json as { refused: Refusal[] }).refused
				expect(refusalKeysOf(refused)).toEqual(row.keys)
				expect(refused.map((refusal) => refusal.detail).join('\n')).toContain(row.detail ?? '')
				expect(createdBy(start)).toEqual(before)
				expect(existsSync(start.worktreesFolder)).toBe(false)
			})

	it('the text form is one line per refusal: <field>: <rule> - <detail>', () => {
		const start = createStartWorkspace({
			brief: briefWith({ base: 'no-such-ref', scope: undefined, scopes: ['src/'] }),
		})

		expect(
			withSortedLines(
				runLot({ cwd: start.cwd, argv: ['start', start.workspace.briefPath], now: START_NOW }),
			),
		).toEqual({
			exitCode: 2,
			lines: [
				expect.stringMatching(/^base: base - .+/),
				expect.stringMatching(/^scope: shape - .+/),
				expect.stringMatching(/^scopes: shape - .+/),
			],
		})
	})
})

/** The claims of the workspace's index folder: one empty file per index taken. */
function claimOf(params: { start: StartWorkspace; index: string }): void {
	writeRecordFile({
		folder: join(params.start.worktreesFolder, '.index'),
		name: params.index,
		text: '',
	})
}

describe('lot start --dry-run', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('exit 0: prints the name with the next index and the worktree it would make, writes and claims nothing', () => {
		const start = createStartWorkspace()
		claimOf({ start, index: '0004' })
		const would = '0005-repo-dataflow-subscribe'
		const before = {
			created: createdBy(start),
			branches: git({ root: start.repository, args: ['branch', '--list'] }),
			worktrees: git({ root: start.repository, args: ['worktree', 'list'] }),
		}

		expect(
			runLot({
				cwd: start.cwd,
				argv: ['start', start.workspace.briefPath, '--dry-run'],
				now: START_NOW,
			}),
		).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining(join(start.worktreesFolder, would)),
		})
		expect(
			withLines(
				runLot({
					cwd: start.cwd,
					argv: ['start', start.workspace.briefPath, '--dry-run'],
					now: START_NOW,
				}),
			),
		).toMatchObject({
			exitCode: 0,
			lines: expect.arrayContaining([
				expect.stringMatching(/checks/i),
				expect.stringContaining(would),
			]),
		})
		expect({
			created: createdBy(start),
			branches: git({ root: start.repository, args: ['branch', '--list'] }),
			worktrees: git({ root: start.repository, args: ['worktree', 'list'] }),
		}).toEqual(before)
		expect(createdBy(start)).toEqual({
			claims: ['0004'],
			lots: [],
			worktrees: [],
			storeList: undefined,
		})
		expect(existsSync(start.store)).toBe(false)
	})

	it('--json: { dryRun: true, lot, worktree, next } and no name key (E3)', () => {
		const start = createStartWorkspace()

		expect(
			withJson(
				runLot({
					cwd: start.cwd,
					argv: ['start', start.workspace.briefPath, '--dry-run', '--json'],
					now: START_NOW,
				}),
			),
		).toEqual({
			exitCode: 0,
			json: {
				dryRun: true,
				lot: LOT_NAME,
				worktree: join(start.worktreesFolder, LOT_NAME),
				next: `dialecte lot start ${shellQuote(start.workspace.briefPath)}`,
			},
		})
	})
})

describe(
	'lot start, the store list inside a git work tree',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('XDG_STATE_HOME inside a repository -> exit 2 naming the work tree, nothing created', () => {
			const start = createStartWorkspace()
			const state = join(start.workspace.repository, 'state')
			vi.stubEnv('XDG_STATE_HOME', state)

			expect(
				runLot({ cwd: start.cwd, argv: ['start', start.workspace.briefPath], now: START_NOW }),
			).toMatchObject({ exitCode: 2, output: expect.stringContaining(start.workspace.repository) })
			expect(existsSync(state)).toBe(false)
			expect(createdBy(start)).toEqual({
				claims: [],
				lots: [],
				worktrees: [],
				storeList: undefined,
			})
		})
	},
)

describe(
	'lot start, a file system without hard links (D6, case 29)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const code of LINK_REFUSAL_CODES)
			it(`link failing with ${code} -> exit 2 with the reason, no list line, no claim, no lot folder`, () => {
				const start = createStartWorkspace()
				const refusing = Object.assign(new Error(INJECTED_LINK_MESSAGE), { code })

				expect(
					startLot({
						cwd: start.cwd,
						argv: [start.workspace.briefPath],
						now: START_NOW,
						seams: {
							link: function refuse() {
								throw refusing
							},
						},
					}),
				).toMatchObject({ exitCode: 2, output: expect.stringContaining(INJECTED_LINK_MESSAGE) })
				expect(createdBy(start)).toEqual({
					claims: [],
					lots: [],
					worktrees: [],
					storeList: undefined,
				})
				expect(existsSync(start.worktreesFolder)).toBe(false)
			})
	},
)
