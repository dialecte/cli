/**
 * The heavy advice's reading (33N section 7, cases 16, 17): the live heavy markers through the liveness check,
 * mapped to the plan's entries through their worktree's branch, and the reasons the machine is short.
 */
import { join } from 'node:path'

import { createPlanWorkspace } from '../../../test/plan-facts.ts'
import {
	blockOf,
	branchOf,
	factsOf,
	lotOf,
	planFile,
	registryOf,
	worktreeOf,
} from '../../../test/plan-state-facts.ts'
import { writeRecordFile } from '../../../test/store-records.ts'
import { entryStates } from './entry-state.ts'
import { readPlanHeavy } from './plan-heavy.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { RepositorySpec } from '../../../test/plan-state-facts.types.ts'
import type { MachineLoad } from '../heavy/machine-load.types.ts'
import type { PlanEntry } from './plan-block.types.ts'
import type { PlanHeavyReading } from './propose.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const GIGABYTE = 1024 ** 3
const QUIET: MachineLoad = { load: 9.1, cores: 12, available: 6 * GIGABYTE, source: 'vm_stat' }

/** A marker file's content, as `writeHeavyMarker` writes it. */
type MarkerFile = {
	name: string
	pid: number
	startTime: string
	step: string
	started: string
	worktree: string
}

function worktreePath(name: string): string {
	return `/work/.worktrees/${name}`
}

function markerFileOf(overrides: Partial<MarkerFile> = {}): MarkerFile {
	return {
		name: '4001-1.json',
		pid: 4001,
		startTime: 'Tue Nov 10 09:00:00 2026',
		step: 'gate-full',
		started: '2026-11-10T10:02:00.000Z',
		worktree: worktreePath('0016-cli-open1'),
		...overrides,
	}
}

/** Which pids run, and the start time each runs with. */
type Processes = Record<number, string>

type HeavyRow = {
	name: string
	lots: PlanEntry[]
	repositories: Record<string, RepositorySpec>
	markers: MarkerFile[]
	processes: Processes
	machine?: MachineLoad
	expected: { markers: unknown[]; shortReasons?: string[] }
}

const OPEN1_REPOSITORIES: Record<string, RepositorySpec> = {
	cli: { worktrees: [worktreeOf('0016-cli-open1', branchOf('Open1'))] },
}

const PROCESSES: Processes = { 4001: 'Tue Nov 10 09:00:00 2026', 4002: 'Tue Nov 10 09:10:00 2026' }

const HEAVY_ROWS: HeavyRow[] = [
	{
		name: 'a live marker: step, worktree folder, start, the entry of its worktree branch',
		lots: [lotOf('Open1')],
		repositories: OPEN1_REPOSITORIES,
		markers: [markerFileOf()],
		processes: PROCESSES,
		expected: {
			markers: [
				{
					step: 'gate-full',
					worktree: '0016-cli-open1',
					since: '2026-11-10T10:02:00.000Z',
					entry: 'Open1',
				},
			],
			shortReasons: [],
		},
	},
	{
		name: 'a dead marker (its pid reused with another start time) is not running (case 16)',
		lots: [lotOf('Open1')],
		repositories: OPEN1_REPOSITORIES,
		markers: [
			markerFileOf({ name: '4001-1.json', pid: 4001, startTime: 'Mon Nov  9 08:00:00 2026' }),
			markerFileOf({
				name: '4002-1.json',
				pid: 4002,
				startTime: PROCESSES[4002],
				step: 'mutation',
			}),
		],
		processes: PROCESSES,
		expected: {
			markers: [
				{
					step: 'mutation',
					worktree: '0016-cli-open1',
					since: '2026-11-10T10:02:00.000Z',
					entry: 'Open1',
				},
			],
		},
	},
	{
		name: 'a marker whose pid does not run is not running',
		lots: [lotOf('Open1')],
		repositories: OPEN1_REPOSITORIES,
		markers: [markerFileOf({ pid: 4999, name: '4999-1.json' }), markerFileOf()],
		processes: PROCESSES,
		expected: {
			markers: [
				{
					step: 'gate-full',
					worktree: '0016-cli-open1',
					since: '2026-11-10T10:02:00.000Z',
					entry: 'Open1',
				},
			],
		},
	},
	{
		name: 'a worktree on a branch no entry has: the folder name stands, no entry',
		lots: [lotOf('Open1')],
		repositories: {
			cli: { worktrees: [worktreeOf('0021-cli-else', 'feat/something-else')] },
		},
		markers: [markerFileOf({ worktree: worktreePath('0021-cli-else') })],
		processes: PROCESSES,
		expected: {
			markers: [
				{
					step: 'gate-full',
					worktree: '0021-cli-else',
					since: '2026-11-10T10:02:00.000Z',
					entry: null,
				},
			],
		},
	},
	{
		name: 'a marker of a folder that is no worktree of the plan: the folder name, no entry',
		lots: [lotOf('Open1')],
		repositories: OPEN1_REPOSITORIES,
		markers: [markerFileOf({ worktree: '/elsewhere/checkout' })],
		processes: PROCESSES,
		expected: {
			markers: [
				{
					step: 'gate-full',
					worktree: 'checkout',
					since: '2026-11-10T10:02:00.000Z',
					entry: null,
				},
			],
		},
	},
	{
		name: 'a shared branch: the marker belongs to the entry the worktree is attributed to',
		lots: [
			lotOf('L0a', { match: { branch: 'feat/shared', handover: planFile('L0a') } }),
			lotOf('L0b', {
				match: { branch: 'feat/shared', handover: planFile('L0b') },
				dependsOn: ['L0a'],
			}),
		],
		repositories: {
			cli: {
				registry: [registryOf({ name: 'L0a', branch: 'feat/shared', state: 'committed' })],
				worktrees: [worktreeOf('0016-cli-open1', 'feat/shared')],
			},
		},
		markers: [markerFileOf()],
		processes: PROCESSES,
		expected: {
			markers: [
				{
					step: 'gate-full',
					worktree: '0016-cli-open1',
					since: '2026-11-10T10:02:00.000Z',
					entry: 'L0b',
				},
			],
		},
	},
	{
		name: 'a done entry whose registry record names the same worktree never takes the marker: the open one does',
		lots: [lotOf('A'), lotOf('B')],
		repositories: {
			cli: {
				registry: [
					registryOf({
						name: 'r-a',
						branch: branchOf('A'),
						state: 'committed',
						worktree: worktreePath('0016-cli-open1'),
					}),
				],
				worktrees: [worktreeOf('0016-cli-open1', branchOf('B'))],
			},
		},
		markers: [markerFileOf()],
		processes: PROCESSES,
		expected: {
			markers: [
				{
					step: 'gate-full',
					worktree: '0016-cli-open1',
					since: '2026-11-10T10:02:00.000Z',
					entry: 'B',
				},
			],
		},
	},
	{
		name: 'case 26: L1 pending by its record, L2 attributed to the worktree: the marker is L2 (never L1)',
		lots: [
			lotOf('L1', { match: { branch: 'feat/shared', handover: planFile('L1') } }),
			lotOf('L2', {
				match: { branch: 'feat/shared', handover: planFile('L2') },
				dependsOn: ['L1'],
			}),
		],
		repositories: {
			cli: {
				registry: [
					registryOf({
						name: 'L1',
						branch: 'feat/shared',
						state: 'pending',
						worktree: worktreePath('0016-cli-open1'),
					}),
				],
				worktrees: [worktreeOf('0016-cli-open1', 'feat/shared')],
			},
		},
		markers: [markerFileOf()],
		processes: PROCESSES,
		expected: {
			markers: [
				{
					step: 'gate-full',
					worktree: '0016-cli-open1',
					since: '2026-11-10T10:02:00.000Z',
					entry: 'L2',
				},
			],
		},
	},
	{
		name: 'a marker in another folder of the same name is not the plan worktree: path, never name',
		lots: [lotOf('Open1')],
		repositories: OPEN1_REPOSITORIES,
		markers: [markerFileOf({ worktree: '/elsewhere/.worktrees/0016-cli-open1' })],
		processes: PROCESSES,
		expected: {
			markers: [
				{
					step: 'gate-full',
					worktree: '0016-cli-open1',
					since: '2026-11-10T10:02:00.000Z',
					entry: null,
				},
			],
		},
	},
	{
		name: 'two live markers: in the order they started; a heavy part keeps its step text',
		lots: [lotOf('Open1')],
		repositories: OPEN1_REPOSITORIES,
		markers: [
			markerFileOf({
				name: '4002-1.json',
				pid: 4002,
				startTime: PROCESSES[4002],
				step: 'gate-fast: e2e',
				started: '2026-11-10T10:05:00.000Z',
			}),
			markerFileOf({ started: '2026-11-10T10:02:00.000Z' }),
		],
		processes: PROCESSES,
		expected: {
			markers: [
				{
					step: 'gate-full',
					worktree: '0016-cli-open1',
					since: '2026-11-10T10:02:00.000Z',
					entry: 'Open1',
				},
				{
					step: 'gate-fast: e2e',
					worktree: '0016-cli-open1',
					since: '2026-11-10T10:05:00.000Z',
					entry: 'Open1',
				},
			],
		},
	},
	{
		name: 'no marker: nothing runs',
		lots: [lotOf('Open1')],
		repositories: OPEN1_REPOSITORIES,
		markers: [],
		processes: {},
		expected: { markers: [], shortReasons: [] },
	},
	{
		name: 'a short machine: the reasons ride on the reading',
		lots: [lotOf('Open1')],
		repositories: OPEN1_REPOSITORIES,
		markers: [],
		processes: {},
		machine: { load: 31.2, cores: 12, available: Math.round(1.6 * GIGABYTE), source: 'vm_stat' },
		expected: { markers: [], shortReasons: ['load 31.2 > 24', 'memory 1.6 GB < 2 GB'] },
	},
	{
		name: 'memory unknown and a quiet load: no reason, never short (case 17)',
		lots: [lotOf('Open1')],
		repositories: OPEN1_REPOSITORIES,
		markers: [],
		processes: {},
		machine: { load: 9.1, cores: 12, available: undefined, source: 'unknown' },
		expected: { markers: [], shortReasons: [] },
	},
	{
		name: 'memory unknown and a high load: short on the load alone (case 17)',
		lots: [lotOf('Open1')],
		repositories: OPEN1_REPOSITORIES,
		markers: [],
		processes: {},
		machine: { load: 31.2, cores: 12, available: undefined, source: 'unknown' },
		expected: { markers: [], shortReasons: ['load 31.2 > 24'] },
	},
]

/** The parts of a reading a row states: its markers, and its reasons only when the row names them. */
function comparedOf(params: {
	reading: PlanHeavyReading
	expected: HeavyRow['expected']
}): HeavyRow['expected'] {
	return {
		markers: params.reading.markers,
		...(params.expected.shortReasons === undefined
			? {}
			: { shortReasons: params.reading.shortReasons }),
	}
}

describe('readPlanHeavy: the live markers and the shortness of the machine', () => {
	it.each(HEAVY_ROWS)('$name', (row) => {
		const workspace = createPlanWorkspace()
		const folder = join(workspace.state, 'dialecte', 'heavy')
		for (const marker of row.markers)
			writeRecordFile({
				folder,
				name: marker.name,
				text: `${JSON.stringify({
					step: marker.step,
					lot: null,
					repository: 'cli',
					worktree: marker.worktree,
					pid: marker.pid,
					startTime: marker.startTime,
					started: marker.started,
				})}\n`,
			})
		const block = blockOf({ lots: row.lots })
		const facts = factsOf({ repositories: row.repositories })

		expect(
			comparedOf({
				reading: readPlanHeavy({
					block,
					facts,
					states: entryStates({ block, facts }),
					machine: row.machine ?? QUIET,
					location: { environment: { XDG_STATE_HOME: workspace.state } },
					check: {
						isAlive: (pid) => Object.hasOwn(row.processes, pid),
						startTimeOf: (pid) => row.processes[pid],
					},
				}),
				expected: row.expected,
			}),
		).toEqual(row.expected)
	})
})
