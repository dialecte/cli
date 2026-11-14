/** `lot status <id>`: the JSON and the text form for a lot in each state, on stores written by the helpers. */
import { realpathSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../test/brief-workspace.ts'
import { manualLineOf, withJson, withLines } from '../../test/lot-start-workspace.ts'
import { EARLIER_TIME, LATER_TIME, RECORD_TIME } from '../../test/store-records.constants.ts'
import {
	answerOf,
	entryOf,
	questionTransitionOf,
	transitionOf,
	writeRecordFile,
} from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'
import type { StoreEntry } from '../lib/handover/handover.types.ts'
import type { Transition } from '../lib/store/store.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const LOT = '0007-repo-feature'
const REGISTRY_NAME = '2026-11-08-feat-feature'
const QUESTION_TEXT = 'One question, one line.'

/** What a row writes beside the lot's own start. */
type StatusRow = {
	title: string
	simulated?: boolean
	later?: Transition[]
	/** The numbers of the questions that have an answer. */
	answered?: number[]
	registry?: { state: StoreEntry['state']; written: string }
	expected: Record<string, unknown>
}

/** A real working lot with no station recorded: the walk starts at the first test-writer, the manual line stays in `also`. */
const FIRST_STATION_NEXT = `dialecte lot station ${LOT} start test-writer --step 1`

const TO_ANSWER = `dialecte lot answer ${LOT} q1 "<answer>"`

function questionOf(number: number): Record<string, unknown> {
	return {
		id: `q${number}`,
		audience: 'caller',
		station: 'test-reviewer',
		text: QUESTION_TEXT,
		asked: RECORD_TIME,
	}
}

/** What every real `working` lot of these rows reports; a row overrides what its state changes. */
function expectedOf(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		lot: LOT,
		index: '0007',
		since: RECORD_TIME,
		limit: false,
		runner: 'manual',
		position: { step: 1, of: 3, station: null, round: null },
		questions: [],
		answered: 0,
		handover: null,
		effort: { level: 'medium', source: 'default' },
		simulated: false,
		scenario: null,
		checks: { wouldRefuse: [] },
		notes: [],
		also: [],
		...overrides,
	}
}

const STATUS_ROWS: StatusRow[] = [
	{
		title:
			'working, real: no station recorded, the first station command and the manual line in also',
		expected: expectedOf({
			state: 'working',
			next: FIRST_STATION_NEXT,
			also: [manualLineOf(LOT)],
		}),
	},
	{
		title: 'working with a last limit transition: limit true, the same next and also',
		later: [transitionOf({ seq: 2, kind: 'limit', at: LATER_TIME })],
		expected: expectedOf({
			state: 'working',
			since: LATER_TIME,
			limit: true,
			next: FIRST_STATION_NEXT,
			also: [manualLineOf(LOT)],
		}),
	},
	{
		title: 'input-required: the open question and the lot answer line for it',
		later: [questionTransitionOf({ seq: 2, number: 1 })],
		expected: expectedOf({
			state: 'input-required',
			questions: [questionOf(1)],
			next: TO_ANSWER,
		}),
	},
	{
		title: 'two questions, the first answered: the second is open, answered 1, next names it',
		later: [
			questionTransitionOf({ seq: 2, number: 1 }),
			questionTransitionOf({ seq: 3, number: 2 }),
		],
		answered: [1],
		expected: expectedOf({
			state: 'input-required',
			questions: [questionOf(2)],
			answered: 1,
			next: `dialecte lot answer ${LOT} q2 "<answer>"`,
		}),
	},
	{
		title: 'ready by a ready transition only: since its time, no hand-over yet, the result line',
		later: [transitionOf({ seq: 2, state: 'ready', kind: 'ready', at: LATER_TIME })],
		expected: expectedOf({
			state: 'ready',
			since: LATER_TIME,
			handover: null,
			next: `dialecte lot result ${LOT}`,
			also: [],
		}),
	},
	{
		title:
			'ready by a registry entry pending that names the lot folder: show, and run as an alternative',
		registry: { state: 'pending', written: LATER_TIME },
		expected: expectedOf({
			state: 'ready',
			since: LATER_TIME,
			handover: { name: REGISTRY_NAME, state: 'pending' },
			next: `dialecte handover show ${REGISTRY_NAME}`,
			also: [`dialecte handover run ${REGISTRY_NAME}`],
		}),
	},
	{
		title: 'committed by the registry: next null',
		registry: { state: 'committed', written: LATER_TIME },
		expected: expectedOf({
			state: 'committed',
			since: LATER_TIME,
			handover: { name: REGISTRY_NAME, state: 'committed' },
			next: null,
		}),
	},
	{
		title: 'canceled by its last transition: next null',
		later: [transitionOf({ seq: 2, state: 'canceled', kind: 'stop', at: LATER_TIME })],
		expected: expectedOf({ state: 'canceled', since: LATER_TIME, next: null }),
	},
	{
		title: 'failed: the stop line',
		later: [transitionOf({ seq: 2, state: 'failed', kind: 'fail', at: LATER_TIME })],
		expected: expectedOf({
			state: 'failed',
			since: LATER_TIME,
			next: `dialecte lot stop ${LOT} --reason <text>`,
		}),
	},
	{
		title: 'simulated: runner simulated, no worktree, no checks, the wait line',
		simulated: true,
		expected: expectedOf({
			state: 'working',
			runner: 'simulated',
			simulated: true,
			worktree: null,
			checks: { worktree: null, link: null, wouldRefuse: [] },
			next: `dialecte lot wait ${LOT} --timeout 60`,
		}),
	},
]

/** The workspace holding the lot of a row; its folder is the real path. */
function writeRow(row: StatusRow): { workspace: BriefWorkspace; lotFolder: string } {
	const workspace = createBriefWorkspace()
	const written = writeStoreLot({
		workspace,
		name: LOT,
		scope: ['src/'],
		simulated: row.simulated,
		later: row.later,
	})
	const lotFolder = realpathSync(written)
	for (const number of row.answered ?? [])
		writeRecordFile({
			folder: lotFolder,
			name: `answers/q${number}.json`,
			text: `${JSON.stringify(answerOf(number))}\n`,
		})
	if (row.registry)
		writeRecordFile({
			folder: workspace.registry,
			name: `${REGISTRY_NAME}.json`,
			text: JSON.stringify(
				entryOf({ state: row.registry.state, written: row.registry.written, folder: lotFolder }),
			),
		})
	return { workspace, lotFolder }
}

describe('lot status --json, a lot in each state', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of STATUS_ROWS)
		it(`${row.title} -> exit 0 with the JSON of that state`, () => {
			const { workspace } = writeRow(row)

			expect(
				withJson(runLot({ cwd: workspace.repository, argv: ['status', LOT, '--json'] })),
			).toMatchObject({ exitCode: 0, json: row.expected })
		})

	it('the JSON carries what identity.json records and the lot folder (real path)', () => {
		const { workspace, lotFolder } = writeRow({ title: 'plain', expected: {} })

		expect(
			withJson(runLot({ cwd: workspace.repository, argv: ['status', LOT, '--json'] })),
		).toMatchObject({
			exitCode: 0,
			json: {
				lot: LOT,
				index: '0007',
				feature: 'branch',
				repository: '/work/repo',
				branch: `feat/${LOT}`,
				base: { ref: 'main', commit: 'a'.repeat(40) },
				worktree: join(workspace.workspace, '.worktrees', LOT),
				folder: lotFolder,
			},
		})
	})

	it('a registry entry written before the last transition does not move since', () => {
		const { workspace } = writeRow({
			title: 'ready, old entry',
			later: [transitionOf({ seq: 2, kind: 'station', at: LATER_TIME })],
			registry: { state: 'pending', written: EARLIER_TIME },
			expected: {},
		})

		expect(
			withJson(runLot({ cwd: workspace.repository, argv: ['status', LOT, '--json'] })),
		).toMatchObject({ exitCode: 0, json: { state: 'ready', since: LATER_TIME } })
	})
})

type TextRow = {
	title: string
	row: StatusRow
	first: string
	/** The next line; null: a state with no next command has no `next:` line. */
	next: string | null
	/** A line other than the first and the next line that holds this text. */
	alsoHolds?: string
}

const TEXT_ROWS: TextRow[] = [
	{
		title: 'working',
		row: { title: 'working', expected: {} },
		first: `${LOT} working since ${RECORD_TIME}`,
		next: `next: ${FIRST_STATION_NEXT}`,
		// the recorded worktree was never made: the checks line says so
		alsoHolds: 'worktree missing',
	},
	{
		title: 'committed',
		row: {
			title: 'committed',
			registry: { state: 'committed', written: LATER_TIME },
			expected: {},
		},
		first: `${LOT} committed since ${LATER_TIME}`,
		next: null,
	},
	{
		title: 'input-required',
		row: {
			title: 'input-required',
			later: [questionTransitionOf({ seq: 2, number: 1 })],
			expected: {},
		},
		first: `${LOT} input-required since ${RECORD_TIME}`,
		next: `next: ${TO_ANSWER}`,
		alsoHolds: 'q1',
	},
	{
		title: 'failed',
		row: {
			title: 'failed',
			later: [transitionOf({ seq: 2, state: 'failed', kind: 'fail', at: LATER_TIME })],
			expected: {},
		},
		first: `${LOT} failed since ${LATER_TIME}`,
		next: `next: dialecte lot stop ${LOT} --reason <text>`,
	},
]

describe('lot status, the text form', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const text of TEXT_ROWS)
		it(`${text.title} -> exit 0, the first line "<lot> <state> since <since>", a next: line, at most five lines`, () => {
			const { workspace } = writeRow(text.row)
			const argv = ['status', LOT]

			expect(withLines(runLot({ cwd: workspace.repository, argv }))).toMatchObject({
				exitCode: 0,
				lines: expect.arrayContaining([text.first, ...(text.next === null ? [] : [text.next])]),
			})
			if (text.next === null)
				expect(
					withLines(runLot({ cwd: workspace.repository, argv })).lines.filter((line) =>
						line.startsWith('next:'),
					),
				).toEqual([])
			expect(withLines(runLot({ cwd: workspace.repository, argv })).lines[0]).toBe(text.first)
			expect(
				withLines(runLot({ cwd: workspace.repository, argv })).lines.length,
			).toBeLessThanOrEqual(5)
			if (text.alsoHolds !== undefined)
				expect(withLines(runLot({ cwd: workspace.repository, argv })).lines).toContainEqual(
					expect.stringMatching(new RegExp(`^(?!next:).*${text.alsoHolds}`)),
				)
		})
})
