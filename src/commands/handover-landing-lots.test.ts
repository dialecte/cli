/**
 * `handover run` and its rehearsal of several plain lots on a package whose commit hook is the real `gate --hook`,
 * only the final tree gated: the rehearsal commits each lot on its own tree, its clone's hook leaves a rehearsal
 * record of the first lot's tree, a failing first lot stops it, and a real run after it starts no step.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { hookRecordsOf } from '../../test/gate-hook.ts'
import {
	ALL_REUSED_LANDING,
	LANDING_LINE_START,
	LOT,
	PROBE_WITH_SECOND_LOT,
	PROBE_WITHOUT_SECOND_LOT,
	SECOND_FILE_PROBE,
} from '../../test/handover-landing.constants.ts'
import {
	createLandingScenario,
	landingLinesOf,
	mergeTreeOf,
	recordMergeTree,
	runCounts,
} from '../../test/handover-landing.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { runFolder } from '../../test/scratch-checks.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { treeOfWorkingFiles } from '../../test/scratch-tree.ts'
import { shellQuote } from '../lib/shell-quote.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(function clearStoreVariable() {
	vi.stubEnv('DIALECTE_CHECK_STORE', undefined)
})

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe(
	'handover run: several plain lots, only the final tree gated',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('two plain lots, gate --full of the final tree, rehearsed → the clone’s hook of the first lot left a hook-gate record of the first lot’s tree marked as a rehearsal', async () => {
			const { root, out, lotTree } = await createLandingScenario({
				merge: false,
				gated: true,
				laterLot: 'plain',
			})

			const rehearsed = await runFolder({ out, argv: ['--rehearse'] })

			expect(rehearsed.exitCode).toBe(0)
			expect(hookRecordsOf({ root, tree: lotTree })).toEqual(
				expect.arrayContaining([expect.objectContaining({ origin: 'rehearsal' })]),
			)
		})

		it('two plain lots, gate --full of the final tree, rehearsed then run for real → the real run starts no step, both landing lines say ran none', async () => {
			const { out, counters } = await createLandingScenario({
				merge: false,
				gated: true,
				laterLot: 'plain',
			})
			const rehearsed = await runFolder({ out, argv: ['--rehearse'] })
			expect(rehearsed.exitCode).toBe(0)
			const before = runCounts(counters)

			const ran = await runFolder({ out })

			expect(ran.exitCode).toBe(0)
			expect(runCounts(counters)).toEqual(before)
			expect(landingLinesOf({ text: ran.text, start: LANDING_LINE_START })).toEqual([
				expect.stringMatching(ALL_REUSED_LANDING),
				expect.stringMatching(ALL_REUSED_LANDING),
			])
		})

		it('two plain lots whose first lot alone fails the tests step, rehearsed → the rehearsal stops at the first lot: exit non-zero, its text says the first lot was not committed and the second never started', async () => {
			const { out } = await createLandingScenario({
				merge: false,
				gated: true,
				laterLot: 'required',
			})

			const rehearsed = await runFolder({ out, argv: ['--rehearse'] })

			expect(rehearsed.exitCode).not.toBe(0)
			expect(rehearsed.text).toMatch(
				new RegExp(`^✗ ${LOT} 1 not committed: git commit exited \\d+`, 'm'),
			)
			expect(rehearsed.text).not.toContain(`▶ ${LOT} 2/2`)
		})

		it('two plain lots, gate --full of the final tree, rehearsed → the clone’s hook of the first lot ran on a tree holding HEAD’s notes and without the second lot’s new file', async () => {
			const log = join(temporaryFolder('dialecte-probe-'), 'second-file.log')
			const { out } = await createLandingScenario({
				merge: false,
				gated: true,
				laterLot: 'plain',
				hookExtra: SECOND_FILE_PROBE.replace('{log}', shellQuote(log)),
			})

			const rehearsed = await runFolder({ out, argv: ['--rehearse'] })

			expect(rehearsed.exitCode).toBe(0)
			// one probe line only: the second lot is answered by the gate --full record, so it is committed with --no-verify
			expect(readFileSync(log, 'utf8').split('\n').filter(Boolean)).toEqual([
				PROBE_WITHOUT_SECOND_LOT,
			])
		})

		it('two plain lots and a merge lot, no record, rehearsed → the first lot’s hook left a rehearsal record of the first lot’s tree and the merge commit is the merge of the final tree with main', async () => {
			const { root, out, lotTree, finalTree } = await createLandingScenario({
				merge: true,
				gated: false,
				laterLot: 'plain',
			})
			// a merge lot is committed only with its tree: any other merge tree is refused
			const mergeTree = recordMergeTree({ root, out, lotTree: finalTree })

			const rehearsed = await runFolder({ out, argv: ['--rehearse'] })

			expect(rehearsed.exitCode).toBe(0)
			expect(mergeTreeOf(rehearsed.text)).toBe(mergeTree)
			expect(hookRecordsOf({ root, tree: lotTree })).toEqual(
				expect.arrayContaining([expect.objectContaining({ origin: 'rehearsal' })]),
			)
		})

		it('two plain lots, run for real → the hook of the first lot sees the second lot’s new file and notes, and the working files are those of the final tree before and after', async () => {
			const log = join(temporaryFolder('dialecte-probe-'), 'second-file.log')
			const { root, out, finalTree } = await createLandingScenario({
				merge: false,
				gated: false,
				laterLot: 'plain',
				hookExtra: SECOND_FILE_PROBE.replace('{log}', shellQuote(log)),
			})
			const before = treeOfWorkingFiles(root)

			const ran = await runFolder({ out })

			expect(ran.exitCode).toBe(0)
			expect(readFileSync(log, 'utf8').split('\n').filter(Boolean)).toEqual([
				PROBE_WITH_SECOND_LOT,
				PROBE_WITH_SECOND_LOT,
			])
			expect([before, treeOfWorkingFiles(root)]).toEqual([finalTree, finalTree])
		})
	},
)
