/**
 * `lot start` settles a lot its scope meets that merged on the host but was never closed (FIX-start-settles-landed,
 * design section 2.1): a pushed lot read merged offline, or by the host when origin was not fetched, gets its landed fact
 * and no longer holds its scope; a dry run writes nothing; a lot not merged, never pushed, with work after its landing,
 * or that the host cannot read still holds, as today.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { briefWith } from '../../test/brief-workspace.ts'
import {
	LANDING_CHANGE_REQUEST_NUMBER,
	LANDING_LOT_FILE,
	LANDING_LOT_TEXT,
	LANDING_NOW,
} from '../../test/landing-lot.constants.ts'
import { landingLotOf, writeLandingRecord } from '../../test/landing-lot.ts'
import {
	changeRequestOf,
	commitIn,
	editOnOrigin,
	landingHostOf,
	mergeOnOrigin,
	pushBranch,
} from '../../test/landing-repository.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { HostAdapter } from '../lib/host/host.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The lock file both lots hold: a met lock file is never shared, so the met lot refuses unless it is settled. */
const LOCK_FILE = 'package-lock.json'

/** The refusal of a start meeting the lot on the lock file. */
function lockOverlapOf(lot: LandingLot): string {
	return `overlap with ${lot.name}: ${LOCK_FILE} meets ${LOCK_FILE} (exclusive: a lock file is never shared)`
}

/** Lot A: a store lot holding the lock file, pushed with its pull request recorded (`landing.json`). */
function pushedLockLot(): LandingLot {
	const lot = landingLotOf({ scope: [LOCK_FILE] })
	writeLandingRecord({ lot, number: LANDING_CHANGE_REQUEST_NUMBER })
	return lot
}

/**
 * The lot squash-merged on origin, then origin's main put back where the main checkout last fetched it (the merge
 * helper fetches): the checkout reads stale, so only the host can tell the lot landed.
 */
function squashedUnfetched(lot: LandingLot): void {
	const root = lot.workspace.repository
	const before = git({ root, args: ['rev-parse', 'origin/main'] }).trim()
	mergeOnOrigin({ repository: lot.repository, how: 'squash' })
	git({ root, args: ['update-ref', 'refs/remotes/origin/main', before] })
}

/** A host answering the lot's pull request in `state` at the lot's tip. */
function hostAnswering(params: { lot: LandingLot; state: 'merged' | 'open' }): HostAdapter {
	return landingHostOf({
		byNumber: {
			[LANDING_CHANGE_REQUEST_NUMBER]: changeRequestOf({
				number: LANDING_CHANGE_REQUEST_NUMBER,
				state: params.state,
				head: params.lot.tip,
			}),
		},
	}).host
}

/** Lot B started in A's workspace on the lock file, with `extra` words and `host`. */
function startMeeting(params: {
	lot: LandingLot
	host: HostAdapter
	extra?: readonly string[]
}): CommandResult {
	const { workspace } = params.lot
	const briefPath = join(workspace.briefFolder, 'lot-b.json')
	writeFileSync(
		briefPath,
		`${JSON.stringify(
			briefWith({
				feature: 'lot-b',
				branch: 'feat/lot-b',
				scope: [LOCK_FILE],
				lots: [{ paths: [LOCK_FILE], message: 'feat: lot b' }],
			}),
			null,
			2,
		)}\n`,
	)
	return runLot({
		cwd: workspace.workspace,
		argv: ['start', briefPath, ...(params.extra ?? [])],
		now: LANDING_NOW,
		host: params.host,
	})
}

/** The line of a lot the start settled (or would settle), up to its tip. */
function settledLineOf(params: { lot: LandingLot; verb?: string }): RegExp {
	const verb = params.verb ?? 'settled'
	return new RegExp(
		`^${verb} ${params.lot.name}: merged on main at ${params.lot.tip.slice(0, SHORT_SHA_LENGTH)} \\(`,
		'm',
	)
}

/** The warning of a merged lot that still holds its scope, `why` it holds. */
function heldLineOf(params: { lot: LandingLot; why: string }): string {
	return `! ${params.lot.name} merged on main at ${params.lot.tip.slice(0, SHORT_SHA_LENGTH)} but ${params.why}: it still holds its scope`
}

/** Whether the lot folder holds its landed fact. */
function landedWritten(lot: LandingLot): boolean {
	return existsSync(join(lot.lotFolder, 'landed.json'))
}

describe(
	'lot start settles a met lot that merged on the host',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it("a lot squash-merged on origin, never closed, origin not fetched, the host answering merged -> lot start on its lock file goes on, the lot's landed fact written", () => {
			const lot = pushedLockLot()
			squashedUnfetched(lot)

			const started = startMeeting({ lot, host: hostAnswering({ lot, state: 'merged' }) })

			expect({
				exitCode: started.exitCode,
				settled: settledLineOf({ lot }).test(started.output),
				landed: landedWritten(lot),
			}).toEqual({ exitCode: 0, settled: true, landed: true })
		})

		it('a lot squash-merged on origin and fetched -> settled offline, the host never asked', () => {
			const lot = pushedLockLot()
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			const host = landingHostOf({ refusal: 'the host must not be asked' })

			const started = startMeeting({ lot, host: host.host })

			expect({
				exitCode: started.exitCode,
				landed: landedWritten(lot),
				asked: host.asked,
			}).toEqual({ exitCode: 0, landed: true, asked: [] })
		})

		it('a lot merged on origin by a merge commit and fetched -> settled offline', () => {
			const lot = pushedLockLot()
			mergeOnOrigin({ repository: lot.repository, how: 'merge-commit' })

			const started = startMeeting({ lot, host: landingHostOf({}).host })

			expect({
				exitCode: started.exitCode,
				settled: settledLineOf({ lot }).test(started.output),
				landed: landedWritten(lot),
			}).toEqual({ exitCode: 0, settled: true, landed: true })
		})

		it('lot start --dry-run meeting a lot merged on the host -> clean, would settle named, no landed fact written', () => {
			const lot = pushedLockLot()
			squashedUnfetched(lot)

			const started = startMeeting({
				lot,
				host: hostAnswering({ lot, state: 'merged' }),
				extra: ['--dry-run'],
			})

			expect({
				exitCode: started.exitCode,
				wouldSettle: settledLineOf({ lot, verb: 'would settle' }).test(started.output),
				landed: landedWritten(lot),
			}).toEqual({ exitCode: 0, wouldSettle: true, landed: false })
		})

		it('a lot pushed and not merged, the host answering open -> refused as today, nothing written', () => {
			const lot = pushedLockLot()
			pushBranch({ repository: lot.repository })

			const started = startMeeting({ lot, host: hostAnswering({ lot, state: 'open' }) })

			expect({
				exitCode: started.exitCode,
				refused: started.output.includes(lockOverlapOf(lot)),
				landed: landedWritten(lot),
			}).toEqual({ exitCode: 2, refused: true, landed: false })
		})

		it('a lot merged on the host with a commit on its branch after the merged head -> refused, nothing written, the work named', () => {
			const lot = pushedLockLot()
			squashedUnfetched(lot)
			commitIn({
				root: lot.worktree,
				files: { 'src/after.ts': 'export const after = 1\n' },
				message: 'feat: after',
			})

			const started = startMeeting({ lot, host: hostAnswering({ lot, state: 'merged' }) })

			expect({
				exitCode: started.exitCode,
				refused: started.output.includes(lockOverlapOf(lot)),
				why: started.output.includes(
					heldLineOf({ lot, why: 'its branch holds 1 commit(s) since' }),
				),
				landed: landedWritten(lot),
			}).toEqual({ exitCode: 2, refused: true, why: true, landed: false })
		})

		it('a lot merged and fetched whose worktree holds an uncommitted edit to a tracked file -> refused, nothing written, the uncommitted work named', () => {
			const lot = pushedLockLot()
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			writeFileSync(join(lot.worktree, LANDING_LOT_FILE), 'export const edited = 1\n')

			const started = startMeeting({ lot, host: landingHostOf({}).host })

			expect({
				exitCode: started.exitCode,
				refused: started.output.includes(lockOverlapOf(lot)),
				why: started.output.includes(
					heldLineOf({ lot, why: 'its worktree holds uncommitted changes' }),
				),
				landed: landedWritten(lot),
			}).toEqual({ exitCode: 2, refused: true, why: true, landed: false })
		})

		it('a lot merged on the host, origin not fetched, the host refusing its read -> refused as today, nothing written', () => {
			const lot = pushedLockLot()
			squashedUnfetched(lot)

			const started = startMeeting({
				lot,
				host: landingHostOf({ refusal: 'host: no network' }).host,
			})

			expect({
				exitCode: started.exitCode,
				refused: started.output.includes(lockOverlapOf(lot)),
				landed: landedWritten(lot),
			}).toEqual({ exitCode: 2, refused: true, landed: false })
		})

		it('a lot never pushed whose work origin holds all the same -> refused as today, nothing written, the host never asked', () => {
			const lot = landingLotOf({ scope: [LOCK_FILE] })
			editOnOrigin({ repository: lot.repository, files: { [LANDING_LOT_FILE]: LANDING_LOT_TEXT } })
			const host = landingHostOf({ refusal: 'the host must not be asked' })

			const started = startMeeting({ lot, host: host.host })

			expect({
				exitCode: started.exitCode,
				refused: started.output.includes(lockOverlapOf(lot)),
				landed: landedWritten(lot),
				asked: host.asked,
			}).toEqual({ exitCode: 2, refused: true, landed: false, asked: [] })
		})

		it('lot start --json and --dry-run --json meeting a lot merged on the host -> settled carries the lot, written or not', () => {
			const answers = [[], ['--dry-run']].map(function startOne(extra) {
				const lot = pushedLockLot()
				squashedUnfetched(lot)
				const started = startMeeting({
					lot,
					host: hostAnswering({ lot, state: 'merged' }),
					extra: [...extra, '--json'],
				})
				return {
					settled: (JSON.parse(started.output) as { settled?: unknown }).settled,
					expected: [
						{ lot: lot.name, base: 'main', tip: lot.tip, how: 'host', written: extra.length === 0 },
					],
				}
			})

			expect(answers.map((answer) => answer.settled)).toEqual(
				answers.map((answer) => answer.expected),
			)
		})

		it('a lot merged and fetched whose worktree is on a detached HEAD with a commit of its own -> refused, nothing written, the work named', () => {
			const lot = pushedLockLot()
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			git({ root: lot.worktree, args: ['switch', '-q', '--detach'] })
			commitIn({
				root: lot.worktree,
				files: { 'src/d.ts': 'export const detached = 1\n' },
				message: 'feat: detached',
			})

			const started = startMeeting({ lot, host: landingHostOf({}).host })

			expect({
				exitCode: started.exitCode,
				refused: started.output.includes(lockOverlapOf(lot)),
				why: started.output.includes(
					heldLineOf({ lot, why: 'its worktree holds 1 commit(s) of its own since' }),
				),
				landed: landedWritten(lot),
			}).toEqual({ exitCode: 2, refused: true, why: true, landed: false })
		})

		it('a lot merged and fetched whose worktree holds a new untracked file -> refused, nothing written, the uncommitted work named', () => {
			const lot = pushedLockLot()
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			writeFileSync(join(lot.worktree, 'src', 'new.ts'), 'export const fresh = 1\n')

			const started = startMeeting({ lot, host: landingHostOf({}).host })

			expect({
				exitCode: started.exitCode,
				refused: started.output.includes(lockOverlapOf(lot)),
				why: started.output.includes(
					heldLineOf({ lot, why: 'its worktree holds uncommitted changes' }),
				),
				landed: landedWritten(lot),
			}).toEqual({ exitCode: 2, refused: true, why: true, landed: false })
		})

		it('a lot merged and fetched whose worktree is detached at the fetched origin main -> settled, the start goes on', () => {
			const lot = pushedLockLot()
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			git({ root: lot.worktree, args: ['switch', '-q', '--detach', 'origin/main'] })

			const started = startMeeting({ lot, host: landingHostOf({}).host })

			expect({
				exitCode: started.exitCode,
				settled: settledLineOf({ lot }).test(started.output),
				landed: landedWritten(lot),
			}).toEqual({ exitCode: 0, settled: true, landed: true })
		})
	},
)
