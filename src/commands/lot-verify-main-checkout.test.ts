/**
 * `lot verify`, `lot snapshot` and `lot delta` of a store lot from the main checkout (SAFE 3.6, 5.6): each reads the
 * lot's own worktree (`lotTreeOf`), not the cwd's tree; a lot with no worktree (a simulated lot) is refused, naming
 * it, nothing written.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from '../../test/brief-workspace.ts'
import { landingLotOf } from '../../test/landing-lot.ts'
import { writeFiles } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { computeStateHash } from '../lib/gate-records/state-hash.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NOW = new Date('2026-11-21T12:00:00.000Z')

/** The text of `file`; undefined when there is none. */
function textIfPresent(file: string): string | undefined {
	return existsSync(file) ? readFileSync(file, 'utf8') : undefined
}

/** The lot with a change in its worktree (`src/x.ts`) and another in the main checkout (`src/main-only.ts`). */
function lotWithTwoTrees(): LandingLot {
	const lot = landingLotOf()
	writeFiles({ root: lot.worktree, files: { 'src/x.ts': 'export const x = 2\n' } })
	writeFiles({ root: lot.repository.root, files: { 'src/main-only.ts': 'export const m = 1\n' } })
	return lot
}

/** A simulated lot of the workspace (no worktree), holding a `round-1/` snapshot folder when `snapshot`: its name and folder. */
function simulatedLotOf(params: { lot: LandingLot; snapshot: boolean }): {
	name: string
	lotFolder: string
} {
	const name = '0002-repo-simulated'
	const lotFolder = writeStoreLot({
		workspace: params.lot.workspace,
		name,
		scope: ['src/'],
		simulated: true,
	})
	if (params.snapshot) mkdirSync(join(lotFolder, 'round-1'))
	return { name, lotFolder }
}

describe(
	'lot verify and lot snapshot from the main checkout',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it("lot snapshot of a store lot -> it holds the lot's worktree, not the main checkout", () => {
			const lot = lotWithTwoTrees()

			expect(
				[
					runLot({
						cwd: lot.repository.root,
						argv: ['snapshot', lot.name, '--round', '1'],
						now: NOW,
					}),
				].map(function snapshotOf(result) {
					return {
						exitCode: result.exitCode,
						x: textIfPresent(join(lot.lotFolder, 'round-1', 'src', 'x.ts')),
						mainOnly: existsSync(join(lot.lotFolder, 'round-1', 'src', 'main-only.ts')),
						state: (
							JSON.parse(textIfPresent(join(lot.lotFolder, 'round-1.state')) ?? '{}') as {
								stateHash?: string
							}
						).stateHash,
					}
				})[0],
			).toEqual({
				exitCode: 0,
				x: 'export const x = 2\n',
				mainOnly: false,
				state: computeStateHash(lot.worktree),
			})
		})

		it("lot verify <lot> --by orchestrator -> the lot's worktree hashed, its line in verify.jsonl", () => {
			const lot = lotWithTwoTrees()
			const snapshot = runLot({
				cwd: lot.worktree,
				argv: ['snapshot', lot.name, '--round', '1'],
				now: NOW,
			})
			if (snapshot.exitCode !== 0) throw new Error(snapshot.output)
			const state = computeStateHash(lot.worktree)

			expect(
				runLot({
					cwd: lot.repository.root,
					argv: ['verify', lot.name, '--by', 'orchestrator', '--note', 'n'],
					now: NOW,
				}),
			).toEqual({
				exitCode: 0,
				output: `lot verify: ${state.slice(0, 12)} by orchestrator - ${join(lot.lotFolder, STORE_FILES.verify)}`,
			})
		})

		it("lot delta of a store lot -> the diff of the lot's worktree since its snapshot, not the main checkout's", () => {
			const lot = lotWithTwoTrees()
			const snapshot = runLot({
				cwd: lot.worktree,
				argv: ['snapshot', lot.name, '--round', '1'],
				now: NOW,
			})
			if (snapshot.exitCode !== 0) throw new Error(snapshot.output)
			writeFiles({ root: lot.worktree, files: { 'src/x.ts': 'export const x = 3\n' } })

			expect(
				[
					runLot({
						cwd: lot.repository.root,
						argv: ['delta', lot.name, '--round', '2'],
						now: NOW,
					}),
				].map(function deltaOf(result) {
					return {
						exitCode: result.exitCode,
						fix: result.output.includes('-export const x = 2\n+export const x = 3'),
						mainOnly: result.output.includes('main-only'),
					}
				})[0],
			).toEqual({ exitCode: 0, fix: true, mainOnly: false })
		})

		it('lot verify of a simulated lot -> refused naming it, nothing written', () => {
			const lot = landingLotOf()
			const simulated = simulatedLotOf({ lot, snapshot: true })

			expect(
				[
					runLot({
						cwd: lot.repository.root,
						argv: ['verify', simulated.name, '--by', 'person-a', '--note', 'n'],
						now: NOW,
					}),
				].map(function refusalOf(result) {
					return {
						refused: result.exitCode !== 0,
						named: result.output.includes(simulated.name),
						written: existsSync(join(simulated.lotFolder, STORE_FILES.verify)),
					}
				})[0],
			).toEqual({ refused: true, named: true, written: false })
		})

		it('lot snapshot of a simulated lot -> refused naming it, nothing written', () => {
			const lot = landingLotOf()
			const simulated = simulatedLotOf({ lot, snapshot: false })
			const before = readdirSync(simulated.lotFolder).sort()

			expect(
				[
					runLot({
						cwd: lot.repository.root,
						argv: ['snapshot', simulated.name, '--round', '1'],
						now: NOW,
					}),
				].map(function refusalOf(result) {
					return {
						refused: result.exitCode !== 0,
						named: result.output.includes(simulated.name),
						listing: readdirSync(simulated.lotFolder).sort(),
					}
				})[0],
			).toEqual({ refused: true, named: true, listing: before })
		})
	},
)
