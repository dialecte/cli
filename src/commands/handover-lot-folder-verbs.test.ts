/** `handover run` and `handover abandon` on a lot folder: a canceled lot is not run, a lot is never abandoned from here. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	abandon,
	headOf,
	markAbandoned,
	runIn,
	setEntryState,
} from '../../test/handover-store-scenario.ts'
import {
	bytesOf,
	entryPathOf,
	lotFolderHolds,
	resultMentioning,
	startRealLot,
	writeLotHandover,
	writeTransition,
} from '../../test/lot-handover-workspace.ts'
import { LATER_TIME } from '../../test/store-records.constants.ts'
import { transitionOf } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { HANDOVER_FILES, HANDOVER_RUN_MARKER_FILE } from '../lib/handover/handover.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotHandoverWorkspace } from '../../test/lot-handover-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A way a lot reads `canceled` while its hand-over is written: the lot and the name of its entry in, nothing out. */
type CanceledRow = {
	title: string
	cancel: (params: { lot: LotHandoverWorkspace; name: string }) => void
}

const CANCELED_ROWS: CanceledRow[] = [
	{
		title: 'a canceled transition',
		cancel: ({ lot }) =>
			writeTransition({
				lotFolder: lot.lotFolder,
				transition: transitionOf({ seq: 2, state: 'canceled', kind: 'stop', at: LATER_TIME }),
			}),
	},
	{
		title: 'a registry entry abandoned',
		cancel: ({ lot, name }) =>
			setEntryState({ root: lot.start.repository, name, state: 'abandoned' }),
	},
	{
		title: 'abandoned.json and no live run marker',
		cancel: ({ lot }) => markAbandoned({ folder: lot.lotFolder, file: HANDOVER_FILES.abandoned }),
	},
]

/** How `handover run` is told which hand-over: the lot folder, its registry name, or nothing (the store's one to run). */
const RUN_ARGUMENTS: {
	title: string
	argv: (params: { lot: LotHandoverWorkspace; name: string }) => string[]
}[] = [
	{ title: 'by the lot folder', argv: ({ lot }) => [lot.lotFolder] },
	{ title: 'by its registry name', argv: ({ name }) => [name] },
]

describe('handover run on a canceled lot folder', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of CANCELED_ROWS)
		for (const form of RUN_ARGUMENTS)
			it(`${row.title}, ${form.title} -> refused, exit 2, naming the lot and canceled, nothing run`, async () => {
				const lot = startRealLot()
				const name = writeLotHandover(lot)
				row.cancel({ lot, name })
				const headBefore = headOf(lot.worktree)
				const before = bytesOf(lot)

				const outcome = await runIn({ cwd: lot.worktree, argv: form.argv({ lot, name }) })

				expect(
					resultMentioning({
						result: { exitCode: outcome.exitCode, output: outcome.text },
						needles: [lot.lotName, 'canceled'],
					}),
				).toEqual({ exitCode: 2, mentioned: [lot.lotName, 'canceled'] })
				expect(headOf(lot.worktree)).toBe(headBefore)
				expect(lotFolderHolds({ lot, name: HANDOVER_RUN_MARKER_FILE })).toBe(false)
				expect(bytesOf(lot)).toEqual(before)
			})

	it('a canceled transition, no argument from the worktree -> refused, exit 2, naming the lot and canceled, nothing run', async () => {
		const lot = startRealLot()
		const name = writeLotHandover(lot)
		CANCELED_ROWS[0].cancel({ lot, name })
		const headBefore = headOf(lot.worktree)
		const before = bytesOf(lot)

		const outcome = await runIn({ cwd: lot.worktree, argv: [] })

		expect(
			resultMentioning({
				result: { exitCode: outcome.exitCode, output: outcome.text },
				needles: [lot.lotName, 'canceled'],
			}),
		).toEqual({ exitCode: 2, mentioned: [lot.lotName, 'canceled'] })
		expect(headOf(lot.worktree)).toBe(headBefore)
		expect(bytesOf(lot)).toEqual(before)
	})
})

/** Ways to name the lot's hand-over after `abandon`: its folder, its registered name, its index. */
type AbandonRow = {
	title: string
	argument: (params: { lot: LotHandoverWorkspace; name: string }) => string[]
}

const ABANDON_ROWS: AbandonRow[] = [
	{ title: 'the lot folder path', argument: ({ lot }) => [lot.lotFolder] },
	{ title: 'the registry name', argument: ({ name }) => [name] },
	{ title: 'the index', argument: ({ lot }) => [lot.lotName.slice(0, 4)] },
	{ title: 'no argument, the lock naming the lot hand-over', argument: () => [] },
]

describe('handover abandon on a lot folder (case 53)', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of ABANDON_ROWS)
		it(`${row.title} -> refused, exit 2, with the lot's redo and stop commands, nothing written`, () => {
			const lot = startRealLot()
			const name = writeLotHandover(lot)
			const before = bytesOf(lot)
			const entryBefore = readFileSync(entryPathOf({ lot, name }), 'utf8')

			expect(abandon({ cwd: lot.worktree, argv: row.argument({ lot, name }) })).toEqual({
				exitCode: 2,
				output: `${lot.lotName} is a lot: its hand-over is redone with dialecte handover write --rehash --out ${lot.lotName}; to end the lot: dialecte lot stop ${lot.lotName}`,
			})
			expect(existsSync(join(lot.lotFolder, HANDOVER_FILES.abandoned))).toBe(false)
			expect(readFileSync(entryPathOf({ lot, name }), 'utf8')).toBe(entryBefore)
			expect(bytesOf(lot)).toEqual(before)
		})
})
