/** `handover run` and `handover abandon` name a lot folder by `.dialecte/lot`, and `run` by index: the same refusals as by path. */
import { join } from 'node:path'

import { abandon, headOf, runIn } from '../../test/handover-store-scenario.ts'
import {
	bytesOf,
	resultMentioning,
	startRealLot,
	writeLotHandover,
	writeTransition,
} from '../../test/lot-handover-workspace.ts'
import { LATER_TIME } from '../../test/store-records.constants.ts'
import { transitionOf } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotHandoverWorkspace } from '../../test/lot-handover-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** How `handover` is told which lot folder, from the lot's worktree. */
const NAMES: { title: string; argument: (lot: LotHandoverWorkspace) => string }[] = [
	{ title: '.dialecte/lot', argument: () => join('.dialecte', 'lot') },
	{ title: 'the index', argument: (lot) => lot.lotName.slice(0, 4) },
]

describe(
	'handover run on a canceled lot named by a link or an index',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const name of NAMES)
			it(`${name.title} -> refused, exit 2, naming the lot and canceled, nothing run`, async () => {
				const lot = startRealLot()
				writeLotHandover(lot)
				writeTransition({
					lotFolder: lot.lotFolder,
					transition: transitionOf({ seq: 2, state: 'canceled', kind: 'stop', at: LATER_TIME }),
				})
				const headBefore = headOf(lot.worktree)
				const before = bytesOf(lot)

				const outcome = await runIn({ cwd: lot.worktree, argv: [name.argument(lot)] })

				expect(
					resultMentioning({
						result: { exitCode: outcome.exitCode, output: outcome.text },
						needles: [lot.lotName, 'canceled'],
					}),
				).toEqual({ exitCode: 2, mentioned: [lot.lotName, 'canceled'] })
				expect(headOf(lot.worktree)).toBe(headBefore)
				expect(bytesOf(lot)).toEqual(before)
			})
	},
)

describe(
	'handover abandon on a lot named by .dialecte/lot',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('.dialecte/lot -> refused, exit 2, with the lot redo and stop commands, nothing written', () => {
			const lot = startRealLot()
			writeLotHandover(lot)
			const before = bytesOf(lot)

			expect(abandon({ cwd: lot.worktree, argv: [join('.dialecte', 'lot')] })).toEqual({
				exitCode: 2,
				output: `${lot.lotName} is a lot: its hand-over is redone with dialecte handover write --rehash --out ${lot.lotName}; to end the lot: dialecte lot stop ${lot.lotName}`,
			})
			expect(bytesOf(lot)).toEqual(before)
		})
	},
)
