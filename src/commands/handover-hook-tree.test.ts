/**
 * A merge hand-over whose worktree commit hook is not the merged tree's: rehearsed, its card reads READY with no
 * gates on another tree, the rehearsal plan judges each lot with the hook of its own tree, and the real run's hooks
 * answer.
 */

import { ALL_REUSED_LANDING, LANDING_LINE_START } from '../../test/handover-landing.constants.ts'
import { landingLinesOf, recordMergeTree, runCounts } from '../../test/handover-landing.ts'
import { show } from '../../test/handover-store-scenario.ts'
import { GATES_ON_ANOTHER_TREE, OLD_STAGING_PRE_COMMIT } from '../../test/hook-tree.constants.ts'
import { createHookTreeScenario } from '../../test/hook-tree.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { lotLinePattern, runFolder } from '../../test/scratch-checks.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { JsonCard } from '../../test/handover-profile.types.ts'

beforeEach(function clearStoreVariable() {
	vi.stubEnv('DIALECTE_CHECK_STORE', undefined)
})

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe(
	'handover: a worktree on the old three-line hook, a gated lot then a merge of a main holding the one-line hook',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('rehearsed → the card reads READY with no gates on another tree, a second rehearsal reuses both lots, and the real run’s hooks answer: no step runs, each landing line says ran none', async () => {
			const { root, out, counters, lotTree } = await createHookTreeScenario()
			const rehearsed = await runFolder({ out, argv: ['--rehearse'] })
			expect(rehearsed.exitCode).toBe(0)
			recordMergeTree({ root, out, lotTree })

			const card = JSON.parse(show({ cwd: root, argv: [out, '--json'] }).output) as JsonCard
			const again = await runFolder({ out, argv: ['--rehearse'] })
			const before = runCounts(counters)
			const ran = await runFolder({ out })

			expect({
				verdict: card.verdict,
				otherTree: card.otherTreeGates,
				failed: card.failedGates,
			}).toEqual({ verdict: 'READY', otherTree: [], failed: [] })
			expect(JSON.stringify(card.gates)).not.toContain(GATES_ON_ANOTHER_TREE)
			expect(again.text).toMatch(
				lotLinePattern({
					index: 1,
					count: 2,
					decision: 'reused',
					reason: /green gate --full on tree \S+/,
				}),
			)
			expect(again.text).toMatch(
				lotLinePattern({
					index: 2,
					count: 2,
					decision: 'reused',
					reason: /green hook record of the tip's tree \S+/,
				}),
			)
			expect(ran.exitCode).toBe(0)
			expect(runCounts(counters)).toEqual(before)
			expect(landingLinesOf({ text: ran.text, start: LANDING_LINE_START })).toEqual([
				expect.stringMatching(ALL_REUSED_LANDING),
				expect.stringMatching(ALL_REUSED_LANDING),
			])
		})

		it('the worktree’s hook stages files, the merged tree’s hook does not → a second rehearsal rehearses the first lot (the hook stages files) and reuses the merge lot', async () => {
			const { root, out, lotTree } = await createHookTreeScenario({
				oldHook: OLD_STAGING_PRE_COMMIT,
			})
			const rehearsed = await runFolder({ out, argv: ['--rehearse'] })
			expect(rehearsed.exitCode).toBe(0)
			recordMergeTree({ root, out, lotTree })

			const again = await runFolder({ out, argv: ['--rehearse'] })

			expect(again.text).toMatch(
				lotLinePattern({
					index: 1,
					count: 2,
					decision: 'rehearse',
					reason: 'the hook stages files (git add)',
				}),
			)
			expect(again.text).toMatch(
				lotLinePattern({
					index: 2,
					count: 2,
					decision: 'reused',
					reason: /green hook record of the tip's tree \S+/,
				}),
			)
		})
	},
)
