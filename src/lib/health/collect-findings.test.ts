import {
	INTERRUPTED_AT,
	INTERRUPTED_MS,
	ONE_HOUR_MS,
	THREE_HOURS_MS,
} from '../../../test/health-stall.constants.ts'
import {
	gone,
	openRun,
	stallRepositoryOf,
	stepEndOf,
	stepStartOf,
} from '../../../test/health-stall.ts'
import { REAL_FINDINGS_NEWEST_FIRST } from '../../../test/health-verb.constants.ts'
import { findingKeysOf } from '../../../test/health-verb.ts'
import { DAY_MS } from '../../../test/health-worktrees.constants.ts'
import { addsRepositoryOf, scratchFoldersOf, worktreeOf } from '../../../test/health-worktrees.ts'
import { FIXTURE_0105, WINDOW } from '../../../test/health.constants.ts'
import { copyHealthFixture } from '../../../test/health.ts'
/** `collectFindings`: every rule over every repository, the scratch once; red first, then newest first. */
import { collectFindings } from './collect-findings.ts'
import { SCRATCH_LEAK_MS } from './health.constants.ts'
import { readHealthRepository } from './read-health-context.ts'

import { describe, expect, it } from 'vitest'

const SCRATCH_LEAK_AGE_MS = SCRATCH_LEAK_MS + ONE_HOUR_MS

describe('collectFindings', () => {
	it('the real 0105 fixture → the store pair and the rehearsal plan (duplicate work) and the landing, all red, newest first', () => {
		const repository = readHealthRepository({ common: copyHealthFixture({ name: FIXTURE_0105 }) })

		expect(
			findingKeysOf(
				collectFindings({
					repositories: [repository],
					scratch: [],
					window: WINDOW,
					isAlive: () => false,
				}),
			),
		).toEqual(REAL_FINDINGS_NEWEST_FIRST)
	})

	it('a lot with a dead open run, a lot interrupted later, a slow worktree add, an idle worktree newer than all → the red stall first, then the amber ones, newest first', () => {
		const stalled = stallRepositoryOf({
			lots: [
				{ events: openRun({ step: 'gate-full', at: gone(THREE_HOURS_MS) }) },
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
		const adds = addsRepositoryOf({
			adds: [
				{
					step: 'worktree-add',
					durationMs: 803_000,
					endAt: '2026-11-15T10:00:00.000Z',
					parts: { nodeModules: 'cloned', npmCi: false },
				},
			],
		})
		const repository = {
			...stalled,
			lots: [...stalled.lots, ...adds.lots],
			worktrees: [worktreeOf({ name: 'old', idleMs: 3 * DAY_MS })],
		}

		expect(
			collectFindings({
				repositories: [repository],
				scratch: [],
				window: WINDOW,
				isAlive: () => false,
			}).map((finding) => [finding.rule, finding.severity]),
		).toEqual([
			['stalled-run', 'red'],
			['worktrees', 'amber'],
			['stalled-run', 'amber'],
			['worktrees', 'amber'],
		])
	})

	it('two repositories and one leaked scratch folder → the scratch finding once, not once per repository', () => {
		const first = { ...stallRepositoryOf({ lots: [] }), name: 'cli' }
		const second = {
			...stallRepositoryOf({
				lots: [{ events: openRun({ step: 'gate-full', at: gone(THREE_HOURS_MS) }) }],
			}),
			name: 'scl',
		}

		expect(
			collectFindings({
				repositories: [first, second],
				scratch: scratchFoldersOf([{ name: 'dialecte-rehearse-1', ageMs: SCRATCH_LEAK_AGE_MS }]),
				window: WINDOW,
				isAlive: () => false,
			}).map((finding) => [finding.rule, finding.severity, finding.repository]),
		).toEqual([
			['stalled-run', 'red', 'scl'],
			['worktrees', 'amber', 'scratch'],
		])
	})

	it('a live process on an open run younger than its budget, no scratch → no finding', () => {
		const repository = stallRepositoryOf({
			lots: [{ events: openRun({ step: 'gate-full', at: gone(ONE_HOUR_MS) }) }],
		})

		expect(
			collectFindings({
				repositories: [repository],
				scratch: [],
				window: WINDOW,
				isAlive: () => true,
			}),
		).toEqual([])
	})
})
