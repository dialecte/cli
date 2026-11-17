/**
 * `lot close` and `lot status` read the one landing state (FIX-ci-loop design, sections 1, 2 and 5): a lot id with no
 * hand-over entry closes once its pull request merged, a squash merge is read offline from the tree, the host decides
 * when main edited the lot's lines again, the lot's own declaration is archived, work after the landing keeps the
 * worktree, and `lot status` shows a squash-merged lot committed without writing anything.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
	AFTER_LANDING_FILE,
	LANDING_LOT_FILE,
	LANDING_PULL_NUMBER,
	MAIN_EDIT_TEXT,
	OWN_DECLARATION,
} from '../../test/landing-lot.constants.ts'
import {
	addOwnDeclaration,
	archivedDeclarationOf,
	closeArgumentsOf,
	closeOutcomesOf,
	commitAfterLanding,
	landingLotOf,
	registerCommittedHandover,
} from '../../test/landing-lot.ts'
import {
	editOnOrigin,
	landingHostOf,
	mergeOnOrigin,
	pullRequestOf,
} from '../../test/landing-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import { readLanded } from '../lib/landing/landed-record.ts'
import { runLotClose } from './lot-close.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A host whose newest pull request of the lot's branch merged at the lot's tip (opened by hand: no landing.json). */
function mergedByHost(lot: LandingLot) {
	return landingHostOf({
		byBranch: {
			[lot.branch]: pullRequestOf({
				number: LANDING_PULL_NUMBER,
				state: 'merged',
				head: lot.tip,
			}),
		},
	}).host
}

/** A host that knows no pull request: git alone decides. */
function silentHost() {
	return landingHostOf({}).host
}

describe('lot close: the landing state', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot close <id> of a lot with no hand-over entry, its pull request opened by hand and squash-merged → closed, landed.json written', () => {
		const lot = landingLotOf()
		mergeOnOrigin({ repository: lot.repository, how: 'squash' })

		expect({
			outcomes: closeOutcomesOf(
				runLotClose(closeArgumentsOf({ lot, names: [lot.name], host: mergedByHost(lot) })),
			),
			worktreeGone: !existsSync(lot.worktree),
			landed: readLanded({ lotFolder: lot.lotFolder }),
		}).toMatchObject({
			outcomes: [{ closed: true, landed: expect.stringContaining(`#${LANDING_PULL_NUMBER}`) }],
			worktreeGone: true,
			landed: {
				how: 'host',
				tip: lot.tip,
				base: 'main',
				pull: { number: LANDING_PULL_NUMBER },
			},
		})
	})

	it('lot close of a lot committed through a hand-over, no landing.json, squash-merged → closed', () => {
		const lot = landingLotOf()
		const handover = registerCommittedHandover(lot)
		mergeOnOrigin({ repository: lot.repository, how: 'squash' })

		expect({
			outcomes: closeOutcomesOf(
				runLotClose(closeArgumentsOf({ lot, names: [handover], host: silentHost() })),
			),
			worktreeGone: !existsSync(lot.worktree),
			landed: readLanded({ lotFolder: lot.lotFolder }),
		}).toMatchObject({
			outcomes: [{ closed: true }],
			worktreeGone: true,
			landed: { how: 'tree', tip: lot.tip },
		})
	})

	it('lot close of a landed lot whose worktree holds its own lot declaration → the declaration archived, closed', () => {
		const lot = landingLotOf()
		addOwnDeclaration(lot)
		mergeOnOrigin({ repository: lot.repository, how: 'squash' })

		expect({
			outcomes: closeOutcomesOf(
				runLotClose(closeArgumentsOf({ lot, names: [lot.name], host: mergedByHost(lot) })),
			),
			worktreeGone: !existsSync(lot.worktree),
			archived: archivedDeclarationOf(lot),
		}).toMatchObject({
			outcomes: [{ closed: true }],
			worktreeGone: true,
			archived: OWN_DECLARATION,
		})
	})

	it('squash, then main edits the same lines, the host says merged → lot close removes the worktree', () => {
		const lot = landingLotOf()
		mergeOnOrigin({ repository: lot.repository, how: 'squash' })
		editOnOrigin({ repository: lot.repository, files: { [LANDING_LOT_FILE]: MAIN_EDIT_TEXT } })

		expect({
			outcomes: closeOutcomesOf(
				runLotClose(closeArgumentsOf({ lot, names: [lot.name], host: mergedByHost(lot) })),
			),
			worktreeGone: !existsSync(lot.worktree),
			landed: readLanded({ lotFolder: lot.lotFolder }),
		}).toMatchObject({
			outcomes: [{ closed: true }],
			worktreeGone: true,
			landed: { how: 'host', tip: lot.tip },
		})
	})

	it('a squash-merged lot with a commit made after the merge → lot close keeps it naming the commits', () => {
		const lot = landingLotOf()
		mergeOnOrigin({ repository: lot.repository, how: 'squash' })
		const after = commitAfterLanding({ lot, file: AFTER_LANDING_FILE })

		expect({
			outcomes: closeOutcomesOf(
				runLotClose(closeArgumentsOf({ lot, names: [lot.name], host: silentHost() })),
			),
			worktreeKept: existsSync(lot.worktree),
		}).toMatchObject({
			outcomes: [
				{
					closed: false,
					kept: expect.stringMatching(
						new RegExp(`1 commit\\(s\\) of work not in main: ${after.slice(0, SHORT_SHA_LENGTH)}`),
					),
				},
			],
			worktreeKept: true,
		})
	})

	it('a lot with no hand-over entry, not landed → kept, naming why, nothing written', () => {
		const lot = landingLotOf()

		expect({
			exitCode: runLotClose(closeArgumentsOf({ lot, names: [lot.name], host: silentHost() }))
				.exitCode,
			worktreeKept: existsSync(lot.worktree),
			landed: readLanded({ lotFolder: lot.lotFolder }),
		}).toEqual({ exitCode: 1, worktreeKept: true, landed: undefined })
	})
})

describe('lot status: the landing state', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot status of a squash-merged lot → committed, nothing written', () => {
		const lot = landingLotOf()
		mergeOnOrigin({ repository: lot.repository, how: 'squash' })

		expect({
			state: (
				JSON.parse(
					runLot({
						cwd: lot.workspace.repository,
						argv: ['status', lot.name, '--json'],
						host: silentHost(),
					}).output,
				) as { state: string }
			).state,
			landed: existsSync(join(lot.lotFolder, 'landed.json')),
		}).toEqual({ state: 'committed', landed: false })
	})
})
