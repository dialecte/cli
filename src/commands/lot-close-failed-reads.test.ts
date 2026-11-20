/**
 * `lot close` of a landed lot when a read of its worktree's own records fails, real git behind a `git` on PATH that
 * fails that one read: the worktree's HEAD reflog, or its own refs (`refs/worktree/*`, `refs/bisect/*`). The commits
 * only those records hold are never taken for none: the worktree is kept with `could not read <what>: <git's error>`.
 */
import { existsSync } from 'node:fs'

import { failGitReadsOf, unreadOf } from '../../test/failing-git.ts'
import { recordingHost } from '../../test/land-lot.ts'
import {
	closeArgumentsOf,
	closeOutcomesOf,
	landingLotOf,
	writeLandedFact,
} from '../../test/landing-lot.ts'
import { mergeOnOrigin } from '../../test/landing-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLotClose } from './lot-close.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A store lot landed by a fast-forward on origin, its landed fact written, its worktree still there. */
function landedLot(): LandingLot {
	const lot = landingLotOf()
	mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
	writeLandedFact({ lot, tip: lot.tip })
	return lot
}

const UNREAD_RECORDS: {
	title: string
	/** The words of the one read made to fail. */
	pattern: string
	/** The reason the worktree is kept with. */
	kept: (lot: LandingLot) => string
}[] = [
	{
		title: 'its HEAD reflog not read',
		pattern: 'reflog show --format=%H HEAD',
		kept: (lot) =>
			unreadOf({
				what: `the HEAD reflog of ${lot.worktree}`,
				args: 'reflog show --format=%H HEAD --',
			}),
	},
	{
		title: 'its own refs not read',
		pattern: 'refs/worktree/',
		kept: (lot) =>
			unreadOf({
				what: `the own refs of ${lot.worktree}`,
				args: 'for-each-ref --format=%(objectname) refs/worktree/ refs/bisect/',
			}),
	},
]

describe(
	'lot close: a landed lot whose worktree records cannot be read',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of UNREAD_RECORDS)
			it(`a landed lot’s worktree, ${row.title} → kept with why, its folder still there`, () => {
				const lot = landedLot()
				const { host } = recordingHost()
				failGitReadsOf({ pattern: row.pattern })

				expect(
					((outcome: { kept?: string } | undefined) => ({
						kept: outcome?.kept,
						there: existsSync(lot.worktree),
					}))(closeOutcomesOf(runLotClose(closeArgumentsOf({ lot, names: [lot.name], host })))[0]),
				).toEqual({ kept: row.kept(lot), there: true })
			})
	},
)
