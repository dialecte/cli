/** A store lot landed as a draft pull request, for `lot review` and `lot approve` to read. */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { LANDING_FILE } from '../src/lib/handover/land-lot.constants.ts'
import { pullRequestLot } from './lot-pr.ts'
import { CLI_PACKAGE, REVIEW_PULL_NUMBER, REVIEW_PULL_URL } from './lot-review.constants.ts'
import { git } from './scratch-repository.ts'
import { transitionOf } from './store-records.ts'

import type { LandedLot, LandedLotState } from './lot-review.types.ts'

/**
 * `pullRequestLot` whose main holds a package.json named `packageName` (the cli's when left out), its landing recorded
 * at the worktree's HEAD, and its draft pull request #7 at `pullHead` (the landed head when left out); the lot in
 * `state` (at work when left out).
 */
export function landedLot(
	params: { packageName?: string; pullHead?: string; state?: LandedLotState } = {},
): LandedLot {
	const lot = pullRequestLot({
		...stateRecordsOf(params.state),
		mainFiles: {
			'package.json': `${JSON.stringify({ name: params.packageName ?? CLI_PACKAGE })}\n`,
		},
	})
	const head = git({ root: lot.worktree, args: ['rev-parse', 'HEAD'] }).trim()
	writeFileSync(
		join(lot.lotFolder, LANDING_FILE),
		JSON.stringify({
			schema: 1,
			number: REVIEW_PULL_NUMBER,
			url: REVIEW_PULL_URL,
			branch: 'feat/x',
			head,
			replaced: [],
			at: '2026-11-17T00:00:00Z',
		}),
	)
	return {
		...lot,
		head,
		pullRequest: {
			number: REVIEW_PULL_NUMBER,
			url: REVIEW_PULL_URL,
			title: 'feat(x): x answers one',
			body: '',
			state: 'open',
			draft: true,
			queued: false,
			head: params.pullHead ?? head,
			filesUrl: `${REVIEW_PULL_URL}/files`,
		},
	}
}

/** The records that put a lot in `state`: a later transition, a registry entry for a committed lot. */
function stateRecordsOf(
	state: LandedLotState | undefined,
): Pick<Parameters<typeof pullRequestLot>[0] & object, 'later' | 'registry'> {
	if (state === 'committed') return { registry: 'committed' }
	if (state === 'failed')
		return { later: [transitionOf({ seq: 2, state: 'failed', kind: 'fail' })] }
	if (state === 'canceled')
		return { later: [transitionOf({ seq: 2, state: 'canceled', kind: 'stop' })] }
	return {}
}
