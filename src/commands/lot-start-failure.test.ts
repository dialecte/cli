/** `lot start` when the worktree cannot be made, when the base ref moves, when two starts meet at the claim. */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from '../../test/brief-workspace.ts'
import {
	addOtherRepository,
	createdBy,
	createStartWorkspace,
	entriesOf,
	recordOf,
	withJson,
} from '../../test/lot-start-workspace.ts'
import {
	BRIEF_BRANCH,
	INJECTED_WORKTREE_MESSAGE,
	LOT_NAME,
	OTHER_LOT_NAME,
	START_NOW,
} from '../../test/lot-start.constants.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { startLot } from './lot-start.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { AddWorktreeFunction } from './lot-start.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const OVERLAPPING_LOT = '0003-repo-taken'

type FailureRow = {
	title: string
	/** The worktree maker the start gets; none: the real one. */
	addWorktree?: AddWorktreeFunction
	/** Made in the repository before the start. */
	prepare?: (repository: string) => void
	/** What the failed transition's reason is. */
	reason: unknown
	/** A text the command's output holds. */
	outputPart?: string
	/** Whether the brief's branch exists after the failure (nothing is removed). */
	branchStays: boolean
}

/** The maker that makes the branch, then throws (a failure after the branch exists). */
function makeBranchThenThrow(params: Parameters<AddWorktreeFunction>[0]): never {
	git({ root: params.repository, args: ['branch', params.branch, params.from ?? 'HEAD'] })
	throw new Error(INJECTED_WORKTREE_MESSAGE)
}

const FAILURE_ROWS: FailureRow[] = [
	{
		title: 'addWorktree refuses with a text -> that text',
		addWorktree: function refuse() {
			return 'a worktree folder is there already'
		},
		reason: 'a worktree folder is there already',
		outputPart: 'a worktree folder is there already',
		branchStays: false,
	},
	{
		title: 'addWorktree throws and the branch does not exist -> the message alone',
		addWorktree: function throwAtOnce() {
			throw new Error(INJECTED_WORKTREE_MESSAGE)
		},
		reason: INJECTED_WORKTREE_MESSAGE,
		outputPart: INJECTED_WORKTREE_MESSAGE,
		branchStays: false,
	},
	{
		title:
			'addWorktree throws after making the branch -> the reason says a retry meets branch-exists',
		addWorktree: makeBranchThenThrow,
		reason: `${INJECTED_WORKTREE_MESSAGE}; the branch ${BRIEF_BRANCH} was made: a retry meets branch-exists`,
		outputPart: 'a retry meets branch-exists',
		branchStays: true,
	},
	{
		title:
			'real git refusing (a branch named feat blocks feat/dataflow-subscribe) -> an error text, no branch-exists remark',
		prepare: function blockTheBranchName(repository) {
			git({ root: repository, args: ['branch', 'feat'] })
		},
		reason: expect.stringMatching(/^(?!.*branch-exists).+$/s),
		branchStays: false,
	},
]

describe('lot start, the worktree cannot be made', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of FAILURE_ROWS)
		it(`${row.title} -> exit 1, a failed transition (cause fail), the lot folder kept, nothing removed`, () => {
			const start = createStartWorkspace()
			row.prepare?.(start.repository)
			const lotFolder = join(start.store, LOT_NAME)

			expect(
				startLot({
					cwd: start.cwd,
					argv: [start.workspace.briefPath],
					now: START_NOW,
					seams: row.addWorktree ? { addWorktree: row.addWorktree } : undefined,
				}),
			).toMatchObject({ exitCode: 1, output: expect.stringContaining(row.outputPart ?? '') })
			expect(entriesOf(join(lotFolder, 'transitions'))).toEqual(['000001.json', '000002.json'])
			expect(
				git({ root: start.repository, args: ['branch', '--list', BRIEF_BRANCH] }).trim() !== '',
			).toBe(row.branchStays)
			expect(recordOf({ folder: lotFolder, name: 'transitions/000002.json' })).toMatchObject({
				seq: 2,
				at: START_NOW.toISOString(),
				lot: LOT_NAME,
				state: 'failed',
				position: { step: 0, of: 1, station: null, round: null },
				cause: { kind: 'fail', by: 'engine', reason: row.reason },
				simulated: false,
			})
			expect(entriesOf(lotFolder)).toEqual(
				expect.arrayContaining(['brief.json', 'identity.json', 'plan.md', 'transitions']),
			)
			expect(createdBy(start)).toMatchObject({ claims: ['0001'], lots: [LOT_NAME], worktrees: [] })
		})

	it('the worktree maker gets the repository, the branch, the recorded base commit and the claimed index', () => {
		const start = createStartWorkspace()
		const received: Array<Record<string, unknown>> = []

		expect(
			startLot({
				cwd: start.cwd,
				argv: [start.workspace.briefPath],
				now: START_NOW,
				seams: {
					addWorktree: function record(params) {
						received.push(params)
						return 'recorded'
					},
				},
			}),
		).toMatchObject({ exitCode: 1 })
		expect(received).toEqual([
			{
				repository: start.repository,
				branch: BRIEF_BRANCH,
				from: start.workspace.commit,
				index: '0001',
				now: START_NOW,
			},
		])
	})
})

describe('lot start, two starts and a moving ref', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('case 6: the base ref moves after the check -> the lot and its worktree keep the recorded commit', () => {
		const start = createStartWorkspace()

		expect(
			startLot({
				cwd: start.cwd,
				argv: [start.workspace.briefPath],
				now: START_NOW,
				seams: {
					afterClaimPick: function moveTheBase() {
						git({
							root: start.repository,
							args: ['commit', '--allow-empty', '-q', '-m', 'chore: main moved'],
						})
					},
				},
			}),
		).toMatchObject({ exitCode: 0 })
		expect({
			baseOfLot: (
				recordOf({ folder: join(start.store, LOT_NAME), name: 'identity.json' }) as {
					base: { commit: string }
				}
			).base.commit,
			worktreeHead: git({
				root: join(start.worktreesFolder, LOT_NAME),
				args: ['rev-parse', 'HEAD'],
			}).trim(),
			mainHasMoved:
				git({ root: start.repository, args: ['rev-parse', 'main'] }).trim() !==
				start.workspace.commit,
		}).toEqual({
			baseOfLot: start.workspace.commit,
			worktreeHead: start.workspace.commit,
			mainHasMoved: true,
		})
	})

	it('case 8 through startLot: an overlapping open lot appears between the check and the claim -> exit 1, this lot failed (overlap) naming it, no worktree, no branch, no link', () => {
		const start = createStartWorkspace()
		const lotFolder = join(start.store, LOT_NAME)

		expect(
			startLot({
				cwd: start.cwd,
				argv: [start.workspace.briefPath],
				now: START_NOW,
				seams: {
					afterClaimPick: function otherLotAppears() {
						writeStoreLot({
							workspace: start.workspace,
							name: OVERLAPPING_LOT,
							scope: ['src/dataflow'],
						})
					},
				},
			}),
		).toMatchObject({ exitCode: 1, output: expect.stringContaining(OVERLAPPING_LOT) })
		expect(entriesOf(join(lotFolder, 'transitions'))).toEqual(['000001.json', '000002.json'])
		expect(recordOf({ folder: lotFolder, name: 'transitions/000002.json' })).toMatchObject({
			seq: 2,
			at: START_NOW.toISOString(),
			lot: LOT_NAME,
			state: 'failed',
			position: { step: 0, of: 1, station: null, round: null },
			cause: {
				kind: 'overlap',
				by: 'engine',
				reason: `overlap with ${OVERLAPPING_LOT}, started at the same time`,
			},
		})
		expect({
			worktrees: createdBy(start).worktrees,
			worktreeFolder: existsSync(join(start.worktreesFolder, LOT_NAME)),
			branch: git({ root: start.repository, args: ['branch', '--list', BRIEF_BRANCH] }).trim(),
		}).toEqual({ worktrees: [], worktreeFolder: false, branch: '' })
	})

	it('case 32: a start of another repository of the workspace runs between the pick and the claim -> two different indexes', () => {
		const start = createStartWorkspace()
		const otherBrief = addOtherRepository(start)
		const meanwhile: CommandResult[] = []

		expect(
			withJson(
				startLot({
					cwd: start.cwd,
					argv: [start.workspace.briefPath, '--json'],
					now: START_NOW,
					seams: {
						afterClaimPick: function startTheOther() {
							meanwhile.push(
								startLot({ cwd: start.cwd, argv: [otherBrief, '--json'], now: START_NOW }),
							)
						},
					},
				}),
			),
		).toMatchObject({ exitCode: 0, json: { lot: '0002-repo-dataflow-subscribe' } })
		expect(meanwhile.map((result) => withJson(result))).toMatchObject([
			{ exitCode: 0, json: { lot: OTHER_LOT_NAME } },
		])
		expect(
			existsSync(join(start.worktreesFolder, '.index'))
				? readdirSync(join(start.worktreesFolder, '.index')).sort()
				: [],
		).toEqual(['0001', '0002'])
	})
})
