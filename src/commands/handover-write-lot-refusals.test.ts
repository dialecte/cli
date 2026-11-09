/** `handover write --out` refuses what must not be written into a lot folder, and a committed hand-over: exit 2, every byte kept. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { STORE_FIRST_NAME } from '../../test/handover-store-scenario.constants.ts'
import {
	createBranchRepository,
	entryNamesOf,
	setEntryState,
	storeOf,
	writeStoreHandover,
} from '../../test/handover-store-scenario.ts'
import { FOREIGN_BRANCH, LOT_CHANGES } from '../../test/lot-handover-workspace.constants.ts'
import {
	bytesOf,
	entryPathOf,
	isolateStateFolder,
	lotFolderHolds,
	startRealLot,
	startSimulatedLot,
	withMentioned,
	writeForeignBranchLotsFile,
	writeInto,
	writeLotHandover,
	writeMainLotsFile,
	writeTransition,
	runCliSplit,
} from '../../test/lot-handover-workspace.ts'
import { snapshotOf } from '../../test/lot-start-workspace.ts'
import { BRIEF_BRANCH } from '../../test/lot-start.constants.ts'
import { LATER_TIME } from '../../test/store-records.constants.ts'
import { questionTransitionOf, transitionOf } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { COMMIT_SCRIPT_FILE } from '../lib/handover/handover.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotHandoverWorkspace } from '../../test/lot-handover-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A lot refusing a hand-over: how it is made, what `--out` and the lots file name, what the message must hold. */
type RefusalRow = {
	title: string
	lot: () => LotHandoverWorkspace
	/** The lots file the write is given; default: the lot's own. */
	lotsPath?: (lot: LotHandoverWorkspace) => string
	/** The spelling of `--out`; default: the full name. */
	out?: (lot: LotHandoverWorkspace) => string
	/** What the refusal names, in this order of listing. */
	needles: (lot: LotHandoverWorkspace) => string[]
	/** What the refusal must not say. */
	absent?: (lot: LotHandoverWorkspace) => string[]
}

/** The phrase that names a lots file's repository and the lot's worktree. */
function foreignRepositoryOf(lot: LotHandoverWorkspace): string {
	return `repository ${lot.start.repository} is not the lot's worktree ${lot.worktree}`
}

/** The phrase that names a lots file's branch and the lot's branch. */
function foreignBranchOf(): string {
	return `branch ${FOREIGN_BRANCH} is not the lot's branch ${BRIEF_BRANCH}`
}

function canceledLot(): LotHandoverWorkspace {
	const lot = startRealLot()
	writeTransition({
		lotFolder: lot.lotFolder,
		transition: transitionOf({ seq: 2, state: 'canceled', kind: 'stop', at: LATER_TIME }),
	})
	return lot
}

function failedLot(): LotHandoverWorkspace {
	const lot = startRealLot()
	writeTransition({
		lotFolder: lot.lotFolder,
		transition: transitionOf({ seq: 2, state: 'failed', kind: 'fail', at: LATER_TIME }),
	})
	return lot
}

function questionedLot(): LotHandoverWorkspace {
	const lot = startRealLot()
	writeTransition({
		lotFolder: lot.lotFolder,
		transition: questionTransitionOf({ seq: 2, number: 1 }),
	})
	return lot
}

/** A lot with an open question and then a `canceled` transition: the state is `canceled`. */
function questionedThenCanceledLot(): LotHandoverWorkspace {
	const lot = questionedLot()
	writeTransition({
		lotFolder: lot.lotFolder,
		transition: transitionOf({ seq: 3, state: 'canceled', kind: 'stop', at: LATER_TIME }),
	})
	return lot
}

function answerFirstOf(lot: LotHandoverWorkspace): string {
	return `answer q1 first: dialecte lot answer ${lot.lotName} q1 "<answer>"`
}

const REFUSAL_ROWS: RefusalRow[] = [
	{
		title: 'a simulated lot',
		lot: startSimulatedLot,
		needles: () => ['a simulated lot has no hand-over'],
	},
	{
		title: 'a canceled lot, by its full name',
		lot: canceledLot,
		needles: (lot) => [lot.lotName, 'canceled'],
	},
	{
		title: 'a canceled lot, by .dialecte/lot',
		lot: canceledLot,
		out: () => join('.dialecte', 'lot'),
		needles: (lot) => [lot.lotName, 'canceled'],
	},
	{
		title: 'a failed lot (case 52)',
		lot: failedLot,
		needles: (lot) => [lot.lotName, 'failed'],
	},
	{
		title: 'a lot with an open question (case 58)',
		lot: questionedLot,
		needles: (lot) => [answerFirstOf(lot)],
	},
	{
		title: 'a canceled lot that also has an open question: the state comes first',
		lot: questionedThenCanceledLot,
		needles: () => ['canceled'],
	},
	{
		title: 'an open question and a lots file of another repository: the question comes first',
		lot: questionedLot,
		lotsPath: writeMainLotsFile,
		needles: (lot) => [answerFirstOf(lot)],
		absent: (lot) => [foreignRepositoryOf(lot)],
	},
	{
		title: 'a lots file whose repository is not the lot worktree (case 45): both named',
		lot: startRealLot,
		lotsPath: writeMainLotsFile,
		needles: (lot) => [foreignRepositoryOf(lot)],
	},
	{
		title: 'a lots file whose branch is not the lot branch (case 45): both named',
		lot: startRealLot,
		lotsPath: writeForeignBranchLotsFile,
		needles: () => [foreignBranchOf()],
	},
	{
		title: 'a canceled lot, by the real absolute path of its folder',
		lot: canceledLot,
		out: (lot) => lot.lotFolder,
		needles: (lot) => [lot.lotName, 'canceled'],
	},
	{
		title: 'a canceled lot, by its index',
		lot: canceledLot,
		out: (lot) => lot.lotName.slice(0, 4),
		needles: (lot) => [lot.lotName, 'canceled'],
	},
]

describe('handover write --out a lot folder, refused', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of REFUSAL_ROWS)
		it(`${row.title} -> exit 2 naming it, nothing written`, () => {
			const lot = row.lot()
			const lotsPath = row.lotsPath ? row.lotsPath(lot) : lot.lotsPath
			const needles = row.needles(lot)
			const absent = row.absent ? row.absent(lot) : []
			const before = bytesOf(lot)

			expect(
				withMentioned({
					run: writeInto({
						lotsPath,
						out: row.out ? row.out(lot) : lot.lotName,
						cwd: lot.worktree,
					}),
					needles: [...needles, ...absent],
				}),
			).toEqual({ exitCode: 2, mentioned: needles })
			expect(bytesOf(lot)).toEqual(before)
			expect(lotFolderHolds({ lot, name: COMMIT_SCRIPT_FILE })).toBe(false)
			expect(entryNamesOf(lot.start.repository)).toEqual([])
		})

	it('a canceled lot that also has an open question -> the message does not ask for the answer', () => {
		const lot = questionedThenCanceledLot()

		expect(
			withMentioned({
				run: writeInto({ lotsPath: lot.lotsPath, out: lot.lotName, cwd: lot.worktree }),
				needles: [answerFirstOf(lot)],
			}),
		).toEqual({ exitCode: 2, mentioned: [] })
	})
})

describe(
	'handover write --rehash on a committed hand-over, refused (case 46)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a lot folder whose entry is committed -> exit 2 naming the entry, the entry byte for byte as it was', () => {
			const lot = startRealLot()
			const name = writeLotHandover(lot)
			setEntryState({ root: lot.start.repository, name, state: 'committed' })
			const entryPath = entryPathOf({ lot, name })
			const entryBefore = readFileSync(entryPath, 'utf8')
			const lotBefore = snapshotOf(lot.lotFolder)

			expect(
				withMentioned({
					run: writeInto({
						lotsPath: lot.lotsPath,
						out: lot.lotName,
						cwd: lot.worktree,
						extra: ['--rehash'],
					}),
					needles: [`${name} is committed: a committed hand-over is never rewritten`],
				}),
			).toEqual({
				exitCode: 2,
				mentioned: [`${name} is committed: a committed hand-over is never rewritten`],
			})
			expect(readFileSync(entryPath, 'utf8')).toBe(entryBefore)
			expect(snapshotOf(lot.lotFolder)).toEqual(lotBefore)
		})

		it('a folder that is no lot, whose entry is committed -> exit 2 naming the entry, the entry and the folder byte for byte as they were', () => {
			isolateStateFolder()
			const root = createBranchRepository()
			const { folder } = writeStoreHandover({
				root,
				name: STORE_FIRST_NAME,
				changes: { ...LOT_CHANGES },
			})
			setEntryState({ root, name: STORE_FIRST_NAME, state: 'committed' })
			const [name] = entryNamesOf(root)
			const entryPath = join(storeOf(root), `${name}.json`)
			const entry = readFileSync(entryPath, 'utf8')
			const folderBefore = snapshotOf(folder)
			const message = `${name} is committed: a committed hand-over is never rewritten`

			expect(
				withMentioned({
					run: runCliSplit({
						argv: ['handover', 'write', join(folder, 'lots.json'), '--rehash', '--out', folder],
						cwd: root,
					}),
					needles: [message],
				}),
			).toEqual({ exitCode: 2, mentioned: [message] })
			expect(readFileSync(entryPath, 'utf8')).toBe(entry)
			expect(snapshotOf(folder)).toEqual(folderBefore)
		})
	},
)
