/**
 * `lot start`'s one question (D13, case 32): the effort asked on a terminal, through `runLotCommand`'s `isTerminal`
 * and `ask` seams (a test never opens a terminal). Each case starts a real lot in a scratch repository.
 */
import { join } from 'node:path'

import {
	createRiskWorkspace,
	identityEffortOf,
	noCreation,
	startedCreation,
} from '../../test/lot-start-risk-workspace.ts'
import {
	AWAY_SCOPE,
	DECLARED_GLOB,
	DECLARED_SCOPE,
	DECLARING_PACKAGE_JSON,
} from '../../test/lot-start-risk.constants.ts'
import { createdBy } from '../../test/lot-start-workspace.ts'
import { LOT_NAME, START_NOW } from '../../test/lot-start.constants.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { readRiskRecords } from '../lib/risk/risk-records.ts'
import { runLotCommand } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StartWorkspace } from '../../test/lot-start-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const AT = START_NOW.toISOString()

type NotAskedRow = {
	title: string
	isTerminal: boolean
	flags: string[]
	briefEffort?: string
	/** The effort the identity holds; undefined when nothing is written. */
	effort?: { level: string; source: string }
	output: unknown
	created: (start: StartWorkspace) => unknown
}

const MEDIUM_LINE = 'effort medium (risk) · risk class medium: no declared path'

const NOT_ASKED_ROWS: NotAskedRow[] = [
	{
		title: 'case 32: not a terminal',
		isTerminal: false,
		flags: [],
		effort: { level: 'medium', source: 'risk' },
		output: expect.stringContaining(MEDIUM_LINE),
		created: startedCreation,
	},
	{
		title: 'case 32: --json on a terminal',
		isTerminal: true,
		flags: ['--json'],
		effort: { level: 'medium', source: 'risk' },
		output: expect.stringContaining('"riskClass"'),
		created: startedCreation,
	},
	{
		title: '--dry-run on a terminal',
		isTerminal: true,
		flags: ['--dry-run'],
		output: expect.stringContaining(MEDIUM_LINE),
		created: noCreation,
	},
	{
		title: '--effort on a terminal',
		isTerminal: true,
		flags: ['--effort', 'high'],
		effort: { level: 'high', source: 'flag' },
		output: expect.stringContaining('effort high (flag) · risk class medium: no declared path'),
		created: startedCreation,
	},
	{
		title: 'a brief that names an effort, on a terminal',
		isTerminal: true,
		briefEffort: 'high',
		flags: [],
		effort: { level: 'high', source: 'brief' },
		output: expect.stringContaining('effort high (brief) · risk class medium: no declared path'),
		created: startedCreation,
	},
]

/** One `lot start` through `runLotCommand` with the answers an `ask` reads; what it returned and what it asked. */
async function outcomeOf(params: {
	start: StartWorkspace
	flags: string[]
	isTerminal: boolean
	answers: string[]
}): Promise<{ exitCode: number; output: string; prompts: string[] }> {
	const answers = [...params.answers]
	const prompts: string[] = []
	async function ask(question: { prompt: string }): Promise<string> {
		prompts.push(question.prompt)
		return answers.shift() ?? ''
	}
	const result = await runLotCommand({
		cwd: params.start.cwd,
		argv: ['start', params.start.workspace.briefPath, ...params.flags],
		isTerminal: params.isTerminal,
		ask,
		now: START_NOW,
	})
	return { exitCode: result.exitCode, output: result.output, prompts }
}

describe('lot start, never asked', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of NOT_ASKED_ROWS)
		it(`${row.title} -> the question is not asked`, async () => {
			const start = createRiskWorkspace({
				packageJson: DECLARING_PACKAGE_JSON,
				scope: AWAY_SCOPE,
				effort: row.briefEffort,
			})

			await expect(
				outcomeOf({ start, flags: row.flags, isTerminal: row.isTerminal, answers: ['low'] }),
			).resolves.toEqual({ exitCode: 0, output: row.output, prompts: [] })
			expect({
				effort: identityEffortOf(join(start.store, LOT_NAME)),
				created: createdBy(start),
			}).toEqual({ effort: row.effort, created: row.created(start) })
		})
})

type AskedRow = {
	title: string
	scope: string
	answers: string[]
	flags: string[]
	/** The prompts printed, one per answer read. */
	prompts: string[]
	/** The identity's effort; undefined when the start is refused. */
	effort?: { level: string; source: string }
	exitCode: number
	output: unknown
	effortRecords: unknown[]
	created: (start: StartWorkspace) => unknown
}

const MEDIUM_PROMPT = 'effort for risk class medium [medium]: '
const HIGH_PROMPT = 'effort for risk class high [high]: '
const BELOW_HIGH = `lot start: effort low is below risk class high (${DECLARED_GLOB}): add --by <who> --reason <text>`

const ASKED_ROWS: AskedRow[] = [
	{
		title: 'an empty answer on a medium scope takes medium',
		scope: AWAY_SCOPE,
		answers: [''],
		flags: [],
		prompts: [MEDIUM_PROMPT],
		effort: { level: 'medium', source: 'asked' },
		exitCode: 0,
		output: expect.stringContaining('effort medium (asked) · risk class medium: no declared path'),
		effortRecords: [],
		created: startedCreation,
	},
	{
		title: 'an empty answer on a declared scope takes high',
		scope: DECLARED_SCOPE,
		answers: [''],
		flags: [],
		prompts: [HIGH_PROMPT],
		effort: { level: 'high', source: 'asked' },
		exitCode: 0,
		output: expect.stringContaining(`effort high (asked) · risk class high: ${DECLARED_GLOB}`),
		effortRecords: [],
		created: startedCreation,
	},
	{
		title: 'high on a medium scope',
		scope: AWAY_SCOPE,
		answers: ['high'],
		flags: [],
		prompts: [MEDIUM_PROMPT],
		effort: { level: 'high', source: 'asked' },
		exitCode: 0,
		output: expect.stringContaining('effort high (asked) · risk class medium: no declared path'),
		effortRecords: [],
		created: startedCreation,
	},
	{
		title: 'a word out of the list asks again',
		scope: AWAY_SCOPE,
		answers: ['extreme', 'high'],
		flags: [],
		prompts: [MEDIUM_PROMPT, MEDIUM_PROMPT],
		effort: { level: 'high', source: 'asked' },
		exitCode: 0,
		output: expect.stringContaining('effort high (asked) · risk class medium: no declared path'),
		effortRecords: [],
		created: startedCreation,
	},
	{
		title: 'three words out of the list -> usage exit 2',
		scope: AWAY_SCOPE,
		answers: ['a', 'b', 'c'],
		flags: [],
		prompts: [MEDIUM_PROMPT, MEDIUM_PROMPT, MEDIUM_PROMPT],
		exitCode: 2,
		output: renderLotUsage(),
		effortRecords: [],
		created: noCreation,
	},
	{
		title: 'low on a declared scope without --by and --reason -> exit 2',
		scope: DECLARED_SCOPE,
		answers: ['low'],
		flags: [],
		prompts: [HIGH_PROMPT],
		exitCode: 2,
		output: BELOW_HIGH,
		effortRecords: [],
		created: noCreation,
	},
	{
		title: 'low on a declared scope with --by and --reason -> started, recorded',
		scope: DECLARED_SCOPE,
		answers: ['low'],
		flags: ['--by', 'person-a', '--reason', 'x'],
		prompts: [HIGH_PROMPT],
		effort: { level: 'low', source: 'asked' },
		exitCode: 0,
		output: expect.stringContaining(`effort low (asked) · risk class high: ${DECLARED_GLOB}`),
		effortRecords: [
			{ schema: 1, kind: 'effort', at: AT, effort: 'low', by: 'person-a', reason: 'x' },
		],
		created: startedCreation,
	},
]

describe('lot start, asked on a terminal', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of ASKED_ROWS)
		it(`${row.title}`, async () => {
			const start = createRiskWorkspace({ packageJson: DECLARING_PACKAGE_JSON, scope: row.scope })
			const lotFolder = join(start.store, LOT_NAME)

			await expect(
				outcomeOf({ start, flags: row.flags, isTerminal: true, answers: row.answers }),
			).resolves.toEqual({ exitCode: row.exitCode, output: row.output, prompts: row.prompts })
			expect({
				effort: identityEffortOf(lotFolder),
				effortRecords: readRiskRecords({ folder: lotFolder }).effort,
				created: createdBy(start),
			}).toEqual({
				effort: row.effort,
				effortRecords: row.effortRecords,
				created: row.created(start),
			})
		})
})

describe('lot start, the input closes', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the ask rejects -> exit 2, no answer to the question, nothing created', async () => {
		const start = createRiskWorkspace({ packageJson: DECLARING_PACKAGE_JSON, scope: AWAY_SCOPE })
		async function closedInput(): Promise<string> {
			throw new Error('input closed')
		}

		await expect(
			runLotCommand({
				cwd: start.cwd,
				argv: ['start', start.workspace.briefPath],
				isTerminal: true,
				ask: closedInput,
				now: START_NOW,
			}),
		).resolves.toEqual({
			exitCode: 2,
			output: 'lot start: no answer to the effort question',
		})
		expect(createdBy(start)).toEqual(noCreation())
	})
})
