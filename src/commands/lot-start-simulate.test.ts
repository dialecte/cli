/**
 * `lot start <brief> --simulate <scenario>` (33S section 8, G6, case 26): every brief check runs, the overlap and
 * branch findings are recorded in `wouldRefuse` instead of refusing, the lot folder holds `scenario.json`, and no
 * worktree, branch, link or registry entry is made; an unknown scenario exits 2 listing every scenario name; a
 * simulated lot never blocks a real start. The overlap check re-reads once after 100 ms a lot whose only evidence
 * of `canceled` is `abandoned.json` (case 62).
 */
import { rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { briefWith, writeStoreLot } from '../../test/brief-workspace.ts'
import { outcomeOf } from '../../test/call-outcome.ts'
import { markerOnlyLot } from '../../test/lot-start-pause-lots.ts'
import { PAUSE_ROWS } from '../../test/lot-start-pause-rows.constants.ts'
import { SECOND_LOT, TAKEN_LOT, WAIT_LINE } from '../../test/lot-start-simulate-cases.constants.ts'
import {
	createdBy,
	createStartWorkspace,
	entriesOf,
	recordOf,
	withJson,
	withLines,
} from '../../test/lot-start-workspace.ts'
import { BRIEF_BRANCH, LOT_NAME, START_NOW } from '../../test/lot-start.constants.ts'
import { git } from '../../test/scratch-repository.ts'
import {
	PERMISSION_BITS,
	READ_ONLY_MODE,
	REREAD_PAUSE_MS,
} from '../../test/simulated-lot.constants.ts'
import { repositoryFactsOf } from '../../test/simulated-lot.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { SCENARIOS } from '../lib/store/scenarios.constants.ts'
import { startLot } from './lot-start.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StartWorkspace } from '../../test/lot-start-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** `lot start <brief> --simulate <scenario>` through `runLot` from the workspace folder; the options after it as given. */
function simulate(params: { start: StartWorkspace; scenario: string; extra?: string[] }) {
	return runLot({
		cwd: params.start.cwd,
		argv: [
			'start',
			params.start.workspace.briefPath,
			'--simulate',
			params.scenario,
			...(params.extra ?? ['--json']),
		],
		now: START_NOW,
	})
}

/** The identity of the lot a simulated start made, as read from its folder. */
function identityOf(start: StartWorkspace) {
	return outcomeOf(
		() =>
			recordOf({ folder: join(start.store, LOT_NAME), name: 'identity.json' }) as {
				wouldRefuse: { rule: string; detail: string }[]
			},
	)
}

/** The rules of the would-be refusals an identity holds, sorted; none when the identity is unreadable. */
function rulesOf(identity: ReturnType<typeof identityOf>): string[] {
	return 'value' in identity ? identity.value.wouldRefuse.map((finding) => finding.rule).sort() : []
}

describe('lot start --simulate: the lot and its output', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const name of Object.keys(SCENARIOS))
		it(`${name} -> exit 0, runner simulated, no worktree, the wait line with --timeout 60`, () => {
			const start = createStartWorkspace()

			expect(withJson(simulate({ start, scenario: name }))).toMatchObject({
				exitCode: 0,
				json: {
					lot: LOT_NAME,
					folder: join(start.store, LOT_NAME),
					worktree: null,
					runner: 'simulated',
					next: WAIT_LINE,
				},
			})
		})

	for (const name of Object.keys(SCENARIOS))
		it(`${name} -> identity.json says simulated, the scenario's name, no worktree and no would-be refusal`, () => {
			const start = createStartWorkspace()

			expect({
				exitCode: simulate({ start, scenario: name }).exitCode,
				identity: identityOf(start),
			}).toMatchObject({
				exitCode: 0,
				identity: { value: { simulated: true, scenario: name, worktree: null, wouldRefuse: [] } },
			})
		})

	for (const name of Object.keys(SCENARIOS))
		it(`${name} -> scenario.json is { schema: 1, name, steps } with the table's steps`, () => {
			const start = createStartWorkspace()

			expect({
				exitCode: simulate({ start, scenario: name }).exitCode,
				scenario: outcomeOf(() =>
					recordOf({ folder: join(start.store, LOT_NAME), name: 'scenario.json' }),
				),
			}).toEqual({
				exitCode: 0,
				scenario: { value: { schema: 1, name, steps: SCENARIOS[name] } },
			})
		})

	it('a start -> scenario.json is read-only', () => {
		const start = createStartWorkspace()

		expect({
			exitCode: simulate({ start, scenario: 'ready' }).exitCode,
			mode: outcomeOf(
				() => statSync(join(start.store, LOT_NAME, 'scenario.json')).mode & PERMISSION_BITS,
			),
		}).toEqual({ exitCode: 0, mode: { value: READ_ONLY_MODE } })
	})

	it('a start -> transition 1 is the working start of the lot, marked simulated, at step 0 of the brief steps', () => {
		const start = createStartWorkspace()

		expect({
			exitCode: simulate({ start, scenario: 'ready' }).exitCode,
			first: outcomeOf(() =>
				recordOf({ folder: join(start.store, LOT_NAME), name: 'transitions/000001.json' }),
			),
		}).toMatchObject({
			exitCode: 0,
			first: {
				value: {
					seq: 1,
					at: START_NOW.toISOString(),
					lot: LOT_NAME,
					state: 'working',
					position: { step: 0, of: 1, station: null, round: null },
					cause: { kind: 'start' },
					question: null,
					simulated: true,
				},
			},
		})
	})

	it('the text form -> names the lot, says runner: simulated and gives the wait line', () => {
		const start = createStartWorkspace()

		expect(withLines(simulate({ start, scenario: 'ready', extra: [] }))).toMatchObject({
			exitCode: 0,
			lines: expect.arrayContaining([
				`${LOT_NAME} started`,
				'runner: simulated',
				`next: ${WAIT_LINE}`,
			]),
		})
	})

	it('--simulate ready --dry-run -> the dry run: exit 0, dryRun true, no index claimed, nothing created', () => {
		const start = createStartWorkspace()

		expect({
			...withJson(simulate({ start, scenario: 'ready', extra: ['--dry-run', '--json'] })),
			created: createdBy(start),
		}).toMatchObject({
			exitCode: 0,
			json: { dryRun: true, lot: LOT_NAME },
			created: { claims: [], lots: [], worktrees: [], storeList: undefined },
		})
	})
})

describe('lot start --simulate: what it writes (case 26)', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a start -> refs, worktree list, registry and .git/info/exclude are byte-identical; no worktree folder', () => {
		const start = createStartWorkspace()
		const before = repositoryFactsOf(start)

		expect({
			exitCode: simulate({ start, scenario: 'ready' }).exitCode,
			facts: repositoryFactsOf(start),
			worktreeFolders: createdBy(start).worktrees,
		}).toEqual({ exitCode: 0, facts: before, worktreeFolders: [] })
	})

	it('a start -> new are only the lot folder, one store-list line and one claim', () => {
		const start = createStartWorkspace()

		expect({
			exitCode: simulate({ start, scenario: 'ready' }).exitCode,
			claims: createdBy(start).claims.length,
			lots: createdBy(start).lots,
			worktrees: createdBy(start).worktrees,
			storeList: createdBy(start).storeList,
		}).toEqual({
			exitCode: 0,
			claims: 1,
			lots: [LOT_NAME],
			worktrees: [],
			storeList: `${start.store}\n`,
		})
	})

	it('a start -> the lot folder holds the brief, the plan, the scenario, the identity and transitions, no answers', () => {
		const start = createStartWorkspace()

		expect({
			exitCode: simulate({ start, scenario: 'ready' }).exitCode,
			entries: entriesOf(join(start.store, LOT_NAME)),
		}).toEqual({
			exitCode: 0,
			entries: ['brief.json', 'identity.json', 'plan.md', 'scenario.json', 'transitions'],
		})
	})
})

describe('lot start --simulate: the checks', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a real open lot on the same scope naming the branch, and the branch ref in the repository -> exit 0, wouldRefuse names overlap and branch-exists, the lot named', () => {
		const start = createStartWorkspace()
		writeStoreLot({
			workspace: start.workspace,
			name: TAKEN_LOT,
			scope: ['src/dataflow/'],
			branch: BRIEF_BRANCH,
		})
		git({ root: start.repository, args: ['branch', BRIEF_BRANCH] })

		expect({
			exitCode: simulate({ start, scenario: 'ready' }).exitCode,
			rules: rulesOf(identityOf(start)),
			named: (function allNamed() {
				const identity = identityOf(start)
				return (
					'value' in identity &&
					identity.value.wouldRefuse.every((finding) => finding.detail.includes(TAKEN_LOT))
				)
			})(),
		}).toEqual({ exitCode: 0, rules: ['branch-exists', 'overlap'], named: true })
	})

	it('a real open lot on the same scope naming the branch, no ref holding it -> exit 0, wouldRefuse holds overlap only, the lot named', () => {
		const start = createStartWorkspace()
		writeStoreLot({
			workspace: start.workspace,
			name: TAKEN_LOT,
			scope: ['src/dataflow/'],
			branch: BRIEF_BRANCH,
		})

		expect({
			exitCode: simulate({ start, scenario: 'ready' }).exitCode,
			rules: rulesOf(identityOf(start)),
			named: (function allNamed() {
				const identity = identityOf(start)
				return (
					'value' in identity &&
					identity.value.wouldRefuse.every((finding) => finding.detail.includes(TAKEN_LOT))
				)
			})(),
		}).toEqual({ exitCode: 0, rules: ['overlap'], named: true })
	})

	it('the branch exists as a git ref -> exit 0, wouldRefuse holds branch-exists only, the ref untouched', () => {
		const start = createStartWorkspace()
		git({ root: start.repository, args: ['branch', BRIEF_BRANCH] })
		const refsBefore = git({ root: start.repository, args: ['for-each-ref'] })

		expect({
			exitCode: simulate({ start, scenario: 'ready' }).exitCode,
			rules: rulesOf(identityOf(start)),
			refs: git({ root: start.repository, args: ['for-each-ref'] }),
		}).toEqual({ exitCode: 0, rules: ['branch-exists'], refs: refsBefore })
	})

	it('a brief with a shape fault -> still refused, exit 2, nothing created', () => {
		const start = createStartWorkspace({ brief: briefWith({ goal: undefined }) })

		expect({
			...withJson(simulate({ start, scenario: 'ready' })),
			created: createdBy(start),
		}).toMatchObject({
			exitCode: 2,
			json: { refused: [expect.objectContaining({ rule: 'shape' })] },
			created: { claims: [], lots: [], worktrees: [], storeList: undefined },
		})
	})

	it('an unknown scenario -> exit 2 listing every scenario name, nothing created', () => {
		const start = createStartWorkspace()
		const result = simulate({ start, scenario: 'nope' })

		expect({
			exitCode: result.exitCode,
			listed: Object.keys(SCENARIOS).filter((name) => result.output.includes(name)),
			created: createdBy(start),
		}).toEqual({
			exitCode: 2,
			listed: Object.keys(SCENARIOS),
			created: { claims: [], lots: [], worktrees: [], storeList: undefined },
		})
	})
})

describe(
	'lot start --simulate: a simulated lot blocks nothing',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a simulated start, then a real start of the same brief -> the real lot starts with its worktree', () => {
			const start = createStartWorkspace()
			simulate({ start, scenario: 'ready' })

			expect({
				...withJson(
					runLot({
						cwd: start.cwd,
						argv: ['start', start.workspace.briefPath, '--json'],
						now: START_NOW,
					}),
				),
				worktrees: createdBy(start).worktrees,
			}).toMatchObject({
				exitCode: 0,
				json: { lot: SECOND_LOT, runner: 'manual' },
				worktrees: [SECOND_LOT],
			})
		})

		it('two simulated starts of one brief -> both exit 0 as lots 0001 and 0002', () => {
			const start = createStartWorkspace()

			expect({
				first: simulate({ start, scenario: 'ready' }).exitCode,
				second: simulate({ start, scenario: 'question' }).exitCode,
				lots: createdBy(start).lots,
			}).toEqual({ first: 0, second: 0, lots: [LOT_NAME, SECOND_LOT] })
		})
	},
)

/**
 * `lot start` (a dry run, or `--simulate ready`) with a pause seam that records its calls (and takes the marker
 * back when asked): the exit code, the pauses and the rules of a simulated start's `wouldRefuse`.
 */
function startPausing(params: {
	start: StartWorkspace
	folder: string
	removeMarker: boolean
	run: 'dry-run' | 'simulate'
}) {
	const pauses: number[] = []
	function pause(milliseconds: number): void {
		pauses.push(milliseconds)
		if (params.removeMarker) rmSync(join(params.folder, 'abandoned.json'), { force: true })
	}
	const result = startLot({
		cwd: params.start.cwd,
		argv: [
			params.start.workspace.briefPath,
			...(params.run === 'dry-run' ? ['--dry-run'] : ['--simulate', 'ready']),
			'--json',
		],
		now: START_NOW,
		seams: { pause },
	})
	return {
		exitCode: result.exitCode,
		pauses,
		findings: params.run === 'simulate' ? rulesOf(identityOf(params.start)) : [],
	}
}

/**
 * A real start where the marker-only lot appears just before the lot folder is published (the race re-check is the
 * first check to see it), with a pause seam that records its calls (and takes the marker back when asked).
 */
function startWithLotAtTheRecheck(params: { start: StartWorkspace; removeMarker: boolean }) {
	const pauses: number[] = []
	let folder = ''
	function pause(milliseconds: number): void {
		pauses.push(milliseconds)
		if (params.removeMarker) rmSync(join(folder, 'abandoned.json'), { force: true })
	}
	function lotAppears(): void {
		folder = markerOnlyLot(params.start)
	}
	const result = startLot({
		cwd: params.start.cwd,
		argv: [params.start.workspace.briefPath, '--json'],
		now: START_NOW,
		seams: { pause, beforePublish: lotAppears },
	})
	return { exitCode: result.exitCode, pauses }
}

describe(
	'lot start: the overlap check re-reads once (case 62)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of PAUSE_ROWS)
			it(row.title, () => {
				const start = createStartWorkspace()
				const folder = row.lot(start)

				expect(
					startPausing({
						start,
						folder,
						removeMarker: row.removeMarker,
						run: row.run ?? 'dry-run',
					}),
				).toEqual({
					exitCode: row.exitCode,
					pauses: row.pauses,
					findings: row.findings ?? [],
				})
			})
	},
)

describe(
	'lot start: the race re-check re-reads once too (case 62)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a real start, a marker-only lot appearing before the publish and its marker still there after the pause -> one re-read at the re-check, the start goes on', () => {
			const start = createStartWorkspace()

			expect(startWithLotAtTheRecheck({ start, removeMarker: false })).toEqual({
				exitCode: 0,
				pauses: [REREAD_PAUSE_MS],
			})
		})

		it('a real start, the marker taken back during that pause -> the lot is open: the start fails as an overlap, exit 1', () => {
			const start = createStartWorkspace()

			expect(startWithLotAtTheRecheck({ start, removeMarker: true })).toEqual({
				exitCode: 1,
				pauses: [REREAD_PAUSE_MS],
			})
		})

		it('a real start, no other lot -> a real start of the default brief identity holds no wouldRefuse key', () => {
			const start = createStartWorkspace()

			expect({
				exitCode: runLot({
					cwd: start.cwd,
					argv: ['start', start.workspace.briefPath, '--json'],
					now: START_NOW,
				}).exitCode,
				hasKey: Object.hasOwn(
					recordOf({ folder: join(start.store, LOT_NAME), name: 'identity.json' }) as object,
					'wouldRefuse',
				),
			}).toEqual({ exitCode: 0, hasKey: false })
		})
	},
)
