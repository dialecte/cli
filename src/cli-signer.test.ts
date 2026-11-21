/**
 * The signer rule at the cli's dispatch (SAFE 3.5, 5.6), the real cli spawned: `--by orchestrator` from a lot's own
 * worktree is refused before any verb runs (exit 2, nothing written); from the main checkout the orchestrator signs,
 * `lot verify` included, which reads the lot's own worktree.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { runCliProcess } from '../test/forged-cli-run.ts'
import { landingLotOf } from '../test/landing-lot.ts'
import { writeFiles } from '../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../test/test-timing.constants.ts'
import { runLot } from './commands/lot.ts'
import { computeStateHash } from './lib/gate-records/state-hash.ts'
import { STORE_FILES } from './lib/store/store.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** How long one spawned cli may run. */
const SPAWN_TIMEOUT = 60_000

describe('the cli - --by orchestrator at dispatch', { timeout: STORE_CASE_TIMEOUT }, () => {
	it("lot scope --add --by orchestrator from the lot's worktree -> exit 2, the refusal line, scope-changes.jsonl unchanged", async () => {
		const lot = landingLotOf()
		const changes = join(lot.lotFolder, 'scope-changes.jsonl')

		await expect(
			runCliProcess({
				argv: [
					'lot',
					'scope',
					lot.name,
					'--add',
					'src/y.ts',
					'--by',
					'orchestrator',
					'--reason',
					'r',
				],
				cwd: lot.worktree,
				timeout: SPAWN_TIMEOUT,
			}).then(function refusalOf(run) {
				return {
					exitCode: run.exitCode,
					refused: `${run.stdout}${run.stderr}`.includes(
						`--by orchestrator is signed from the main checkout: from lot ${lot.name}'s worktree, sign --by lot-session`,
					),
					changes: existsSync(changes),
				}
			}),
		).resolves.toEqual({ exitCode: 2, refused: true, changes: false })
	})

	it('lot verify --by orchestrator --note n from the main checkout, after a snapshot -> accepted, its line in verify.jsonl', async () => {
		const lot = landingLotOf()
		writeFiles({ root: lot.worktree, files: { 'src/x.ts': 'export const x = 2\n' } })
		const snapshot = runLot({ cwd: lot.worktree, argv: ['snapshot', lot.name, '--round', '1'] })
		if (snapshot.exitCode !== 0) throw new Error(snapshot.output)
		const state = computeStateHash(lot.worktree)

		await expect(
			runCliProcess({
				argv: ['lot', 'verify', lot.name, '--by', 'orchestrator', '--note', 'n'],
				cwd: lot.repository.root,
				timeout: SPAWN_TIMEOUT,
			}).then(function verifiedOf(run) {
				const file = join(lot.lotFolder, STORE_FILES.verify)
				return {
					exitCode: run.exitCode,
					lines: existsSync(file)
						? readFileSync(file, 'utf8')
								.split('\n')
								.filter(Boolean)
								.map((line) => JSON.parse(line) as Record<string, unknown>)
						: [],
				}
			}),
		).resolves.toEqual({
			exitCode: 0,
			lines: [expect.objectContaining({ by: 'orchestrator', note: 'n', state })],
		})
	})
})

describe(
	'the cli - the main checkout signs as the orchestrator (kept as today)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('handover run --not-a-lot --by orchestrator --reason r from the main checkout -> no signer refusal', async () => {
			const lot = landingLotOf()

			await expect(
				runCliProcess({
					argv: ['handover', 'run', '--not-a-lot', '--by', 'orchestrator', '--reason', 'r'],
					cwd: lot.repository.root,
					timeout: SPAWN_TIMEOUT,
				}).then(function signerRefused(run) {
					return `${run.stdout}${run.stderr}`.includes(
						'--by orchestrator is signed from the main checkout',
					)
				}),
			).resolves.toBe(false)
		})
	},
)
