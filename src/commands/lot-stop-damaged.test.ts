/**
 * `lot stop <id> --reason <text>` on a damaged lot (P2.4): the lot's folder is moved aside, never deleted, to
 * `<git common folder>/dialecte-lots-aside/<name>` (`-<n>` appended when taken) with a `stopped.json` beside its
 * content; nothing is written into the lot's own records first; the index stays claimed; the worktree and the branch
 * stay. A stop on a lot that is not damaged behaves as before.
 */
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	renameSync,
	rmSync,
	symlinkSync,
} from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from '../../test/brief-workspace.ts'
import {
	DAMAGES,
	DISJOINT_SCOPE,
	HEALTHY_NAME,
} from '../../test/damaged-lot-workspace.constants.ts'
import {
	asideFolderOf,
	asideNamesOf,
	damagedLotIn,
	fileIdentityOf,
	refusalsOf,
	startDefaultBrief,
	stoppedRecordOf,
} from '../../test/damaged-lot-workspace.ts'
import { startRealLot } from '../../test/lot-handover-workspace.ts'
import {
	addOtherRepository,
	createdBy,
	createStartWorkspace,
	entriesOf,
	snapshotOf,
	withJson,
} from '../../test/lot-start-workspace.ts'
import { STOP_NOW, STOP_REASON } from '../../test/lot-stop-workspace.constants.ts'
import { differenceOf, stopOf, transitionSummaryOf } from '../../test/lot-stop-workspace.ts'
import { git } from '../../test/scratch-repository.ts'
import { writeRecordFile } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { startLot } from './lot-start.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DamagedLot } from '../../test/damaged-lot-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The line a stop of a damaged lot prints: the lot, its damage and where its folder is now. */
function stoppedLine(params: { lot: DamagedLot; folder: string }): string {
	return `stopped ${params.lot.name}: damaged (${params.lot.reason}); its folder is now ${params.folder}`
}

/** The path of the lot's folder in the aside folder under `name` (`<name>` or `<name>-<n>`). */
function asidePathOf(params: { lot: DamagedLot; name: string }): string {
	return join(asideFolderOf(params.lot), params.name)
}

describe(
	'lot stop of a damaged lot moves its folder aside',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of DAMAGES)
			it(`${row.title} -> exit 0 printing where the folder is now: moved whole to dialecte-lots-aside/<name>, stopped.json added beside its content, nothing else changed, the registry untouched`, () => {
				const start = createStartWorkspace()
				const lot = damagedLotIn({ start, kind: row.kind })
				const folderBefore = snapshotOf(lot.lotFolder)
				const registryBefore = snapshotOf(start.workspace.registry)
				const identityBefore = fileIdentityOf({ path: lot.lotFolder })
				let seenAtTheSeam: Record<string, string> | undefined

				const stopped = stopOf({
					cwd: start.repository,
					id: lot.name,
					reason: STOP_REASON,
					by: 'a-person',
					seams: {
						beforeMoveAside() {
							seenAtTheSeam = snapshotOf(lot.lotFolder)
						},
					},
				})

				const moved = asidePathOf({ lot, name: lot.name })
				expect(stopped).toEqual({
					exitCode: 0,
					output: stoppedLine({ lot, folder: moved }),
				})
				expect(seenAtTheSeam).toEqual(folderBefore)
				expect(fileIdentityOf({ path: moved })).toBe(identityBefore)
				expect(existsSync(lot.lotFolder)).toBe(false)
				expect(asideNamesOf(lot)).toEqual([lot.name])
				expect(differenceOf({ before: folderBefore, after: snapshotOf(moved) })).toEqual({
					added: ['stopped.json'],
					removed: [],
					changed: [],
				})
				expect(stoppedRecordOf({ folder: moved })).toEqual({
					reason: STOP_REASON,
					by: 'a-person',
					at: STOP_NOW.toISOString(),
					damage: row.reason,
				})
				expect(snapshotOf(start.workspace.registry)).toEqual(registryBefore)
			})

		it('a stop without --by -> stopped.json names the caller', () => {
			const start = createStartWorkspace()
			const lot = damagedLotIn({ start, kind: 'identityMissing' })

			stopOf({ cwd: start.repository, id: lot.name })

			expect(asideNamesOf(lot)).toEqual([lot.name])
			expect(stoppedRecordOf({ folder: asidePathOf({ lot, name: lot.name }) })).toMatchObject({
				by: 'caller',
			})
		})

		it('the lot named by its index -> exit 0, the folder moved aside', () => {
			const start = createStartWorkspace()
			const lot = damagedLotIn({ start, kind: 'identityMissing' })

			expect(stopOf({ cwd: start.repository, id: '0007' }).exitCode).toBe(0)
			expect(asideNamesOf(lot)).toEqual([lot.name])
		})

		it('a stop with --json -> exit 0, JSON { lot, state: "moved-aside", damage, folder }', () => {
			const start = createStartWorkspace()
			const lot = damagedLotIn({ start, kind: 'identityMissing' })

			const stopped = stopOf({ cwd: start.repository, id: lot.name, json: true })

			expect(withJson(stopped)).toEqual({
				exitCode: 0,
				json: {
					lot: lot.name,
					state: 'moved-aside',
					damage: lot.reason,
					folder: asidePathOf({ lot, name: lot.name }),
				},
			})
		})

		it('the same lot stopped again -> exit 2 saying no lot, nothing moved again', () => {
			const start = createStartWorkspace()
			const lot = damagedLotIn({ start, kind: 'identityMissing' })
			const first = stopOf({ cwd: start.repository, id: lot.name })
			const asideBefore = snapshotOf(asideFolderOf(lot))

			expect(first.exitCode).toBe(0)
			expect(stopOf({ cwd: start.repository, id: lot.name })).toEqual({
				exitCode: 2,
				output: `no lot ${lot.name}`,
			})
			expect(snapshotOf(asideFolderOf(lot))).toEqual(asideBefore)
		})
	},
)

describe(
	'lot stop of a damaged lot whose aside name is taken',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		/** A folder of the aside folder already holding a file: another lot's, never touched. */
		function takeAsideName(params: { lot: DamagedLot; name: string }): void {
			writeRecordFile({
				folder: asidePathOf(params),
				name: 'earlier.txt',
				text: `${params.name}\n`,
			})
		}

		it('a name taken in dialecte-lots-aside -> the folder goes to <name>-2, the earlier one untouched', () => {
			const start = createStartWorkspace()
			const lot = damagedLotIn({ start, kind: 'identityMissing' })
			takeAsideName({ lot, name: lot.name })
			const earlier = snapshotOf(asidePathOf({ lot, name: lot.name }))

			const stopped = stopOf({ cwd: start.repository, id: lot.name })

			expect(stopped).toEqual({
				exitCode: 0,
				output: stoppedLine({ lot, folder: asidePathOf({ lot, name: `${lot.name}-2` }) }),
			})
			expect(asideNamesOf(lot)).toEqual([lot.name, `${lot.name}-2`])
			expect(snapshotOf(asidePathOf({ lot, name: lot.name }))).toEqual(earlier)
			expect(existsSync(join(asidePathOf({ lot, name: `${lot.name}-2` }), 'stopped.json'))).toBe(
				true,
			)
		})

		it('<name> and <name>-2 taken -> the folder goes to <name>-3', () => {
			const start = createStartWorkspace()
			const lot = damagedLotIn({ start, kind: 'identityMissing' })
			takeAsideName({ lot, name: lot.name })
			takeAsideName({ lot, name: `${lot.name}-2` })

			stopOf({ cwd: start.repository, id: lot.name })

			expect(asideNamesOf(lot)).toEqual([lot.name, `${lot.name}-2`, `${lot.name}-3`])
			expect(existsSync(join(asidePathOf({ lot, name: `${lot.name}-3` }), 'stopped.json'))).toBe(
				true,
			)
		})

		it('an empty folder of that name in the aside folder -> never replaced: the folder goes to <name>-2', () => {
			const start = createStartWorkspace()
			const lot = damagedLotIn({ start, kind: 'identityMissing' })
			mkdirSync(asidePathOf({ lot, name: lot.name }), { recursive: true })

			stopOf({ cwd: start.repository, id: lot.name })

			expect(asideNamesOf(lot)).toEqual([lot.name, `${lot.name}-2`])
			expect(entriesOf(asidePathOf({ lot, name: lot.name }))).toEqual([])
		})
	},
)

describe(
	'lot stop of a damaged lot that is a symbolic link',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a lot folder that is a link to a folder elsewhere -> the link is moved aside, never its target: the target holds the same bytes and still exists', () => {
			const start = createStartWorkspace()
			const lot = damagedLotIn({ start, kind: 'identityMissing' })
			const target = join(realpathSync(start.workspace.workspace), 'elsewhere', lot.name)
			mkdirSync(join(target, '..'), { recursive: true })
			renameSync(lot.lotFolder, target)
			symlinkSync(target, join(start.store, lot.name))
			const targetBefore = snapshotOf(target)
			const linkIdentityBefore = fileIdentityOf({ path: join(start.store, lot.name) })

			const stopped = stopOf({ cwd: start.repository, id: lot.name })

			const moved = asidePathOf({ lot, name: lot.name })
			expect(stopped.exitCode).toBe(0)
			expect(fileIdentityOf({ path: moved })).toBe(linkIdentityBefore)
			expect(lstatSync(moved).isSymbolicLink()).toBe(true)
			expect(readlinkSync(moved)).toBe(target)
			expect(entriesOf(start.store)).toEqual([])
			expect(snapshotOf(target)).toEqual(targetBefore)
			expect(asideNamesOf(lot)).toEqual([lot.name, `${lot.name}.stopped.json`])
			expect(JSON.parse(readFileSync(`${moved}.stopped.json`, 'utf8')) as unknown).toMatchObject({
				reason: STOP_REASON,
				by: 'caller',
			})
		})
	},
)

describe(
	'lot stop of a damaged lot keeps what a stop keeps',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a real lot whose identity is gone -> its worktree and branch stay, its index stays claimed: the next start takes the index after it', () => {
			const real = startRealLot()
			const { start } = real
			const branchBefore = git({
				root: start.repository,
				args: ['branch', '--list', 'feat/dataflow-subscribe'],
			}).trim()
			const claimsBefore = createdBy(start).claims
			const lot = {
				start,
				name: real.lotName,
				lotFolder: real.lotFolder,
				reason: '',
			}
			const otherBrief = addOtherRepository(start)
			// the identity is lost to a hand: the lot reads damaged
			rmSync(join(real.lotFolder, 'identity.json'))

			const stopped = stopOf({ cwd: start.repository, id: real.lotName })
			const claimsAfterStop = createdBy(start).claims
			const next = withJson(
				startLot({ cwd: start.cwd, argv: [otherBrief, '--json'], now: STOP_NOW }),
			)

			expect(stopped.exitCode).toBe(0)
			expect(existsSync(real.worktree)).toBe(true)
			expect(
				git({
					root: start.repository,
					args: ['branch', '--list', 'feat/dataflow-subscribe'],
				}).trim(),
			).toBe(branchBefore)
			expect(claimsAfterStop).toEqual(claimsBefore)
			expect(createdBy(start).claims).toEqual(['0001', '0002'])
			expect(asideNamesOf(lot)).toEqual([real.lotName])
			expect(next).toMatchObject({ exitCode: 0, json: { lot: '0002-other-other' } })
		})

		it('a lot that is not damaged -> stopped as before (unchanged base behaviour): canceled by a transition, its folder in the store, no aside folder', () => {
			const start = createStartWorkspace()
			const lotFolder = realpathSync(
				writeStoreLot({
					workspace: start.workspace,
					name: HEALTHY_NAME,
					scope: DISJOINT_SCOPE,
					repository: start.workspace.repository,
				}),
			)

			const stopped = stopOf({ cwd: start.repository, id: HEALTHY_NAME })

			expect(stopped.exitCode).toBe(0)
			expect(existsSync(lotFolder)).toBe(true)
			expect(transitionSummaryOf(lotFolder)).toEqual(['1:working:start', '2:canceled:stop'])
			expect(asideNamesOf({ lotFolder })).toEqual([])
		})

		it('a damaged lot beside a lot that is stopped -> it stays in the store and still holds its paths: lot start refused naming it', () => {
			const start = createStartWorkspace()
			const damaged = damagedLotIn({ start, kind: 'identityMissing' })
			writeStoreLot({
				workspace: start.workspace,
				name: HEALTHY_NAME,
				scope: DISJOINT_SCOPE,
				repository: start.workspace.repository,
			})
			stopOf({ cwd: start.repository, id: HEALTHY_NAME })

			const started = startDefaultBrief({ start })

			expect(existsSync(damaged.lotFolder)).toBe(true)
			expect(started.exitCode).toBe(2)
			expect(refusalsOf({ json: started.json })).toEqual([
				expect.objectContaining({
					detail: expect.stringContaining(
						`overlap with ${damaged.name} (damaged: ${damaged.reason})`,
					),
				}),
			])
		})
	},
)
