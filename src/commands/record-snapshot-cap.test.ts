/**
 * `lot snapshot` and the cap of review rounds (33L1 section 6, cases 15, 16, 20; D2, D3, D8, D17): the cap read from the
 * identity's effort, else the folder's `brief.json`; `--beyond-cap --by --reason` and its decisions row; `--by` or
 * `--reason` held to the forbidden words; `round-<n>.state` (D7). Each case runs on a scratch store lot.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { FIRST_WORD } from '../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../test/forbidden-words-workspace.ts'
import { createStationLot } from '../../test/lot-station-workspace.ts'
import { git } from '../../test/scratch-repository.ts'
import { setIdentityEffort, writeLotBrief } from '../../test/station-records-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { computeStateHash } from '../lib/gate-records/state-hash.ts'
import { appendDecision, readDecisions } from '../lib/review-rounds/decisions-file.ts'
import { runLot } from './lot.ts'
import { runRecordVerb } from './record.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StationLot } from '../../test/lot-station-workspace.types.ts'
import type { BriefEffort } from '../lib/store/brief.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A local time: the decisions row's day is `2026-11-12`. */
const NOW = new Date(2026, 10, 12, 10, 30, 0)
const DAY = '2026-11-12'

/** The one-line usage: spec section 3's line, never an `unknown option` message. */
const USAGE_PATTERN =
	/^lot snapshot: expected <id\|folder> --round <n> \[--beyond-cap --by <who> --reason <text>\]$/

type Effort = BriefEffort

/** A store lot whose identity holds `identity` (undefined: none) and whose `brief.json` holds `brief` (undefined: none). */
function lotWith(params: { identity?: Effort; brief?: Effort }): StationLot {
	const lot = createStationLot()
	setIdentityEffort({ lot, level: params.identity })
	writeLotBrief({ lot, stepCount: 1, effort: params.brief })
	return lot
}

/** `lot snapshot <lot folder> --round <round> <extra...>`, from the lot's repository. */
function snapshot(params: { lot: StationLot; round: number; extra?: string[] }) {
	return runRecordVerb({
		verb: 'snapshot',
		cwd: params.lot.cwd,
		argv: [params.lot.lotFolder, '--round', String(params.round), ...(params.extra ?? [])],
		now: NOW,
	})
}

/** The names the lot folder holds, sorted. */
function listing(lot: StationLot): string[] {
	return readdirSync(lot.lotFolder).sort()
}

function decisionsOf(lot: StationLot) {
	return readDecisions(join(lot.lotFolder, 'decisions.md'))
}

/** The whole refusal of a round beyond the cap (D22.2); `effort` undefined: none recorded. */
function beyondCapLine(params: {
	folder: string
	round: number
	cap: number
	effort: Effort | undefined
}): string {
	const effort = params.effort === undefined ? 'no effort recorded' : `effort ${params.effort}`
	return `lot snapshot: round ${params.round} is beyond the cap of ${params.cap} (${effort}): dialecte lot snapshot ${params.folder} --round ${params.round} --beyond-cap --by <who> --reason <text>`
}

type CapCase = {
	name: string
	identity?: Effort
	brief?: Effort
	round: number
	/** The cap the refusal reports (undefined: the round is taken). */
	refusedAt?: number
}

const CAP_CASES: CapCase[] = [
	{ name: 'identity high, round 3', identity: 'high', round: 3 },
	{ name: 'identity high beats brief low, round 3', identity: 'high', brief: 'low', round: 3 },
	{ name: 'identity high, round 4', identity: 'high', round: 4, refusedAt: 3 },
	{ name: 'identity medium, round 2', identity: 'medium', round: 2 },
	{ name: 'identity medium, round 3', identity: 'medium', round: 3, refusedAt: 2 },
	{ name: 'identity low, round 1', identity: 'low', round: 1 },
	{ name: 'identity low, round 2', identity: 'low', round: 2, refusedAt: 1 },
	{ name: 'no identity effort, brief high, round 3', brief: 'high', round: 3 },
	{ name: 'no identity effort, brief high, round 4', brief: 'high', round: 4, refusedAt: 3 },
	{ name: 'no identity effort, brief medium, round 3', brief: 'medium', round: 3, refusedAt: 2 },
	{ name: 'no identity effort, brief low, round 2', brief: 'low', round: 2, refusedAt: 1 },
	{
		name: 'identity low beats brief high, round 2',
		identity: 'low',
		brief: 'high',
		round: 2,
		refusedAt: 1,
	},
	{ name: 'neither effort, round 1', round: 1 },
	{ name: 'neither effort, round 2', round: 2, refusedAt: 1 },
]

describe('lot snapshot - the cap', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const { name, identity, brief, round, refusedAt } of CAP_CASES)
		it(`${name} → ${refusedAt === undefined ? 'taken' : `refused at the cap of ${refusedAt}, exit 2, nothing written`}`, () => {
			const lot = lotWith({ identity, brief })
			const before = listing(lot)

			const result = snapshot({ lot, round })

			if (refusedAt === undefined) {
				expect(result).toEqual({
					exitCode: 0,
					output: expect.stringMatching(new RegExp(`^lot snapshot: round-${round} - `)),
				})
				expect(existsSync(join(lot.lotFolder, `round-${round}.state`))).toBe(true)
				return
			}
			expect(result).toEqual({
				exitCode: 2,
				output: beyondCapLine({
					folder: lot.lotFolder,
					round,
					cap: refusedAt,
					effort: identity ?? brief,
				}),
			})
			expect(listing(lot)).toEqual(before)
		})
})

describe('lot snapshot --beyond-cap', { timeout: STORE_CASE_TIMEOUT }, () => {
	const GO_AHEAD = ['--beyond-cap', '--by', 'reviewer', '--reason', 'x']

	it('round 4 at the cap of 3 → the decisions row first, then the snapshot with its .state', () => {
		const lot = lotWith({ identity: 'high' })

		const result = snapshot({ lot, round: 4, extra: GO_AHEAD })

		expect(result).toEqual({
			exitCode: 0,
			output: expect.stringMatching(/^lot snapshot: round-4 - /),
		})
		expect(decisionsOf(lot)).toEqual([
			{ decision: 'round 4 beyond the cap of 3: x', by: 'reviewer', when: DAY },
		])
		expect(readFileSync(join(lot.lotFolder, 'decisions.md'), 'utf8')).toContain(
			'| round 4 beyond the cap of 3: x | reviewer | 2026-11-12 |',
		)
		expect(listing(lot)).toEqual(
			expect.arrayContaining([
				'decisions.md',
				'round-4',
				'round-4.base',
				'round-4.deleted',
				'round-4.state',
			]),
		)
	})

	it('a crash after the row, before the snapshot (the row present, no round-4 names) then a retry → the row once, the snapshot made', () => {
		const lot = lotWith({ identity: 'high' })
		appendDecision({
			path: join(lot.lotFolder, 'decisions.md'),
			title: lot.name,
			decision: 'round 4 beyond the cap of 3: x',
			by: 'reviewer',
			when: DAY,
		})

		const retry = snapshot({ lot, round: 4, extra: GO_AHEAD })

		expect(retry.exitCode).toBe(0)
		expect(decisionsOf(lot)).toEqual([
			{ decision: 'round 4 beyond the cap of 3: x', by: 'reviewer', when: DAY },
		])
		expect(existsSync(join(lot.lotFolder, 'round-4.state'))).toBe(true)
	})

	it('a crash while the row is written (the write stopped at its temporary file) then a retry → nothing half written, the row once, the snapshot made', () => {
		const lot = lotWith({ identity: 'high' })
		const before = listing(lot)

		const crashed = runRecordVerb({
			verb: 'snapshot',
			cwd: lot.cwd,
			argv: [lot.lotFolder, '--round', '4', ...GO_AHEAD],
			now: NOW,
			afterTemporaryWritten() {
				throw new Error('crash')
			},
		})

		expect(crashed.exitCode).toBe(1)
		// the stopped write leaves its temporary file (a later run sweeps it): nothing else is new
		const kept = listing(lot).filter((name) => !name.includes('.tmp-'))
		expect(kept).toEqual(before)
		expect(kept).not.toContain('decisions.md')
		expect(kept.filter((name) => name.startsWith('round-4'))).toEqual([])
		expect(snapshot({ lot, round: 4, extra: GO_AHEAD }).exitCode).toBe(0)
		expect(decisionsOf(lot)).toEqual([
			{ decision: 'round 4 beyond the cap of 3: x', by: 'reviewer', when: DAY },
		])
		expect(existsSync(join(lot.lotFolder, 'round-4.state'))).toBe(true)
	})

	it('a retry with another --by and --reason → the first row only, the snapshot made', () => {
		const lot = lotWith({ identity: 'high' })
		appendDecision({
			path: join(lot.lotFolder, 'decisions.md'),
			title: lot.name,
			decision: 'round 4 beyond the cap of 3: x',
			by: 'reviewer',
			when: DAY,
		})

		expect(
			snapshot({ lot, round: 4, extra: ['--beyond-cap', '--by', 'other', '--reason', 'y'] })
				.exitCode,
		).toBe(0)

		expect(decisionsOf(lot)).toEqual([
			{ decision: 'round 4 beyond the cap of 3: x', by: 'reviewer', when: DAY },
		])
		expect(existsSync(join(lot.lotFolder, 'round-4.state'))).toBe(true)
	})

	it('a rerun after a full success → refused as taken (exit 1), the row once, the folder unchanged', () => {
		const lot = lotWith({ identity: 'high' })
		expect(snapshot({ lot, round: 4, extra: GO_AHEAD }).exitCode).toBe(0)
		const before = listing(lot)
		const decisions = readFileSync(join(lot.lotFolder, 'decisions.md'), 'utf8')

		expect(snapshot({ lot, round: 4, extra: GO_AHEAD })).toEqual({
			exitCode: 1,
			output: `lot snapshot: ${join(lot.lotFolder, 'round-4')} exists already: round 4 was taken`,
		})
		expect(listing(lot)).toEqual(before)
		expect(readFileSync(join(lot.lotFolder, 'decisions.md'), 'utf8')).toBe(decisions)
	})

	it('a go-ahead row of round 5 present while round 4 is asked → the round-4 row appended, then the snapshot', () => {
		const lot = lotWith({ identity: 'high' })
		appendDecision({
			path: join(lot.lotFolder, 'decisions.md'),
			title: lot.name,
			decision: 'round 5 beyond the cap of 3: later',
			by: 'person-a',
			when: DAY,
		})

		expect(snapshot({ lot, round: 4, extra: GO_AHEAD }).exitCode).toBe(0)

		expect(decisionsOf(lot)).toEqual([
			{ decision: 'round 5 beyond the cap of 3: later', by: 'person-a', when: DAY },
			{ decision: 'round 4 beyond the cap of 3: x', by: 'reviewer', when: DAY },
		])
		expect(existsSync(join(lot.lotFolder, 'round-4.state'))).toBe(true)
	})

	it('R1-3: a go-ahead row of round 4 stands (a crash before the snapshot), a flag-less snapshot of round 4 → taken, no second row', () => {
		const lot = lotWith({ identity: 'high' })
		appendDecision({
			path: join(lot.lotFolder, 'decisions.md'),
			title: lot.name,
			decision: 'round 4 beyond the cap of 3: x',
			by: 'reviewer',
			when: DAY,
		})

		const retry = snapshot({ lot, round: 4 })

		expect(retry).toEqual({
			exitCode: 0,
			output: expect.stringMatching(/^lot snapshot: round-4 - /),
		})
		expect(decisionsOf(lot)).toEqual([
			{ decision: 'round 4 beyond the cap of 3: x', by: 'reviewer', when: DAY },
		])
		expect(existsSync(join(lot.lotFolder, 'round-4.state'))).toBe(true)
	})

	it('R1-3: a go-ahead row of round 5 only, a flag-less snapshot of round 4 → still refused (exit 2), nothing written', () => {
		const lot = lotWith({ identity: 'high' })
		appendDecision({
			path: join(lot.lotFolder, 'decisions.md'),
			title: lot.name,
			decision: 'round 5 beyond the cap of 3: later',
			by: 'person-a',
			when: DAY,
		})
		const before = listing(lot)

		expect(snapshot({ lot, round: 4 })).toEqual({
			exitCode: 2,
			output: beyondCapLine({ folder: lot.lotFolder, round: 4, cap: 3, effort: 'high' }),
		})
		expect(listing(lot)).toEqual(before)
	})

	for (const reason of [
		'costs $& more',
		'costs $1 and $$ and $` more',
		'keeps {by} and {cap} as written',
	])
		it(`R1-4: --reason '${reason}' → the decisions row holds it as written`, () => {
			const lot = lotWith({ identity: 'high' })

			const result = snapshot({
				lot,
				round: 4,
				extra: ['--beyond-cap', '--by', 'reviewer', '--reason', reason],
			})

			expect(result.exitCode).toBe(0)
			expect(decisionsOf(lot)).toEqual([
				{ decision: `round 4 beyond the cap of 3: ${reason}`, by: 'reviewer', when: DAY },
			])
		})

	it('a round within the cap → refused, exit 2, nothing written (D17)', () => {
		const lot = lotWith({ identity: 'high' })
		const before = listing(lot)

		expect(snapshot({ lot, round: 2, extra: GO_AHEAD })).toEqual({
			exitCode: 2,
			output: 'lot snapshot: round 2 is within the cap of 3: drop --beyond-cap',
		})
		expect(listing(lot)).toEqual(before)
	})

	for (const extra of [
		['--by', 'reviewer'],
		['--reason', 'x'],
		['--by', 'reviewer', '--reason', 'x'],
		['--beyond-cap'],
		['--beyond-cap', '--by', 'reviewer'],
		['--beyond-cap', '--reason', 'x'],
	])
		it(`${extra.join(' ')} → a usage of one line, exit 2, nothing written (D17)`, () => {
			const lot = lotWith({ identity: 'high' })
			const before = listing(lot)

			expect(snapshot({ lot, round: 4, extra })).toEqual({
				exitCode: 2,
				output: expect.stringMatching(USAGE_PATTERN),
			})
			expect(listing(lot)).toEqual(before)
		})
})

describe(
	'lot snapshot --beyond-cap - the forbidden words (D3)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		type WordCase = {
			name: string
			extra: string[]
			source: 'git config' | 'user file'
			/** The option holding the word. */
			option: '--by' | '--reason'
		}

		const WORD_CASES: WordCase[] = [
			{
				name: '--by holding a word of the git config list',
				option: '--by',
				extra: ['--by', FIRST_WORD, '--reason', 'x'],
				source: 'git config',
			},
			{
				name: '--reason holding a word of the git config list',
				option: '--reason',
				extra: ['--by', 'reviewer', '--reason', `needs ${FIRST_WORD} here`],
				source: 'git config',
			},
			{
				name: '--by holding a word of the user file list',
				option: '--by',
				extra: ['--by', FIRST_WORD, '--reason', 'x'],
				source: 'user file',
			},
			{
				name: '--reason holding a word of the user file list, in capitals',
				option: '--reason',
				extra: ['--by', 'reviewer', '--reason', FIRST_WORD.toUpperCase()],
				source: 'user file',
			},
		]

		for (const { name, extra, source, option } of WORD_CASES)
			it(`${name} → exit 2, nothing written`, () => {
				const lot = createStationLot()
				setIdentityEffort({ lot, level: 'high' })
				configureMachine({ userFileLines: source === 'user file' ? [FIRST_WORD] : undefined })
				if (source === 'git config')
					git({ root: lot.cwd, args: ['config', 'dialecte.forbiddenWords', FIRST_WORD] })
				const before = listing(lot)

				const result = snapshot({ lot, round: 4, extra: ['--beyond-cap', ...extra] })

				expect(result).toEqual({
					exitCode: 2,
					output: `lot snapshot: ${option} holds a forbidden word: nothing written`,
				})
				expect(listing(lot)).toEqual(before)
			})
	},
)

describe('lot snapshot - round-<n>.state (D7)', { timeout: STORE_CASE_TIMEOUT }, () => {
	it("a snapshot writes { schema: 1, at, stateHash } beside .base and .deleted, the worktree's state hash", () => {
		const lot = lotWith({ identity: 'medium' })

		expect(snapshot({ lot, round: 1 }).exitCode).toBe(0)

		expect(existsSync(join(lot.lotFolder, 'round-1.state'))).toBe(true)
		const state = JSON.parse(readFileSync(join(lot.lotFolder, 'round-1.state'), 'utf8'))
		expect(state).toEqual({
			schema: 1,
			at: NOW.toISOString(),
			stateHash: computeStateHash(lot.cwd),
		})
		expect(listing(lot)).toEqual(
			expect.arrayContaining(['round-1', 'round-1.base', 'round-1.deleted', 'round-1.state']),
		)
		expect(listing(lot).filter((name) => name.endsWith('.partial'))).toEqual([])
	})

	it('the state hash follows the worktree: a changed file gives another hash', () => {
		const lot = lotWith({ identity: 'medium' })
		const clean = computeStateHash(lot.cwd)
		writeFileSync(join(lot.cwd, 'changed.ts'), 'export const changed = 1\n')

		expect(snapshot({ lot, round: 1 }).exitCode).toBe(0)

		expect(existsSync(join(lot.lotFolder, 'round-1.state'))).toBe(true)
		const { stateHash } = JSON.parse(readFileSync(join(lot.lotFolder, 'round-1.state'), 'utf8'))
		expect(stateHash).toBe(computeStateHash(lot.cwd))
		expect(stateHash).not.toBe(clean)
	})
})

describe('lot snapshot - by id', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the refusal names the folder the success line prints', () => {
		const lot = lotWith({ identity: 'low' })
		function argv(round: string): string[] {
			return ['snapshot', lot.name, '--round', round]
		}

		const taken = runLot({ cwd: lot.cwd, argv: argv('1') })
		const folder = /.* - ([^\n]+)$/.exec(taken.output)?.[1]

		expect(taken.exitCode).toBe(0)
		expect(folder).toBeDefined()
		expect(runLot({ cwd: lot.cwd, argv: argv('2') })).toEqual({
			exitCode: 2,
			output: beyondCapLine({ folder: folder ?? '', round: 2, cap: 1, effort: 'low' }),
		})
	})
})
