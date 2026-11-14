/**
 * `dialecte plan next <plan.md> [--json]` (33N sections 3, 6, 7, 9, cases 16, 17, 34): over a hand-made workspace,
 * a plan file with its fence, a repository made of files, records as files; the machine reading and the marker
 * check through seams. No git process, no real `vm_stat`.
 */
import { join } from 'node:path'

import {
	createCommandWorkspace,
	lotJson,
	personJson,
	writePlanWithBlock,
} from '../../test/plan-command-workspace.ts'
import {
	writeMainCheckout,
	writeRegistryEntry,
	writeWorktreeRecord,
} from '../../test/plan-facts.ts'
import { writeRecordFile } from '../../test/store-records.ts'
import { runPlan } from './plan.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CommandWorkspace } from '../../test/plan-command-workspace.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { MachineLoad } from '../lib/heavy/machine-load.types.ts'
import type { PlanSeams, RunPlanParams } from './plan.types.ts'

beforeEach(function readLocalTimeAsUtc() {
	vi.stubEnv('TZ', 'UTC')
})

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const GIGABYTE = 1024 ** 3

/** 10:06:30 on the day of the spec: a step started at 10:02 has run 4 minutes. */
const NOW = new Date('2026-11-10T10:06:30.000Z')

const QUIET: MachineLoad = {
	load: 9.1,
	cores: 12,
	available: Math.round(6.2 * GIGABYTE),
	source: 'vm_stat',
}

const SHORT: MachineLoad = {
	load: 31.2,
	cores: 12,
	available: Math.round(1.6 * GIGABYTE),
	source: 'vm_stat',
}

const MEMORY_UNKNOWN: MachineLoad = {
	load: 9.1,
	cores: 12,
	available: undefined,
	source: 'unknown',
}

/** No marker's process runs, unless a test says so. */
const NOTHING_RUNS = { isAlive: () => false, startTimeOf: () => undefined }

function seamsOf(workspace: CommandWorkspace, overrides: Partial<PlanSeams> = {}): PlanSeams {
	return {
		machine: QUIET,
		check: NOTHING_RUNS,
		state: { environment: { XDG_STATE_HOME: workspace.state } },
		now: NOW,
		...overrides,
	}
}

/**
 * The scenario of the tests, shaped on the 2026-11-10 morning facts: D1 committed; Open1 open (manual, its worktree only); Fix1 (a fix,
 * its brief exists) and Fix2 (its spec is written, no brief) ready and proposed; Held1 ready but meeting Open1;
 * Wait1 waits for Open1 with its spec DRAFT; Wait2 waits for the ready Fix1; Person1 a person entry without a mark;
 * Parked1 parked. CHANGELOG.md is shared.
 */
function writeScenario(
	workspace: CommandWorkspace,
	params: { without?: string[] } = {},
): { briefPath: string } {
	const dropped = new Set(params.without ?? [])
	const lots = [
		lotJson('D1'),
		lotJson('Open1'),
		lotJson('Fix1', {
			kind: 'fix',
			dependsOn: ['D1'],
			heavy: ['mutation'],
			brief: 'briefs/fix1.json',
		}),
		lotJson('Fix2', { kind: 'fix', spec: 'fix2.md' }),
		lotJson('Held1', { scope: { cli: ['src/open1/sub/', 'src/open1/x.ts'] } }),
		lotJson('Wait1', { dependsOn: ['Open1'], spec: 'wait.md', group: 'Grp' }),
		lotJson('Wait2', { dependsOn: ['Fix1'] }),
		personJson('Person1'),
		lotJson('Parked1', { parked: 'core is slow' }),
	].filter((entry) => !dropped.has(entry.id as string))
	writePlanWithBlock({ workspace, lots, shared: { cli: ['CHANGELOG.md'] } })
	writeRecordFile({
		folder: workspace.planFolder,
		name: 'wait.md',
		text: '# Wait\n\nStatus: DRAFT\n',
	})
	writeRecordFile({
		folder: workspace.planFolder,
		name: 'fix2.md',
		text: '# Fix2\n\nStatus: READY rev 1\n',
	})
	const briefPath = writeRecordFile({
		folder: workspace.planFolder,
		name: 'briefs/fix1.json',
		text: '{}\n',
	})
	writeRegistryEntry({
		common: workspace.common,
		name: '2026-11-01-feat-d1',
		folder: join(workspace.root, 'done', 'd1'),
		branch: 'feat/d1',
		state: 'committed',
	})
	writeWorktreeRecord({
		common: workspace.common,
		name: '0016-cli-open1',
		head: 'ref: refs/heads/feat/open1',
		worktreeFolder: openWorktreeOf(workspace),
	})
	return { briefPath }
}

function openWorktreeOf(workspace: CommandWorkspace): string {
	return join(workspace.root, 'worktrees', '0016-cli-open1')
}

/**
 * The arguments of `runPlan` for `plan next plan.md`: every case calls `runPlan` itself, inside its `expect`, so a
 * stub's refusal is read as an assertion failure.
 */
function nextCall(params: {
	workspace: CommandWorkspace
	extra?: string[]
	seams?: Partial<PlanSeams>
}): RunPlanParams {
	return {
		cwd: params.workspace.planFolder,
		argv: ['next', 'plan.md', ...(params.extra ?? [])],
		seams: seamsOf(params.workspace, params.seams),
	}
}

/** What a case reads of a result: the view applied to it. */
function viewOf<View>(result: CommandResult, view: (result: CommandResult) => View): View {
	return view(result)
}

/** A result's JSON output. */
function jsonOf<Json>(result: CommandResult): Json {
	return JSON.parse(result.output) as Json
}

/** A live heavy marker file of the machine: the process `pid` runs with the start time the marker holds. */
function writeMarker(params: {
	workspace: CommandWorkspace
	pid: number
	step: string
	started: string
}): void {
	writeRecordFile({
		folder: join(params.workspace.state, 'dialecte', 'heavy'),
		name: `${params.pid}-1.json`,
		text: `${JSON.stringify({
			step: params.step,
			lot: null,
			repository: 'cli',
			worktree: openWorktreeOf(params.workspace),
			pid: params.pid,
			startTime: 'Tue Nov 10 09:00:00 2026',
			started: params.started,
		})}\n`,
	})
}

const MARKERS_RUN = {
	isAlive: (pid: number) => pid === 4242 || pid === 4243,
	startTimeOf: (pid: number) =>
		pid === 4242 || pid === 4243 ? 'Tue Nov 10 09:00:00 2026' : undefined,
}

function linesOf(output: string): string[] {
	return output.split('\n')
}

/** The line of a label (padded to ten columns; none for a continuation line) holding every fragment. */
function lineOf(params: {
	output: string
	label: string
	fragments: string[]
}): string | undefined {
	return linesOf(params.output).find(
		(line) =>
			line.startsWith(params.label === '' ? ' '.repeat(10) : params.label.padEnd(10)) &&
			params.fragments.every((fragment) => line.includes(fragment)),
	)
}

type TextRow = {
	name: string
	label: string
	fragments: (params: { briefPath: string }) => string[]
}

const TEXT_ROWS: TextRow[] = [
	{
		name: 'open: the entry, its repository and how it is open, its worktree',
		label: 'open',
		fragments: () => ['Open1', 'cli', 'manual, no hand-over yet (worktree 0016-cli-open1)'],
	},
	{
		name: 'start: the best lot with its rank, the open lots it will merge with, the command to run',
		label: 'start',
		fragments: ({ briefPath }) => [
			'Fix1',
			'unblocks 1 (chain 1)',
			'merge: Open1',
			`next: dialecte lot start ${briefPath}`,
		],
	},
	{
		name: 'start: the next candidate, its brief to write beside its spec',
		label: '',
		fragments: () => ['Fix2', 'unblocks 0 (chain 0)', 'next: write the brief for Fix2 (spec '],
	},
	{
		name: 'held: the entry meeting an open lot, each pair, how the lot is open',
		label: 'held',
		fragments: () => [
			'Held1',
			'src/open1/sub meets src/open1 (Open1, open, manual) · ',
			'src/open1/x.ts meets src/open1 (Open1, open, manual)',
		],
	},
	{
		name: 'person: ready without a mark, the command that records it',
		label: 'person',
		fragments: () => [
			'Person1',
			'ready, no mark',
			'dialecte plan mark plan.md Person1 done --by <who>',
		],
	},
	{
		name: 'spec: the file still a draft, the entries that need it',
		label: 'spec',
		fragments: () => ['spec      wait.md DRAFT (Wait1)'],
	},
	{
		name: 'waiting: each entry with what it waits for and that entry state',
		label: 'waiting',
		fragments: () => ['Wait1 for Open1 (open)', 'Wait2 for Fix1 (ready)'],
	},
	{
		name: 'parked: the entry with its reason',
		label: 'parked',
		fragments: () => ['Parked1', 'core is slow'],
	},
	{
		name: 'heavy: the load against twice the cores and the available memory',
		label: 'heavy',
		fragments: () => ['load 9.1 / 24', 'memory 6.2 GB'],
	},
	{
		name: 'next: the command that gives the same answer as JSON',
		label: 'next',
		fragments: () => ['dialecte plan next plan.md --json'],
	},
]

describe('plan next: the text of section 9', () => {
	it('the head line: the plan as given, its repositories, the counts (held inside ready)', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace)

		expect(linesOf(runPlan(nextCall({ workspace })).output)[0]).toBe(
			'plan plan.md  ·  repositories cli  ·  done 1 · open 1 · ready 4 (1 held) · waiting 2 · parked 1',
		)
	})

	it.each(TEXT_ROWS)('$name', ({ label, fragments }) => {
		const workspace = createCommandWorkspace()
		const { briefPath } = writeScenario(workspace)

		expect(
			lineOf({
				output: runPlan(nextCall({ workspace })).output,
				label,
				fragments: fragments({ briefPath }),
			}) !== undefined,
		).toEqual(true)
	})

	it('a lot or fix can start: exit 0, the last line names the JSON form', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace)

		expect(
			viewOf(runPlan(nextCall({ workspace })), (result) => ({
				exitCode: result.exitCode,
				last: linesOf(result.output.trimEnd()).at(-1),
			})),
		).toEqual({ exitCode: 0, last: 'next      dialecte plan next plan.md --json' })
	})
})

describe('plan next: no lot can start, spec work still listed (exit 1)', () => {
	it('without Fix1, Fix2 and Wait2: no lot, the reason, the spec work and the held kept', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace, { without: ['Fix1', 'Fix2', 'Wait2'] })

		expect(
			viewOf(runPlan(nextCall({ workspace })), (result) => ({
				exitCode: result.exitCode,
				start:
					lineOf({ output: result.output, label: 'start', fragments: ['no lot'] }) !== undefined,
				spec:
					lineOf({
						output: result.output,
						label: 'spec',
						fragments: ['wait.md DRAFT', '(Wait1)'],
					}) !== undefined,
				held: lineOf({ output: result.output, label: 'held', fragments: ['Held1'] }) !== undefined,
			})),
		).toEqual({ exitCode: 1, start: true, spec: true, held: true })
	})

	it('--json at exit 1: the same object, no proposal', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace, { without: ['Fix1', 'Fix2', 'Wait2'] })

		expect(
			viewOf(runPlan(nextCall({ workspace, extra: ['--json'] })), (result) => ({
				exitCode: result.exitCode,
				proposals: jsonOf<{ proposals: unknown[] }>(result).proposals,
			})),
		).toEqual({ exitCode: 1, proposals: [] })
	})
})

describe('plan next --json: the object of section 9', () => {
	it('its keys', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace)

		expect(
			Object.keys(jsonOf<object>(runPlan(nextCall({ workspace, extra: ['--json'] })))).sort(),
		).toEqual([
			'counts',
			'entries',
			'heavy',
			'held',
			'landed',
			'plan',
			'proposals',
			'repositories',
			'specWork',
			'unknown',
		])
	})

	it('the plan as given, the repository names, the counts, exit 0', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace)

		expect(
			viewOf(runPlan(nextCall({ workspace, extra: ['--json'] })), (result) => ({
				exitCode: result.exitCode,
				...jsonOf<object>(result),
			})),
		).toMatchObject({
			exitCode: 0,
			plan: 'plan.md',
			repositories: ['cli'],
			counts: { done: 1, open: 1, ready: 4, held: 1, waiting: 2, parked: 1, unknown: 0 },
			unknown: [],
		})
	})

	it('every entry in block order with its state; the open one realized by its worktree', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace)

		expect(
			viewOf(runPlan(nextCall({ workspace, extra: ['--json'] })), (result) => {
				const { entries } = jsonOf<{
					entries: Array<{ id: string; state: string; realizedBy: { kind: string } | null }>
				}>(result)
				return {
					states: entries.map((entry) => [entry.id, entry.state]),
					open: entries.find((entry) => entry.id === 'Open1')?.realizedBy?.kind,
				}
			}),
		).toEqual({
			states: [
				['D1', 'done'],
				['Open1', 'open'],
				['Fix1', 'ready'],
				['Fix2', 'ready'],
				['Held1', 'ready'],
				['Wait1', 'waiting'],
				['Wait2', 'waiting'],
				['Person1', 'ready'],
				['Parked1', 'parked'],
			],
			open: 'worktree',
		})
	})

	it('proposals in order, each with its rank, no stacking, the command to run; the held; the spec work', () => {
		const workspace = createCommandWorkspace()
		const { briefPath } = writeScenario(workspace)

		expect(
			viewOf(runPlan(nextCall({ workspace, extra: ['--json'] })), (result) => {
				const json = jsonOf<{
					proposals: unknown[]
					held: unknown[]
					specWork: Array<{ ids: string[]; file: string; status: string }>
				}>(result)
				return {
					proposals: json.proposals,
					held: json.held,
					specWork: json.specWork.map((work) => [
						work.ids,
						work.file.endsWith('wait.md'),
						work.status,
					]),
				}
			}),
		).toMatchObject({
			proposals: [
				{
					id: 'Fix1',
					kind: 'fix',
					unblocks: 1,
					chain: 1,
					after: null,
					stacks: [],
					next: `dialecte lot start ${briefPath}`,
				},
				{ id: 'Fix2', kind: 'fix', unblocks: 0, chain: 0, after: null, stacks: [] },
			],
			held: [{ id: 'Held1', open: ['Open1'] }],
			specWork: [[['Wait1'], true, 'DRAFT']],
		})
	})

	it('heavy: no marker, the load against its limit, the memory against 2 GB with its source, not short', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace)

		expect(
			jsonOf<{ heavy: unknown }>(runPlan(nextCall({ workspace, extra: ['--json'] }))).heavy,
		).toEqual({
			markers: [],
			load: { now: 9.1, limit: 24, cores: 12 },
			memory: { available: Math.round(6.2 * GIGABYTE), limit: 2 * GIGABYTE, source: 'vm_stat' },
			short: false,
		})
	})
})

describe('plan next --json: the entries of section 9', () => {
	type EntryJson = Record<string, unknown> & { id: string }

	function entriesOf(result: CommandResult): EntryJson[] {
		return jsonOf<{ entries: EntryJson[] }>(result).entries
	}

	it('every entry carries exactly the keys of section 9', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace)

		expect(
			viewOf(runPlan(nextCall({ workspace, extra: ['--json'] })), (result) =>
				entriesOf(result).map((entry) => Object.keys(entry).sort().join()),
			),
		).toEqual(Array(9).fill('group,id,kind,lotState,parked,realizedBy,spec,state,waitsFor'))
	})

	it('the group, what an entry waits for, its spec, its parked line; null for what an entry has not', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace)

		expect(
			viewOf(runPlan(nextCall({ workspace, extra: ['--json'] })), (result) =>
				Object.fromEntries(
					entriesOf(result)
						.filter((entry) => ['D1', 'Wait1', 'Parked1'].includes(entry.id))
						.map((entry) => [entry.id, entry]),
				),
			),
		).toMatchObject({
			D1: { group: null, parked: null, spec: null, waitsFor: [], lotState: null },
			Wait1: {
				group: 'Grp',
				kind: 'lot',
				state: 'waiting',
				waitsFor: [{ id: 'Open1', state: 'open' }],
				spec: { file: expect.stringMatching(/wait\.md$/), status: 'DRAFT' },
				parked: null,
			},
			Parked1: { state: 'parked', parked: 'core is slow' },
		})
	})
})

describe('plan next --all: the done entries', () => {
	it('with --all a done line lists them; without it they are only counted', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace)

		expect({
			all: lineOf({
				output: runPlan(nextCall({ workspace, extra: ['--all'] })).output,
				label: 'done',
				fragments: ['D1'],
			}),
			counted: linesOf(runPlan(nextCall({ workspace })).output).filter((line) =>
				line.startsWith('done      '),
			),
		}).toEqual({ all: expect.stringContaining('D1'), counted: [] })
	})
})

describe('plan next: an entry that cannot be read is unknown, never ready, never done', () => {
	it('text and JSON name it with the reason; what depends on it waits', () => {
		const workspace = createCommandWorkspace()
		const core = writeMainCheckout({ root: workspace.root, name: 'core' })
		// a file where the store folder belongs: no permission trick, unreadable for any user
		writeRecordFile({ folder: join(core, '.git'), name: 'dialecte-lots', text: 'not a folder\n' })
		writePlanWithBlock({
			workspace,
			lots: [
				lotJson('A'),
				lotJson('U1', { scope: { core: ['src/u/'] } }),
				lotJson('W', { dependsOn: ['U1'] }),
			],
			repositories: { cli: '../cli', core: '../core' },
		})

		expect({
			text: viewOf(runPlan(nextCall({ workspace })), (result) => ({
				head: linesOf(result.output)[0].includes('unknown 1'),
				unknown: lineOf({
					output: result.output,
					label: 'unknown',
					fragments: ['U1', 'cannot be read'],
				}),
				waiting: lineOf({
					output: result.output,
					label: 'waiting',
					fragments: ['W for U1 (unknown)'],
				}),
			})),
			json: viewOf(runPlan(nextCall({ workspace, extra: ['--json'] })), (result) => {
				const json = jsonOf<{
					entries: Array<{ id: string; state: string }>
					unknown: Array<{ id: string; reason: string }>
				}>(result)
				return {
					states: json.entries.map((entry) => [entry.id, entry.state]),
					unknown: json.unknown.map((entry) => [entry.id, entry.reason.includes('cannot be read')]),
				}
			}),
		}).toEqual({
			text: { head: true, unknown: expect.any(String), waiting: expect.any(String) },
			json: {
				states: [
					['A', 'ready'],
					['U1', 'unknown'],
					['W', 'waiting'],
				],
				unknown: [['U1', true]],
			},
		})
	})
})

describe('plan next: outside work and candidates meeting each other', () => {
	function writeOutsideScenario(workspace: CommandWorkspace): void {
		writePlanWithBlock({
			workspace,
			lots: [
				lotJson('Ax', { scope: { cli: ['src/shared/a/'] } }),
				lotJson('Bx', { scope: { cli: ['src/shared/a/b.ts'] } }),
			],
		})
		writeRegistryEntry({
			common: workspace.common,
			name: '2026-11-04-feat-stray',
			folder: join(workspace.root, 'stray'),
			branch: 'feat/stray',
			state: 'pending',
		})
	}

	it('two proposals meeting each other: the later says after the first', () => {
		const workspace = createCommandWorkspace()
		writeOutsideScenario(workspace)

		expect(
			lineOf({
				output: runPlan(nextCall({ workspace })).output,
				label: '',
				fragments: ['Bx', 'after Ax'],
			}) !== undefined,
		).toEqual(true)
	})

	it('open work no entry accounts for: its own open line, and every proposal of its repository unverified', () => {
		const workspace = createCommandWorkspace()
		writeOutsideScenario(workspace)

		expect(
			viewOf(runPlan(nextCall({ workspace })), (result) => ({
				open: lineOf({
					output: result.output,
					label: 'open',
					fragments: [
						'-',
						'cli',
						'unattributed: hand-over 2026-11-04-feat-stray pending since 2026-11-04 (scope unknown)',
					],
				}),
				unverified: ['Ax', 'Bx'].map(
					(id) =>
						lineOf({
							output: result.output,
							label: id === 'Ax' ? 'start' : '',
							fragments: [id, 'unverified: 2026-11-04-feat-stray'],
						}) !== undefined,
				),
			})),
		).toEqual({ open: expect.any(String), unverified: [true, true] })
	})
})

describe('plan next: the exit code 2', () => {
	type RefusalRow = {
		name: string
		setup?: (workspace: CommandWorkspace) => void
		argv: string[]
		fragments: string[]
	}

	const NEXT_USAGE = 'plan next <plan.md>'

	const REFUSAL_ROWS: RefusalRow[] = [
		{
			name: 'no word at all: the usage',
			argv: [],
			fragments: [NEXT_USAGE, 'plan check <plan.md>'],
		},
		{ name: 'an unknown word: the usage', argv: ['bogus'], fragments: [NEXT_USAGE] },
		{ name: 'no plan given: the usage', argv: ['next'], fragments: [NEXT_USAGE] },
		{
			name: 'an unknown option, named',
			setup: (workspace) => {
				writeScenario(workspace)
			},
			argv: ['next', 'plan.md', '--bogus'],
			fragments: ['--bogus'],
		},
		{
			name: 'a plan file that does not exist, named',
			argv: ['next', 'nope.md'],
			fragments: ['nope.md'],
		},
		{
			name: 'a plan with no block: the two forms named',
			setup: (workspace) => {
				writeRecordFile({
					folder: workspace.planFolder,
					name: 'plan.md',
					text: '# Plan\n\nProse only.\n',
				})
			},
			argv: ['next', 'plan.md'],
			fragments: ['json dialecte-lots', 'plan.lots.json'],
		},
		{
			name: 'an invalid block: every fault listed, not the first only',
			setup: (workspace) => {
				writePlanWithBlock({
					workspace,
					lots: [lotJson('A', { dependOn: ['B'] }), lotJson('B', { kind: 'epic' })],
				})
			},
			argv: ['next', 'plan.md'],
			fragments: ['lots[0].dependOn', 'lots[1].kind'],
		},
		{
			name: 'a repository that is not a git checkout, named',
			setup: (workspace) => {
				writeRecordFile({ folder: workspace.root, name: 'plain/README.md', text: 'no git here\n' })
				writePlanWithBlock({
					workspace,
					lots: [lotJson('A')],
					repositories: { cli: '../plain' },
				})
			},
			argv: ['next', 'plan.md'],
			fragments: ['repositories.cli'],
		},
		{
			name: 'a fence and a sidecar: both named',
			setup: (workspace) => {
				writeScenario(workspace)
				writeRecordFile({ folder: workspace.planFolder, name: 'plan.lots.json', text: '{}\n' })
			},
			argv: ['next', 'plan.md'],
			fragments: ['plan.lots.json'],
		},
	]

	it.each(REFUSAL_ROWS)('$name -> exit 2', ({ setup, argv, fragments }) => {
		const workspace = createCommandWorkspace()
		setup?.(workspace)

		expect(
			viewOf(runPlan({ cwd: workspace.planFolder, argv, seams: seamsOf(workspace) }), (result) => ({
				exitCode: result.exitCode,
				missing: fragments.filter((fragment) => !result.output.includes(fragment)),
			})),
		).toEqual({ exitCode: 2, missing: [] })
	})

	it('--json with an invalid block still exits 2', () => {
		const workspace = createCommandWorkspace()
		writePlanWithBlock({ workspace, lots: [lotJson('A', { dependOn: ['B'] })] })

		expect(runPlan(nextCall({ workspace, extra: ['--json'] })).exitCode).toBe(2)
	})
})

describe('plan next: the machine, advice only (cases 16, 17, 34)', () => {
	it('a live gate --full and mutation: the heavy line names each with its worktree, start and age', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace)
		writeMarker({ workspace, pid: 4242, step: 'gate-full', started: '2026-11-10T10:02:00.000Z' })
		writeMarker({ workspace, pid: 4243, step: 'mutation', started: '2026-11-10T10:03:00.000Z' })

		expect(
			lineOf({
				output: runPlan(nextCall({ workspace, seams: { check: MARKERS_RUN } })).output,
				label: 'heavy',
				fragments: [
					'gate --full in 0016-cli-open1 since 10:02 (4m)',
					'mutation in 0016-cli-open1 since 10:03 (3m)',
					'load 9.1 / 24',
				],
			}) !== undefined,
		).toEqual(true)
	})

	it('a lot declaring mutation beside a live mutation stays proposed and says it stacks (case 34); every lot stacks with a whole-suite run', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace)
		writeMarker({ workspace, pid: 4242, step: 'gate-full', started: '2026-11-10T10:02:00.000Z' })
		writeMarker({ workspace, pid: 4243, step: 'mutation', started: '2026-11-10T10:03:00.000Z' })

		expect(
			viewOf(runPlan(nextCall({ workspace, seams: { check: MARKERS_RUN } })), (result) => ({
				exitCode: result.exitCode,
				fix1:
					lineOf({
						output: result.output,
						label: 'start',
						fragments: [
							'Fix1',
							'stacks: gate --full (running in 0016-cli-open1 since 10:02)',
							'mutation (running in 0016-cli-open1 since 10:03)',
						],
					}) !== undefined,
				fix2:
					lineOf({
						output: result.output,
						label: '',
						fragments: ['Fix2', 'stacks: gate --full (running in 0016-cli-open1 since 10:02)'],
					}) !== undefined,
				fix2Mutation:
					lineOf({
						output: result.output,
						label: '',
						fragments: ['Fix2', 'mutation (running'],
					}) !== undefined,
			})),
		).toEqual({ exitCode: 0, fix1: true, fix2: true, fix2Mutation: false })
	})

	it('--json: the markers with their entry, the stacks of the proposals', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace)
		writeMarker({ workspace, pid: 4243, step: 'mutation', started: '2026-11-10T10:03:00.000Z' })

		expect(
			viewOf(
				runPlan(nextCall({ workspace, extra: ['--json'], seams: { check: MARKERS_RUN } })),
				(result) => {
					const json = jsonOf<{
						heavy: { markers: unknown[] }
						proposals: Array<{ id: string; stacks: string[] }>
					}>(result)
					return {
						markers: json.heavy.markers,
						stacks: json.proposals.map((proposal) => [proposal.id, proposal.stacks]),
					}
				},
			),
		).toMatchObject({
			markers: [{ step: 'mutation', worktree: '0016-cli-open1', entry: 'Open1' }],
			stacks: [
				['Fix1', ['mutation (running in 0016-cli-open1 since 10:03)']],
				['Fix2', []],
			],
		})
	})

	it('a dead marker (its pid reused with another start time) is not running: no stacks (case 16)', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace)
		writeMarker({ workspace, pid: 4243, step: 'mutation', started: '2026-11-10T10:03:00.000Z' })

		expect(
			viewOf(
				runPlan(
					nextCall({
						workspace,
						extra: ['--json'],
						seams: {
							check: { isAlive: () => true, startTimeOf: () => 'Wed Nov 11 07:00:00 2026' },
						},
					}),
				),
				(result) => {
					const json = jsonOf<{
						heavy: { markers: unknown[] }
						proposals: Array<{ id: string; stacks: string[] }>
					}>(result)
					return {
						markers: json.heavy.markers,
						stacks: json.proposals.map((proposal) => proposal.stacks),
						proposed: json.proposals.map((proposal) => proposal.id),
					}
				},
			),
		).toEqual({ markers: [], stacks: [[], []], proposed: ['Fix1', 'Fix2'] })
	})

	it('a short machine: the heavy line says its heavy steps would wait; the lots are still proposed, exit 0', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace)

		expect(
			viewOf(runPlan(nextCall({ workspace, seams: { machine: SHORT } })), (result) => ({
				exitCode: result.exitCode,
				heavy:
					lineOf({
						output: result.output,
						label: 'heavy',
						fragments: [
							'the machine is short now (load 31.2 > 24; memory 1.6 GB < 2 GB)',
							'its heavy steps would wait',
						],
					}) !== undefined,
				start:
					lineOf({
						output: result.output,
						label: 'start',
						fragments: ['Fix1', 'the machine is short now (load 31.2 > 24; memory 1.6 GB < 2 GB)'],
					}) !== undefined,
			})),
		).toEqual({ exitCode: 0, heavy: true, start: true })
	})

	it('--json on a short machine: heavy.short, never held back', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace)

		expect(
			viewOf(
				runPlan(nextCall({ workspace, extra: ['--json'], seams: { machine: SHORT } })),
				(result) => {
					const json = jsonOf<{
						heavy: { short: boolean }
						proposals: Array<{ wait?: string }>
					}>(result)
					return {
						short: json.heavy.short,
						wait: json.proposals.map((proposal) => proposal.wait),
					}
				},
			),
		).toEqual({
			short: true,
			wait: Array(2).fill(
				'the machine is short now (load 31.2 > 24; memory 1.6 GB < 2 GB): its heavy steps would wait (section 8)',
			),
		})
	})

	it('memory unknown: the heavy line says so and judges the load alone; never short (case 17)', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace)

		expect(
			viewOf(runPlan(nextCall({ workspace, seams: { machine: MEMORY_UNKNOWN } })), (result) => ({
				memory:
					lineOf({
						output: result.output,
						label: 'heavy',
						fragments: ['load 9.1 / 24', 'memory unknown'],
					}) !== undefined,
				short:
					lineOf({ output: result.output, label: 'heavy', fragments: ['is short now'] }) !==
					undefined,
			})),
		).toEqual({ memory: true, short: false })
	})

	it('--json with memory unknown: available null, source unknown, short false', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace)

		expect(
			jsonOf<{ heavy: unknown }>(
				runPlan(nextCall({ workspace, extra: ['--json'], seams: { machine: MEMORY_UNKNOWN } })),
			).heavy,
		).toMatchObject({
			memory: { available: null, limit: 2 * GIGABYTE, source: 'unknown' },
			short: false,
		})
	})
})

/** The result of a call, or what it threw: a throw out of `runPlan` fails the case on its assertion. */
function outcomeOf(call: RunPlanParams): CommandResult | { threw: string } {
	try {
		return runPlan(call)
	} catch (error) {
		return { threw: (error as Error).message }
	}
}

describe('plan next: a damaged state folder never throws', () => {
	it('<state>/dialecte/heavy a file: the usual answer, the heavy line says the markers are unknown and why', () => {
		const workspace = createCommandWorkspace()
		writeScenario(workspace)
		writeRecordFile({
			folder: join(workspace.state, 'dialecte'),
			name: 'heavy',
			text: 'not a folder',
		})
		const outcome = outcomeOf(nextCall({ workspace }))

		expect(
			'threw' in outcome
				? outcome
				: {
						exitCode: outcome.exitCode,
						heavy:
							lineOf({
								output: outcome.output,
								label: 'heavy',
								fragments: ['markers unknown (', 'load 9.1 / 24'],
							}) !== undefined,
					},
		).toEqual({ exitCode: 0, heavy: true })
	})
})
