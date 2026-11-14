/**
 * `lot start`'s effort from the risk class (33L1 section 5, cases 26, 27, 32 without the terminal, 35): the class of
 * the brief's scope over the repository's declared list, the effort line below the class, `risk.jsonl` published
 * with the folder. Each case starts a real lot in a scratch repository.
 */
import { join } from 'node:path'

import { FIRST_WORD } from '../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../test/forbidden-words-workspace.ts'
import { createRiskWorkspace, identityEffortOf } from '../../test/lot-start-risk-workspace.ts'
import {
	AWAY_SCOPE,
	BROAD_LOT_PATH,
	BROAD_REASONS,
	BROAD_SCOPE,
	DECLARED_GLOB,
	DECLARED_REASONS,
	FOLDER_REASONS,
	FOLDER_SCOPE,
	DECLARED_SCOPE,
	DECLARING_PACKAGE_JSON,
	NOTHING_CREATED,
	PLAIN_PACKAGE_JSON,
} from '../../test/lot-start-risk.constants.ts'
import { createdBy, withJson, withLines } from '../../test/lot-start-workspace.ts'
import { LOT_NAME, START_NOW } from '../../test/lot-start.constants.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { readRiskRecords } from '../lib/risk/risk-records.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const AT = START_NOW.toISOString()

type StartedRow = {
	title: string
	packageJson: string
	scope: string
	lotPath?: string
	briefEffort?: string
	flags: string[]
	effort: { level: string; source: string }
	riskClass: { class: string; reasons: unknown[] }
	/** The line a start prints for the effort. */
	effortLine: string
	/** The effort lines `risk.jsonl` holds. */
	effortRecords: unknown[]
	/** The lines that say the effort is below the class; none when empty. */
	belowLines: string[]
}

const STARTED_ROWS: StartedRow[] = [
	{
		title: 'declared scope, nothing given',
		packageJson: DECLARING_PACKAGE_JSON,
		scope: DECLARED_SCOPE,
		flags: [],
		effort: { level: 'high', source: 'risk' },
		riskClass: { class: 'high', reasons: DECLARED_REASONS },
		effortLine: `effort high (risk) · risk class high: ${DECLARED_GLOB}`,
		effortRecords: [],
		belowLines: [],
	},
	{
		title: "a declared glob's own folder, with its trailing slash",
		packageJson: DECLARING_PACKAGE_JSON,
		scope: FOLDER_SCOPE,
		flags: [],
		effort: { level: 'high', source: 'risk' },
		riskClass: { class: 'high', reasons: FOLDER_REASONS },
		effortLine: `effort high (risk) · risk class high: ${DECLARED_GLOB}`,
		effortRecords: [],
		belowLines: [],
	},
	{
		title: 'case 35: src/** that may reach a declared glob',
		packageJson: DECLARING_PACKAGE_JSON,
		scope: BROAD_SCOPE,
		lotPath: BROAD_LOT_PATH,
		flags: [],
		effort: { level: 'high', source: 'risk' },
		riskClass: { class: 'high', reasons: BROAD_REASONS },
		effortLine: `effort high (risk) · risk class high: broad scope: may touch ${DECLARED_GLOB}`,
		effortRecords: [],
		belowLines: [],
	},
	{
		title: 'scope away from the declared list',
		packageJson: DECLARING_PACKAGE_JSON,
		scope: AWAY_SCOPE,
		flags: [],
		effort: { level: 'medium', source: 'risk' },
		riskClass: { class: 'medium', reasons: [] },
		effortLine: 'effort medium (risk) · risk class medium: no declared path',
		effortRecords: [],
		belowLines: [],
	},
	{
		title: 'no list declared, a store path',
		packageJson: PLAIN_PACKAGE_JSON,
		scope: DECLARED_SCOPE,
		flags: [],
		effort: { level: 'medium', source: 'risk' },
		riskClass: { class: 'medium', reasons: [] },
		effortLine: 'effort medium (risk) · risk class medium: no declared path',
		effortRecords: [],
		belowLines: [],
	},
	{
		title: 'case 27: --effort low with --by and --reason',
		packageJson: DECLARING_PACKAGE_JSON,
		scope: DECLARED_SCOPE,
		flags: ['--effort', 'low', '--by', 'person-a', '--reason', 'x'],
		effort: { level: 'low', source: 'flag' },
		riskClass: { class: 'high', reasons: DECLARED_REASONS },
		effortLine: `effort low (flag) · risk class high: ${DECLARED_GLOB}`,
		effortRecords: [
			{ schema: 1, kind: 'effort', at: AT, effort: 'low', by: 'person-a', reason: 'x' },
		],
		belowLines: ['! effort low below risk class high (by person-a: x)'],
	},
	{
		title: 'brief effort low with --by and --reason',
		packageJson: DECLARING_PACKAGE_JSON,
		scope: DECLARED_SCOPE,
		briefEffort: 'low',
		flags: ['--by', 'person-a', '--reason', 'x'],
		effort: { level: 'low', source: 'brief' },
		riskClass: { class: 'high', reasons: DECLARED_REASONS },
		effortLine: `effort low (brief) · risk class high: ${DECLARED_GLOB}`,
		effortRecords: [
			{ schema: 1, kind: 'effort', at: AT, effort: 'low', by: 'person-a', reason: 'x' },
		],
		belowLines: ['! effort low below risk class high (by person-a: x)'],
	},
	{
		title:
			'--effort high on a declared scope with --by and --reason: at the class, recorded, no ! line',
		packageJson: DECLARING_PACKAGE_JSON,
		scope: DECLARED_SCOPE,
		flags: ['--effort', 'high', '--by', 'person-a', '--reason', 'x'],
		effort: { level: 'high', source: 'flag' },
		riskClass: { class: 'high', reasons: DECLARED_REASONS },
		effortLine: `effort high (flag) · risk class high: ${DECLARED_GLOB}`,
		effortRecords: [
			{ schema: 1, kind: 'effort', at: AT, effort: 'high', by: 'person-a', reason: 'x' },
		],
		belowLines: [],
	},
	{
		title: '--effort high on a medium scope, nothing else: above the class, no record',
		packageJson: DECLARING_PACKAGE_JSON,
		scope: AWAY_SCOPE,
		flags: ['--effort', 'high'],
		effort: { level: 'high', source: 'flag' },
		riskClass: { class: 'medium', reasons: [] },
		effortLine: 'effort high (flag) · risk class medium: no declared path',
		effortRecords: [],
		belowLines: [],
	},
]

describe('lot start, the risk class and the effort', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of STARTED_ROWS)
		it(`${row.title} -> started, effort ${row.effort.level} from ${row.effort.source}`, () => {
			const start = createRiskWorkspace({
				packageJson: row.packageJson,
				scope: row.scope,
				lotPath: row.lotPath,
				effort: row.briefEffort,
			})
			const lotFolder = join(start.store, LOT_NAME)

			const result = runLot({
				cwd: start.cwd,
				argv: ['start', start.workspace.briefPath, ...row.flags],
				now: START_NOW,
			})

			expect({
				exitCode: result.exitCode,
				effort: identityEffortOf(lotFolder),
				records: readRiskRecords({ folder: lotFolder }),
				effortLinePrinted: result.output.split('\n').includes(row.effortLine),
				belowLinePrinted: result.output.split('\n').filter((line) => line.startsWith('! effort')),
			}).toEqual({
				exitCode: 0,
				effort: row.effort,
				records: {
					effort: row.effortRecords,
					derived: [
						{
							schema: 1,
							kind: 'derived',
							at: AT,
							class: row.riskClass.class,
							reasons: row.riskClass.reasons,
							from: 'start',
						},
					],
					skipped: 0,
				},
				effortLinePrinted: true,
				belowLinePrinted: row.belowLines,
			})
		})

	it('--json holds the effort and the risk class with its reasons', () => {
		const start = createRiskWorkspace({
			packageJson: DECLARING_PACKAGE_JSON,
			scope: BROAD_SCOPE,
			lotPath: BROAD_LOT_PATH,
		})

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
				effort: { level: 'high', source: 'risk' },
				riskClass: { class: 'high', reasons: BROAD_REASONS },
			},
		})
	})

	it('--dry-run prints the effort line, writes nothing', () => {
		const start = createRiskWorkspace({
			packageJson: DECLARING_PACKAGE_JSON,
			scope: DECLARED_SCOPE,
		})

		expect({
			...withLines(
				runLot({
					cwd: start.cwd,
					argv: ['start', start.workspace.briefPath, '--dry-run'],
					now: START_NOW,
				}),
			),
			created: createdBy(start),
		}).toMatchObject({
			exitCode: 0,
			lines: expect.arrayContaining([`effort high (risk) · risk class high: ${DECLARED_GLOB}`]),
			created: NOTHING_CREATED,
		})
	})

	it('--simulate writes no risk.jsonl', () => {
		const start = createRiskWorkspace({
			packageJson: DECLARING_PACKAGE_JSON,
			scope: DECLARED_SCOPE,
		})

		const result = runLot({
			cwd: start.cwd,
			argv: ['start', start.workspace.briefPath, '--simulate', 'ready'],
			now: START_NOW,
		})

		expect({
			exitCode: result.exitCode,
			effort: identityEffortOf(join(start.store, LOT_NAME)),
			records: readRiskRecords({ folder: join(start.store, LOT_NAME) }),
		}).toEqual({
			exitCode: 0,
			effort: { level: 'high', source: 'risk' },
			records: { effort: [], derived: [], skipped: 0 },
		})
	})
})

type RefusedRow = {
	title: string
	scope: string
	briefEffort?: string
	flags: string[]
	output: string
}

const BELOW_HIGH = `lot start: effort low is below risk class high (${DECLARED_GLOB}): add --by <who> --reason <text>`
const BELOW_MEDIUM =
	'lot start: effort low is below risk class medium (no declared path): add --by <who> --reason <text>'

const REFUSED_ROWS: RefusedRow[] = [
	{
		title: 'case 26: --effort low on a declared scope',
		scope: DECLARED_SCOPE,
		flags: ['--effort', 'low'],
		output: BELOW_HIGH,
	},
	{
		title: 'brief effort low on a declared scope',
		scope: DECLARED_SCOPE,
		briefEffort: 'low',
		flags: [],
		output: BELOW_HIGH,
	},
	{
		title: '--effort medium on a declared scope',
		scope: DECLARED_SCOPE,
		flags: ['--effort', 'medium'],
		output: `lot start: effort medium is below risk class high (${DECLARED_GLOB}): add --by <who> --reason <text>`,
	},
	{
		title: '--effort low on a medium scope',
		scope: AWAY_SCOPE,
		flags: ['--effort', 'low'],
		output: BELOW_MEDIUM,
	},
	{
		title: '--dry-run --effort low on a declared scope',
		scope: DECLARED_SCOPE,
		flags: ['--effort', 'low', '--dry-run'],
		output: BELOW_HIGH,
	},
]

describe('lot start, refused before anything is published', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of REFUSED_ROWS)
		it(`${row.title} -> exit 2, nothing created`, () => {
			const start = createRiskWorkspace({
				packageJson: DECLARING_PACKAGE_JSON,
				scope: row.scope,
				effort: row.briefEffort,
			})

			const result = runLot({
				cwd: start.cwd,
				argv: ['start', start.workspace.briefPath, ...row.flags],
				now: START_NOW,
			})

			expect({ ...result, created: createdBy(start) }).toEqual({
				exitCode: 2,
				output: row.output,
				created: NOTHING_CREATED,
			})
		})
})

const BOTH_WORDS = ['--by', 'person-a', '--reason', 'x']

type UsageRow = { title: string; scope: string; flags: string[] }

const USAGE_ROWS: UsageRow[] = [
	{
		title: '--effort low with --by alone',
		scope: DECLARED_SCOPE,
		flags: ['--effort', 'low', '--by', 'person-a'],
	},
	{
		title: '--effort low with --reason alone',
		scope: DECLARED_SCOPE,
		flags: ['--effort', 'low', '--reason', 'x'],
	},
	{ title: '--by alone at the class', scope: AWAY_SCOPE, flags: ['--by', 'person-a'] },
	{ title: '--by empty', scope: DECLARED_SCOPE, flags: ['--by', '', '--reason', 'x'] },
	{
		title: '--reason of two lines',
		scope: DECLARED_SCOPE,
		flags: ['--by', 'person-a', '--reason', 'a\nb'],
	},
]

describe('lot start, --by and --reason: usage', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of USAGE_ROWS)
		it(`${row.title} -> exit 2 with the lot usage, nothing created`, () => {
			const start = createRiskWorkspace({ packageJson: DECLARING_PACKAGE_JSON, scope: row.scope })

			const result = runLot({
				cwd: start.cwd,
				argv: ['start', start.workspace.briefPath, ...row.flags],
				now: START_NOW,
			})

			expect({ ...result, created: createdBy(start) }).toEqual({
				exitCode: 2,
				output: renderLotUsage(),
				created: NOTHING_CREATED,
			})

			// the same lot, once both halves are given
			expect(
				runLot({
					cwd: start.cwd,
					argv: ['start', start.workspace.briefPath, ...BOTH_WORDS],
					now: START_NOW,
				}).exitCode,
			).toBe(0)
		})
})

type WholeRow = { title: string; scope: string; flags: string[]; effortLine: string }

const WHOLE_ROWS: WholeRow[] = [
	{
		title: '--by and --reason with --effort low on a declared scope',
		scope: DECLARED_SCOPE,
		flags: ['--effort', 'low', '--by', 'person-a', '--reason', 'x'],
		effortLine: `effort low (flag) · risk class high: ${DECLARED_GLOB}`,
	},
	{
		title: '--by and --reason alone on a medium scope',
		scope: AWAY_SCOPE,
		flags: ['--by', 'person-a', '--reason', 'x'],
		effortLine: 'effort medium (risk) · risk class medium: no declared path',
	},
]

describe('lot start, --by and --reason: both given', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of WHOLE_ROWS)
		it(`${row.title} -> started`, () => {
			const start = createRiskWorkspace({ packageJson: DECLARING_PACKAGE_JSON, scope: row.scope })

			const result = runLot({
				cwd: start.cwd,
				argv: ['start', start.workspace.briefPath, ...row.flags],
				now: START_NOW,
			})

			expect({
				exitCode: result.exitCode,
				effortLinePrinted: result.output.split('\n').includes(row.effortLine),
				created: createdBy(start).lots,
			}).toEqual({ exitCode: 0, effortLinePrinted: true, created: [LOT_NAME] })
		})
})

type ForbiddenRow = { title: string; flags: string[]; output: string }

const FORBIDDEN_ROWS: ForbiddenRow[] = [
	{
		title: '--by',
		flags: ['--by', FIRST_WORD, '--reason', 'one-line reason'],
		output: 'lot start: --by holds a forbidden word: nothing written',
	},
	{
		title: '--reason',
		flags: ['--by', 'person-a', '--reason', `needs ${FIRST_WORD} here`],
		output: 'lot start: --reason holds a forbidden word: nothing written',
	},
]

describe('lot start, a forbidden word in --by or --reason', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of FORBIDDEN_ROWS)
		it(`${row.title} holding it -> exit 2, nothing created`, () => {
			const start = createRiskWorkspace({
				packageJson: DECLARING_PACKAGE_JSON,
				scope: DECLARED_SCOPE,
			})
			configureMachine()
			git({ root: start.repository, args: ['config', 'dialecte.forbiddenWords', FIRST_WORD] })

			const result = runLot({
				cwd: start.cwd,
				argv: ['start', start.workspace.briefPath, '--effort', 'low', ...row.flags],
				now: START_NOW,
			})

			expect({ ...result, created: createdBy(start) }).toEqual({
				exitCode: 2,
				output: row.output,
				created: NOTHING_CREATED,
			})
		})
})
