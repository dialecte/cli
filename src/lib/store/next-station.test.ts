/**
 * `nextStation` (33L1 section 4, rows 1-17 and cases 1-14 of section 11): the pure walk over hand-written records.
 * Every case asserts the whole `NextStation`; the `why` lines are written out, never read from the constants.
 */
import { nextStation } from './next-station.ts'

import { describe, expect, it } from 'vitest'

import type {
	CheckName,
	NextStation,
	StationRecords,
	StationVerdict,
	TimelineEntry,
} from './next-station.types.ts'

type Case = {
	name: string
	records: Partial<StationRecords>
	expected: Partial<NextStation>
}

const START_AT = '2026-11-12T10:00:00.000Z'

const BASE_RECORDS: StationRecords = {
	state: 'working',
	openQuestion: null,
	steps: 1,
	effort: 'high',
	producer: true,
	registered: false,
	checks: 'events',
	worktreeRecords: false,
	beyondCap: [],
	timeline: [],
}

const BASE_EXPECTED: NextStation = {
	kind: 'none',
	station: null,
	check: null,
	step: null,
	round: null,
	why: '',
	unplaced: 0,
	noEnd: [],
}

let runCounter = 0

function nextRun(): string {
	runCounter += 1

	return `run-${runCounter}`
}

/** A station's start and end, as the reader pairs them (a fresh run id unless one is given). */
function ended(params: {
	station: string
	step?: number
	round?: number
	verdict?: StationVerdict
	exit?: number
	run?: string
}): TimelineEntry[] {
	const { station, step, round, verdict, exit, run = nextRun() } = params
	const position = {
		...(step === undefined ? {} : { step }),
		...(round === undefined ? {} : { round }),
	}

	return [
		{ kind: 'station.start', run, station, ...position, at: START_AT },
		{
			kind: 'station.end',
			run,
			station,
			...position,
			...(verdict === undefined ? {} : { verdict }),
			...(exit === undefined ? {} : { exit }),
		},
	]
}

function started(params: {
	station: string
	step?: number
	round?: number
	run: string
	at?: string
}): TimelineEntry {
	const { station, step, round, run, at = START_AT } = params

	return {
		kind: 'station.start',
		run,
		station,
		...(step === undefined ? {} : { step }),
		...(round === undefined ? {} : { round }),
		at,
	}
}

function checked(params: {
	check: CheckName
	passed?: boolean
	throwaway?: boolean
	stateHash?: string
}): TimelineEntry {
	return {
		kind: 'check',
		check: params.check,
		passed: params.passed ?? true,
		throwaway: params.throwaway ?? false,
		...(params.stateHash === undefined ? {} : { stateHash: params.stateHash }),
	}
}

/** A station run with checks recorded inside it (between its start and its end); its end holds `stateHash` (D29). */
function endedAround(params: {
	station: string
	step?: number
	round?: number
	verdict?: StationVerdict
	within: TimelineEntry[]
	stateHash?: string
}): TimelineEntry[] {
	const { within, stateHash, ...station } = params
	const [start, end] = ended(station)

	return [
		start,
		...within,
		{ ...end, ...(stateHash === undefined ? {} : { stateHash }) } as TimelineEntry,
	]
}

function snapshot(round: number): TimelineEntry {
	return { kind: 'snapshot', round }
}

function testWritten(step: number): TimelineEntry[] {
	return [...ended({ station: 'test-writer', step }), checked({ check: 'tdd-red' })]
}

function testsApproved(step: number): TimelineEntry[] {
	return [...testWritten(step), ...ended({ station: 'test-reviewer', step, verdict: 'approve' })]
}

function stepImplemented(step: number): TimelineEntry[] {
	return [...testsApproved(step), ...ended({ station: 'implementer', step })]
}

function stepDone(step: number): TimelineEntry[] {
	return [
		...stepImplemented(step),
		checked({ check: 'tdd-green' }),
		checked({ check: 'gate-fast' }),
	]
}

/** Review rounds 1..upTo, each with `fix-then-repass`, its fixer and a passed fast gate; the next snapshot not taken. */
function fixedRounds(upTo: number): TimelineEntry[] {
	const entries: TimelineEntry[] = [...stepDone(1)]

	for (let round = 1; round <= upTo; round += 1)
		entries.push(
			snapshot(round),
			...ended({ station: 'reviewer', round, verdict: 'fix-then-repass' }),
			...ended({ station: 'fixer', round, verdict: 'fixed' }),
			checked({ check: 'gate-fast' }),
		)

	return entries
}

function reviewApproved(): TimelineEntry[] {
	return [
		...stepDone(1),
		snapshot(1),
		...ended({ station: 'reviewer', round: 1, verdict: 'approve' }),
	]
}

function fullGatePassed(): TimelineEntry[] {
	return [...reviewApproved(), checked({ check: 'gate-full' })]
}

function contribPassed(): TimelineEntry[] {
	return [...fullGatePassed(), checked({ check: 'contrib' })]
}

function independentApproved(): TimelineEntry[] {
	return [...contribPassed(), ...ended({ station: 'independent-reviewer', verdict: 'approve' })]
}

function independentFixRequested(): TimelineEntry[] {
	return [
		...contribPassed(),
		...ended({ station: 'independent-reviewer', verdict: 'fix-then-repass' }),
	]
}

function duplicatedEnd(params: {
	station: string
	step?: number
	round?: number
	verdict?: StationVerdict
}): TimelineEntry[] {
	const pair = ended(params)

	return [...pair, pair[1]]
}

function disagreedRound(): TimelineEntry[] {
	return [
		...stepDone(1),
		snapshot(1),
		...ended({ station: 'reviewer', round: 1, verdict: 'fix-then-repass' }),
		...ended({ station: 'fixer', round: 1, verdict: 'disagreed' }),
	]
}

const CASES: Case[] = [
	// Row 1
	{
		name: 'row 1: committed',
		records: { state: 'committed' },
		expected: { kind: 'none', why: 'lot committed' },
	},
	{
		name: 'row 1: canceled',
		records: { state: 'canceled' },
		expected: { kind: 'none', why: 'lot canceled' },
	},
	{
		name: 'row 1: failed',
		records: { state: 'failed' },
		expected: { kind: 'none', why: 'lot failed' },
	},
	{
		name: 'case 10, row 1: ready with a walk in its records: the state answers, no station walk',
		records: { state: 'ready', timeline: stepDone(1) },
		expected: { kind: 'none', why: 'lot ready' },
	},

	// Row 2
	{
		name: 'row 2: an open question',
		records: { state: 'input-required', openQuestion: 'q3', timeline: testWritten(1) },
		expected: { kind: 'answer', why: 'question q3 open' },
	},
	{
		name: 'row 2 before row 3: an open question wins over a running station',
		records: {
			state: 'input-required',
			openQuestion: 'q1',
			timeline: [started({ station: 'implementer', step: 1, run: 'run-open' })],
		},
		expected: { kind: 'answer', why: 'question q1 open' },
	},

	// Row 3 and case 8
	{
		name: 'case 8, row 3: a station started, never ended, nothing after it: running',
		records: {
			timeline: [
				started({ station: 'implementer', step: 1, run: 'run-9', at: '2026-11-12T09:30:00.000Z' }),
			],
		},
		expected: {
			kind: 'running',
			station: 'implementer',
			step: 1,
			why: 'implementer running since 2026-11-12T09:30:00.000Z (run run-9)',
		},
	},
	{
		name: 'row 3: a running round station names its round',
		records: {
			timeline: [
				...stepDone(1),
				snapshot(1),
				started({ station: 'reviewer', round: 1, run: 'run-r', at: '2026-11-12T09:31:00.000Z' }),
			],
		},
		expected: {
			kind: 'running',
			station: 'reviewer',
			round: 1,
			why: 'reviewer running since 2026-11-12T09:31:00.000Z (run run-r)',
		},
	},
	{
		name: 'case 8, row 3: a start with no end that a later station start passed is no end and the walk goes on',
		records: {
			timeline: [
				started({ station: 'test-writer', step: 1, run: 'run-lost' }),
				...ended({ station: 'test-writer', step: 1, run: 'run-after' }),
			],
		},
		expected: {
			kind: 'check',
			check: 'tdd-red',
			step: 1,
			why: 'test-writer step 1 ended, red not proved',
			noEnd: ['run-lost'],
		},
	},
	{
		name: 'D32 (R4-2), row 3: a start followed by a later start of another station is no end',
		records: {
			timeline: [
				started({ station: 'test-writer', step: 1, run: 'run-lost' }),
				started({
					station: 'test-reviewer',
					step: 1,
					run: 'run-next',
					at: '2026-11-12T10:05:00.000Z',
				}),
			],
		},
		expected: {
			kind: 'running',
			station: 'test-reviewer',
			step: 1,
			why: 'test-reviewer running since 2026-11-12T10:05:00.000Z (run run-next)',
			noEnd: ['run-lost'],
		},
	},
	{
		name: 'D32 (R4-2), row 3: a test-writer started, then its in-run passing tdd red, no end: running',
		records: {
			timeline: [
				started({ station: 'test-writer', step: 1, run: 'run-tw', at: '2026-11-12T09:40:00.000Z' }),
				checked({ check: 'tdd-red' }),
			],
		},
		expected: {
			kind: 'running',
			station: 'test-writer',
			step: 1,
			why: 'test-writer running since 2026-11-12T09:40:00.000Z (run run-tw)',
		},
	},
	{
		name: 'D32 (R4-2), row 3: an implementer started, then its in-run tdd green and gate fast, no end: running',
		records: {
			timeline: [
				...testsApproved(1),
				started({
					station: 'implementer',
					step: 1,
					run: 'run-impl',
					at: '2026-11-12T09:41:00.000Z',
				}),
				checked({ check: 'tdd-green' }),
				checked({ check: 'gate-fast' }),
			],
		},
		expected: {
			kind: 'running',
			station: 'implementer',
			step: 1,
			why: 'implementer running since 2026-11-12T09:41:00.000Z (run run-impl)',
		},
	},
	{
		name: 'case 8: a lost start, then a retry that ended: the walk goes on from the retry',
		records: {
			timeline: [
				started({ station: 'test-writer', step: 1, run: 'run-lost' }),
				...ended({ station: 'test-writer', step: 1, run: 'run-retry' }),
			],
		},
		expected: {
			kind: 'check',
			check: 'tdd-red',
			step: 1,
			why: 'test-writer step 1 ended, red not proved',
			noEnd: ['run-lost'],
		},
	},

	// Row 4 and case 7
	{
		name: 'row 4: a fresh lot (no station, no worktree records): test-writer step 1',
		records: {},
		expected: { kind: 'station', station: 'test-writer', step: 1, why: 'step 1: no test written' },
	},
	{
		name: 'row 4: the next step after a done step',
		records: { steps: 2, timeline: stepDone(1) },
		expected: { kind: 'station', station: 'test-writer', step: 2, why: 'step 2: no test written' },
	},
	{
		name: 'row 4: a fresh lot whose cli records no steps still starts with the test-writer',
		records: { checks: 'none' },
		expected: { kind: 'station', station: 'test-writer', step: 1, why: 'step 1: no test written' },
	},
	{
		name: 'case 7: no station event, worktree records present: unknown, never test-writer step 1',
		records: { worktreeRecords: true, checks: 'records' },
		expected: { kind: 'unknown', why: 'no station recorded: record them with lot station' },
	},
	{
		name: 'case 7: only checks in the timeline, worktree records present: unknown',
		records: {
			worktreeRecords: true,
			checks: 'records',
			timeline: [checked({ check: 'tdd-green' })],
		},
		expected: { kind: 'unknown', why: 'no station recorded: record them with lot station' },
	},
	{
		name: 'case 7: a station recorded, worktree records present: the walk runs',
		records: { worktreeRecords: true, timeline: [...ended({ station: 'test-writer', step: 1 })] },
		expected: {
			kind: 'check',
			check: 'tdd-red',
			step: 1,
			why: 'test-writer step 1 ended, red not proved',
		},
	},

	// Row 5
	{
		name: 'row 5: test-writer ended, red not proved',
		records: { timeline: ended({ station: 'test-writer', step: 1 }) },
		expected: {
			kind: 'check',
			check: 'tdd-red',
			step: 1,
			why: 'test-writer step 1 ended, red not proved',
		},
	},
	{
		name: 'row 5: a red check before the test-writer end does not count',
		records: {
			timeline: [checked({ check: 'tdd-red' }), ...ended({ station: 'test-writer', step: 1 })],
		},
		expected: {
			kind: 'check',
			check: 'tdd-red',
			step: 1,
			why: 'test-writer step 1 ended, red not proved',
		},
	},
	{
		name: 'row 5: a failed red check does not count',
		records: {
			timeline: [
				...ended({ station: 'test-writer', step: 1 }),
				checked({ check: 'tdd-red', passed: false }),
			],
		},
		expected: {
			kind: 'check',
			check: 'tdd-red',
			step: 1,
			why: 'test-writer step 1 ended, red not proved',
		},
	},
	{
		name: 'row 5: a throwaway red check does not count',
		records: {
			timeline: [
				...ended({ station: 'test-writer', step: 1 }),
				checked({ check: 'tdd-red', throwaway: true }),
			],
		},
		expected: {
			kind: 'check',
			check: 'tdd-red',
			step: 1,
			why: 'test-writer step 1 ended, red not proved',
		},
	},
	{
		name: 'row 5: step 2 needs its own red: the step 1 checks do not count',
		records: {
			steps: 2,
			timeline: [...stepDone(1), ...ended({ station: 'test-writer', step: 2 })],
		},
		expected: {
			kind: 'check',
			check: 'tdd-red',
			step: 2,
			why: 'test-writer step 2 ended, red not proved',
		},
	},
	{
		name: 'case 11: a worktree whose cli records no steps and a check needed: unknown with that reason',
		records: { checks: 'none', timeline: ended({ station: 'test-writer', step: 1 }) },
		expected: { kind: 'unknown', why: "the worktree's cli records no steps" },
	},
	{
		name: 'case 11: checks read from the worktree records stand in for step events',
		records: { checks: 'records', timeline: testWritten(1) },
		expected: {
			kind: 'station',
			station: 'test-reviewer',
			step: 1,
			why: 'step 1: tests not reviewed',
		},
	},

	// Row 6 and cases 3, 4, 6
	{
		name: 'row 6: red proved, tests not reviewed',
		records: { timeline: testWritten(1) },
		expected: {
			kind: 'station',
			station: 'test-reviewer',
			step: 1,
			why: 'step 1: tests not reviewed',
		},
	},
	{
		name: 'row 6: medium effort reviews the tests too',
		records: { effort: 'medium', timeline: testWritten(1) },
		expected: {
			kind: 'station',
			station: 'test-reviewer',
			step: 1,
			why: 'step 1: tests not reviewed',
		},
	},
	{
		name: 'row 6: a review before the last red does not count',
		records: {
			timeline: [
				...testWritten(1),
				...ended({ station: 'test-reviewer', step: 1, verdict: 'approve' }),
				...ended({ station: 'test-writer', step: 1 }),
				checked({ check: 'tdd-red' }),
			],
		},
		expected: {
			kind: 'station',
			station: 'test-reviewer',
			step: 1,
			why: 'step 1: tests not reviewed',
		},
	},
	{
		name: 'row 6: after back, the test-writer again (back 1 of 2)',
		records: {
			timeline: [
				...testWritten(1),
				...ended({ station: 'test-reviewer', step: 1, verdict: 'back' }),
			],
		},
		expected: { kind: 'station', station: 'test-writer', step: 1, why: 'test review back 1 of 2' },
	},
	{
		name: 'row 6: the test-writer ended again after a back: red again',
		records: {
			timeline: [
				...testWritten(1),
				...ended({ station: 'test-reviewer', step: 1, verdict: 'back' }),
				...ended({ station: 'test-writer', step: 1 }),
			],
		},
		expected: {
			kind: 'check',
			check: 'tdd-red',
			step: 1,
			why: 'test-writer step 1 ended, red not proved',
		},
	},
	{
		name: 'row 6: the second back (back 2 of 2)',
		records: {
			timeline: [
				...testWritten(1),
				...ended({ station: 'test-reviewer', step: 1, verdict: 'back' }),
				...testWritten(1),
				...ended({ station: 'test-reviewer', step: 1, verdict: 'back' }),
			],
		},
		expected: { kind: 'station', station: 'test-writer', step: 1, why: 'test review back 2 of 2' },
	},
	{
		name: 'case 4, row 6: the third back asks the person, never a third test-writer',
		records: {
			timeline: [
				...testWritten(1),
				...ended({ station: 'test-reviewer', step: 1, verdict: 'back' }),
				...testWritten(1),
				...ended({ station: 'test-reviewer', step: 1, verdict: 'back' }),
				...testWritten(1),
				...ended({ station: 'test-reviewer', step: 1, verdict: 'back' }),
			],
		},
		expected: { kind: 'question', step: 1, why: 'test review back 3 times' },
	},
	{
		name: 'case 6: two ends of one run count once (back 1 of 2, not 2 of 2)',
		records: {
			timeline: [
				...testWritten(1),
				...duplicatedEnd({ station: 'test-reviewer', step: 1, verdict: 'back' }),
			],
		},
		expected: { kind: 'station', station: 'test-writer', step: 1, why: 'test review back 1 of 2' },
	},
	{
		name: 'case 6: the back count is per step',
		records: {
			steps: 2,
			timeline: [
				...testWritten(1),
				...ended({ station: 'test-reviewer', step: 1, verdict: 'back' }),
				...testWritten(1),
				...ended({ station: 'test-reviewer', step: 1, verdict: 'approve' }),
				...ended({ station: 'implementer', step: 1 }),
				checked({ check: 'tdd-green' }),
				checked({ check: 'gate-fast' }),
				...testWritten(2),
				...ended({ station: 'test-reviewer', step: 2, verdict: 'back' }),
			],
		},
		expected: { kind: 'station', station: 'test-writer', step: 2, why: 'test review back 1 of 2' },
	},
	{
		name: 'case 3: a test-writer end of step 2 after its approval: red again',
		records: {
			steps: 2,
			timeline: [
				...stepDone(1),
				...testsApproved(2),
				...ended({ station: 'test-writer', step: 2 }),
			],
		},
		expected: {
			kind: 'check',
			check: 'tdd-red',
			step: 2,
			why: 'test-writer step 2 ended, red not proved',
		},
	},
	{
		name: 'case 3: then test review of step 2 again',
		records: {
			steps: 2,
			timeline: [
				...stepDone(1),
				...testsApproved(2),
				...ended({ station: 'test-writer', step: 2 }),
				checked({ check: 'tdd-red' }),
			],
		},
		expected: {
			kind: 'station',
			station: 'test-reviewer',
			step: 2,
			why: 'step 2: tests not reviewed',
		},
	},
	{
		name: 'case 3: its back count starts at 0 after an earlier back and an approval',
		records: {
			steps: 2,
			timeline: [
				...stepDone(1),
				...testWritten(2),
				...ended({ station: 'test-reviewer', step: 2, verdict: 'back' }),
				...testsApproved(2),
				...ended({ station: 'test-writer', step: 2 }),
				checked({ check: 'tdd-red' }),
				...ended({ station: 'test-reviewer', step: 2, verdict: 'back' }),
			],
		},
		expected: { kind: 'station', station: 'test-writer', step: 2, why: 'test review back 1 of 2' },
	},

	// Row 7 and 7b
	{
		name: 'row 7: tests approved, not implemented',
		records: { timeline: testsApproved(1) },
		expected: {
			kind: 'station',
			station: 'implementer',
			step: 1,
			why: 'step 1: tests approved, not implemented',
		},
	},
	{
		name: 'row 7: low effort skips the test review: red proved, not implemented',
		records: { effort: 'low', timeline: testWritten(1) },
		expected: {
			kind: 'station',
			station: 'implementer',
			step: 1,
			why: 'step 1: red proved, not implemented',
		},
	},
	{
		name: 'row 7b: the implementer says a test is wrong',
		records: {
			timeline: [
				...testsApproved(1),
				...ended({ station: 'implementer', step: 1, verdict: 'back' }),
			],
		},
		expected: {
			kind: 'station',
			station: 'test-writer',
			step: 1,
			why: 'the implementer says a test is wrong',
		},
	},
	{
		name: 'row 7b: the test-writer ended again after it: red again',
		records: {
			timeline: [
				...testsApproved(1),
				...ended({ station: 'implementer', step: 1, verdict: 'back' }),
				...ended({ station: 'test-writer', step: 1 }),
			],
		},
		expected: {
			kind: 'check',
			check: 'tdd-red',
			step: 1,
			why: 'test-writer step 1 ended, red not proved',
		},
	},

	// Row 8 and cases 1, 2, 9, 14
	{
		name: 'case 1, row 8: an implementer end with no green after it: claim unchecked, never reviewer',
		records: { timeline: stepImplemented(1) },
		expected: {
			kind: 'check',
			check: 'tdd-green-and-gate-fast',
			step: 1,
			why: 'implementer step 1 ended, claim unchecked',
		},
	},
	{
		name: 'row 8: tdd green without the fast gate is not enough',
		records: { timeline: [...stepImplemented(1), checked({ check: 'tdd-green' })] },
		expected: {
			kind: 'check',
			check: 'tdd-green-and-gate-fast',
			step: 1,
			why: 'implementer step 1 ended, claim unchecked',
		},
	},
	{
		name: 'row 8: the fast gate without tdd green is not enough',
		records: { timeline: [...stepImplemented(1), checked({ check: 'gate-fast' })] },
		expected: {
			kind: 'check',
			check: 'tdd-green-and-gate-fast',
			step: 1,
			why: 'implementer step 1 ended, claim unchecked',
		},
	},
	{
		name: 'row 8: checks before the implementer end do not count',
		records: {
			timeline: [
				...testsApproved(1),
				checked({ check: 'tdd-green' }),
				checked({ check: 'gate-fast' }),
				...ended({ station: 'implementer', step: 1 }),
			],
		},
		expected: {
			kind: 'check',
			check: 'tdd-green-and-gate-fast',
			step: 1,
			why: 'implementer step 1 ended, claim unchecked',
		},
	},
	{
		name: 'row 8: both checked after the end: the step is done, the round 1 snapshot is next',
		records: { timeline: stepDone(1) },
		expected: { kind: 'snapshot', round: 1, why: 'round 1 not snapshot' },
	},
	{
		name: 'case 2: a passed tdd green then a later failed one: not checked',
		records: { timeline: [...stepDone(1), checked({ check: 'tdd-green', passed: false })] },
		expected: {
			kind: 'check',
			check: 'tdd-green-and-gate-fast',
			step: 1,
			why: 'implementer step 1 ended, claim unchecked',
		},
	},
	{
		name: 'case 2: a later failed fast gate cancels the earlier passed one',
		records: { timeline: [...stepDone(1), checked({ check: 'gate-fast', passed: false })] },
		expected: {
			kind: 'check',
			check: 'tdd-green-and-gate-fast',
			step: 1,
			why: 'implementer step 1 ended, claim unchecked',
		},
	},
	{
		name: 'case 2: a failed check then a passed one: checked',
		records: {
			timeline: [
				...stepImplemented(1),
				checked({ check: 'tdd-green', passed: false }),
				checked({ check: 'tdd-green' }),
				checked({ check: 'gate-fast' }),
			],
		},
		expected: { kind: 'snapshot', round: 1, why: 'round 1 not snapshot' },
	},
	{
		name: 'case 14: a throwaway tdd green never counts',
		records: {
			timeline: [
				...stepImplemented(1),
				checked({ check: 'tdd-green', throwaway: true }),
				checked({ check: 'gate-fast' }),
			],
		},
		expected: {
			kind: 'check',
			check: 'tdd-green-and-gate-fast',
			step: 1,
			why: 'implementer step 1 ended, claim unchecked',
		},
	},
	{
		name: 'case 9: an implementer end with verdict failed: implementer again, never tdd green',
		records: {
			timeline: [
				...testsApproved(1),
				...ended({ station: 'implementer', step: 1, verdict: 'failed' }),
			],
		},
		expected: {
			kind: 'station',
			station: 'implementer',
			step: 1,
			why: 'implementer again: failed',
		},
	},
	{
		name: 'case 9: a limit verdict runs the station again',
		records: {
			timeline: [
				...testsApproved(1),
				...ended({ station: 'implementer', step: 1, verdict: 'limit' }),
			],
		},
		expected: { kind: 'station', station: 'implementer', step: 1, why: 'implementer again: limit' },
	},
	{
		name: 'case 9: a failed test-writer end: test-writer again',
		records: { timeline: ended({ station: 'test-writer', step: 1, verdict: 'failed' }) },
		expected: {
			kind: 'station',
			station: 'test-writer',
			step: 1,
			why: 'test-writer again: failed',
		},
	},
	{
		name: 'case 9: a failed reviewer end: reviewer again for its round',
		records: {
			timeline: [
				...stepDone(1),
				snapshot(1),
				...ended({ station: 'reviewer', round: 1, verdict: 'failed' }),
			],
		},
		expected: { kind: 'station', station: 'reviewer', round: 1, why: 'reviewer again: failed' },
	},

	// Case 5: unplaced
	{
		name: 'case 5: an implementer end without a step: unplaced, position unchanged',
		records: { timeline: [...testsApproved(1), ...ended({ station: 'implementer' })] },
		expected: {
			kind: 'station',
			station: 'implementer',
			step: 1,
			why: 'step 1: tests approved, not implemented',
			unplaced: 1,
		},
	},
	{
		name: 'case 5: a reviewer end without a round: unplaced, position unchanged',
		records: {
			timeline: [
				...stepDone(1),
				snapshot(1),
				...ended({ station: 'reviewer', verdict: 'approve' }),
			],
		},
		expected: {
			kind: 'station',
			station: 'reviewer',
			round: 1,
			why: 'round 1 snapshot, not reviewed',
			unplaced: 1,
		},
	},
	{
		name: 'case 5: a fixer end without a round outside an independent review: unplaced',
		records: {
			timeline: [
				...stepDone(1),
				snapshot(1),
				...ended({ station: 'reviewer', round: 1, verdict: 'fix-then-repass' }),
				...ended({ station: 'fixer', verdict: 'fixed' }),
			],
		},
		expected: {
			kind: 'station',
			station: 'fixer',
			round: 1,
			why: 'reviewer round 1: fix-then-repass',
			unplaced: 1,
		},
	},
	{
		name: 'case 5: an end of another name is unplaced, never moving the position',
		records: { timeline: ended({ station: 'scribe', step: 1 }) },
		expected: {
			kind: 'station',
			station: 'test-writer',
			step: 1,
			why: 'step 1: no test written',
			unplaced: 1,
		},
	},
	{
		name: 'case 5: two unplaced ends are counted twice',
		records: { timeline: [...ended({ station: 'scribe' }), ...ended({ station: 'implementer' })] },
		expected: {
			kind: 'station',
			station: 'test-writer',
			step: 1,
			why: 'step 1: no test written',
			unplaced: 2,
		},
	},
	{
		name: 'case 5, 6: two ends of one unplaced run are counted once',
		records: { timeline: duplicatedEnd({ station: 'implementer' }) },
		expected: {
			kind: 'station',
			station: 'test-writer',
			step: 1,
			why: 'step 1: no test written',
			unplaced: 1,
		},
	},

	// Rows 9 to 13 and case 12
	{
		name: 'row 9: steps done, no snapshot of round 1',
		records: { effort: 'medium', timeline: stepDone(1) },
		expected: { kind: 'snapshot', round: 1, why: 'round 1 not snapshot' },
	},
	{
		name: 'row 10: round 1 snapshot, not reviewed',
		records: { timeline: [...stepDone(1), snapshot(1)] },
		expected: {
			kind: 'station',
			station: 'reviewer',
			round: 1,
			why: 'round 1 snapshot, not reviewed',
		},
	},
	{
		name: 'row 11: reviewer fix-then-repass: fixer',
		records: {
			timeline: [
				...stepDone(1),
				snapshot(1),
				...ended({ station: 'reviewer', round: 1, verdict: 'fix-then-repass' }),
			],
		},
		expected: {
			kind: 'station',
			station: 'fixer',
			round: 1,
			why: 'reviewer round 1: fix-then-repass',
		},
	},
	{
		name: 'row 11: a fixer end with verdict disagreed: adjudicator',
		records: {
			timeline: [
				...stepDone(1),
				snapshot(1),
				...ended({ station: 'reviewer', round: 1, verdict: 'fix-then-repass' }),
				...ended({ station: 'fixer', round: 1, verdict: 'disagreed' }),
			],
		},
		expected: {
			kind: 'station',
			station: 'adjudicator',
			round: 1,
			why: 'fixer round 1: disagreed',
		},
	},
	{
		name: 'row 12: fixer ended, no fast gate after it',
		records: {
			timeline: [
				...stepDone(1),
				snapshot(1),
				...ended({ station: 'reviewer', round: 1, verdict: 'fix-then-repass' }),
				...ended({ station: 'fixer', round: 1, verdict: 'fixed' }),
			],
		},
		expected: {
			kind: 'check',
			check: 'gate-fast',
			round: 1,
			why: 'fixer round 1 ended, claim unchecked',
		},
	},
	{
		name: 'case 14, row 12: a throwaway fast gate from a review never counts',
		records: {
			timeline: [
				...stepDone(1),
				snapshot(1),
				...ended({ station: 'reviewer', round: 1, verdict: 'fix-then-repass' }),
				...ended({ station: 'fixer', round: 1, verdict: 'fixed' }),
				checked({ check: 'gate-fast', throwaway: true }),
			],
		},
		expected: {
			kind: 'check',
			check: 'gate-fast',
			round: 1,
			why: 'fixer round 1 ended, claim unchecked',
		},
	},
	{
		name: 'row 12: a fast gate before the fixer end does not count',
		records: {
			timeline: [
				...stepDone(1),
				snapshot(1),
				...ended({ station: 'reviewer', round: 1, verdict: 'fix-then-repass' }),
				checked({ check: 'gate-fast' }),
				...ended({ station: 'fixer', round: 1, verdict: 'fixed' }),
			],
		},
		expected: {
			kind: 'check',
			check: 'gate-fast',
			round: 1,
			why: 'fixer round 1 ended, claim unchecked',
		},
	},
	{
		name: 'row 12, 9: fixer checked: the round 2 snapshot (cap 3)',
		records: { timeline: fixedRounds(1) },
		expected: { kind: 'snapshot', round: 2, why: 'round 2 not snapshot' },
	},
	{
		name: 'row 10: round 2 snapshot taken, not reviewed',
		records: { timeline: [...fixedRounds(1), snapshot(2)] },
		expected: {
			kind: 'station',
			station: 'reviewer',
			round: 2,
			why: 'round 2 snapshot, not reviewed',
		},
	},
	{
		name: 'case 12, row 13: round 3 at cap 3 fixed, no approve: the person question, never a silent stall',
		records: { effort: 'high', timeline: fixedRounds(3) },
		expected: { kind: 'question', round: 4, why: 'round cap 3 reached' },
	},
	{
		name: 'row 13: medium cap 2',
		records: { effort: 'medium', timeline: fixedRounds(2) },
		expected: { kind: 'question', round: 3, why: 'round cap 2 reached' },
	},
	{
		name: 'row 13: low cap 1',
		records: { effort: 'low', timeline: fixedRounds(1) },
		expected: { kind: 'question', round: 2, why: 'round cap 1 reached' },
	},
	{
		name: 'row 13: undefined effort at round 2: cap 1, the person question',
		records: { effort: undefined, timeline: fixedRounds(1) },
		expected: { kind: 'question', round: 2, why: 'round cap 1 reached' },
	},
	{
		name: 'row 9: a go-ahead for round 4 allows its snapshot',
		records: { effort: 'high', beyondCap: [4], timeline: fixedRounds(3) },
		expected: { kind: 'snapshot', round: 4, why: 'round 4 not snapshot' },
	},
	{
		name: 'row 9: a go-ahead for round 5 does not allow round 4',
		records: { effort: 'high', beyondCap: [5], timeline: fixedRounds(3) },
		expected: { kind: 'question', round: 4, why: 'round cap 3 reached' },
	},
	{
		name: 'row 9: undefined effort with a go-ahead for round 2: round 2 snapshot',
		records: { effort: undefined, beyondCap: [2], timeline: fixedRounds(1) },
		expected: { kind: 'snapshot', round: 2, why: 'round 2 not snapshot' },
	},

	// D16-4: the adjudicator
	{
		name: 'D16-4: an adjudicator end after the fixer disagreed: the fast gate, round 1',
		records: {
			timeline: [
				...disagreedRound(),
				...ended({ station: 'adjudicator', round: 1, verdict: 'fixed' }),
			],
		},
		expected: {
			kind: 'check',
			check: 'gate-fast',
			round: 1,
			why: 'fixer round 1 ended, claim unchecked',
		},
	},
	{
		name: 'D16-4: a fast gate between the fixer and adjudicator ends does not count',
		records: {
			timeline: [
				...stepDone(1),
				snapshot(1),
				...ended({ station: 'reviewer', round: 1, verdict: 'fix-then-repass' }),
				...ended({ station: 'fixer', round: 1, verdict: 'disagreed' }),
				checked({ check: 'gate-fast' }),
				...ended({ station: 'adjudicator', round: 1, verdict: 'fixed' }),
			],
		},
		expected: {
			kind: 'check',
			check: 'gate-fast',
			round: 1,
			why: 'fixer round 1 ended, claim unchecked',
		},
	},
	{
		name: 'D16-4: a fast gate after both ends: the round 2 snapshot',
		records: {
			timeline: [
				...disagreedRound(),
				...ended({ station: 'adjudicator', round: 1, verdict: 'fixed' }),
				checked({ check: 'gate-fast' }),
			],
		},
		expected: { kind: 'snapshot', round: 2, why: 'round 2 not snapshot' },
	},

	// D16-5
	{
		name: 'D16-5: registered after the independent approve, lot still working: hand-over written',
		records: { registered: true, timeline: independentApproved() },
		expected: { kind: 'none', why: 'hand-over written' },
	},

	// D16-7
	{
		name: 'D16-7: a test-writer end with exit 1 and no verdict: not ended, test-writer again',
		records: { timeline: ended({ station: 'test-writer', step: 1, exit: 1 }) },
		expected: {
			kind: 'station',
			station: 'test-writer',
			step: 1,
			why: 'test-writer again: exit 1',
		},
	},
	{
		name: 'D16-7: an implementer end with exit 2 and no verdict: implementer again',
		records: {
			timeline: [...testsApproved(1), ...ended({ station: 'implementer', step: 1, exit: 2 })],
		},
		expected: {
			kind: 'station',
			station: 'implementer',
			step: 1,
			why: 'implementer again: exit 2',
		},
	},

	// D16-9
	{
		name: 'D16-9: an unended start followed only by a snapshot is no end and the walk goes on',
		records: {
			timeline: [started({ station: 'test-writer', step: 1, run: 'run-snap' }), snapshot(1)],
		},
		expected: {
			kind: 'station',
			station: 'test-writer',
			step: 1,
			why: 'step 1: no test written',
			noEnd: ['run-snap'],
		},
	},

	// D16-6
	{
		name: 'D16-6: undefined effort runs the test review: test-reviewer step 1',
		records: { effort: undefined, timeline: testWritten(1) },
		expected: {
			kind: 'station',
			station: 'test-reviewer',
			step: 1,
			why: 'step 1: tests not reviewed',
		},
	},

	// T1-6
	{
		name: 'T1-6: cap 3, reviewer round 3 fix-then-repass, no fixer yet: fixer round 3',
		records: {
			timeline: [
				...fixedRounds(2),
				snapshot(3),
				...ended({ station: 'reviewer', round: 3, verdict: 'fix-then-repass' }),
			],
		},
		expected: {
			kind: 'station',
			station: 'fixer',
			round: 3,
			why: 'reviewer round 3: fix-then-repass',
		},
	},
	{
		name: 'T1-6: cap 3, fixer round 3 ended with no gate: the fast gate, before the question',
		records: {
			timeline: [
				...fixedRounds(2),
				snapshot(3),
				...ended({ station: 'reviewer', round: 3, verdict: 'fix-then-repass' }),
				...ended({ station: 'fixer', round: 3, verdict: 'fixed' }),
			],
		},
		expected: {
			kind: 'check',
			check: 'gate-fast',
			round: 3,
			why: 'fixer round 3 ended, claim unchecked',
		},
	},

	// T1-7
	{
		name: 'T1-7: a passed fast gate after the test-writer end does not prove the red',
		records: {
			timeline: [...ended({ station: 'test-writer', step: 1 }), checked({ check: 'gate-fast' })],
		},
		expected: {
			kind: 'check',
			check: 'tdd-red',
			step: 1,
			why: 'test-writer step 1 ended, red not proved',
		},
	},
	{
		name: 'T1-7: a passed fast gate after the approve is not the full gate',
		records: { timeline: [...reviewApproved(), checked({ check: 'gate-fast' })] },
		expected: {
			kind: 'check',
			check: 'gate-full',
			why: 'review approved, no full gate after the last edit',
		},
	},

	// T1-8
	{
		name: 'T1-8: a failed fast gate after the fixer: the fast gate again, never back to row 8',
		records: {
			timeline: [
				...stepDone(1),
				snapshot(1),
				...ended({ station: 'reviewer', round: 1, verdict: 'fix-then-repass' }),
				...ended({ station: 'fixer', round: 1, verdict: 'fixed' }),
				checked({ check: 'gate-fast', passed: false }),
			],
		},
		expected: {
			kind: 'check',
			check: 'gate-fast',
			round: 1,
			why: 'fixer round 1 ended, claim unchecked',
		},
	},

	// Row 14 (D10: accept at the cap)
	{
		name: 'row 14: reviewer approve: the full gate',
		records: { timeline: reviewApproved() },
		expected: {
			kind: 'check',
			check: 'gate-full',
			why: 'review approved, no full gate after the last edit',
		},
	},
	{
		name: 'row 14, D10: the person accepts at the cap (a later reviewer approve of the round): the full gate',
		records: {
			timeline: [
				...fixedRounds(3),
				...ended({ station: 'reviewer', round: 3, verdict: 'approve' }),
			],
		},
		expected: {
			kind: 'check',
			check: 'gate-full',
			why: 'review approved, no full gate after the last edit',
		},
	},
	{
		name: 'row 14, D10: the last reviewer end of a round decides its verdict (approve, then a fix again)',
		records: {
			timeline: [
				...reviewApproved(),
				...ended({ station: 'reviewer', round: 1, verdict: 'fix-then-repass' }),
			],
		},
		expected: {
			kind: 'station',
			station: 'fixer',
			round: 1,
			why: 'reviewer round 1: fix-then-repass',
		},
	},
	{
		name: 'case 14, row 14: a throwaway full gate never counts',
		records: { timeline: [...reviewApproved(), checked({ check: 'gate-full', throwaway: true })] },
		expected: {
			kind: 'check',
			check: 'gate-full',
			why: 'review approved, no full gate after the last edit',
		},
	},
	{
		name: 'row 14: a failed full gate does not count',
		records: { timeline: [...reviewApproved(), checked({ check: 'gate-full', passed: false })] },
		expected: {
			kind: 'check',
			check: 'gate-full',
			why: 'review approved, no full gate after the last edit',
		},
	},
	{
		name: 'row 14: a passed full gate then a later failed one: the full gate again',
		records: { timeline: [...fullGatePassed(), checked({ check: 'gate-full', passed: false })] },
		expected: {
			kind: 'check',
			check: 'gate-full',
			why: 'review approved, no full gate after the last edit',
		},
	},

	// Row 15 and 16
	{
		name: 'row 15: full gate passed, producer: contrib',
		records: { producer: true, timeline: fullGatePassed() },
		expected: { kind: 'check', check: 'contrib', why: 'full gate passed, contrib not run' },
	},
	{
		name: 'row 15: a contrib check before the full gate does not count',
		records: {
			producer: true,
			timeline: [
				...reviewApproved(),
				checked({ check: 'contrib' }),
				checked({ check: 'gate-full' }),
			],
		},
		expected: { kind: 'check', check: 'contrib', why: 'full gate passed, contrib not run' },
	},
	{
		name: 'row 15: a failed contrib check does not count',
		records: {
			producer: true,
			timeline: [...fullGatePassed(), checked({ check: 'contrib', passed: false })],
		},
		expected: { kind: 'check', check: 'contrib', why: 'full gate passed, contrib not run' },
	},
	{
		name: 'row 15: not a producer: no contrib row, the independent review',
		records: { producer: false, timeline: fullGatePassed() },
		expected: {
			kind: 'station',
			station: 'independent-reviewer',
			why: 'no independent review after the full gate',
		},
	},
	{
		name: 'row 16: contrib passed: the independent review',
		records: { timeline: contribPassed() },
		expected: {
			kind: 'station',
			station: 'independent-reviewer',
			why: 'no independent review after the full gate',
		},
	},
	{
		name: 'row 16: an independent review before the full gate does not count',
		records: {
			producer: false,
			timeline: [
				...reviewApproved(),
				...ended({ station: 'independent-reviewer', verdict: 'approve' }),
				checked({ check: 'gate-full' }),
			],
		},
		expected: {
			kind: 'station',
			station: 'independent-reviewer',
			why: 'no independent review after the full gate',
		},
	},

	{
		name: 'R2-3 (D30): an independent-reviewer end with no verdict: unknown, never the hand-over',
		records: { timeline: [...contribPassed(), ...ended({ station: 'independent-reviewer' })] },
		expected: { kind: 'unknown', why: 'independent-reviewer ended without a verdict' },
	},
	{
		name: 'R2-3 (D30): an independent-reviewer end with an unexpected verdict (fixed): unknown, never the hand-over',
		records: {
			timeline: [
				...contribPassed(),
				...ended({ station: 'independent-reviewer', verdict: 'fixed' }),
			],
		},
		expected: { kind: 'unknown', why: 'independent-reviewer ended with fixed' },
	},

	// Row 16b and case 13 (D11)
	{
		name: 'row 16b: independent review fix-then-repass: the fixer, no round',
		records: { timeline: independentFixRequested() },
		expected: { kind: 'station', station: 'fixer', why: 'independent review: fix-then-repass' },
	},
	{
		name: 'case 13, D11: the fixer of the independent review ends with no round: placed, not unplaced, then the fast gate',
		records: {
			timeline: [...independentFixRequested(), ...ended({ station: 'fixer', verdict: 'fixed' })],
		},
		expected: {
			kind: 'check',
			check: 'gate-fast',
			why: 'independent review fixer ended, claim unchecked',
		},
	},
	{
		name: 'case 13, D11: the fixer of the independent review may name a round: placed as well',
		records: {
			timeline: [
				...independentFixRequested(),
				...ended({ station: 'fixer', round: 4, verdict: 'fixed' }),
			],
		},
		expected: {
			kind: 'check',
			check: 'gate-fast',
			why: 'independent review fixer ended, claim unchecked',
		},
	},
	{
		name: 'case 13: then the full gate again',
		records: {
			timeline: [
				...independentFixRequested(),
				...ended({ station: 'fixer', verdict: 'fixed' }),
				checked({ check: 'gate-fast' }),
			],
		},
		expected: {
			kind: 'check',
			check: 'gate-full',
			why: 'review approved, no full gate after the last edit',
		},
	},
	{
		name: 'case 13: then contrib again',
		records: {
			timeline: [
				...independentFixRequested(),
				...ended({ station: 'fixer', verdict: 'fixed' }),
				checked({ check: 'gate-fast' }),
				checked({ check: 'gate-full' }),
			],
		},
		expected: { kind: 'check', check: 'contrib', why: 'full gate passed, contrib not run' },
	},
	{
		name: 'case 13: then the independent review again, never the hand-over first',
		records: {
			timeline: [
				...independentFixRequested(),
				...ended({ station: 'fixer', verdict: 'fixed' }),
				checked({ check: 'gate-fast' }),
				checked({ check: 'gate-full' }),
				checked({ check: 'contrib' }),
			],
		},
		expected: {
			kind: 'station',
			station: 'independent-reviewer',
			why: 'no independent review after the full gate',
		},
	},
	{
		name: 'case 13: the verifying pass approves: the hand-over',
		records: {
			timeline: [
				...independentFixRequested(),
				...ended({ station: 'fixer', verdict: 'fixed' }),
				checked({ check: 'gate-fast' }),
				checked({ check: 'gate-full' }),
				checked({ check: 'contrib' }),
				...ended({ station: 'independent-reviewer', verdict: 'approve' }),
			],
		},
		expected: { kind: 'handover-write', why: 'no hand-over written' },
	},

	// Row 17
	{
		name: 'row 17: independent review approved, no registry entry: write the hand-over',
		records: { registered: false, timeline: independentApproved() },
		expected: { kind: 'handover-write', why: 'no hand-over written' },
	},
	{
		name: 'row 17: not a producer, independent review approved: write the hand-over',
		records: {
			producer: false,
			timeline: [
				...fullGatePassed(),
				...ended({ station: 'independent-reviewer', verdict: 'approve' }),
			],
		},
		expected: { kind: 'handover-write', why: 'no hand-over written' },
	},

	// Unknown through the checks
	{
		name: 'case 11: a full gate needed and a cli that records no steps: unknown with that reason',
		records: { checks: 'none', timeline: reviewApproved() },
		expected: { kind: 'unknown', why: "the worktree's cli records no steps" },
	},

	// R1-1 (D28): in records mode a worktree keeps one gate record per mode; a later green record covers earlier claims
	{
		name: 'R1-1: records mode, two steps, one gate-fast record after step 2: step 1 is covered, the round 1 snapshot is next',
		records: {
			checks: 'records',
			steps: 2,
			timeline: [
				...stepImplemented(1),
				checked({ check: 'tdd-green' }),
				...stepImplemented(2),
				checked({ check: 'tdd-green' }),
				checked({ check: 'gate-fast' }),
			],
		},
		expected: { kind: 'snapshot', round: 1, why: 'round 1 not snapshot' },
	},
	{
		name: 'R1-1: records mode, two rounds, one gate-fast record after round 2: round 1 is covered, the round 3 snapshot is next',
		records: {
			checks: 'records',
			timeline: [
				...stepImplemented(1),
				checked({ check: 'tdd-green' }),
				snapshot(1),
				...ended({ station: 'reviewer', round: 1, verdict: 'fix-then-repass' }),
				...ended({ station: 'fixer', round: 1, verdict: 'fixed' }),
				snapshot(2),
				...ended({ station: 'reviewer', round: 2, verdict: 'fix-then-repass' }),
				...ended({ station: 'fixer', round: 2, verdict: 'fixed' }),
				checked({ check: 'gate-fast' }),
			],
		},
		expected: { kind: 'snapshot', round: 3, why: 'round 3 not snapshot' },
	},
	{
		name: 'R1-1: records mode, a later FAILED gate-fast record after step 2: the claim is unchecked (D12 stays)',
		records: {
			checks: 'records',
			steps: 2,
			timeline: [
				...stepImplemented(1),
				checked({ check: 'tdd-green' }),
				...stepImplemented(2),
				checked({ check: 'tdd-green' }),
				checked({ check: 'gate-fast', passed: false }),
			],
		},
		expected: {
			kind: 'check',
			check: 'tdd-green-and-gate-fast',
			step: 1,
			why: 'implementer step 1 ended, claim unchecked',
		},
	},

	// R1-2 (D28): an end approves only with the verdict approve
	{
		name: 'R1-2: a reviewer end with no verdict: unknown, never the full gate',
		records: {
			timeline: [...stepDone(1), snapshot(1), ...ended({ station: 'reviewer', round: 1 })],
		},
		expected: { kind: 'unknown', why: 'reviewer ended without a verdict' },
	},
	{
		name: 'R1-2: a reviewer end with an unexpected verdict (fixed): unknown, never the full gate',
		records: {
			timeline: [
				...stepDone(1),
				snapshot(1),
				...ended({ station: 'reviewer', round: 1, verdict: 'fixed' }),
			],
		},
		expected: { kind: 'unknown', why: 'reviewer ended with fixed' },
	},
	{
		name: 'R1-2: a test-reviewer end with no verdict: unknown, never the implementer',
		records: {
			timeline: [...testWritten(1), ...ended({ station: 'test-reviewer', step: 1 })],
		},
		expected: { kind: 'unknown', why: 'test-reviewer ended without a verdict' },
	},
	{
		name: 'R1-2: a test-reviewer end with an unexpected verdict (fixed): unknown, never the implementer',
		records: {
			timeline: [
				...testWritten(1),
				...ended({ station: 'test-reviewer', step: 1, verdict: 'fixed' }),
			],
		},
		expected: { kind: 'unknown', why: 'test-reviewer ended with fixed' },
	},

	// R1-7 (D29): a check inside the station's run counts when its state hash is the end's
	{
		name: 'D29: test-writer, tdd red inside the run on the end state: red proved, the test-reviewer is next',
		records: {
			timeline: endedAround({
				station: 'test-writer',
				step: 1,
				within: [checked({ check: 'tdd-red', stateHash: 'h1' })],
				stateHash: 'h1',
			}),
		},
		expected: {
			kind: 'station',
			station: 'test-reviewer',
			step: 1,
			why: 'step 1: tests not reviewed',
		},
	},
	{
		name: 'D29: implementer, tdd green and gate --fast inside the run on the end state: the step is done, the round 1 snapshot is next',
		records: {
			timeline: [
				...testsApproved(1),
				...endedAround({
					station: 'implementer',
					step: 1,
					within: [
						checked({ check: 'tdd-green', stateHash: 'h2' }),
						checked({ check: 'gate-fast', stateHash: 'h2' }),
					],
					stateHash: 'h2',
				}),
			],
		},
		expected: { kind: 'snapshot', round: 1, why: 'round 1 not snapshot' },
	},
	{
		name: 'D29: tdd red inside the run on another state than the end (files edited after it): not counted, tdd red asked',
		records: {
			timeline: endedAround({
				station: 'test-writer',
				step: 1,
				within: [checked({ check: 'tdd-red', stateHash: 'h1' })],
				stateHash: 'h9',
			}),
		},
		expected: {
			kind: 'check',
			check: 'tdd-red',
			step: 1,
			why: 'test-writer step 1 ended, red not proved',
		},
	},
	{
		name: 'D29: gate --fast inside the run on another state than the end: not counted, tdd green and gate --fast asked',
		records: {
			timeline: [
				...testsApproved(1),
				...endedAround({
					station: 'implementer',
					step: 1,
					within: [
						checked({ check: 'tdd-green', stateHash: 'h2' }),
						checked({ check: 'gate-fast', stateHash: 'h3' }),
					],
					stateHash: 'h2',
				}),
			],
		},
		expected: {
			kind: 'check',
			check: 'tdd-green-and-gate-fast',
			step: 1,
			why: 'implementer step 1 ended, claim unchecked',
		},
	},
	{
		name: 'D29: an end with no stateHash (an older event) and a hashed check inside the run: not counted',
		records: {
			timeline: endedAround({
				station: 'test-writer',
				step: 1,
				within: [checked({ check: 'tdd-red', stateHash: 'h1' })],
			}),
		},
		expected: {
			kind: 'check',
			check: 'tdd-red',
			step: 1,
			why: 'test-writer step 1 ended, red not proved',
		},
	},
	{
		name: 'D29: a check inside the run with no stateHash and an end with one: not counted',
		records: {
			timeline: endedAround({
				station: 'test-writer',
				step: 1,
				within: [checked({ check: 'tdd-red' })],
				stateHash: 'h1',
			}),
		},
		expected: {
			kind: 'check',
			check: 'tdd-red',
			step: 1,
			why: 'test-writer step 1 ended, red not proved',
		},
	},
	{
		name: 'D29: a later FAILED tdd red after an in-run pass on the end state: not counted (D12)',
		records: {
			timeline: [
				...endedAround({
					station: 'test-writer',
					step: 1,
					within: [checked({ check: 'tdd-red', stateHash: 'h1' })],
					stateHash: 'h1',
				}),
				checked({ check: 'tdd-red', passed: false }),
			],
		},
		expected: {
			kind: 'check',
			check: 'tdd-red',
			step: 1,
			why: 'test-writer step 1 ended, red not proved',
		},
	},
]

describe('nextStation', () => {
	for (const { name, records, expected } of CASES)
		it(name, () => {
			expect(nextStation({ ...BASE_RECORDS, ...records })).toEqual({
				...BASE_EXPECTED,
				...expected,
			})
		})
})
