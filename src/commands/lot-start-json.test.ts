import { createHash } from 'node:crypto'
/** `lot start`: every --json exit is JSON, a link that cannot be made, bytes that are no UTF-8, --dry-run in a work tree. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { PLAN_TEXT } from '../../test/brief-workspace.constants.ts'
import { briefWith, writeStoreLot } from '../../test/brief-workspace.ts'
import {
	createdBy,
	createStartWorkspace,
	entriesOf,
	withJson,
	withJsonAndText,
	withLines,
} from '../../test/lot-start-workspace.ts'
import {
	INJECTED_BREAK_MESSAGE,
	INJECTED_LINK_MESSAGE,
	INJECTED_REFUSAL_MESSAGE,
	INJECTED_SYMLINK_MESSAGE,
	LOT_NAME,
	NON_UTF8_BYTE,
	OVERLAPPING_LOT,
	START_NOW,
} from '../../test/lot-start.constants.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { storeRefusal } from '../lib/store/publish.ts'
import { startLot } from './lot-start.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StartWorkspace } from '../../test/lot-start-workspace.types.ts'
import type { StartSeams } from './lot-start.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const STOP_LINE = `dialecte lot stop ${LOT_NAME} --reason <text>`

type JsonRow = {
	title: string
	exitCode: number
	/** Made before the start. */
	prepare?: (start: StartWorkspace) => void
	seams?: (start: StartWorkspace) => StartSeams
	/** What the JSON holds. */
	expected: (start: StartWorkspace) => Record<string, unknown>
	/** A text the raw output holds. */
	mention?: string
}

function failedJsonOf(params: { start: StartWorkspace; reason: string }): Record<string, unknown> {
	return {
		lot: LOT_NAME,
		folder: join(params.start.store, LOT_NAME),
		state: 'failed',
		reason: params.reason,
		next: STOP_LINE,
	}
}

const JSON_ROWS: JsonRow[] = [
	{
		title: 'the worktree cannot be made',
		exitCode: 1,
		seams: () => ({
			addWorktree: function refuse() {
				return 'a worktree folder is there already'
			},
		}),
		expected: (start) => failedJsonOf({ start, reason: 'a worktree folder is there already' }),
	},
	{
		title: 'the re-check finds an overlapping open lot',
		exitCode: 1,
		seams: (start) => ({
			afterClaimPick: function otherLotAppears() {
				writeStoreLot({
					workspace: start.workspace,
					name: OVERLAPPING_LOT,
					scope: ['src/dataflow'],
				})
			},
		}),
		expected: (start) =>
			failedJsonOf({
				start,
				reason: `overlap with ${OVERLAPPING_LOT}, started at the same time`,
			}),
	},
	{
		title: 'the hard-link probe is refused',
		exitCode: 2,
		seams: () => ({
			link: function refuse() {
				throw Object.assign(new Error(INJECTED_LINK_MESSAGE), { code: 'EPERM' })
			},
		}),
		expected: () => ({ next: null }),
		mention: INJECTED_LINK_MESSAGE,
	},
	{
		title: 'the store list sits inside a git work tree',
		exitCode: 2,
		prepare: (start) => {
			vi.stubEnv('XDG_STATE_HOME', join(start.workspace.repository, 'state'))
		},
		expected: () => ({ next: null }),
		mention: 'git work tree',
	},
	{
		title: 'the lot folder exists already (a damaged store)',
		exitCode: 1,
		seams: (start) => ({
			afterClaimPick: function folderAppears() {
				writeStoreLot({
					workspace: start.workspace,
					name: LOT_NAME,
					scope: ['docs/'],
					branch: 'feat/elsewhere',
				})
			},
		}),
		expected: () => ({ next: null }),
		mention: LOT_NAME,
	},
	{
		title: 'a step throws an error',
		exitCode: 1,
		seams: () => ({
			afterClaimPick: function breaks() {
				throw new Error(INJECTED_BREAK_MESSAGE)
			},
		}),
		expected: () => ({ next: null }),
		mention: INJECTED_BREAK_MESSAGE,
	},
	{
		title: 'a step throws a store refusal',
		exitCode: 2,
		seams: () => ({
			afterClaimPick: function refuses() {
				throw storeRefusal(INJECTED_REFUSAL_MESSAGE)
			},
		}),
		expected: () => ({ next: null }),
		mention: INJECTED_REFUSAL_MESSAGE,
	},
]

describe('lot start --json, every exit is JSON', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of JSON_ROWS)
		it(`${row.title} -> exit ${row.exitCode}, JSON with the next of that case`, () => {
			const start = createStartWorkspace()
			row.prepare?.(start)

			expect(
				withJsonAndText(
					startLot({
						cwd: start.cwd,
						argv: [start.workspace.briefPath, '--json'],
						now: START_NOW,
						seams: row.seams?.(start),
					}),
				),
			).toMatchObject({
				exitCode: row.exitCode,
				json: row.expected(start),
				text: expect.stringContaining(row.mention ?? ''),
			})
		})
})

describe(
	'lot start, the link cannot be made after the worktree exists',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		function failingSymlink(): never {
			throw new Error(INJECTED_SYMLINK_MESSAGE)
		}

		it('exit 0, the lot stays working, the worktree exists, a note names the reason, lot status reports the link missing', () => {
			const start = createStartWorkspace()
			const lotFolder = join(start.store, LOT_NAME)

			expect(
				withLines(
					startLot({
						cwd: start.cwd,
						argv: [start.workspace.briefPath],
						now: START_NOW,
						seams: { symlink: failingSymlink },
					}),
				),
			).toMatchObject({
				exitCode: 0,
				lines: expect.arrayContaining([
					expect.stringMatching(new RegExp(`^note: .*${INJECTED_SYMLINK_MESSAGE}`)),
				]),
			})
			expect(entriesOf(join(lotFolder, 'transitions'))).toEqual(['000001.json'])
			expect(existsSync(join(start.worktreesFolder, LOT_NAME))).toBe(true)
			expect(
				withJson(runLot({ cwd: start.workspace.repository, argv: ['status', LOT_NAME, '--json'] })),
			).toMatchObject({
				exitCode: 0,
				json: { state: 'working', checks: { worktree: 'present', link: 'missing' } },
			})
		})

		it('--json: exit 0 with notes naming the reason', () => {
			const start = createStartWorkspace()

			expect(
				withJson(
					startLot({
						cwd: start.cwd,
						argv: [start.workspace.briefPath, '--json'],
						now: START_NOW,
						seams: { symlink: failingSymlink },
					}),
				),
			).toMatchObject({
				exitCode: 0,
				json: { lot: LOT_NAME, notes: [expect.stringContaining(INJECTED_SYMLINK_MESSAGE)] },
			})
		})
	},
)

function sha256Of(bytes: Buffer): string {
	return createHash('sha256').update(bytes).digest('hex')
}

/** The brief and the plan as bytes, each holding a byte that is no UTF-8. */
function nonUtf8Files(): { brief: Buffer; plan: Buffer } {
	const marker = '@@'
	const text = JSON.stringify(briefWith({ goal: `one line ${marker}` }), null, 2)
	const [before, after] = text.split(marker)
	return {
		brief: Buffer.concat([
			Buffer.from(before),
			Buffer.from([NON_UTF8_BYTE]),
			Buffer.from(after),
			Buffer.from('\n'),
		]),
		plan: Buffer.concat([Buffer.from(PLAN_TEXT), Buffer.from([NON_UTF8_BYTE, 0x0a])]),
	}
}

type BytesRow = {
	title: string
	read: (params: { lotFolder: string; files: { brief: Buffer; plan: Buffer } }) => unknown
	expected: (files: { brief: Buffer; plan: Buffer }) => unknown
}

const BYTES_ROWS: BytesRow[] = [
	{
		title: 'brief.json holds exactly the bytes read',
		read: ({ lotFolder }) => readFileSync(join(lotFolder, 'brief.json')),
		expected: (files) => files.brief,
	},
	{
		title: 'plan.md holds exactly the bytes read',
		read: ({ lotFolder }) => readFileSync(join(lotFolder, 'plan.md')),
		expected: (files) => files.plan,
	},
	{
		title: 'identity.briefHash is the sha256 of the brief bytes',
		read: ({ lotFolder }) =>
			(JSON.parse(readFileSync(join(lotFolder, 'identity.json'), 'utf8')) as { briefHash: string })
				.briefHash,
		expected: (files) => sha256Of(files.brief),
	},
]

describe(
	'lot start, a brief and a plan holding a byte that is no UTF-8',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of BYTES_ROWS)
			it(`${row.title}`, () => {
				const start = createStartWorkspace()
				const files = nonUtf8Files()
				writeFileSync(start.workspace.briefPath, files.brief)
				writeFileSync(join(start.workspace.briefFolder, 'plan.md'), files.plan)

				expect(
					runLot({ cwd: start.cwd, argv: ['start', start.workspace.briefPath], now: START_NOW }),
				).toMatchObject({ exitCode: 0 })
				expect(row.read({ lotFolder: join(start.store, LOT_NAME), files })).toEqual(
					row.expected(files),
				)
			})
	},
)

describe(
	'lot start --dry-run with the store list inside a git work tree',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('exit 2 naming the work tree, nothing written', () => {
			const start = createStartWorkspace()
			const state = join(start.workspace.repository, 'state')
			vi.stubEnv('XDG_STATE_HOME', state)

			expect(
				runLot({
					cwd: start.cwd,
					argv: ['start', start.workspace.briefPath, '--dry-run'],
					now: START_NOW,
				}),
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
