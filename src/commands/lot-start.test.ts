/** `lot start <brief.json>` on a real temporary repository: the lot folder, the worktree, the link, the output, the options. */
import { createHash } from 'node:crypto'
import { readFileSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'

import { PLAN_TEXT } from '../../test/brief-workspace.constants.ts'
import { briefWith } from '../../test/brief-workspace.ts'
import {
	createdBy,
	createStartWorkspace,
	manualLineOf,
	recordOf,
	withJson,
	withLines,
} from '../../test/lot-start-workspace.ts'
import {
	BRIEF_BRANCH,
	BRIEF_BASE,
	LOT_NAME,
	START_NOW,
	START_USAGE,
} from '../../test/lot-start.constants.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { readCliVersion } from '../lib/read-cli-version.ts'
import { SCENARIOS } from '../lib/store/scenarios.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StartWorkspace } from '../../test/lot-start-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

function sha256Of(text: string): string {
	return createHash('sha256').update(text).digest('hex')
}

/** What a start of the default brief leaves, found from the workspace. */
type StartContext = {
	start: StartWorkspace
	briefText: string
	lotFolder: string
	worktree: string
}

function contextOf(start: StartWorkspace): StartContext {
	return {
		start,
		briefText: readFileSync(start.workspace.briefPath, 'utf8'),
		lotFolder: join(start.store, LOT_NAME),
		worktree: join(start.worktreesFolder, LOT_NAME),
	}
}

type LayoutRow = {
	title: string
	read: (context: StartContext) => unknown
	expected: (context: StartContext) => unknown
}

const LAYOUT_ROWS: LayoutRow[] = [
	{
		title: 'brief.json holds the bytes of the brief as given',
		read: (context) => readFileSync(join(context.lotFolder, 'brief.json'), 'utf8'),
		expected: (context) => context.briefText,
	},
	{
		title: 'plan.md holds the bytes of the plan',
		read: (context) => readFileSync(join(context.lotFolder, 'plan.md'), 'utf8'),
		expected: () => PLAN_TEXT,
	},
	{
		title: 'transition 000001 is working at step 0 of 1, cause start by engine (D4)',
		read: (context) => recordOf({ folder: context.lotFolder, name: 'transitions/000001.json' }),
		expected: () => ({
			seq: 1,
			at: START_NOW.toISOString(),
			lot: LOT_NAME,
			state: 'working',
			position: { step: 0, of: 1, station: null, round: null },
			cause: { kind: 'start', by: 'engine', reason: 'lot started' },
			question: null,
			simulated: false,
		}),
	},
	{
		title: 'identity.json holds the fields of D3 with real paths and both hashes',
		read: (context) => recordOf({ folder: context.lotFolder, name: 'identity.json' }),
		expected: (context) => ({
			schema: 1,
			name: LOT_NAME,
			index: '0001',
			repository: context.start.repository,
			store: context.start.store,
			worktree: context.worktree,
			branch: BRIEF_BRANCH,
			base: { ref: BRIEF_BASE, commit: context.start.workspace.commit },
			feature: 'dataflow-subscribe',
			effort: { level: 'medium', source: 'risk' },
			simulated: false,
			scenario: null,
			cli: readCliVersion(),
			briefHash: sha256Of(context.briefText),
			planHash: sha256Of(PLAN_TEXT),
			created: START_NOW.toISOString(),
		}),
	},
	{
		title: 'the numbered worktree is on the new branch',
		read: (context) => git({ root: context.worktree, args: ['branch', '--show-current'] }).trim(),
		expected: () => BRIEF_BRANCH,
	},
	{
		title: 'the numbered worktree is at the base commit',
		read: (context) => git({ root: context.worktree, args: ['rev-parse', 'HEAD'] }).trim(),
		expected: (context) => context.start.workspace.commit,
	},
	{
		title: '.dialecte/lot is a symbolic link with an absolute target: the lot folder',
		read: (context) => readlinkSync(join(context.worktree, '.dialecte', 'lot')),
		expected: (context) => context.lotFolder,
	},
	{
		title: 'the store list holds one line: the store',
		read: (context) => createdBy(context.start).storeList,
		expected: (context) => `${context.start.store}\n`,
	},
	{
		title: 'one index is claimed',
		read: (context) => createdBy(context.start).claims,
		expected: () => ['0001'],
	},
]

describe('lot start, a real start', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of LAYOUT_ROWS)
		it(`exit 0, then ${row.title}`, () => {
			const start = createStartWorkspace()
			const context = contextOf(start)

			expect(
				runLot({ cwd: start.cwd, argv: ['start', start.workspace.briefPath], now: START_NOW }),
			).toMatchObject({ exitCode: 0 })
			expect(row.read(context)).toEqual(row.expected(context))
		})

	it('--json names the full name, the folder, the worktree, runner manual and the manual next (D18)', () => {
		const start = createStartWorkspace()
		const context = contextOf(start)

		expect(
			withJson(
				runLot({
					cwd: start.cwd,
					argv: ['start', start.workspace.briefPath, '--json'],
					now: START_NOW,
				}),
			),
		).toMatchObject({
			exitCode: 0,
			json: {
				lot: LOT_NAME,
				folder: context.lotFolder,
				worktree: context.worktree,
				runner: 'manual',
				next: manualLineOf(LOT_NAME),
			},
		})
	})

	it('the text form names the full name, the folder, the worktree, runner: manual and next: <the manual line>', () => {
		const start = createStartWorkspace()
		const context = contextOf(start)

		expect(
			withLines(
				runLot({ cwd: start.cwd, argv: ['start', start.workspace.briefPath], now: START_NOW }),
			),
		).toMatchObject({
			exitCode: 0,
			lines: expect.arrayContaining([
				expect.stringContaining(LOT_NAME),
				expect.stringContaining(context.lotFolder),
				expect.stringContaining(context.worktree),
				'runner: manual',
				`next: ${manualLineOf(LOT_NAME)}`,
			]),
		})
	})
})

type EffortRow = {
	title: string
	briefEffort?: string
	flags: string[]
	expected: { level: string; source: string }
}

const EFFORT_ROWS: EffortRow[] = [
	{
		title: '--effort high',
		flags: ['--effort', 'high'],
		expected: { level: 'high', source: 'flag' },
	},
	{
		title: 'the brief says low, no flag',
		briefEffort: 'low',
		flags: ['--by', 'person-a', '--reason', 'x'],
		expected: { level: 'low', source: 'brief' },
	},
	{
		title: 'the brief says low and --effort high: the flag wins',
		briefEffort: 'low',
		flags: ['--effort', 'high'],
		expected: { level: 'high', source: 'flag' },
	},
	{ title: 'neither', flags: [], expected: { level: 'medium', source: 'risk' } },
]

describe('lot start, the effort', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of EFFORT_ROWS)
		it(`${row.title} -> identity.effort ${row.expected.level} from ${row.expected.source}`, () => {
			const start = createStartWorkspace({ brief: briefWith({ effort: row.briefEffort }) })

			expect(
				runLot({
					cwd: start.cwd,
					argv: ['start', start.workspace.briefPath, ...row.flags],
					now: START_NOW,
				}),
			).toMatchObject({ exitCode: 0 })
			expect(
				recordOf({ folder: join(start.store, LOT_NAME), name: 'identity.json' }),
			).toMatchObject({
				effort: row.expected,
			})
		})
})

type OptionRow = { title: string; words: (briefPath: string) => string[] }

const OPTION_ROWS: OptionRow[] = [
	{ title: 'no positional', words: () => [] },
	{ title: 'two positionals', words: (briefPath) => [briefPath, `${briefPath}.more`] },
	{ title: 'an unknown option', words: (briefPath) => [briefPath, '--bogus'] },
	{ title: 'a bad --effort', words: (briefPath) => [briefPath, '--effort', 'extreme'] },
	{ title: '--effort without a value', words: (briefPath) => [briefPath, '--effort'] },
]

describe('lot start, the options (D8)', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('--simulate with an unknown scenario -> exit 2 naming every scenario, nothing created', () => {
		const start = createStartWorkspace()
		const result = runLot({
			cwd: start.cwd,
			argv: ['start', start.workspace.briefPath, '--simulate', 'x'],
			now: START_NOW,
		})

		expect({
			exitCode: result.exitCode,
			named: Object.keys(SCENARIOS).filter((name) => result.output.includes(name)),
			created: createdBy(start),
		}).toEqual({
			exitCode: 2,
			named: Object.keys(SCENARIOS),
			created: { claims: [], lots: [], worktrees: [], storeList: undefined },
		})
	})

	for (const row of OPTION_ROWS)
		it(`${row.title} -> exit 2 with the lot usage, nothing created`, () => {
			const start = createStartWorkspace()
			const argv = ['start', ...row.words(start.workspace.briefPath)]

			expect(runLot({ cwd: start.cwd, argv, now: START_NOW })).toMatchObject({
				exitCode: 2,
				output: expect.stringContaining(START_USAGE),
			})
			expect(runLot({ cwd: start.cwd, argv, now: START_NOW }).output).toBe(renderLotUsage())
			expect(createdBy(start)).toEqual({
				claims: [],
				lots: [],
				worktrees: [],
				storeList: undefined,
			})
		})
})
