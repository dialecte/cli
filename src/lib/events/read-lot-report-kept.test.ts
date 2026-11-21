/**
 * `lot report` of a kept lot (KEEP 3.6): its keep in the JSON and as one `kept` line, `lot unkeep` its next while its
 * worktree or branch is left (prune would keep everything); `lot report --kept` lists every kept lot of the stores,
 * real, simulated and damaged, each line built from the one checked read alone; `--feature` marks a kept lot.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace } from '../../../test/brief-workspace.ts'
import { KEEP_REASON } from '../../../test/keep-decision-workspace.constants.ts'
import {
	damageLot,
	jsonOrText,
	keptJsonOf,
	unkeepNextOf,
	writeKeepDocument,
	writeKeepLine,
} from '../../../test/keep-decision-workspace.ts'
import {
	landingLotOf,
	removeBranchAndWorktree,
	writeLandedFact,
} from '../../../test/landing-lot.ts'
import { mergeOnOrigin } from '../../../test/landing-repository.ts'
import { addLotWithoutWorktree } from '../../../test/lot-keep-workspace.ts'
import { writeStoreListFile } from '../../../test/lot-stores.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { runLot } from '../../commands/lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../../test/brief-workspace.types.ts'
import type { LandingLot } from '../../../test/landing-lot.types.ts'
import type { CommandResult } from '../command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The kept line of the text report: its label, then the kept text without its first word. */
const KEPT_LINE = /^kept\s+by decision: performance audit, rerun later \(by person, 2026-11-20\)$/

/** The lot landed on main by a fast-forward, its landed fact written: committed, its worktree and branch left. */
function landedLot(): LandingLot {
	const lot = landingLotOf()
	mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
	writeLandedFact({ lot, tip: lot.tip })
	return lot
}

/** `lot report <words>` from the lot's main checkout. */
function reported(params: { cwd: string; words: string[] }): CommandResult {
	return runLot({ cwd: params.cwd, argv: ['report', ...params.words] })
}

/** `next` and `kept` of `lot report <lot> --json`, and whether the text report holds the kept line. */
function reportOf(lot: LandingLot): { next: unknown; kept: unknown; keptLine: boolean } {
	const cwd = lot.workspace.repository
	const json = jsonOrText(reported({ cwd, words: [lot.name, '--json'] }).output) as {
		next?: unknown
		kept?: unknown
	}
	const text = reported({ cwd, words: [lot.name] }).output
	return {
		next: json.next,
		kept: json.kept,
		keptLine: text.split('\n').some((line) => KEPT_LINE.test(line)),
	}
}

describe('lot report <id> of a kept lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a committed kept lot, its worktree on disk → next lot unkeep, the keep in JSON, a kept line', () => {
		const lot = landedLot()
		writeKeepLine({ lotFolder: lot.lotFolder })

		expect(reportOf(lot)).toEqual({
			next: unkeepNextOf(lot.name),
			kept: keptJsonOf(),
			keptLine: true,
		})
	})

	it('a committed kept lot, its worktree and branch gone → no next, the kept line', () => {
		const lot = landedLot()
		removeBranchAndWorktree(lot)
		writeKeepLine({ lotFolder: lot.lotFolder })

		expect(reportOf(lot)).toEqual({ next: null, kept: keptJsonOf(), keptLine: true })
	})

	it('a committed lot not kept, its worktree on disk → next lot prune, kept null, no kept line', () => {
		const lot = landedLot()

		expect(reportOf(lot)).toEqual({
			next: `dialecte lot prune ${lot.name}`,
			kept: null,
			keptLine: false,
		})
	})

	it('a working kept lot → the state’s next, unchanged; the kept line', () => {
		const lot = landingLotOf()
		const before = (
			jsonOrText(
				reported({ cwd: lot.workspace.repository, words: [lot.name, '--json'] }).output,
			) as {
				next?: unknown
			}
		).next
		writeKeepLine({ lotFolder: lot.lotFolder })

		expect(reportOf(lot)).toEqual({ next: before, kept: keptJsonOf(), keptLine: true })
	})

	it('a committed lot whose keep.jsonl holds a torn line → next is the repair of the file, then the unkeep', () => {
		const lot = landedLot()
		writeKeepDocument({ lotFolder: lot.lotFolder, text: '{"schema":1,"op":"keep"' })

		expect(reportOf(lot)).toEqual({
			next: `repair keep.jsonl by hand (1 line(s) do not read), then: ${unkeepNextOf(lot.name)}`,
			kept: { unreadable: 1 },
			keptLine: false,
		})
	})
})

/** Two stores: the workspace's (three kept lots, one plain) and a second listed in the store list (one kept lot). */
function twoStores(): { first: BriefWorkspace; second: BriefWorkspace } {
	const first = createBriefWorkspace()
	writeKeepLine({
		lotFolder: addLotWithoutWorktree({
			workspace: first,
			name: '0001-repo-alpha',
			state: 'committed',
		}),
	})
	addLotWithoutWorktree({ workspace: first, name: '0002-repo-plain', state: 'committed' })
	const broken = addLotWithoutWorktree({
		workspace: first,
		name: '0003-repo-broken',
		state: 'canceled',
	})
	damageLot({ lotFolder: broken })
	writeKeepLine({ lotFolder: broken })
	const second = createBriefWorkspace()
	writeKeepLine({
		lotFolder: addLotWithoutWorktree({
			workspace: second,
			name: '0001-repo-beta',
			state: 'canceled',
		}),
	})
	writeStoreListFile({ stores: [second.store] })
	return { first, second }
}

describe('lot report --kept: every kept lot of the stores', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('two stores, a kept lot each, one not kept, one damaged and kept → the three kept lots, sorted by name, JSON', () => {
		const { first } = twoStores()

		expect(
			jsonOrText(reported({ cwd: first.repository, words: ['--kept', '--json'] }).output),
		).toEqual({
			lots: [
				{
					lot: '0001-repo-alpha',
					state: 'committed',
					kept: keptJsonOf(),
					worktree: 'gone',
					branch: 'gone',
					next: null,
				},
				{
					lot: '0001-repo-beta',
					state: 'canceled',
					kept: keptJsonOf(),
					worktree: 'gone',
					branch: 'gone',
					next: null,
				},
				{
					lot: '0003-repo-broken',
					state: 'damaged',
					kept: keptJsonOf(),
					worktree: 'gone',
					branch: 'gone',
					next: unkeepNextOf('0003-repo-broken'),
				},
			],
		})
	})

	it('the same stores, text → one line per kept lot, sorted, then the count', () => {
		const { first } = twoStores()
		const since = `kept since 2026-11-20 by person: ${KEEP_REASON}  · worktree gone · branch gone`

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				lines: result.output.split('\n').filter(Boolean),
			}))(reported({ cwd: first.repository, words: ['--kept'] })),
		).toEqual({
			exitCode: 0,
			lines: [
				`0001-repo-alpha  committed  ${since}`,
				`0001-repo-beta  canceled  ${since}`,
				`0003-repo-broken  damaged  ${since}`,
				'3 kept lot(s)',
			],
		})
	})

	it('a kept lot whose events.jsonl and the registry’s cards.log cannot be read → listed all the same', () => {
		const workspace = createBriefWorkspace()
		const lotFolder = addLotWithoutWorktree({
			workspace,
			name: '0001-repo-alpha',
			state: 'committed',
		})
		writeKeepLine({ lotFolder })
		rmSync(join(lotFolder, 'events.jsonl'), { force: true })
		mkdirSync(join(lotFolder, 'events.jsonl'))
		mkdirSync(join(workspace.registry, 'cards.log'), { recursive: true })

		expect(
			(
				jsonOrText(reported({ cwd: workspace.repository, words: ['--kept', '--json'] }).output) as {
					lots?: { lot: string }[]
				}
			).lots?.map((lot) => lot.lot),
		).toEqual(['0001-repo-alpha'])
	})

	it('a kept lot whose identity.json does not read → listed by its folder name, damaged, its worktree and branch unknown', () => {
		const workspace = createBriefWorkspace()
		const lotFolder = addLotWithoutWorktree({
			workspace,
			name: '0001-repo-alpha',
			state: 'committed',
		})
		writeKeepLine({ lotFolder })
		rmSync(join(lotFolder, 'identity.json'), { force: true })
		writeFileSync(join(lotFolder, 'identity.json'), '{ not json\n')

		expect(
			jsonOrText(reported({ cwd: workspace.repository, words: ['--kept', '--json'] }).output),
		).toMatchObject({
			lots: [
				{
					lot: '0001-repo-alpha',
					state: 'damaged',
					kept: keptJsonOf(),
					worktree: 'unknown',
					branch: 'unknown',
				},
			],
		})
	})

	it('no kept lot → no kept lot, exit 0', () => {
		const workspace = createBriefWorkspace()
		addLotWithoutWorktree({ workspace, name: '0001-repo-alpha', state: 'committed' })

		expect(
			((result: CommandResult) => ({ exitCode: result.exitCode, output: result.output.trim() }))(
				reported({ cwd: workspace.repository, words: ['--kept'] }),
			),
		).toEqual({ exitCode: 0, output: 'no kept lot' })
	})

	it.each([
		{ title: '--kept <id>', words: ['--kept', '0001'], named: '0001' },
		{
			title: '--kept --feature <name>',
			words: ['--kept', '--feature', 'branch'],
			named: '--feature',
		},
	])('$title → exit 2, a usage naming what does not go with --kept', ({ words, named }) => {
		const workspace = createBriefWorkspace()
		addLotWithoutWorktree({ workspace, name: '0001-repo-alpha', state: 'committed' })

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				namesKept: result.output.includes('--kept'),
				names: result.output.includes(named),
				wholeUsage: result.output.includes('start <brief.json>'),
			}))(reported({ cwd: workspace.repository, words })),
		).toEqual({ exitCode: 2, namesKept: true, names: true, wholeUsage: false })
	})
})

describe('lot report --feature and a kept lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a feature with a kept lot and one not kept → the kept lot carries the mark', () => {
		const workspace = createBriefWorkspace()
		writeKeepLine({
			lotFolder: addLotWithoutWorktree({ workspace, name: '0001-repo-alpha', state: 'committed' }),
		})
		addLotWithoutWorktree({ workspace, name: '0002-repo-plain', state: 'committed' })

		expect(
			(
				jsonOrText(
					reported({ cwd: workspace.repository, words: ['--feature', 'branch', '--json'] }).output,
				) as {
					lots?: { lot: string; kept?: unknown }[]
				}
			).lots?.map((lot) => ({ lot: lot.lot, kept: lot.kept })),
		).toEqual([
			{ lot: '0001-repo-alpha', kept: true },
			{ lot: '0002-repo-plain', kept: false },
		])
	})
})
