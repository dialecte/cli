/**
 * The hand-over guards and the lot's scope (SAFE 3.7, 5.5): a store lot's hand-over whose lot holds a path outside its
 * effective scope - its committed work, or a pending lot's files - is refused by the guards before any rehearsal, in a
 * real run and a rehearsal alike, naming the lot, the path and the add; a hand-over that is no store lot is not held.
 */
import { runIn } from '../../../test/handover-store-scenario.ts'
import { headOf } from '../../../test/landing-repository.ts'
import {
	mergeLotHandover,
	outsideScopeHandover,
	packageFolderHandover,
} from '../../../test/scope-guard-lot.ts'
import { runFolder } from '../../../test/scratch-checks.ts'
import { GO_AHEAD_ARGV } from '../../../test/store-lot-guard-workspace.constants.ts'
import { plainHandover } from '../../../test/store-lot-guard-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { runLot } from '../../commands/lot.ts'
import { RECORD_DAMAGE_REASONS } from '../store/store.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotHandoverWorkspace } from '../../../test/lot-handover-workspace.types.ts'

/** The lot folder whose records the scope guard reads as nothing (`readCheckedLotState` undefined); none: read as is. */
const { unread } = vi.hoisted(() => ({ unread: { lotFolder: undefined as string | undefined } }))

vi.mock('../store/lot-records.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../store/lot-records.ts')>()
	return {
		...actual,
		readCheckedLotState: vi.fn((params: Parameters<typeof actual.readCheckedLotState>[0]) =>
			// only the scope guard's reads: the lot guard still reads the lot as it is
			params.lotFolder === unread.lotFolder && (new Error().stack ?? '').includes('checkScope')
				? undefined
				: actual.readCheckedLotState(params),
		),
	}
})

afterEach(function restoreEnvironment() {
	unread.lotFolder = undefined
	vi.unstubAllEnvs()
})

/**
 * `handover run <lot folder> <argv>` from the lot's worktree: its exit, whether it refused naming `path`
 * (`src/outside.ts` unless given) and its add, committed, rehearsed.
 */
async function runOf(params: { lot: LotHandoverWorkspace; argv?: string[]; path?: string }) {
	const { lot } = params
	const path = params.path ?? 'src/outside.ts'
	const head = headOf(lot.worktree)
	const run = await runIn({ cwd: lot.worktree, argv: [lot.lotFolder, ...(params.argv ?? [])] })
	return {
		exitCode: run.exitCode,
		reason: run.text.includes(`1 path(s) outside lot ${lot.lotName}'s scope: ${path}`),
		add: run.text.includes(
			`dialecte lot scope ${lot.lotName} --add '${path}' --by lot-session --reason "<why>"`,
		),
		committed: headOf(lot.worktree) !== head,
		rehearsed: run.text.includes('rehearsed:'),
	}
}

describe('handover run - the scope guard', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a store-lot hand-over holding a file outside the scope -> refused by the guards, naming the lot, the path and the add', async () => {
		await expect(runOf({ lot: outsideScopeHandover({ outside: 'pending' }) })).resolves.toEqual({
			exitCode: 1,
			reason: true,
			add: true,
			committed: false,
			rehearsed: false,
		})
	})

	it('--rehearse of the same hand-over -> refused before any rehearsal', async () => {
		await expect(
			runOf({ lot: outsideScopeHandover({ outside: 'pending' }), argv: ['--rehearse'] }),
		).resolves.toMatchObject({ reason: true, add: true, committed: false, rehearsed: false })
	})

	it("a file outside the scope committed on the lot's branch with the hook skipped, not in lots.json -> refused naming it", async () => {
		await expect(runOf({ lot: outsideScopeHandover({ outside: 'committed' }) })).resolves.toEqual({
			exitCode: 1,
			reason: true,
			add: true,
			committed: false,
			rehearsed: false,
		})
	})

	it('a package in the folder pkg/ whose lots.json holds src/outside.ts -> refused naming pkg/src/outside.ts', async () => {
		await expect(
			runOf({
				lot: packageFolderHandover({ packageFolder: 'pkg', outside: 'pending' }),
				path: 'pkg/src/outside.ts',
			}),
		).resolves.toEqual({
			exitCode: 1,
			reason: true,
			add: true,
			committed: false,
			rehearsed: false,
		})
	})
})

describe(
	'handover run - the scope guard on merge lots and unread records',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a store-lot hand-over whose merge lot merges a sibling branch holding a file outside the scope -> refused naming it', async () => {
			await expect(
				(async function siblingMerge() {
					const { root, out } = mergeLotHandover({ merged: 'sibling' })
					const head = headOf(root)
					const run = await runFolder({ out })
					return {
						refused: run.exitCode !== 0,
						scope: run.text.split('\n').filter((line) => line.startsWith('✗ scope ')),
						committed: headOf(root) !== head,
					}
				})(),
			).resolves.toEqual({
				refused: true,
				scope: [
					expect.stringMatching(/^✗ scope +1 path\(s\) outside lot \S+'s scope: side-only\.txt\b/),
				],
				committed: false,
			})
		})

		it("the lot's records read as nothing by the scope guard -> refused with the damaged line, as the hook refuses", async () => {
			await expect(
				(async function unreadLot() {
					const lot = outsideScopeHandover({ outside: 'none' })
					unread.lotFolder = lot.lotFolder
					const head = headOf(lot.worktree)
					const run = await runIn({ cwd: lot.worktree, argv: [lot.lotFolder] })
					return {
						refused: run.exitCode !== 0,
						damaged: run.text.includes(
							`${lot.lotName} is damaged (${RECORD_DAMAGE_REASONS.identityUnreadable}): repair its records by hand; nothing to add`,
						),
						committed: headOf(lot.worktree) !== head,
					}
				})(),
			).resolves.toEqual({ refused: true, damaged: true, committed: false })
		})
	},
)

describe(
	'handover run - what the scope guard lets through (kept as today)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('the same hand-over with the path added -> passes every guard, its lot committed', async () => {
			const lot = outsideScopeHandover({ outside: 'pending' })
			const added = runLot({
				cwd: lot.start.repository,
				argv: [
					'scope',
					lot.lotName,
					'--add',
					'src/outside.ts',
					'--by',
					'person-a',
					'--reason',
					'approved widening',
				],
			})
			if (added.exitCode !== 0) throw new Error(added.output)

			await expect(runOf({ lot })).resolves.toEqual({
				exitCode: 0,
				reason: false,
				add: false,
				committed: true,
				rehearsed: false,
			})
		})

		it('a package in the folder pkg/ whose lots.json holds only its scope -> passes every guard, its lot committed', async () => {
			await expect(
				runOf({
					lot: packageFolderHandover({ packageFolder: 'pkg', outside: 'none' }),
					path: 'pkg/src/in/a.ts',
				}),
			).resolves.toEqual({
				exitCode: 0,
				reason: false,
				add: false,
				committed: true,
				rehearsed: false,
			})
		})

		it('a store-lot hand-over whose lot committed a .dialecte/ record beside its pending change -> ✓ scope counting the held path only', async () => {
			await expect(
				(async function recordHeld() {
					const lot = outsideScopeHandover({ outside: 'none', record: true })
					const run = await runIn({ cwd: lot.worktree, argv: [lot.lotFolder] })
					return run.lines.filter((line) => /^[✓!✗] scope /.test(line))
				})(),
			).resolves.toEqual(['✓ scope       1 path(s) inside the scope  0.0 s'])
		})

		it('a store-lot hand-over whose merge lot merges the base branch (its tip on the base line) -> the scope guard passes', async () => {
			await expect(
				(async function baseMerge() {
					const { out } = mergeLotHandover({ merged: 'base' })
					const run = await runFolder({ out })
					return run.text.split('\n').filter((line) => /^[✓!✗] scope /.test(line))
				})(),
			).resolves.toEqual([expect.stringMatching(/^✓ scope +\d+ path\(s\) inside the scope/)])
		})

		it('a --not-a-lot hand-over on a branch no lot names -> no scope hold', async () => {
			const plain = plainHandover()

			await expect(
				runIn({ cwd: plain.root, argv: [plain.folder, ...GO_AHEAD_ARGV] }).then(
					function scopeLines(run) {
						return run.lines.filter((line) => /^[✓!✗] scope /.test(line))
					},
				),
			).resolves.toEqual([])
		})
	},
)
