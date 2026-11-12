/**
 * Step events of `dialecte gate` (33L0 section 4 "Step events", "Which lot"; cases 8, 11 (gate half), 12): what a gate
 * run records into its lot's `events.jsonl`, through shell steps in a scratch lot worktree (no test runner is
 * started). Parts are compact: a key whose value is null, false or an empty list is left out (D14).
 */
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { readRecordFile } from '../../test/gate-records.ts'
import { addWorktreeFolder, linkLot } from '../../test/lot-stores.ts'
import {
	FAST_RECORD_FILE,
	FULL_RECORD_FILE,
	SCRATCH_REPOSITORY_TIMEOUT,
} from '../../test/scratch-checks.constants.ts'
import { createScratchRepository, git } from '../../test/scratch-repository.ts'
import { commonGitDirOf } from '../../test/scratch-tree.ts'
import { STEP_LOT, TEST_SUMMARY_COMMAND } from '../../test/step-events-lot.constants.ts'
import {
	createStepLot,
	eventsOfStep,
	markerFilesIn,
	markerProbeStep,
	markersSeen,
	partsOf,
	seenFile,
	stepEventsOf,
	warningCollector,
} from '../../test/step-events-lot.ts'
import { runGate } from './gate.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GateRecord } from '../lib/gate-records/gate-records.types.ts'
import type { LiveOutput } from '../lib/progress/step-progress.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const TWO_STEPS = [
	{ name: 'one', run: 'echo one' },
	{ name: 'two', run: 'echo two' },
]

/** The keys a part of a plain passed step leaves out: their value is the default (D14). */
const DEFAULT_KEYS = ['reused', 'rerun', 'heavy', 'selection', 'failing']

describe('gate --fast in the lot worktree', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a green run → exactly one step.start and one step.end of gate-fast by the cli, paired by run', async () => {
		const lot = createStepLot({ fast: TWO_STEPS })

		const result = await runGate({ cwd: lot.worktree, argv: [] })

		expect({
			exitCode: result.exitCode,
			kinds: stepEventsOf(lot).map((event) => event.kind),
			steps: stepEventsOf(lot).map((event) => event.step),
			by: stepEventsOf(lot).map((event) => event.by),
			lots: stepEventsOf(lot).map((event) => event.lot),
			runsEqual: new Set(stepEventsOf(lot).map((event) => event.run)).size,
		}).toEqual({
			exitCode: 0,
			kinds: ['step.start', 'step.end'],
			steps: ['gate-fast', 'gate-fast'],
			by: ['cli', 'cli'],
			lots: [STEP_LOT, STEP_LOT],
			runsEqual: 1,
		})
	})

	it('two runs → two pairs, each with its own run id', async () => {
		const lot = createStepLot({ fast: TWO_STEPS })

		await runGate({ cwd: lot.worktree, argv: ['--no-reuse'] })
		await runGate({ cwd: lot.worktree, argv: ['--no-reuse'] })
		const events = stepEventsOf(lot)

		expect({
			kinds: events.map((event) => event.kind),
			pairs: [events[0]?.run === events[1]?.run, events[2]?.run === events[3]?.run],
			distinct: events[0]?.run !== events[2]?.run,
		}).toEqual({
			kinds: ['step.start', 'step.end', 'step.start', 'step.end'],
			pairs: [true, true],
			distinct: true,
		})
	})

	it('the start → heavy false, the real path of the worktree, not a throwaway', async () => {
		const lot = createStepLot({ fast: TWO_STEPS })

		await runGate({ cwd: lot.worktree, argv: [] })

		expect(
			((start) => ({
				heavy: start?.heavy,
				worktree: start?.worktree,
				throwaway: start?.throwaway,
			}))(stepEventsOf(lot)[0]),
		).toEqual({ heavy: false, worktree: lot.worktree, throwaway: false })
	})

	it('the end → exit 0, a duration, reuse none, the state hash the gate record stored', async () => {
		const lot = createStepLot({ fast: TWO_STEPS })

		await runGate({ cwd: lot.worktree, argv: [] })
		const record = readRecordFile<GateRecord>({ root: lot.worktree, name: FAST_RECORD_FILE })

		expect(
			((end) => ({
				exit: end?.exit,
				durationMs: typeof end?.durationMs,
				reuse: end?.reuse,
				stateHash: end?.stateHash,
			}))(stepEventsOf(lot)[1]),
		).toEqual({ exit: 0, durationMs: 'number', reuse: 'none', stateHash: record?.stateHash })
	})

	it('the start is written before the record, the end after it', async () => {
		const lot = createStepLot({ fast: TWO_STEPS })

		await runGate({ cwd: lot.worktree, argv: [] })
		const record = readRecordFile<GateRecord>({ root: lot.worktree, name: FAST_RECORD_FILE })

		expect([
			((events) => events[0]?.at <= (record?.at ?? ''))(stepEventsOf(lot)),
			((events) => (record?.at ?? '') <= events[1]?.at)(stepEventsOf(lot)),
		]).toEqual([true, true])
	})

	it('the parts → hygiene, tdd and each configured step, compact: only name, status, duration where nothing else is set', async () => {
		const lot = createStepLot({ fast: TWO_STEPS })

		await runGate({ cwd: lot.worktree, argv: [] })
		const parts = partsOf(stepEventsOf(lot)[1])

		expect({
			names: parts.map((part) => part.name),
			statuses: parts.map((part) => part.status),
			durations: parts.every((part) => typeof part.durationMs === 'number'),
			defaultKeysPresent: parts
				.filter((part) => ['one', 'two'].includes(String(part.name)))
				.flatMap((part) => DEFAULT_KEYS.filter((key) => key in part)),
		}).toEqual({
			names: ['hygiene', 'tdd', 'one', 'two'],
			statuses: ['passed', 'skipped', 'passed', 'passed'],
			durations: true,
			defaultKeysPresent: [],
		})
	})

	it('a step that sleeps 0.2 s → its part lasts at least 150 ms, the run at least the sum of its parts', async () => {
		const lot = createStepLot({ fast: [{ name: 'slow', run: 'sleep 0.2' }] })

		await runGate({ cwd: lot.worktree, argv: [] })
		const end = stepEventsOf(lot)[1]
		const parts = partsOf(end)

		expect({
			slow: Number(parts.find((part) => part.name === 'slow')?.durationMs) >= 150,
			run: Number(end?.durationMs) >= parts.reduce((sum, part) => sum + Number(part.durationMs), 0),
		}).toEqual({ slow: true, run: true })
	})

	it('--json → the run is recorded too, one start and one end', async () => {
		const lot = createStepLot({ fast: TWO_STEPS })

		const result = await runGate({ cwd: lot.worktree, argv: ['--json'] })

		expect({
			json: JSON.parse(result.output).ok,
			kinds: stepEventsOf(lot).map((event) => event.kind),
		}).toEqual({ json: true, kinds: ['step.start', 'step.end'] })
	})

	it('a failing step → exit 1 in the end, the failed part with its failing files, the later part not run with duration 0, the state hash the record stored', async () => {
		const lot = createStepLot({
			fast: [
				{ name: 'one', run: 'echo one' },
				{
					name: 'bad',
					run: "printf ' FAIL  |node| src/a.test.ts > group > one\\n'; exit 3",
					counts: 'tests',
				},
				{ name: 'later', run: 'echo later' },
			],
		})

		const result = await runGate({ cwd: lot.worktree, argv: [] })
		const record = readRecordFile<GateRecord>({ root: lot.worktree, name: FAST_RECORD_FILE })
		const end = stepEventsOf(lot)[1]
		const parts = partsOf(end)

		expect({
			exitCode: result.exitCode,
			exit: end?.exit,
			stateHash: end?.stateHash,
			statuses: parts
				.filter((part) => ['one', 'bad', 'later'].includes(String(part.name)))
				.map((part) => [part.name, part.status]),
			failing: parts.find((part) => part.name === 'bad')?.failing,
			laterDuration: parts.find((part) => part.name === 'later')?.durationMs,
		}).toEqual({
			exitCode: 1,
			exit: 1,
			stateHash: record?.stateHash,
			statuses: [
				['one', 'passed'],
				['bad', 'failed'],
				['later', 'not-run'],
			],
			failing: ['src/a.test.ts'],
			laterDuration: 0,
		})
	})

	it('a declared step running a missing npm script → a failed part', async () => {
		const lot = createStepLot({ fast: [{ name: 'docs', run: 'npm run no-such-script' }] })

		await runGate({ cwd: lot.worktree, argv: [] })

		expect(
			partsOf(stepEventsOf(lot)[1])
				.filter((part) => part.name === 'docs')
				.map((part) => part.status),
		).toEqual(['failed'])
	})
})

describe('gate --fast: reuse', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a second run answered from the record → reuse whole, the configured parts reused, hygiene and tdd run and not counted', async () => {
		const lot = createStepLot({ fast: TWO_STEPS })

		await runGate({ cwd: lot.worktree, argv: [] })
		await runGate({ cwd: lot.worktree, argv: [] })
		const ends = stepEventsOf(lot).filter((event) => event.kind === 'step.end')

		expect({
			reuse: ends.map((end) => end.reuse),
			reused: partsOf(ends[1]).map((part) => [part.name, part.reused ?? false]),
		}).toEqual({
			reuse: ['none', 'whole'],
			reused: [
				['hygiene', false],
				['tdd', false],
				['one', true],
				['two', true],
			],
		})
	})

	it('--no-reuse after a recorded run → reuse none', async () => {
		const lot = createStepLot({ fast: TWO_STEPS })

		await runGate({ cwd: lot.worktree, argv: [] })
		await runGate({ cwd: lot.worktree, argv: ['--no-reuse'] })

		expect(
			stepEventsOf(lot)
				.filter((event) => event.kind === 'step.end')
				.map((end) => end.reuse),
		).toEqual(['none', 'none'])
	})
})

describe('gate --fast: which lot', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it("in the lot's throwaway → the same events with throwaway true, the throwaway's path, the lot", async () => {
		const lot = createStepLot({ fast: TWO_STEPS })
		const throwaway = addWorktreeFolder({
			workspace: lot.workspace,
			folderName: `${STEP_LOT}-round-1`,
		})

		const result = await runGate({ cwd: throwaway, argv: [] })

		expect({
			exitCode: result.exitCode,
			events: stepEventsOf(lot).map((event) => [
				event.kind,
				event.lot,
				event.throwaway,
				event.worktree,
			]),
		}).toEqual({
			exitCode: 0,
			events: [
				['step.start', STEP_LOT, true, throwaway],
				['step.end', STEP_LOT, true, throwaway],
			],
		})
	})

	it('in a throwaway of the same index but not of the lot name (0171-repo-zzz-round-1) → no event, no file, no warning', async () => {
		const lot = createStepLot({ fast: TWO_STEPS })
		const other = addWorktreeFolder({
			workspace: lot.workspace,
			folderName: '0171-repo-zzz-round-1',
		})
		const warnings = warningCollector()

		const result = await runGate({ cwd: other, argv: [], warn: warnings.warn })

		expect({
			exitCode: result.exitCode,
			file: existsSync(lot.eventsFile),
			warnings: warnings.lines,
		}).toEqual({ exitCode: 0, file: false, warnings: [] })
	})

	it('in the main checkout of the repository (no lot) → no event, no file, no warning', async () => {
		const lot = createStepLot({ fast: TWO_STEPS })
		const warnings = warningCollector()

		const result = await runGate({ cwd: lot.workspace.repository, argv: [], warn: warnings.warn })

		expect({
			exitCode: result.exitCode,
			file: existsSync(lot.eventsFile),
			warnings: warnings.lines,
		}).toEqual({ exitCode: 0, file: false, warnings: [] })
	})

	it('in a repository with no lot store → no lot folder or store is made', async () => {
		const root = createScratchRepository({
			'package.json': JSON.stringify({
				name: 'demo',
				dialecte: { gate: { fast: TWO_STEPS } },
			}),
		})

		const result = await runGate({ cwd: root, argv: [] })

		expect({
			exitCode: result.exitCode,
			store: existsSync(join(commonGitDirOf(root), 'dialecte-lots')),
		}).toEqual({ exitCode: 0, store: false })
	})

	it("in a worktree whose .dialecte/lot was copied from the lot's → one step.foreign in that lot, one warning naming the lot, no start or end", async () => {
		const lot = createStepLot({ fast: TWO_STEPS })
		const copied = addWorktreeFolder({ workspace: lot.workspace, folderName: 'copied-checkout' })
		linkLot({ worktree: copied, lotFolder: lot.lotFolder })
		const warnings = warningCollector()

		const result = await runGate({ cwd: copied, argv: [], warn: warnings.warn })

		expect({
			exitCode: result.exitCode,
			events: stepEventsOf(lot).map((event) => [event.kind, event.step, event.worktree]),
			warnings: warnings.lines.map((line) => [
				line.includes(STEP_LOT),
				line.startsWith('events: not recorded'),
			]),
		}).toEqual({
			exitCode: 0,
			events: [['step.foreign', 'gate-fast', copied]],
			warnings: [[true, false]],
		})
	})

	it('in the lot worktree moved with git worktree move → one step.foreign with the moved path, one warning, no start or end', async () => {
		const lot = createStepLot({ fast: TWO_STEPS })
		const moved = join(lot.workspace.workspace, '.worktrees', 'moved-checkout')
		git({ root: lot.workspace.repository, args: ['worktree', 'move', lot.worktree, moved] })
		const worktree = realpathSync(moved)
		linkLot({ worktree, lotFolder: lot.lotFolder })
		const warnings = warningCollector()

		const result = await runGate({ cwd: worktree, argv: [], warn: warnings.warn })

		expect({
			exitCode: result.exitCode,
			events: stepEventsOf(lot).map((event) => [event.kind, event.step, event.worktree]),
			warnings: warnings.lines.length,
		}).toEqual({
			exitCode: 0,
			events: [['step.foreign', 'gate-fast', worktree]],
			warnings: 1,
		})
	})
})

describe('gate --full, --release and --hook', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('--full → gate-full, heavy true, a marker of the whole run present while a step runs and gone after', async () => {
		const seen = seenFile()
		const lot = createStepLot({
			full: (markerFolder) => [markerProbeStep({ name: 'probe', seen, markerFolder })],
		})

		const result = await runGate({ cwd: lot.worktree, argv: ['--full'] })

		expect({
			exitCode: result.exitCode,
			events: eventsOfStep({ lot, step: 'gate-full' }).map((event) => [event.kind, event.heavy]),
			seen: markersSeen(seen).map((marker) => [marker.step, marker.lot, marker.pid]),
			after: markerFilesIn(lot.markerFolder),
		}).toEqual({
			exitCode: 0,
			events: [
				['step.start', true],
				['step.end', true],
			],
			seen: [['gate-full', STEP_LOT, process.pid]],
			after: [],
		})
	})

	it('--full in the main checkout (no lot) → the marker is written with lot null and removed, no event, no file', async () => {
		const seen = seenFile()
		const lot = createStepLot({
			full: (markerFolder) => [markerProbeStep({ name: 'probe', seen, markerFolder })],
		})

		const result = await runGate({ cwd: lot.workspace.repository, argv: ['--full'] })

		expect({
			exitCode: result.exitCode,
			seen: markersSeen(seen).map((marker) => [marker.step, marker.lot]),
			file: existsSync(lot.eventsFile),
			after: markerFilesIn(lot.markerFolder),
		}).toEqual({ exitCode: 0, seen: [['gate-full', null]], file: false, after: [] })
	})

	it('--release → gate-release, heavy true, a marker of the whole run, reuse none', async () => {
		const seen = seenFile()
		const lot = createStepLot({
			release: (markerFolder) => [markerProbeStep({ name: 'probe', seen, markerFolder })],
		})

		const result = await runGate({ cwd: lot.worktree, argv: ['--release'] })

		expect({
			exitCode: result.exitCode,
			events: eventsOfStep({ lot, step: 'gate-release' }).map((event) => [
				event.kind,
				event.heavy,
				event.reuse,
			]),
			seen: markersSeen(seen).map((marker) => marker.step),
			after: markerFilesIn(lot.markerFolder),
		}).toEqual({
			exitCode: 0,
			events: [
				['step.start', true, undefined],
				['step.end', true, 'none'],
			],
			seen: ['gate-release'],
			after: [],
		})
	})

	it('--hook → gate-hook start and end, no state hash (the hook stores no record), reuse none, the test step as a part', async () => {
		const lot = createStepLot({
			full: [{ name: 'tests', run: TEST_SUMMARY_COMMAND, counts: 'tests' }],
		})

		const result = await runGate({ cwd: lot.worktree, argv: ['--hook'] })
		const end = eventsOfStep({ lot, step: 'gate-hook' })[1]

		expect({
			exitCode: result.exitCode,
			kinds: eventsOfStep({ lot, step: 'gate-hook' }).map((event) => event.kind),
			heavy: end?.heavy,
			stateHash: end?.stateHash,
			reuse: end?.reuse,
			parts: partsOf(end).map((part) => [part.name, part.status]),
		}).toEqual({
			exitCode: 0,
			kinds: ['step.start', 'step.end'],
			heavy: false,
			stateHash: null,
			reuse: 'none',
			parts: [['tests', 'passed']],
		})
	})

	it('--full with the gate record written → the end stores the hash of the full record', async () => {
		const lot = createStepLot({ full: [{ name: 'one', run: 'echo one' }] })

		await runGate({ cwd: lot.worktree, argv: ['--full'] })
		const record = readRecordFile<GateRecord>({ root: lot.worktree, name: FULL_RECORD_FILE })

		expect(eventsOfStep({ lot, step: 'gate-full' })[1]?.stateHash).toBe(record?.stateHash)
	})
})

describe('gate with live output', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a live-output stub → the events are written and the step lines still printed', async () => {
		const lot = createStepLot({ fast: TWO_STEPS })
		const lines: string[] = []
		const live: LiveOutput = {
			tty: false,
			writeLine: (line) => void lines.push(line),
			rewriteLines: () => undefined,
		}

		const result = await runGate({ cwd: lot.worktree, argv: [], live })

		expect({
			exitCode: result.exitCode,
			kinds: stepEventsOf(lot).map((event) => event.kind),
			printed: ['one', 'two'].map((name) => lines.some((line) => line.includes(name))),
			partNames: partsOf(stepEventsOf(lot)[1]).map((part) => part.name),
		}).toEqual({
			exitCode: 0,
			kinds: ['step.start', 'step.end'],
			printed: [true, true],
			partNames: ['hygiene', 'tdd', 'one', 'two'],
		})
	})
})

describe('gate: a long run (case 8)', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('100 steps, one failing → the end keeps the failing part and the first passing ones, cut true, partsTotal counted from the record, the line under 4,096 bytes', async () => {
		const lot = createStepLot({
			full: Array.from({ length: 100 }, (_, index) => ({
				name: `s${index}`,
				run: index === 50 ? 'exit 1' : 'true',
			})),
		})

		const result = await runGate({ cwd: lot.worktree, argv: ['--full'] })
		const record = readRecordFile<GateRecord>({ root: lot.worktree, name: FULL_RECORD_FILE })
		const lines = existsSync(lot.eventsFile)
			? readFileSync(lot.eventsFile, 'utf8').split('\n')
			: ['']
		const end = stepEventsOf(lot)[1]
		const names = partsOf(end).map((part) => String(part.name))

		expect({
			exitCode: result.exitCode,
			cut: end?.cut,
			shown: names.length <= 40,
			failingKept: names.includes('s50'),
			firstPassingKept: names.slice(0, 3).join(','),
			partsTotal: end?.partsTotal === record?.steps.length,
			partsFailedTotal: end?.partsFailedTotal,
			longest: Math.max(...lines.map((line) => Buffer.byteLength(line, 'utf8'))) < 4_096,
			kinds: stepEventsOf(lot).map((event) => event.kind),
		}).toEqual({
			exitCode: 1,
			cut: true,
			shown: true,
			failingKept: true,
			firstPassingKept: 'tdd,s0,s1',
			partsTotal: true,
			partsFailedTotal: 1,
			longest: true,
			kinds: ['step.start', 'step.end'],
		})
	})
})

describe(
	'gate: events that cannot be written (case 11)',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a folder stands at events.jsonl, in place of a read-only file → the same exit and output as without it, one warning line on the warning channel', async () => {
			const reference = createStepLot({ fast: TWO_STEPS })
			const blocked = createStepLot({ fast: TWO_STEPS })
			mkdirSync(blocked.eventsFile)
			const warnings = warningCollector()

			const expected = await runGate({ cwd: reference.worktree, argv: [] })
			const result = await runGate({ cwd: blocked.worktree, argv: [], warn: warnings.warn })

			expect({
				same: result.exitCode === expected.exitCode && result.output === expected.output,
				exitCode: result.exitCode,
				warnings: warnings.lines.map((line) => line.startsWith('events: not recorded: ')),
			}).toEqual({ same: true, exitCode: 0, warnings: [true] })
		})

		it('the same with --json → stdout still parses as the gate JSON, holds no events: text, the warning goes through warn', async () => {
			const reference = createStepLot({ fast: TWO_STEPS })
			const blocked = createStepLot({ fast: TWO_STEPS })
			mkdirSync(blocked.eventsFile)
			const warnings = warningCollector()

			const expected = await runGate({ cwd: reference.worktree, argv: ['--json'] })
			const result = await runGate({ cwd: blocked.worktree, argv: ['--json'], warn: warnings.warn })

			expect({
				exitCode: result.exitCode === expected.exitCode,
				parsed: JSON.parse(result.output).ok,
				noEventsText: !result.output.includes('events:'),
				warnings: warnings.lines.length,
			}).toEqual({ exitCode: true, parsed: true, noEventsText: true, warnings: 1 })
		})
	},
)
