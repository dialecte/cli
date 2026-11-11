/**
 * `dialecte lot station` refusals (33L0 section 4 "Station events", section 12, cases 8 (5,000 bytes), 9 (refusal
 * half)): exit 2 and not one byte written; usage errors in E4's shape; every fault of a `--from` file in one answer;
 * a write failure exits 1 with its reason.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { STATION } from '../../test/lot-station-workspace.constants.ts'
import { createStationLot, recordedAfter, station } from '../../test/lot-station-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { DISPLAY_ESCAPED_RANGES } from '../lib/store/store.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const START = ['start', STATION]
const END = ['end', STATION]
const ESCAPE = '\u001b[31m'

type Row = {
	name: string
	words: string[]
	/** What the error of the refusal must say (checked when given). */
	error?: RegExp
}

/** Both ends of every escaped range, once each. */
const RANGE_ENDS: number[] = [...new Set(DISPLAY_ESCAPED_RANGES.flat())]

/** The right-to-left override, built from its code point (a source escape would be printed back raw by the formatter). */
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e)

/** Rows of calls that must be refused: exit 2, a JSON error, nothing written. */
const REFUSED: Row[] = [
	...RANGE_ENDS.map((point): Row => ({
		name: `agent holding U+${point.toString(16).toUpperCase().padStart(4, '0')} → refused`,
		words: [...START, '--agent', `a${String.fromCodePoint(point)}b`],
	})),
	...[
		'--vendor',
		'--model',
		'--tier',
		'--effort',
		'--session',
		'--event',
		'--skill',
		'--skill-asked',
	].map((option): Row => ({
		name: `${option} holding an escape sequence → refused`,
		words: [...START, option, `x${ESCAPE}`],
	})),
	{ name: 'a suite name holding an escape → refused', words: [...END, '--suite', `a${ESCAPE}=1`] },
	{ name: 'a currency holding an escape → refused', words: [...END, '--money', '1', `e${ESCAPE}`] },
	{
		name: 'a right-to-left override in the agent → refused',
		words: [...START, '--agent', `a${RIGHT_TO_LEFT_OVERRIDE}b`],
	},
	{ name: 'a line break in the agent → refused', words: [...START, '--agent', 'a\nb'] },
	{ name: 'station Implement (a capital) → refused', words: ['start', 'Implement'] },
	{ name: 'station 1abc (a digit first) → refused', words: ['start', '1abc'] },
	{ name: 'station a_b (an underscore) → refused', words: ['start', 'a_b'] },
	{ name: 'station of 61 characters → refused', words: ['start', 'a'.repeat(61)] },
	{ name: 'an empty station → refused', words: ['start', ''] },
	{
		name: 'station shared (the report label of parallel stations) → refused',
		words: ['start', 'shared'],
	},
	{
		name: 'station outside (the report label of steps outside stations) → refused',
		words: ['start', 'outside'],
	},
	{ name: 'an end of station shared → refused', words: ['end', 'shared'] },
	{ name: 'an end of station outside → refused', words: ['end', 'outside'] },
	{ name: 'a vendor of 81 characters → refused', words: [...START, '--vendor', 'v'.repeat(81)] },
	{ name: 'a model of 81 characters → refused', words: [...START, '--model', 'm'.repeat(81)] },
	{ name: 'a tier of 81 characters → refused', words: [...START, '--tier', 't'.repeat(81)] },
	{ name: 'an effort of 81 characters → refused', words: [...START, '--effort', 'e'.repeat(81)] },
	{ name: 'a session of 81 characters → refused', words: [...START, '--session', 's'.repeat(81)] },
	...['--step', '--round', '--attempt'].flatMap((option): Row[] =>
		['0', '1000', '-1', '1.5', 'x'].map((value): Row => ({
			name: `${option} ${value} → refused (an integer 1-999)`,
			words: [...START, option, value],
		})),
	),
	...[
		'--tokens-in',
		'--tokens-out',
		'--tokens-cache-read',
		'--tokens-cache-write',
		'--tokens-total',
	].flatMap((option): Row[] =>
		['-1', '1.5', 'x'].map((value): Row => ({
			name: `${option} ${value} → refused (a non-negative integer)`,
			words: [...END, option, value],
		})),
	),
	{
		name: '--money 1 followed by a flag as its currency → refused',
		words: [...END, '--money', '1', '--json'],
	},
	{ name: '--money with a negative amount → refused', words: [...END, '--money', '-1', 'eur'] },
	{
		name: '--money with an amount that is no number → refused',
		words: [...END, '--money', 'x', 'eur'],
	},
	{ name: '--duration negative → refused', words: [...END, '--duration', '-1'] },
	{ name: '--duration that is no number → refused', words: [...END, '--duration', 'x'] },
	{ name: '--exit 3.5 (no integer) → refused', words: [...END, '--exit', '3.5'] },
	{ name: '--suite without =<runs> → refused', words: [...END, '--suite', 'unit'] },
	{ name: '--suite with negative runs → refused', words: [...END, '--suite', 'unit=-1'] },
	{ name: '--verdict maybe (not in the list) → refused', words: [...END, '--verdict', 'maybe'] },
	{
		name: '--executor robot (not host or command) → refused',
		words: [...START, '--executor', 'robot'],
	},
	{
		name: '51 skills → refused (at most 50)',
		words: [...START, ...Array.from({ length: 51 }, (_, index) => ['--skill', `s${index}`]).flat()],
	},
	{
		name: '26 skills seen and 25 asked → refused (the 50 counts both)',
		words: [
			...START,
			...Array.from({ length: 26 }, (_, index) => ['--skill', `s${index}`]).flat(),
			...Array.from({ length: 25 }, (_, index) => ['--skill-asked', `a${index}`]).flat(),
		],
	},
	{
		name: 'an event of about 5,000 bytes (an agent of 5,000 characters) → refused naming the limit',
		words: [...START, '--agent', 'k'.repeat(5_000)],
		error: /4,?096|limit/i,
	},
]

describe('lot station: refusals', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of REFUSED)
		it(row.name, () => {
			const lot = createStationLot()

			expect(
				((recording) => ({
					exitCode: recording.answers[0].exitCode,
					error: typeof recording.answers[0].json?.error,
					errorSaysWhat: (row.error ?? /./s).test(String(recording.answers[0].json?.error)),
					next: recording.answers[0].json?.next,
					eventCount: recording.events.length,
				}))(recordedAfter(lot, [() => station(lot, ['--json', ...row.words])])),
			).toEqual({ exitCode: 2, error: 'string', errorSaysWhat: true, next: null, eventCount: 0 })
		})

	it('a refusal after an event was written → that event untouched, no second one', () => {
		const lot = createStationLot()

		expect(
			((recording) => ({
				exits: recording.answers.map((answer) => answer.exitCode),
				eventCount: recording.events.length,
			}))(
				recordedAfter(lot, [
					() => station(lot, START),
					() => station(lot, [...START, '--step', '0']),
				]),
			),
		).toEqual({ exits: [0, 2], eventCount: 1 })
	})
})

describe('lot station: values at the edge are accepted', { timeout: STORE_CASE_TIMEOUT }, () => {
	const ACCEPTED: Row[] = [
		{ name: 'a station of 60 characters', words: ['start', `a${'b'.repeat(59)}`] },
		{ name: 'a station with digits and dashes', words: ['start', 'a1-b2'] },
		{ name: 'a vendor of 80 characters', words: [...START, '--vendor', 'v'.repeat(80)] },
		{ name: '--step 1', words: [...START, '--step', '1'] },
		{ name: '--step 999', words: [...START, '--step', '999'] },
		{ name: '--attempt 999', words: [...START, '--attempt', '999'] },
		{ name: '--tokens-in 0', words: [...END, '--tokens-in', '0'] },
		{ name: '--duration 0', words: [...END, '--duration', '0'] },
		{ name: '--executor host', words: [...START, '--executor', 'host'] },
		{
			name: '50 skills',
			words: [
				...START,
				...Array.from({ length: 50 }, (_, index) => ['--skill', `s${index}`]).flat(),
			],
		},
	]

	for (const row of ACCEPTED)
		it(`${row.name} → accepted, one event`, () => {
			const lot = createStationLot()

			expect(
				((recording) => ({
					exitCode: recording.answers[0].exitCode,
					eventCount: recording.events.length,
				}))(recordedAfter(lot, [() => station(lot, [...row.words, '--json'])])),
			).toEqual({ exitCode: 0, eventCount: 1 })
		})
})

describe('lot station: usage errors', { timeout: STORE_CASE_TIMEOUT }, () => {
	const USAGE: Row[] = [
		{ name: 'no station after start', words: ['start'] },
		{ name: 'a phase that is neither start nor end', words: ['middle', STATION] },
		{ name: 'an unknown option', words: [...START, '--zzz', '1'] },
		{ name: 'an option given last without its value', words: [...START, '--agent'] },
		{ name: '--from without a file', words: ['--from'] },
		{ name: 'a lot id and nothing else', words: [] },
	]

	for (const row of USAGE)
		it(`${row.name} → exit 2, JSON { error, usage, next: null }`, () => {
			const lot = createStationLot()

			expect(
				((recording) => ({
					exitCode: recording.answers[0].exitCode,
					keys: Object.keys(recording.answers[0].json ?? {}).sort(),
					next: recording.answers[0].json?.next,
					eventCount: recording.events.length,
				}))(recordedAfter(lot, [() => station(lot, ['--json', ...row.words])])),
			).toEqual({ exitCode: 2, keys: ['error', 'next', 'usage'], next: null, eventCount: 0 })
		})

	it('no lot id at all → exit 2 with the usage', () => {
		const lot = createStationLot()

		expect(
			((result) => [result.exitCode, JSON.parse(result.output).next])(
				runLot({ cwd: lot.cwd, argv: ['station', '--json'] }),
			),
		).toEqual([2, null])
	})

	it('an id that names no lot → exit 2, JSON error, nothing written', () => {
		const lot = createStationLot()

		expect(
			((recording) => [recording.answers[0].exitCode, recording.answers[0].json?.next])(
				recordedAfter(lot, [
					() => station({ ...lot, name: '9999-repo-none' }, [...START, '--json']),
				]),
			),
		).toEqual([2, null])
	})
})

describe('lot station: --from faults', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('an unknown key, a bad station and a bad value → exit 2, every fault in the one answer', () => {
		const lot = createStationLot()
		const file = join(lot.workspace.workspace, 'bad.json')
		writeFileSync(
			file,
			JSON.stringify({ phase: 'start', station: 'Bad Name', zzzUnknown: 1, step: 7777 }),
		)

		expect(
			((recording) => {
				const error = String(recording.answers[0].json?.error)
				return {
					exitCode: recording.answers[0].exitCode,
					namesUnknownKey: error.includes('zzzUnknown'),
					namesBadStation: error.includes('Bad Name'),
					namesBadStep: error.includes('7777'),
					eventCount: recording.events.length,
				}
			})(recordedAfter(lot, [() => station(lot, ['--from', file, '--json'])])),
		).toEqual({
			exitCode: 2,
			namesUnknownKey: true,
			namesBadStation: true,
			namesBadStep: true,
			eventCount: 0,
		})
	})

	it('a file whose agent holds an escape sequence → exit 2, nothing written', () => {
		const lot = createStationLot()
		const file = join(lot.workspace.workspace, 'escape.json')
		writeFileSync(file, JSON.stringify({ phase: 'start', station: STATION, agent: `a${ESCAPE}` }))

		expect(
			((recording) => [recording.answers[0].exitCode, recording.events.length])(
				recordedAfter(lot, [() => station(lot, ['--from', file, '--json'])]),
			),
		).toEqual([2, 0])
	})

	it('a file without a phase → exit 2, nothing written', () => {
		const lot = createStationLot()
		const file = join(lot.workspace.workspace, 'no-phase.json')
		writeFileSync(file, JSON.stringify({ station: STATION }))

		expect(
			((recording) => [recording.answers[0].exitCode, recording.events.length])(
				recordedAfter(lot, [() => station(lot, ['--from', file, '--json'])]),
			),
		).toEqual([2, 0])
	})

	it('a file that is not JSON → exit 2, nothing written', () => {
		const lot = createStationLot()
		const file = join(lot.workspace.workspace, 'broken.json')
		writeFileSync(file, '{ not json')

		expect(
			((recording) => [recording.answers[0].exitCode, recording.events.length])(
				recordedAfter(lot, [() => station(lot, ['--from', file, '--json'])]),
			),
		).toEqual([2, 0])
	})

	it('a file that does not exist → exit 2, nothing written', () => {
		const lot = createStationLot()

		expect(
			((recording) => [recording.answers[0].exitCode, recording.events.length])(
				recordedAfter(lot, [
					() => station(lot, ['--from', join(lot.workspace.workspace, 'missing.json'), '--json']),
				]),
			),
		).toEqual([2, 0])
	})
})

describe('lot station: a write failure', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('events.jsonl that cannot be written (a folder stands there) → exit 1 with the reason, JSON { error, next: null }', () => {
		const lot = createStationLot()
		mkdirSync(lot.eventsFile)

		expect(
			((recording) => ({
				exitCode: recording.answers[0].exitCode,
				error: typeof recording.answers[0].json?.error,
				next: recording.answers[0].json?.next,
				reason: /EISDIR|is a directory|EACCES|permission denied|read-only/i.test(
					String(recording.answers[0].json?.error),
				),
			}))(recordedAfter(lot, [() => station(lot, [...START, '--json'])])),
		).toEqual({ exitCode: 1, error: 'string', next: null, reason: true })
	})
})
