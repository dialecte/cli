/**
 * The hand-over guards and the lot's scope (SAFE 3.7, 5.5): a store lot's hand-over whose lot holds a path outside its
 * effective scope - its committed work, or a pending lot's files - is refused by the guards before any rehearsal, in a
 * real run and a rehearsal alike, naming the lot, the path and the add; a hand-over that is no store lot is not held.
 */
import { runIn } from '../../../test/handover-store-scenario.ts'
import { headOf } from '../../../test/landing-repository.ts'
import { outsideScopeHandover, packageFolderHandover } from '../../../test/scope-guard-lot.ts'
import { GO_AHEAD_ARGV } from '../../../test/store-lot-guard-workspace.constants.ts'
import { plainHandover } from '../../../test/store-lot-guard-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { runLot } from '../../commands/lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotHandoverWorkspace } from '../../../test/lot-handover-workspace.types.ts'

afterEach(function restoreEnvironment() {
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
