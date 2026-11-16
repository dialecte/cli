import { HOOK_RAN_MS, OVER_BUDGET_MS } from '../../../test/health-landing.constants.ts'
import { landingLotOf } from '../../../test/health-landing.ts'
/** Worktree findings are never red and never lead: they sort after the event findings of their severity. */
import { INTERRUPTED_AT, INTERRUPTED_MS } from '../../../test/health-stall.constants.ts'
import { stallRepositoryOf, stepEndOf, stepStartOf } from '../../../test/health-stall.ts'
import { DAY_MS, HOUR_MS, WORKTREES_NOW } from '../../../test/health-worktrees.constants.ts'
import {
	idleWorktreesOf,
	scratchFoldersOf,
	worktreeOf,
	worktreesRepositoryOf,
} from '../../../test/health-worktrees.ts'
import { WINDOW } from '../../../test/health.constants.ts'
import { keyOf, writeHealthCommon } from '../../../test/health.ts'
import { collectFindings } from './collect-findings.ts'
import { readHealthRepository } from './read-health-context.ts'
import { findLeakedScratch } from './rule-scratch.ts'
import { findIdleWorktrees } from './rule-worktrees.ts'

import { describe, expect, it } from 'vitest'

describe('worktree findings are amber and sort after the event findings', () => {
	it('41 idle worktrees → amber (no red at any count)', () => {
		const repository = worktreesRepositoryOf({ worktrees: idleWorktreesOf(41) })

		expect(
			findIdleWorktrees({ repository, now: WORKTREES_NOW }).map((finding) => finding.severity),
		).toEqual(['amber'])
	})

	it('a leaked scratch folder → amber', () => {
		const folders = scratchFoldersOf([{ name: 'dialecte-rehearse-x', ageMs: 7 * HOUR_MS }])

		expect(
			findLeakedScratch({ folders, now: WORKTREES_NOW }).map((finding) => finding.severity),
		).toEqual(['amber'])
	})

	it('an amber idle worktree at now, an older amber interrupted stall and an older amber slow landing → the stall, the landing (newest first), then the worktree', () => {
		const stalled = stallRepositoryOf({
			lots: [
				{
					events: [
						stepStartOf({
							run: 'run-int',
							step: 'gate-full',
							at: new Date(Date.parse(INTERRUPTED_AT) - INTERRUPTED_MS - 5_000).toISOString(),
						}),
						stepEndOf({
							run: 'run-int',
							step: 'gate-full',
							at: INTERRUPTED_AT,
							durationMs: INTERRUPTED_MS,
							outcome: 'interrupted',
							exit: 1,
						}),
					],
				},
			],
		})
		const withIdle = { ...stalled, worktrees: [worktreeOf({ name: 'old', idleMs: 3 * DAY_MS })] }
		const landing = readHealthRepository({
			common: writeHealthCommon({
				lots: [
					landingLotOf({
						handoverMs: OVER_BUDGET_MS,
						hooks: [{ durationMs: HOOK_RAN_MS, key: keyOf() }],
					}),
				],
			}),
		})

		expect(
			collectFindings({
				repositories: [withIdle, landing],
				scratch: [],
				window: WINDOW,
				isAlive: () => false,
			}).map((finding) => [finding.rule, finding.severity]),
		).toEqual([
			['stalled-run', 'amber'],
			['landing-time', 'amber'],
			['worktrees', 'amber'],
		])
	})
})
