/**
 * The hints of a kept lot (KEEP 3.6 - 3.8): its keep in the JSON of `lot status`, `lot wait` and `lot result`, the
 * text unchanged; no hint names `lot close` for a kept lot (`also`, `lot land`'s two lines); `lot stop` refuses to move a
 * damaged kept lot aside and leaves a kept lot's keep alone; `lot delta` names the kept text instead of a removal.
 */
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../test/brief-workspace.ts'
import { FIXTURE_TEMPLATE_PATH } from '../../test/change-request-template.constants.ts'
import { KEEP_REASON } from '../../test/keep-decision-workspace.constants.ts'
import {
	damageLot,
	jsonOrText,
	keepTextOf,
	keptJsonOf,
	keptTextOf,
	makeKeepFolder,
	unkeepNextOf,
	writeKeepLine,
} from '../../test/keep-decision-workspace.ts'
import { recordingHost } from '../../test/land-lot.ts'
import { landingLotOf } from '../../test/landing-lot.ts'
import { landingHostOf } from '../../test/landing-repository.ts'
import { cliTemplate } from '../../test/lot-describe.ts'
import { lotPruneArgumentsOf, prunedItemsOf } from '../../test/lot-prune-workspace.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLotLand } from './lot-land.ts'
import { runLotPrune } from './lot-prune.ts'
import { waitLot } from './lot-wait.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const LOT = '0007-repo-feature'

/** `lot <words>` from the workspace's main checkout. */
function lotVerb(params: { workspace: BriefWorkspace; words: string[] }): CommandResult {
	return runLot({ cwd: params.workspace.repository, argv: params.words })
}

/**
 * A lot ready to land through its pull request: its registry entry pending, its landing record written (pull request
 * #9), no written hand-over. Its folder.
 */
function readyLandingLot(workspace: BriefWorkspace): string {
	const lotFolder = writeStoreLot({ workspace, name: LOT, scope: ['src/'], registry: 'pending' })
	writeFileSync(
		join(lotFolder, 'landing.json'),
		`${JSON.stringify({
			schema: 1,
			number: 9,
			url: 'https://host.test/pull/9',
			branch: `feat/${LOT}`,
			head: 'a'.repeat(40),
			at: '2026-11-20T08:00:00.000Z',
		})}\n`,
	)
	return lotFolder
}

/** `next`, `also` and `kept` of a status JSON. */
function hintsOf(output: string): { next: unknown; also: unknown; kept: unknown } {
	const json = jsonOrText(output) as { next?: unknown; also?: unknown; kept?: unknown }
	return { next: json.next, also: json.also, kept: json.kept }
}

describe('lot status of a kept lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot status --json of a kept working lot → its kept field, next unchanged; the text byte-equal to the lot unkept', () => {
		const lot = landingLotOf()
		const cwd = lot.workspace.repository
		const textBefore = runLot({ cwd, argv: ['status', lot.name] }).output
		const nextBefore = hintsOf(runLot({ cwd, argv: ['status', lot.name, '--json'] }).output).next
		writeKeepLine({ lotFolder: lot.lotFolder })

		expect({
			json: hintsOf(runLot({ cwd, argv: ['status', lot.name, '--json'] }).output),
			text: runLot({ cwd, argv: ['status', lot.name] }).output,
		}).toEqual({
			json: { next: nextBefore, also: expect.any(Array), kept: keptJsonOf() },
			text: textBefore,
		})
	})

	it('lot status --json of a kept ready landing lot → next lot land, no lot close in also', () => {
		const workspace = createBriefWorkspace()
		writeKeepLine({ lotFolder: readyLandingLot(workspace) })

		expect(hintsOf(lotVerb({ workspace, words: ['status', LOT, '--json'] }).output)).toEqual({
			next: `dialecte lot land ${LOT}`,
			also: [],
			kept: keptJsonOf(),
		})
	})

	it('lot status --json of the same lot not kept → lot close in also, kept null', () => {
		const workspace = createBriefWorkspace()
		readyLandingLot(workspace)

		expect(hintsOf(lotVerb({ workspace, words: ['status', LOT, '--json'] }).output)).toEqual({
			next: `dialecte lot land ${LOT}`,
			also: [`dialecte lot close ${LOT}`],
			kept: null,
		})
	})

	it('lot status text of a kept ready landing lot → no line names lot close', () => {
		const workspace = createBriefWorkspace()
		writeKeepLine({ lotFolder: readyLandingLot(workspace) })

		expect(
			lotVerb({ workspace, words: ['status', LOT] })
				.output.split('\n')
				.filter((line) => line.includes('lot close')),
		).toEqual([])
	})

	it('lot wait of a kept ready landing lot → no lot close in also; --json kept set', async () => {
		const workspace = createBriefWorkspace()
		writeKeepLine({ lotFolder: readyLandingLot(workspace) })

		await expect(
			Promise.all([
				waitLot({ cwd: workspace.repository, argv: [LOT] }),
				waitLot({ cwd: workspace.repository, argv: [LOT, '--json'] }),
			]).then(([text, json]) => ({
				text: text.output.includes('lot close'),
				json: ((hints) => ({ also: hints.also, kept: hints.kept }))(hintsOf(json.output)),
			})),
		).resolves.toEqual({ text: false, json: { also: [], kept: keptJsonOf() } })
	})
})

/** The lot's folder and the aside folder after a stop: whether the folder is still in the store. */
function stopOf(params: { workspace: BriefWorkspace; lotFolder: string; words?: string[] }): {
	exitCode: number
	output: string
	inStore: boolean
} {
	const result = lotVerb({
		workspace: params.workspace,
		words: ['stop', LOT, '--reason', 'dropped', ...(params.words ?? [])],
	})
	return {
		exitCode: result.exitCode,
		output: result.output.trim(),
		inStore: existsSync(params.lotFolder),
	}
}

describe('lot stop of a kept lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a damaged kept lot → exit 2, refused naming the keep and lot unkeep first, the folder not moved', () => {
		const workspace = createBriefWorkspace()
		const lotFolder = writeStoreLot({ workspace, name: LOT, scope: ['src/'] })
		damageLot({ lotFolder })
		writeKeepLine({ lotFolder })

		expect(stopOf({ workspace, lotFolder })).toEqual({
			exitCode: 2,
			output: expect.stringMatching(
				new RegExp(
					`^lot stop: ${LOT} is damaged and kept by decision: .*${KEEP_REASON}.*; first: ${unkeepNextOf(LOT).replace(/[<>]/g, '.')}$`,
				),
			),
			inStore: true,
		})
	})

	it('a damaged lot whose keep.jsonl is a folder → exit 2, the repair line, the folder not moved', () => {
		const workspace = createBriefWorkspace()
		const lotFolder = writeStoreLot({ workspace, name: LOT, scope: ['src/'] })
		damageLot({ lotFolder })
		makeKeepFolder({ lotFolder })

		expect(stopOf({ workspace, lotFolder })).toEqual({
			exitCode: 2,
			output: expect.stringContaining(
				`first: repair keep.jsonl by hand (EISDIR), then: ${unkeepNextOf(LOT)}`,
			),
			inStore: true,
		})
	})

	it('a kept working lot → canceled, its keep untouched; lot prune then keeps every item with the kept text', () => {
		const lot = landingLotOf()
		writeKeepLine({ lotFolder: lot.lotFolder })
		const keep = keepTextOf(lot.lotFolder)

		expect(
			((stopped: CommandResult) => ({
				exitCode: stopped.exitCode,
				keep: keepTextOf(lot.lotFolder),
				items: prunedItemsOf({
					result: runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name] })),
					lot: lot.name,
				}),
			}))(
				runLot({ cwd: lot.workspace.repository, argv: ['stop', lot.name, '--reason', 'dropped'] }),
			),
		).toEqual({
			exitCode: 0,
			keep,
			items: {
				[`worktree ${lot.worktree}`]: { decision: { kept: keptTextOf() } },
				[`branch ${lot.branch}`]: { decision: { kept: keptTextOf() } },
			},
		})
	})
})

/**
 * A store lot `0001-repo-x` on its worktree `feat/x` one commit ahead of main (`src/x.ts`), main holding the pull
 * request template and pushed to a bare origin. The workspace, the lot folder and the worktree.
 */
function landableLot(): { workspace: BriefWorkspace; lotFolder: string; worktree: string } {
	const workspace = createBriefWorkspace()
	writeFiles({ root: workspace.repository, files: { [FIXTURE_TEMPLATE_PATH]: cliTemplate() } })
	git({ root: workspace.repository, args: ['add', '-A'] })
	git({ root: workspace.repository, args: ['commit', '-qm', 'chore: the template'] })
	const origin = join(workspace.workspace, 'origin.git')
	git({ root: workspace.workspace, args: ['init', '-q', '--bare', '-b', 'main', origin] })
	git({ root: workspace.repository, args: ['remote', 'add', 'origin', origin] })
	git({ root: workspace.repository, args: ['push', '-q', '-u', 'origin', 'main'] })
	const worktree = join(workspace.workspace, '.worktrees', '0001-repo-x')
	git({
		root: workspace.repository,
		args: ['worktree', 'add', '-q', '-b', 'feat/x', worktree, 'main'],
	})
	const main = git({ root: workspace.repository, args: ['rev-parse', 'main'] }).trim()
	writeFiles({ root: worktree, files: { 'src/x.ts': 'export const x = 1\n' } })
	git({ root: worktree, args: ['add', 'src/x.ts'] })
	git({ root: worktree, args: ['commit', '-qm', 'feat(x): x answers one'] })
	const lotFolder = writeStoreLot({
		workspace,
		name: '0001-repo-x',
		scope: ['src/'],
		branch: 'feat/x',
		repository: workspace.repository,
		worktree,
		base: { ref: 'main', commit: main },
	})
	return { workspace, lotFolder, worktree: realpathSync(worktree) }
}

/** What a land answered: its exit, whether a line names `lot close`, and its output. */
function landedBy(result: CommandResult): { exitCode: number; close: boolean; output: string } {
	return {
		exitCode: result.exitCode,
		close: result.output.includes('lot close'),
		output: result.output,
	}
}

describe('lot land of a kept lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('its pull request opened → once merged, lot land again with the keep named; no lot close', () => {
		const { workspace, lotFolder } = landableLot()
		writeKeepLine({ lotFolder })

		expect(
			landedBy(
				runLotLand({
					cwd: workspace.repository,
					argv: ['0001-repo-x'],
					host: recordingHost().host,
				}),
			),
		).toEqual({
			exitCode: 0,
			close: false,
			output: expect.stringMatching(
				new RegExp(
					`once merged: dialecte lot land 0001-repo-x again \\(it records the merge; kept by decision: ${KEEP_REASON}`,
				),
			),
		})
	})

	it('its branch already in main → committed, the keep named with its release; no lot close', () => {
		const { workspace, lotFolder, worktree } = landableLot()
		git({ root: worktree, args: ['push', '-q', 'origin', 'feat/x:main'] })
		writeKeepLine({ lotFolder })

		expect(
			landedBy(
				runLotLand({
					cwd: workspace.repository,
					argv: ['0001-repo-x'],
					host: landingHostOf({}).host,
				}),
			),
		).toEqual({
			exitCode: 0,
			close: false,
			output: expect.stringContaining(`; to release it: ${unkeepNextOf('0001-repo-x')}`),
		})
	})
})

/** A store lot on its worktree with an empty round-1 snapshot in its folder, ready for `lot delta --round 2 --worktree`. */
function deltaLot() {
	const lot = landingLotOf()
	mkdirSync(join(lot.lotFolder, 'round-1'), { recursive: true })
	writeFileSync(join(lot.lotFolder, 'round-1.deleted'), '')
	return lot
}

describe('lot delta --worktree of a kept lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('text → the kept text says the throwaway stays, no removal command', () => {
		const lot = deltaLot()
		writeKeepLine({ lotFolder: lot.lotFolder })

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				stays: result.output
					.split('\n')
					.includes(`${keptTextOf()}: the throwaway stays with the lot`),
				removal: result.output.includes('remove it:'),
			}))(
				runLot({
					cwd: lot.worktree,
					argv: ['delta', lot.name, '--round', '2', '--worktree'],
					now: new Date('2026-11-20T10:00:00.000Z'),
				}),
			),
		).toEqual({ exitCode: 0, stays: true, removal: false })
	})

	it('--json → the throwaway without its removal, the kept text', () => {
		const lot = deltaLot()
		writeKeepLine({ lotFolder: lot.lotFolder })

		expect(
			((json) => ({
				kept: json.kept,
				removal: json.throwaway !== undefined && 'removal' in json.throwaway,
				throwaway: json.throwaway !== undefined,
			}))(
				jsonOrText(
					runLot({
						cwd: lot.worktree,
						argv: ['delta', lot.name, '--round', '2', '--worktree', '--json'],
						now: new Date('2026-11-20T10:00:00.000Z'),
					}).output,
				) as { kept?: unknown; throwaway?: Record<string, unknown> },
			),
		).toEqual({ kept: keptTextOf(), removal: false, throwaway: true })
	})
})
