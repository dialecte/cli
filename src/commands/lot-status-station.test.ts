/**
 * `lot status` from the records (33L1 section 4, "Output", cases 7, 11, 14; D2, D14): the `station` and `rounds`
 * blocks of the JSON, the station's command in `next` with the manual line in `also`, the added text line, and a
 * read that writes nothing. Lots are built by hand in a scratch store (events at named seconds, snapshots, a worktree's
 * ledger and gate records); the walk's own rows are in `next-station.test.ts`.
 */
import { join } from 'node:path'

import { appendLotEvents, writeLedger } from '../../test/lot-report-workspace.ts'
import { snapshotOf, withLines } from '../../test/lot-start-workspace.ts'
import { STATION_LOT } from '../../test/lot-station-workspace.constants.ts'
import { createStationLot } from '../../test/lot-station-workspace.ts'
import { DECISION_DAY, PRODUCER_PACKAGE } from '../../test/station-records-workspace.constants.ts'
import {
	playMoves,
	setIdentityEffort,
	stationMove,
	writeLotBrief,
	writeSnapshot,
	writeWorktreePackage,
} from '../../test/station-records-workspace.ts'
import { entryOf, questionTransitionOf, writeRecordFile } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { appendDecision } from '../lib/review-rounds/decisions-file.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StationLot } from '../../test/lot-station-workspace.types.ts'
import type { Move } from '../../test/station-records-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NAME = STATION_LOT
const MANUAL = `run the stations, then dialecte handover write <lots.json> --out ${NAME}`

type StationBlock = {
	kind: string
	station: string | null
	check: string | null
	step: number | null
	round: number | null
	why: string
	unplaced: number
	noEnd: string[]
}

type RoundsBlock = {
	review: number
	cap: number | null
	/** The effort the cap was taken from; null when none is known (R1-13). */
	effort: 'low' | 'medium' | 'high' | null
	/** The brief's step count (R1-13). */
	steps: number
	beyondCap: { round: number; by: string; reason: string }[]
	independent: number
}

/** The effort a cap comes from. */
const EFFORT_OF_CAP: Record<string, RoundsBlock['effort']> = { 1: 'low', 2: 'medium', 3: 'high' }

/** The station block of a walk's answer: the fields the case does not name are empty. */
function stationBlock(
	fields: Partial<StationBlock> & Pick<StationBlock, 'kind' | 'why'>,
): StationBlock {
	return {
		station: null,
		check: null,
		step: null,
		round: null,
		unplaced: 0,
		noEnd: [],
		...fields,
	}
}

/** The rounds block of a walk's answer: the effort follows the cap (1 low, 2 medium, 3 high, none null) unless given. */
function roundsBlock(fields: Partial<RoundsBlock> = {}): RoundsBlock {
	const cap = fields.cap === undefined ? 2 : fields.cap

	return {
		review: 0,
		cap,
		effort: cap === null ? null : EFFORT_OF_CAP[cap],
		steps: 1,
		beyondCap: [],
		independent: 0,
		...fields,
	}
}

/** The status JSON of the lot, the four fields a case compares. */
function statusOf(lot: StationLot) {
	const result = runLot({ cwd: lot.cwd, argv: ['status', lot.name, '--json'] })
	const json = JSON.parse(result.output) as Record<string, unknown>

	return {
		exitCode: result.exitCode,
		station: json.station,
		rounds: json.rounds,
		next: json.next,
		also: json.also,
	}
}

type SetupParams = {
	/** The brief's step count (1 unless said). */
	steps?: number
	/** The identity's effort level: `medium` (the helper's default) unless said. */
	effort?: 'low' | 'medium' | 'high'
	/** Neither the identity nor the brief names an effort. */
	noEffort?: boolean
	/** The worktree's cli writes no step events. */
	noStepEvents?: boolean
	/** The worktree package declares the contributor profile. */
	producer?: boolean
	moves: Move[]
}

function build(params: SetupParams): StationLot {
	const lot = createStationLot()
	if (params.steps !== undefined || params.noEffort)
		writeLotBrief({ lot, stepCount: params.steps ?? 1 })
	if (params.noEffort) setIdentityEffort({ lot, level: undefined })
	if (params.effort !== undefined) setIdentityEffort({ lot, level: params.effort })
	if (params.producer) writeWorktreePackage({ lot, manifest: PRODUCER_PACKAGE })
	playMoves({ lot, moves: params.moves, noStepEvents: params.noStepEvents })

	return lot
}

/** A lot with a pending hand-over: ready. */
function readyLot(): StationLot {
	const lot = createStationLot()
	writeRecordFile({
		folder: lot.workspace.registry,
		name: `${lot.name}.json`,
		text: JSON.stringify({
			...entryOf({ state: 'pending', folder: lot.lotFolder }),
			name: lot.name,
		}),
	})

	return lot
}

/** A lot with one open question q1: input-required. */
function questionLot(): StationLot {
	const lot = createStationLot()
	writeRecordFile({
		folder: lot.lotFolder,
		name: 'transitions/000002.json',
		text: `${JSON.stringify({ ...questionTransitionOf({ seq: 2, number: 1 }), simulated: false })}\n`,
	})

	return lot
}

// The story of one step at low effort (no test review): written, red, implemented, green and fast gate.
const WRITTEN: Move[] = [{ station: 'test-writer', step: 1 }]
const RED: Move[] = [...WRITTEN, { check: 'tdd-red' }]
const IMPLEMENTED: Move[] = [...RED, { station: 'implementer', step: 1 }]
const CHECKED: Move[] = [...IMPLEMENTED, { check: 'tdd-green' }, { check: 'gate-fast' }]
const SNAPSHOT_ONE: Move[] = [...CHECKED, { snapshot: 1 }]
const REVIEWER_FIX: Move[] = [
	...SNAPSHOT_ONE,
	{ station: 'reviewer', round: 1, verdict: 'fix-then-repass' },
]
const FIXED: Move[] = [...REVIEWER_FIX, { station: 'fixer', round: 1 }]
const APPROVED: Move[] = [...SNAPSHOT_ONE, { station: 'reviewer', round: 1, verdict: 'approve' }]
const FULL_GATE: Move[] = [...APPROVED, { check: 'gate-full' }]
const INDEPENDENT: Move[] = [...FULL_GATE, { station: 'independent-reviewer', verdict: 'approve' }]

const STEP_TWO_IMPLEMENTED: Move[] = [
	{ station: 'test-writer', step: 1 },
	{ check: 'tdd-red' },
	{ station: 'test-reviewer', step: 1, verdict: 'approve' },
	{ station: 'implementer', step: 1 },
	{ check: 'tdd-green' },
	{ check: 'gate-fast' },
	{ station: 'test-writer', step: 2 },
	{ check: 'tdd-red' },
	{ station: 'test-reviewer', step: 2, verdict: 'approve' },
	{ station: 'implementer', step: 2 },
]

type StatusCase = {
	title: string
	setup: SetupParams
	station: StationBlock
	rounds?: RoundsBlock
	next: string
	also: string[]
}

const NEXT_CASES: StatusCase[] = [
	{
		title:
			'no station event, no record: test-writer step 1, the station command, the manual line kept in also',
		setup: { moves: [] },
		station: stationBlock({
			kind: 'station',
			station: 'test-writer',
			step: 1,
			why: 'step 1: no test written',
		}),
		next: `dialecte lot station ${NAME} start test-writer --step 1`,
		also: [MANUAL],
	},
	{
		title: 'low effort, test-writer ended: the red is to be proved (dialecte tdd red)',
		setup: { effort: 'low', moves: WRITTEN },
		station: stationBlock({
			kind: 'check',
			check: 'tdd-red',
			step: 1,
			why: 'test-writer step 1 ended, red not proved',
		}),
		rounds: roundsBlock({ cap: 1 }),
		next: 'dialecte tdd red',
		also: [MANUAL],
	},
	{
		title:
			'medium, three steps, implementer step 2 ended and no green: tdd green and gate --fast, the manual line in also (case 1)',
		setup: { steps: 3, moves: STEP_TWO_IMPLEMENTED },
		station: stationBlock({
			kind: 'check',
			check: 'tdd-green-and-gate-fast',
			step: 2,
			why: 'implementer step 2 ended, claim unchecked',
		}),
		rounds: roundsBlock({ steps: 3 }),
		next: 'dialecte tdd green && dialecte gate --fast',
		also: [MANUAL],
	},
	{
		title: 'low effort, a running implementer: the end command with its run',
		setup: { effort: 'low', moves: [...RED, { open: 'implementer', step: 1 }] },
		station: stationBlock({
			kind: 'running',
			station: 'implementer',
			step: 1,
			why: 'implementer running since 2026-11-09T10:00:05.000Z (run run-implementer-5)',
		}),
		rounds: roundsBlock({ cap: 1 }),
		next: `dialecte lot station ${NAME} end implementer --run run-implementer-5`,
		also: [MANUAL],
	},
	{
		title: 'low effort, step checked: the snapshot of round 1',
		setup: { effort: 'low', moves: CHECKED },
		station: stationBlock({
			kind: 'snapshot',
			round: 1,
			why: 'round 1 not snapshot',
		}),
		rounds: roundsBlock({ cap: 1 }),
		next: `dialecte lot snapshot ${NAME} --round 1`,
		also: [MANUAL],
	},
	{
		title: 'a snapshot taken, no reviewer yet: reviewer round 1, the station command with --round',
		setup: { effort: 'low', moves: SNAPSHOT_ONE },
		station: stationBlock({
			kind: 'station',
			station: 'reviewer',
			round: 1,
			why: 'round 1 snapshot, not reviewed',
		}),
		rounds: roundsBlock({ cap: 1, review: 1 }),
		next: `dialecte lot station ${NAME} start reviewer --round 1`,
		also: [MANUAL],
	},
	{
		title: 'reviewer said fix-then-repass: fixer round 1',
		setup: { effort: 'low', moves: REVIEWER_FIX },
		station: stationBlock({
			kind: 'station',
			station: 'fixer',
			round: 1,
			why: 'reviewer round 1: fix-then-repass',
		}),
		rounds: roundsBlock({ cap: 1, review: 1 }),
		next: `dialecte lot station ${NAME} start fixer --round 1`,
		also: [MANUAL],
	},
	{
		title: 'the fixer ended, no fast gate after it: gate --fast',
		setup: { effort: 'low', moves: FIXED },
		station: stationBlock({
			kind: 'check',
			check: 'gate-fast',
			round: 1,
			why: 'fixer round 1 ended, claim unchecked',
		}),
		rounds: roundsBlock({ cap: 1, review: 1 }),
		next: 'dialecte gate --fast',
		also: [MANUAL],
	},
	{
		title:
			'cap 1 reached after a fix-then-repass, fixed and gated: the question to the person, with the --beyond-cap command of round 2',
		setup: { effort: 'low', moves: [...FIXED, { check: 'gate-fast' }] },
		station: stationBlock({ kind: 'question', round: 2, why: 'round cap 1 reached' }),
		rounds: roundsBlock({ cap: 1, review: 1 }),
		next: `dialecte lot snapshot ${NAME} --round 2 --beyond-cap --by <who> --reason <text>`,
		also: [MANUAL],
	},
	{
		title: 'reviewer approved, no full gate after the last edit: gate --full',
		setup: { effort: 'low', moves: APPROVED },
		station: stationBlock({
			kind: 'check',
			check: 'gate-full',
			why: 'review approved, no full gate after the last edit',
		}),
		rounds: roundsBlock({ cap: 1, review: 1 }),
		next: 'dialecte gate --full',
		also: [MANUAL],
	},
	{
		title: 'a producer, the full gate passed: contrib',
		setup: { effort: 'low', producer: true, moves: FULL_GATE },
		station: stationBlock({
			kind: 'check',
			check: 'contrib',
			why: 'full gate passed, contrib not run',
		}),
		rounds: roundsBlock({ cap: 1, review: 1 }),
		next: 'dialecte contrib',
		also: [MANUAL],
	},
	{
		title:
			'not a producer, the full gate passed: the independent review (a station without --step or --round)',
		setup: { effort: 'low', moves: FULL_GATE },
		station: stationBlock({
			kind: 'station',
			station: 'independent-reviewer',
			why: 'no independent review after the full gate',
		}),
		rounds: roundsBlock({ cap: 1, review: 1 }),
		next: `dialecte lot station ${NAME} start independent-reviewer`,
		also: [MANUAL],
	},
	{
		title:
			'the independent review approved, no registry entry: the manual hand-over line, nothing in also',
		setup: { effort: 'low', moves: INDEPENDENT },
		station: stationBlock({ kind: 'handover-write', why: 'no hand-over written' }),
		rounds: roundsBlock({ cap: 1, review: 1 }),
		next: MANUAL,
		also: [],
	},
	{
		title:
			'case 7: no station event, a tdd ledger in the worktree: unknown, the manual line, nothing in also',
		setup: { moves: [{ ledger: 'red' }] },
		station: stationBlock({
			kind: 'unknown',
			why: 'no station recorded: record them with lot station',
		}),
		next: MANUAL,
		also: [],
	},
	{
		title:
			'case 11: the cli records no step events and the worktree is gone: unknown with that reason, never a guess',
		setup: { effort: 'low', noStepEvents: true, moves: WRITTEN },
		station: stationBlock({ kind: 'unknown', why: "the worktree's cli records no steps" }),
		rounds: roundsBlock({ cap: 1 }),
		next: MANUAL,
		also: [],
	},
	{
		title:
			'case 11: the cli records no step events, a green ledger entry and a green gate-fast record after the implementer end: checked, the snapshot of round 1',
		setup: {
			effort: 'low',
			noStepEvents: true,
			moves: [
				...WRITTEN,
				{ ledger: 'red' },
				{ station: 'implementer', step: 1 },
				{ ledger: 'green' },
				{ gate: 'fast' },
			],
		},
		station: stationBlock({ kind: 'snapshot', round: 1, why: 'round 1 not snapshot' }),
		rounds: roundsBlock({ cap: 1 }),
		next: `dialecte lot snapshot ${NAME} --round 1`,
		also: [MANUAL],
	},
	{
		title:
			'case 11: the gate-fast record after the end is red: not checked, tdd green and gate --fast again',
		setup: {
			effort: 'low',
			noStepEvents: true,
			moves: [
				...WRITTEN,
				{ ledger: 'red' },
				{ station: 'implementer', step: 1 },
				{ ledger: 'green' },
				{ gate: 'fast', passed: false },
			],
		},
		station: stationBlock({
			kind: 'check',
			check: 'tdd-green-and-gate-fast',
			step: 1,
			why: 'implementer step 1 ended, claim unchecked',
		}),
		rounds: roundsBlock({ cap: 1 }),
		next: 'dialecte tdd green && dialecte gate --fast',
		also: [MANUAL],
	},
	{
		title:
			'case 14: a throwaway gate-fast step end is no check: tdd green and gate --fast still asked',
		setup: {
			effort: 'low',
			moves: [...IMPLEMENTED, { check: 'tdd-green' }, { check: 'gate-fast', throwaway: true }],
		},
		station: stationBlock({
			kind: 'check',
			check: 'tdd-green-and-gate-fast',
			step: 1,
			why: 'implementer step 1 ended, claim unchecked',
		}),
		rounds: roundsBlock({ cap: 1 }),
		next: 'dialecte tdd green && dialecte gate --fast',
		also: [MANUAL],
	},
	{
		title:
			'events mode, D21.1: the gate-fast event passed, then a newer FAILED gate-fast record: the claim is unchecked again',
		setup: { effort: 'low', moves: [...CHECKED, { gate: 'fast', passed: false }] },
		station: stationBlock({
			kind: 'check',
			check: 'tdd-green-and-gate-fast',
			step: 1,
			why: 'implementer step 1 ended, claim unchecked',
		}),
		rounds: roundsBlock({ cap: 1 }),
		next: 'dialecte tdd green && dialecte gate --fast',
		also: [MANUAL],
	},
	{
		title:
			'events mode: a newer PASSED gate-fast record stays out, the events decide: the snapshot of round 1',
		setup: { effort: 'low', moves: [...CHECKED, { gate: 'fast' }] },
		station: stationBlock({ kind: 'snapshot', round: 1, why: 'round 1 not snapshot' }),
		rounds: roundsBlock({ cap: 1 }),
		next: `dialecte lot snapshot ${NAME} --round 1`,
		also: [MANUAL],
	},
	{
		title:
			'case 5: an implementer end with no --step is unplaced (counted), the walk asks test-writer step 1',
		setup: { effort: 'low', moves: [{ station: 'implementer' }] },
		station: stationBlock({
			kind: 'station',
			station: 'test-writer',
			step: 1,
			why: 'step 1: no test written',
			unplaced: 1,
		}),
		rounds: roundsBlock({ cap: 1 }),
		next: `dialecte lot station ${NAME} start test-writer --step 1`,
		also: [MANUAL],
	},
	{
		title:
			'case 8: a start with no end that a later event passed is listed in noEnd and the walk goes on',
		setup: {
			effort: 'low',
			moves: [
				{ open: 'test-writer', step: 1 },
				{ station: 'test-writer', step: 1 },
			],
		},
		station: stationBlock({
			kind: 'check',
			check: 'tdd-red',
			step: 1,
			why: 'test-writer step 1 ended, red not proved',
			noEnd: ['run-test-writer-1'],
		}),
		rounds: roundsBlock({ cap: 1 }),
		next: 'dialecte tdd red',
		also: [MANUAL],
	},
]

describe(
	'lot status --json, the station block and the next command',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of NEXT_CASES)
			it(row.title, () => {
				const lot = build(row.setup)

				expect(statusOf(lot)).toEqual({
					exitCode: 0,
					station: row.station,
					rounds: row.rounds ?? roundsBlock(),
					next: row.next,
					also: row.also,
				})
			})

		it('a simulated lot has no station (null) and keeps its wait line', () => {
			const lot = createStationLot({ simulated: true })

			expect(statusOf(lot)).toEqual({
				exitCode: 0,
				station: null,
				rounds: roundsBlock(),
				next: `dialecte lot wait ${NAME} --timeout 60`,
				also: [],
			})
		})

		it("a ready lot (a pending hand-over) keeps today's next and also; its station is the walk's row 1", () => {
			const lot = readyLot()

			expect(statusOf(lot)).toEqual({
				exitCode: 0,
				station: stationBlock({ kind: 'none', why: 'lot ready' }),
				rounds: roundsBlock(),
				next: `dialecte handover show ${NAME}`,
				also: [`dialecte handover run ${NAME}`],
			})
		})

		it('an input-required lot keeps the answer line; its station is the open question', () => {
			const lot = questionLot()

			expect(statusOf(lot)).toEqual({
				exitCode: 0,
				station: stationBlock({ kind: 'answer', why: 'question q1 open' }),
				rounds: roundsBlock(),
				next: `dialecte lot answer ${NAME} q1 "<answer>"`,
				also: [],
			})
		})
	},
)

type RoundsCase = {
	title: string
	build: (lot: StationLot) => void
	expected: RoundsBlock
}

const ROUNDS_CASES: RoundsCase[] = [
	{
		title:
			'snapshots round-1 and round-2 and ledger rows of rounds 3 and 4 (two in round 3): review 2, independent 2 (the distinct rounds above the last snapshot)',
		build: (lot) => {
			writeSnapshot({ lot, round: 1, state: 1 })
			writeSnapshot({ lot, round: 2, state: 2 })
			writeLedger({
				lot,
				findings: [
					[1, 'blocking', 'fixed'],
					[3, 'should-fix', 'fixed'],
					[3, 'nit', 'fixed'],
					[4, 'nit', 'fixed'],
				],
			})
		},
		expected: roundsBlock({ review: 2, cap: 2, independent: 2 }),
	},
	{
		title:
			'a ledger with no snapshot: every ledger round is above the last snapshot (0), counted apart',
		build: (lot) => {
			writeLedger({
				lot,
				findings: [
					[1, 'nit', 'fixed'],
					[2, 'nit', 'fixed'],
				],
			})
		},
		expected: roundsBlock({ review: 0, cap: 2, independent: 2 }),
	},
	{
		title: 'a ledger whose rounds all lie at or below the last snapshot: independent 0',
		build: (lot) => {
			writeSnapshot({ lot, round: 1, state: 1 })
			writeSnapshot({ lot, round: 2, state: 2 })
			writeLedger({
				lot,
				findings: [
					[1, 'nit', 'fixed'],
					[2, 'nit', 'fixed'],
				],
			})
		},
		expected: roundsBlock({ review: 2, cap: 2, independent: 0 }),
	},
	{
		title: 'decisions rows "round <n> beyond the cap": the round, who and why; other rows ignored',
		build: (lot) => {
			writeSnapshot({ lot, round: 1, state: 1 })
			writeSnapshot({ lot, round: 2, state: 2 })
			writeSnapshot({ lot, round: 3, state: 3 })
			const path = join(lot.lotFolder, 'decisions.md')
			appendDecision({
				path,
				title: lot.name,
				decision: 'the names stay as they are',
				by: 'person-a',
				when: DECISION_DAY,
			})
			appendDecision({
				path,
				title: lot.name,
				decision: 'round 3 beyond the cap of 2: a third pass is needed',
				by: 'person-a',
				when: DECISION_DAY,
			})
		},
		expected: roundsBlock({
			review: 3,
			cap: 2,
			beyondCap: [{ round: 3, by: 'person-a', reason: 'a third pass is needed' }],
		}),
	},
	{
		title: 'effort (D2): the identity says high -> cap 3',
		build: (lot) => setIdentityEffort({ lot, level: 'high' }),
		expected: roundsBlock({ cap: 3 }),
	},
	{
		title:
			'effort (D2): the identity says low and the folder brief high -> cap 1 (the identity first)',
		build: (lot) => {
			setIdentityEffort({ lot, level: 'low' })
			writeLotBrief({ lot, stepCount: 1, effort: 'high' })
		},
		expected: roundsBlock({ cap: 1 }),
	},
	{
		title: 'effort (D2): the identity says low -> cap 1',
		build: (lot) => setIdentityEffort({ lot, level: 'low' }),
		expected: roundsBlock({ cap: 1 }),
	},
	{
		title: 'effort (D2): the identity holds none, the folder brief says high -> cap 3',
		build: (lot) => {
			setIdentityEffort({ lot, level: undefined })
			writeLotBrief({ lot, stepCount: 1, effort: 'high' })
		},
		expected: roundsBlock({ cap: 3 }),
	},
	{
		title: 'effort (D2): neither says -> cap null',
		build: (lot) => {
			setIdentityEffort({ lot, level: undefined })
			writeLotBrief({ lot, stepCount: 1 })
		},
		expected: roundsBlock({ cap: null }),
	},
]

describe('lot status - a go-ahead row stands (R1-3)', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('R1-3: cap 1 reached, the go-ahead row of round 2 written, no snapshot yet -> status asks the plain snapshot command and that command is taken', () => {
		const lot = build({ effort: 'low', moves: [...FIXED, { check: 'gate-fast' }] })
		appendDecision({
			path: join(lot.lotFolder, 'decisions.md'),
			title: lot.name,
			decision: 'round 2 beyond the cap of 1: one more',
			by: 'person-a',
			when: DECISION_DAY,
		})

		const status = statusOf(lot)
		const taken = runLot({ cwd: lot.cwd, argv: ['snapshot', lot.name, '--round', '2'] })

		expect(status).toEqual({
			exitCode: 0,
			station: stationBlock({ kind: 'snapshot', round: 2, why: 'round 2 not snapshot' }),
			rounds: roundsBlock({
				cap: 1,
				review: 1,
				beyondCap: [{ round: 2, by: 'person-a', reason: 'one more' }],
			}),
			next: `dialecte lot snapshot ${NAME} --round 2`,
			also: [MANUAL],
		})
		expect(taken).toEqual({
			exitCode: 0,
			output: expect.stringMatching(/^lot snapshot: round-2 - /),
		})
	})
})

describe('lot status --json, the rounds block', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of ROUNDS_CASES)
		it(row.title, () => {
			const lot = createStationLot()
			row.build(lot)

			expect(
				((status) => ({ exitCode: status.exitCode, rounds: status.rounds }))(statusOf(lot)),
			).toEqual({
				exitCode: 0,
				rounds: row.expected,
			})
		})
})

describe('lot status, the text form', { timeout: STORE_CASE_TIMEOUT }, () => {
	type TextCase = {
		title: string
		build: () => StationLot
		/** The state on the first line. */
		state?: string
		/** The station line, right after the state line; null: a state with no station line. */
		line: string | null
		/** The station block's kind in the JSON of the same lot, when the case pins it. */
		jsonKind?: string
		/** The position line, kept only while five lines are enough (the one given up, as today). */
		position: string[]
	}
	const TEXT_CASES: TextCase[] = [
		{
			title:
				'a station to run: "station <station> step <k> of <n> · round -/<cap> · effort <level>"',
			build: () => build({ steps: 3, moves: [] }),
			line: 'station test-writer step 1 of 3 · round -/2 · effort medium',
			position: [],
		},
		{
			title: 'a round station: the round and the cap in the line',
			build: () => build({ effort: 'low', moves: SNAPSHOT_ONE }),
			line: 'station reviewer round 1 · round 1/1 · effort low',
			position: [],
		},
		{
			title: 'a station with neither step nor round: the station alone',
			build: () => build({ effort: 'low', moves: FULL_GATE }),
			line: 'station independent-reviewer · round -/1 · effort low',
			position: [],
		},
		{
			title: "a check: the command words with the walk's reason in brackets",
			build: () => build({ effort: 'low', moves: WRITTEN }),
			line: 'station tdd red (test-writer step 1 ended, red not proved) · round -/1 · effort low',
			position: [],
		},
		{
			title: 'a claim not checked (case 1): tdd green and gate --fast with its reason',
			build: () => build({ effort: 'low', moves: IMPLEMENTED }),
			line: 'station tdd green and gate --fast (implementer step 1 ended, claim unchecked) · round -/1 · effort low',
			position: [],
		},
		{
			title:
				'case 1, medium, three steps, implementer step 2 ended and no green: the line of that lot',
			build: () => build({ steps: 3, moves: STEP_TWO_IMPLEMENTED }),
			line: 'station tdd green and gate --fast (implementer step 2 ended, claim unchecked) · round -/2 · effort medium',
			position: [],
		},
		{
			title: 'running: the station running since its start, with its run, said once (R4-4)',
			build: () => build({ effort: 'low', moves: [...RED, { open: 'implementer', step: 1 }] }),
			line: 'station implementer running since 2026-11-09T10:00:05.000Z (run run-implementer-5) · round -/1 · effort low',
			position: [],
		},
		{
			title: 'a snapshot to take: "lot snapshot round <r>"',
			build: () => build({ effort: 'low', moves: CHECKED }),
			line: 'station lot snapshot round 1 · round 1/1 · effort low',
			position: [],
		},
		{
			title: 'the cap question: "question to the person (<why>)", the blocked round over the cap',
			build: () => build({ effort: 'low', moves: [...FIXED, { check: 'gate-fast' }] }),
			line: 'station question to the person (round cap 1 reached) · round 2/1 · effort low',
			position: [],
		},
		{
			title: 'the hand-over to write: "handover write (<why>)"',
			build: () => build({ effort: 'low', moves: INDEPENDENT }),
			line: 'station handover write (no hand-over written) · round -/1 · effort low',
			// no also line: one line less is needed, the position line stays (as today)
			position: ['step 1 of 3'],
		},
		{
			title: 'case 7: unknown, with the record command to run',
			build: () => build({ moves: [{ ledger: 'red' }] }),
			line: 'station unknown (no station recorded: record them with lot station) · round -/2 · effort medium',
			// the worktree is there: one line less is needed, the position line stays (as today)
			position: ['step 1 of 3'],
		},
		{
			title: 'an open question: "answer <q>"',
			build: questionLot,
			state: 'input-required',
			line: 'station answer q1 · round -/2 · effort medium',
			position: [],
		},
		{
			title: 'a ready lot: no station line',
			build: readyLot,
			state: 'ready',
			line: null,
			// no station line, yet the JSON still carries the walk's row 1
			jsonKind: 'none',
			position: ['step 1 of 3'],
		},
		{
			title: 'no effort anywhere: "effort -" and, with a round, "round <r>/-"',
			build: () =>
				build({
					noEffort: true,
					moves: [
						{ station: 'test-writer', step: 1 },
						{ check: 'tdd-red' },
						{ station: 'test-reviewer', step: 1, verdict: 'approve' },
						{ station: 'implementer', step: 1 },
						{ check: 'tdd-green' },
						{ check: 'gate-fast' },
						{ snapshot: 1 },
					],
				}),
			line: 'station reviewer round 1 · round 1/- · effort -',
			position: [],
		},
		{
			title: 'no effort, no round: "round -/-"',
			build: () => build({ noEffort: true, moves: [] }),
			line: 'station test-writer step 1 of 1 · round -/- · effort -',
			position: [],
		},
	]

	for (const row of TEXT_CASES)
		it(row.title, () => {
			const lot = row.build()
			const result = withLines(runLot({ cwd: lot.cwd, argv: ['status', lot.name] }))

			expect({
				exitCode: result.exitCode,
				first: result.lines[0]?.startsWith(`${NAME} ${row.state ?? 'working'} since `),
				// the station line is the one right after the state line
				second: result.lines[1]?.startsWith('station ') ? result.lines[1] : null,
				stationLines: result.lines.filter((line) => line.startsWith('station ')),
				positionLines: result.lines.filter((line) => /^step \d+ of \d+/.test(line)),
				within: result.lines.length <= 5,
				jsonKind:
					row.jsonKind === undefined
						? undefined
						: (statusOf(lot).station as StationBlock | undefined)?.kind,
			}).toEqual({
				exitCode: 0,
				first: true,
				second: row.line,
				stationLines: row.line === null ? [] : [row.line],
				positionLines: row.position,
				within: true,
				jsonKind: row.jsonKind,
			})
		})

	it('the next line carries the station command and the also line the manual one', () => {
		const lot = build({ moves: [] })
		const lines = withLines(runLot({ cwd: lot.cwd, argv: ['status', lot.name] })).lines

		expect(lines).toEqual(
			expect.arrayContaining([
				`next: dialecte lot station ${NAME} start test-writer --step 1`,
				`also: ${MANUAL}`,
			]),
		)
	})
})

describe(
	'lot status after the printed end command (D32, R4-1)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('lot station start test-writer --step 1, then end --run <run> with no --step: the end takes the step of its start and the walk moves on', () => {
			const lot = build({ effort: 'low', moves: [] })
			const started = JSON.parse(
				runLot({
					cwd: lot.cwd,
					argv: ['station', lot.name, 'start', 'test-writer', '--step', '1', '--json'],
				}).output,
			) as { run: string }
			const ended = runLot({
				cwd: lot.cwd,
				argv: ['station', lot.name, 'end', 'test-writer', '--run', started.run],
			})

			expect({ exitCode: ended.exitCode, station: statusOf(lot).station }).toEqual({
				exitCode: 0,
				station: stationBlock({
					kind: 'check',
					check: 'tdd-red',
					step: 1,
					why: 'test-writer step 1 ended, red not proved',
				}),
			})
		})
	},
)

describe('lot status reads and writes nothing', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the lot folder and the worktree are byte-identical after a status, in JSON and in text', () => {
		const lot = build({
			steps: 2,
			noStepEvents: true,
			moves: [
				...WRITTEN,
				{ ledger: 'red' },
				{ station: 'implementer', step: 1 },
				{ ledger: 'green' },
				{ gate: 'fast' },
				{ snapshot: 1 },
			],
		})
		appendLotEvents({
			lot,
			events: stationMove({ lot, station: 'reviewer', round: 1, start: 40, end: 41 }),
		})
		writeLedger({ lot, findings: [[2, 'nit', 'fixed']] })
		appendDecision({
			path: join(lot.lotFolder, 'decisions.md'),
			title: lot.name,
			decision: 'round 2 beyond the cap of 1: one more',
			by: 'person-a',
			when: DECISION_DAY,
		})
		const folders = [lot.lotFolder, lot.worktree]
		const before = folders.map(snapshotOf)

		const json = JSON.parse(runLot({ cwd: lot.cwd, argv: ['status', lot.name, '--json'] }).output)
		const text = runLot({ cwd: lot.cwd, argv: ['status', lot.name] })

		expect({ station: json.station, rounds: json.rounds, exitCode: text.exitCode }).toEqual({
			station: expect.objectContaining({ kind: expect.any(String) }),
			rounds: expect.objectContaining({ review: 1, independent: 1 }),
			exitCode: 0,
		})
		expect(folders.map(snapshotOf)).toEqual(before)
	})
})
