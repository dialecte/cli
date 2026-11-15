/**
 * `handover run` and the `lot` guard (33L1 6b, cases 39-42, decision D1): a folder that is not a lot of the store is
 * refused (exit 2, nothing written, nothing committed) unless the person goes ahead with `--not-a-lot --by --reason`
 * (a `decisions.md` row, written before any later guard), a simulated or damaged store lot is always refused, a
 * healthy one passes, a release is not concerned, a rehearsal goes on past a refusal. Each case builds its hand-over
 * inside the expectation: the card of the hand-over write is part of what the stub wiring reaches.
 */
import { join } from 'node:path'

import { FIRST_WORD } from '../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../test/forbidden-words-workspace.ts'
import { git } from '../../test/scratch-repository.ts'
import {
	GO_AHEAD_ARGV,
	GO_AHEAD_DAY,
	GO_AHEAD_DETAIL,
	GO_AHEAD_NOW,
	GUARD_DURATION,
	LOT_GUARD_PREFIX,
	NOT_A_LOT_REFUSAL,
} from '../../test/store-lot-guard-workspace.constants.ts'
import {
	damagedLotHandover,
	plainHandover,
	releaseHandover,
	runSummary,
	simulatedLotHandover,
	stageTheLot,
	storeLotHandover,
} from '../../test/store-lot-guard-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { appendDecision } from '../lib/review-rounds/decisions-file.ts'
import { DECISIONS_FILE } from '../lib/review-rounds/review-rounds.constants.ts'
import { RECORD_DAMAGE_REASONS } from '../lib/store/store.constants.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RunSummary } from '../../test/store-lot-guard-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
	vi.useRealTimers()
})

/** A `lot` guard line as a run prints it. */
function lotLine(params: { mark: '✓' | '!' | '✗'; detail: string }): string {
	return `${params.mark} ${LOT_GUARD_PREFIX} ${params.detail}  ${GUARD_DURATION}`
}

const REFUSED_LINE = lotLine({ mark: '✗', detail: NOT_A_LOT_REFUSAL })
const GO_AHEAD_LINE = lotLine({ mark: '!', detail: GO_AHEAD_DETAIL })

/** The row `--not-a-lot --by reviewer --reason r` writes, dated by the system date the cases fix. */
const GO_AHEAD_ROW = { decision: 'not a store lot: r', by: 'reviewer', when: GO_AHEAD_DAY }

/** The system date (only `Date`: the run's processes and timers stay real) a case that writes a row runs at. */
function fixTheDate(): void {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(GO_AHEAD_NOW)
}

/** A run that stopped at the `lot` guard: the lines it printed, nothing written, nothing committed. */
function refusedAtTheGuard(params: { line: string }): RunSummary {
	return {
		exitCode: 2,
		lot: [params.line],
		failedGuards: ['lot'],
		rows: [],
		hasDecisionsFile: false,
		committed: false,
		namesFolder: true,
		usage: [],
		forbidden: [],
		rehearsed: false,
	}
}

describe(
	'handover run: a folder that is not a lot of the store',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		beforeEach(fixTheDate)

		it('case 39: a hand-over in a plain folder -> ✗ lot, exit 2, no decisions file, nothing committed', async () => {
			await expect(
				(async function plainRun() {
					const plain = plainHandover()
					return runSummary({ handover: { cwd: plain.root, folder: plain.folder } })
				})(),
			).resolves.toEqual(refusedAtTheGuard({ line: REFUSED_LINE }))
		})

		it('--not-a-lot --by reviewer --reason r -> the row is written before a later guard refuses, the guard is ! with the go-ahead', async () => {
			await expect(
				(async function goAheadThenLaterRefusal() {
					const plain = plainHandover()
					stageTheLot(plain.root)
					return runSummary({
						handover: { cwd: plain.root, folder: plain.folder },
						argv: [...GO_AHEAD_ARGV],
					})
				})(),
			).resolves.toEqual({
				exitCode: 1,
				lot: [GO_AHEAD_LINE],
				failedGuards: ['index'],
				rows: [GO_AHEAD_ROW],
				hasDecisionsFile: true,
				committed: false,
				namesFolder: true,
				usage: [],
				forbidden: [],
				rehearsed: false,
			})
		})

		const RERUNS: { title: string; argv: string[] }[] = [
			{ title: 'with the flags again', argv: [...GO_AHEAD_ARGV] },
			{ title: 'without the flags', argv: [] },
		]

		for (const { title, argv } of RERUNS)
			it(`a rerun ${title} -> finds the row: no second row, the same !`, async () => {
				await expect(
					(async function rerun() {
						const plain = plainHandover()
						stageTheLot(plain.root)
						const handover = { cwd: plain.root, folder: plain.folder }
						await runSummary({ handover, argv: [...GO_AHEAD_ARGV] })
						return runSummary({ handover, argv })
					})(),
				).resolves.toEqual({
					exitCode: 1,
					lot: [GO_AHEAD_LINE],
					failedGuards: ['index'],
					rows: [GO_AHEAD_ROW],
					hasDecisionsFile: true,
					committed: false,
					namesFolder: true,
					usage: [],
					forbidden: [],
					rehearsed: false,
				})
			})

		it('a row written ahead by lot choice (a decision starting "not a store lot:") is the go-ahead: ! with its by and reason, no second row', async () => {
			await expect(
				(async function rowAhead() {
					const plain = plainHandover()
					stageTheLot(plain.root)
					appendDecision({
						path: join(plain.folder, DECISIONS_FILE),
						title: 'plain',
						decision: 'not a store lot: written ahead',
						by: 'reviewer',
						when: '2026-11-12',
					})
					return runSummary({ handover: { cwd: plain.root, folder: plain.folder } })
				})(),
			).resolves.toEqual({
				exitCode: 1,
				lot: [lotLine({ mark: '!', detail: 'not a store lot (by reviewer: written ahead)' })],
				failedGuards: ['index'],
				rows: [{ decision: 'not a store lot: written ahead', by: 'reviewer', when: '2026-11-12' }],
				hasDecisionsFile: true,
				committed: false,
				namesFolder: true,
				usage: [],
				forbidden: [],
				rehearsed: false,
			})
		})

		it('--rehearse of a plain folder -> ! lot with the refusal text, the rehearsal goes on and ends rehearsed', async () => {
			await expect(
				(async function rehearsal() {
					const plain = plainHandover()
					return runSummary({
						handover: { cwd: plain.root, folder: plain.folder },
						argv: ['--rehearse'],
					})
				})(),
			).resolves.toEqual({
				exitCode: 0,
				lot: [lotLine({ mark: '!', detail: NOT_A_LOT_REFUSAL })],
				failedGuards: [],
				rows: [],
				hasDecisionsFile: false,
				committed: false,
				namesFolder: true,
				usage: [],
				forbidden: [],
				rehearsed: true,
			})
		})

		it('--rehearse with --not-a-lot --by --reason on a plain folder -> the go-ahead is ignored: ! lot with the refusal text, nothing written', async () => {
			await expect(
				(async function rehearsalWithGoAhead() {
					const plain = plainHandover()
					return runSummary({
						handover: { cwd: plain.root, folder: plain.folder },
						argv: ['--rehearse', ...GO_AHEAD_ARGV],
					})
				})(),
			).resolves.toEqual({
				exitCode: 0,
				lot: [lotLine({ mark: '!', detail: NOT_A_LOT_REFUSAL })],
				failedGuards: [],
				rows: [],
				hasDecisionsFile: false,
				committed: false,
				namesFolder: true,
				usage: [],
				forbidden: [],
				rehearsed: true,
			})
		})
	},
)

describe(
	'handover run: --not-a-lot, --by and --reason are a usage',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		const NEEDS_BOTH =
			'handover run: --not-a-lot needs --by <who> and --reason <text>, neither empty nor holding a line break'
		const GO_WITH_FLAG = 'handover run: --by and --reason go with --not-a-lot'

		type Case = { title: string; argv: string[]; usage: string }

		const CASES: Case[] = [
			{ title: '--not-a-lot alone', argv: ['--not-a-lot'], usage: NEEDS_BOTH },
			{
				title: '--not-a-lot --by without --reason',
				argv: ['--not-a-lot', '--by', 'reviewer'],
				usage: NEEDS_BOTH,
			},
			{
				title: '--not-a-lot --reason without --by',
				argv: ['--not-a-lot', '--reason', 'r'],
				usage: NEEDS_BOTH,
			},
			{
				title: 'an empty --by',
				argv: ['--not-a-lot', '--by', '', '--reason', 'r'],
				usage: NEEDS_BOTH,
			},
			{
				title: 'an empty --reason',
				argv: ['--not-a-lot', '--by', 'reviewer', '--reason', ''],
				usage: NEEDS_BOTH,
			},
			{
				title: 'a --by holding a line break',
				argv: ['--not-a-lot', '--by', 'rev\niewer', '--reason', 'r'],
				usage: NEEDS_BOTH,
			},
			{
				title: 'a --reason holding a line break',
				argv: ['--not-a-lot', '--by', 'reviewer', '--reason', 'r\ns'],
				usage: NEEDS_BOTH,
			},
			{
				title: 'a --by whose value is the next option',
				argv: ['--not-a-lot', '--by', '--reason', 'r'],
				usage: NEEDS_BOTH,
			},
			{ title: '--by without --not-a-lot', argv: ['--by', 'reviewer'], usage: GO_WITH_FLAG },
			{ title: '--reason without --not-a-lot', argv: ['--reason', 'r'], usage: GO_WITH_FLAG },
			{
				title: '--by and --reason without --not-a-lot',
				argv: ['--by', 'reviewer', '--reason', 'r'],
				usage: GO_WITH_FLAG,
			},
		]

		for (const { title, argv, usage } of CASES)
			it(`${title} -> exit 2 with the usage line, no guard ran, nothing written, nothing committed`, async () => {
				await expect(
					(async function usageRun() {
						const plain = plainHandover()
						return runSummary({ handover: { cwd: plain.root, folder: plain.folder }, argv })
					})(),
				).resolves.toEqual({
					exitCode: 2,
					lot: [],
					failedGuards: [],
					rows: [],
					hasDecisionsFile: false,
					committed: false,
					namesFolder: false,
					usage: [usage],
					forbidden: [],
					rehearsed: false,
				})
			})
	},
)

describe(
	'handover run: --by and --reason hold the forbidden words (U3)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		type Case = {
			title: string
			/** The lines of the user file list (none: no such file). */
			userFileLines: string[] | undefined
			/** Puts the word in the git config list of the repository. */
			configure: (root: string) => void
			argv: string[]
			/** The option holding the word. */
			option: '--by' | '--reason'
		}

		function configureGitList(root: string): void {
			git({ root, args: ['config', 'dialecte.forbiddenWords', FIRST_WORD] })
		}

		function leaveGitList(): void {}

		const CASES: Case[] = [
			{
				title: '--by holding a word of the git config list',
				userFileLines: undefined,
				configure: configureGitList,
				option: '--by',
				argv: ['--not-a-lot', '--by', FIRST_WORD, '--reason', 'r'],
			},
			{
				title: '--reason holding a word of the git config list',
				userFileLines: undefined,
				configure: configureGitList,
				option: '--reason',
				argv: ['--not-a-lot', '--by', 'reviewer', '--reason', `needs ${FIRST_WORD} here`],
			},
			{
				title: '--by holding a word of the user file list',
				userFileLines: [FIRST_WORD],
				configure: leaveGitList,
				option: '--by',
				argv: ['--not-a-lot', '--by', FIRST_WORD, '--reason', 'r'],
			},
			{
				title: '--reason holding a word of the user file list, in capitals',
				userFileLines: [FIRST_WORD],
				configure: leaveGitList,
				option: '--reason',
				argv: ['--not-a-lot', '--by', 'reviewer', '--reason', FIRST_WORD.toUpperCase()],
			},
		]

		for (const { title, userFileLines, configure, option, argv } of CASES)
			it(`${title} -> exit 2, no guard ran, nothing written, nothing committed`, async () => {
				await expect(
					(async function forbiddenWordRun() {
						configureMachine({ userFileLines })
						const plain = plainHandover()
						configure(plain.root)
						return runSummary({ handover: { cwd: plain.root, folder: plain.folder }, argv })
					})(),
				).resolves.toEqual({
					exitCode: 2,
					lot: [],
					failedGuards: [],
					rows: [],
					hasDecisionsFile: false,
					committed: false,
					namesFolder: false,
					usage: [],
					forbidden: [`lot handover run: ${option} holds a forbidden word: nothing written`],
					rehearsed: false,
				})
			})
	},
)

const DAMAGES = [
	{ kind: 'unreadable', reason: RECORD_DAMAGE_REASONS.identityUnreadable },
	{ kind: 'otherName', reason: RECORD_DAMAGE_REASONS.identityName },
] as const

describe('handover run: a store lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	const HEALTHY_ARGVS: { title: string; argv: string[] }[] = [
		{ title: 'without the go-ahead', argv: [] },
		{ title: 'with --not-a-lot --by --reason (ignored)', argv: [...GO_AHEAD_ARGV] },
	]

	for (const { title, argv } of HEALTHY_ARGVS)
		it(`a healthy store lot folder ${title} -> ✓ lot with the lot name, no decisions file, committed`, async () => {
			await expect(
				(async function healthyLot() {
					const lot = storeLotHandover()
					const summary = await runSummary({
						handover: { cwd: lot.worktree, folder: lot.lotFolder },
						argv,
					})
					return {
						...summary,
						lot: summary.lot.map((line) => line.replaceAll(lot.lotName, '<name>')),
					}
				})(),
			).resolves.toEqual({
				exitCode: 0,
				lot: [lotLine({ mark: '✓', detail: '<name>' })],
				failedGuards: [],
				rows: [],
				hasDecisionsFile: false,
				committed: true,
				namesFolder: true,
				usage: [],
				forbidden: [],
				rehearsed: false,
			})
		})

	it('--rehearse of a simulated store lot -> ! lot with the simulated text, the rehearsal goes on, nothing written', async () => {
		await expect(
			(async function simulatedRehearsal() {
				const lot = simulatedLotHandover()
				const summary = await runSummary({
					handover: { cwd: lot.worktree, folder: lot.lotFolder },
					argv: ['--rehearse'],
				})
				return {
					lot: summary.lot.map((line) => line.replaceAll(lot.lotName, '<name>')),
					failedGuards: summary.failedGuards,
					rows: summary.rows,
					hasDecisionsFile: summary.hasDecisionsFile,
					committed: summary.committed,
				}
			})(),
		).resolves.toEqual({
			lot: [
				lotLine({ mark: '!', detail: '<name> is a simulated lot: a simulated lot never commits' }),
			],
			failedGuards: [],
			rows: [],
			hasDecisionsFile: false,
			committed: false,
		})
	})

	for (const { kind, reason } of DAMAGES)
		it(`--rehearse of a store lot whose identity is ${kind} -> ! lot with the damage text, the rehearsal goes on, nothing written`, async () => {
			await expect(
				(async function damagedRehearsal() {
					const lot = damagedLotHandover(kind)
					const summary = await runSummary({
						handover: { cwd: lot.worktree, folder: lot.lotFolder },
						argv: ['--rehearse'],
					})
					return {
						lot: summary.lot.map((line) => line.replaceAll(lot.lotName, '<name>')),
						failedGuards: summary.failedGuards,
						rows: summary.rows,
						hasDecisionsFile: summary.hasDecisionsFile,
						committed: summary.committed,
					}
				})(),
			).resolves.toEqual({
				lot: [lotLine({ mark: '!', detail: `<name> is a damaged lot of the store: ${reason}` })],
				failedGuards: [],
				rows: [],
				hasDecisionsFile: false,
				committed: false,
			})
		})

	const REFUSAL_ARGVS: { title: string; argv: string[] }[] = [
		{ title: 'without the go-ahead', argv: [] },
		{ title: 'even with --not-a-lot --by --reason', argv: [...GO_AHEAD_ARGV] },
	]

	for (const { title, argv } of REFUSAL_ARGVS) {
		it(`case 40: a simulated store lot's folder ${title} -> refused, a simulated lot never commits, nothing written`, async () => {
			await expect(
				(async function simulatedRun() {
					const lot = simulatedLotHandover()
					const summary = await runSummary({
						handover: { cwd: lot.worktree, folder: lot.lotFolder },
						argv,
					})
					return {
						...summary,
						lot: summary.lot.map((line) => line.replaceAll(lot.lotName, '<name>')),
					}
				})(),
			).resolves.toEqual({
				...refusedAtTheGuard({
					line: lotLine({
						mark: '✗',
						detail: '<name> is a simulated lot: a simulated lot never commits',
					}),
				}),
			})
		})

		for (const { kind, reason } of DAMAGES)
			it(`case 41: a store lot whose identity is ${kind} ${title} -> refused naming the damage, nothing written`, async () => {
				await expect(
					(async function damagedRun() {
						const lot = damagedLotHandover(kind)
						const summary = await runSummary({
							handover: { cwd: lot.worktree, folder: lot.lotFolder },
							argv,
						})
						return {
							...summary,
							lot: summary.lot.map((line) => line.replaceAll(lot.lotName, '<name>')),
						}
					})(),
				).resolves.toEqual(
					refusedAtTheGuard({
						line: lotLine({
							mark: '✗',
							detail: `<name> is a damaged lot of the store: ${reason}`,
						}),
					}),
				)
			})
	}
})

describe('handover run: a release hand-over', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('case 42: lots.json release true in a plain folder -> no lot line, not refused, no decisions file', async () => {
		await expect(
			(async function releaseRun() {
				const release = releaseHandover()
				return runSummary({ handover: { cwd: release.root, folder: release.folder } })
			})(),
		).resolves.toEqual({
			exitCode: 0,
			lot: [],
			failedGuards: [],
			rows: [],
			hasDecisionsFile: false,
			committed: true,
			namesFolder: true,
			usage: [],
			forbidden: [],
			rehearsed: false,
		})
	})
})
