/**
 * `lot close` and `lot status` read the one landing state (FIX-ci-loop design, sections 1, 2 and 5): a lot id with no
 * hand-over entry closes once its pull request merged, a squash merge is read offline from the tree, the host decides
 * when main edited the lot's lines again, the lot's own declaration is archived, work after the landing keeps the
 * worktree, an entry an older close closed still gets its landed fact from the host, and `lot status` shows a
 * squash-merged lot committed without writing anything.
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
	configureMissingBase,
	landingLotOf,
	lotBranchTipOf,
	lotEntryStateOf,
	lotHeadOf,
	registerCommittedHandover,
	registerLotEntry,
	writeLandedFact,
	writeLandingRecord,
} from '../../test/landing-lot.ts'
import { ORIGIN_MAIN } from '../../test/landing-repository.constants.ts'
import {
	commitDetached,
	deleteOriginBranch,
	editOnOrigin,
	landingHostOf,
	mergeOnOrigin,
	pullRequestOf,
	rebaseOnto,
	rebaseResolving,
	strayCommitOf,
} from '../../test/landing-repository.ts'
import { takeRefusingGhCalls } from '../../test/suite-guard/refusing-gh.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import { readLanded } from '../lib/landing/landed-record.ts'
import { runLotClose } from './lot-close.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { HostAdapter } from '../lib/host/host.types.ts'

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

/** A host whose pull request #9 (the lot's landing.json's) merged at the lot's tip. */
function mergedByNumber(lot: LandingLot) {
	return landingHostOf({
		byNumber: {
			[LANDING_PULL_NUMBER]: pullRequestOf({
				number: LANDING_PULL_NUMBER,
				state: 'merged',
				head: lot.tip,
			}),
		},
	}).host
}

/** What a close row sets up after the lot's first commit: the names it closes and the host it asks. */
type CloseRow = {
	title: string
	arrange: (lot: LandingLot) => { names: string[]; host: HostAdapter }
	/** What the close leaves, as `closeLeft` reads it: a partial match. */
	expected: (lot: LandingLot) => Record<string, unknown>
}

const CLOSE_ROWS: CloseRow[] = [
	{
		title:
			'lot close <id> of a lot with no hand-over entry, its pull request opened by hand and squash-merged → closed, landed.json written',
		arrange: (lot) => {
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			return { names: [lot.name], host: mergedByHost(lot) }
		},
		expected: (lot) => ({
			outcomes: [{ closed: true, landed: expect.stringContaining(`#${LANDING_PULL_NUMBER}`) }],
			worktreeGone: true,
			landed: { how: 'host', tip: lot.tip, base: 'main', pull: { number: LANDING_PULL_NUMBER } },
		}),
	},
	{
		title:
			'lot close of a lot committed through a hand-over, no landing.json, squash-merged → closed',
		arrange: (lot) => {
			const handover = registerCommittedHandover(lot)
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			return { names: [handover], host: silentHost() }
		},
		expected: (lot) => ({
			outcomes: [{ closed: true }],
			worktreeGone: true,
			landed: { how: 'tree', tip: lot.tip },
		}),
	},
	{
		title:
			'lot close of a landed lot whose worktree holds its own lot declaration → the declaration archived, closed',
		arrange: (lot) => {
			addOwnDeclaration(lot)
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			return { names: [lot.name], host: mergedByHost(lot) }
		},
		expected: () => ({
			outcomes: [{ closed: true }],
			worktreeGone: true,
			archived: OWN_DECLARATION,
		}),
	},
	{
		title:
			'squash, then main edits the same lines, the host says merged → lot close removes the worktree',
		arrange: (lot) => {
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			editOnOrigin({ repository: lot.repository, files: { [LANDING_LOT_FILE]: MAIN_EDIT_TEXT } })
			return { names: [lot.name], host: mergedByHost(lot) }
		},
		expected: (lot) => ({
			outcomes: [{ closed: true }],
			worktreeGone: true,
			landed: { how: 'host', tip: lot.tip },
		}),
	},
	{
		title:
			'a squash-merged lot with a commit made after the merge → lot close keeps it naming the commits',
		arrange: (lot) => {
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			commitAfterLanding({ lot, file: AFTER_LANDING_FILE })
			return { names: [lot.name], host: silentHost() }
		},
		expected: (lot) => ({
			outcomes: [
				{
					closed: false,
					kept: expect.stringContaining(lotHeadOf(lot).slice(0, SHORT_SHA_LENGTH)),
				},
			],
			worktreeGone: false,
		}),
	},
	{
		title: 'a lot with no hand-over entry, not landed → kept, naming why, nothing written',
		arrange: (lot) => ({ names: [lot.name], host: silentHost() }),
		expected: () => ({
			outcomes: [{ closed: false, kept: expect.stringContaining('not landed') }],
			worktreeGone: false,
			landed: undefined,
		}),
	},
	{
		title:
			'an entry an older close closed without a landed fact, squash then main edits the same lines, the host says merged → landed.json recorded, its landed line beside already closed, nothing moved',
		arrange: (lot) => {
			writeLandingRecord({ lot, number: LANDING_PULL_NUMBER })
			const entry = registerLotEntry({ lot, closed: true })
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			editOnOrigin({ repository: lot.repository, files: { [LANDING_LOT_FILE]: MAIN_EDIT_TEXT } })
			return { names: [entry], host: mergedByNumber(lot) }
		},
		expected: (lot) => ({
			outcomes: [
				{
					closed: true,
					already: true,
					landed: expect.stringContaining(`pull request #${LANDING_PULL_NUMBER} merged`),
				},
			],
			worktreeGone: false,
			landed: { how: 'host', tip: lot.tip, pull: { number: LANDING_PULL_NUMBER } },
		}),
	},
]

/** What a close left: its outcomes, whether the worktree went, the landed fact and the archived declaration. */
function closeLeft(params: { lot: LandingLot; result: CommandResult }) {
	const { lot } = params
	return {
		outcomes: closeOutcomesOf(params.result),
		worktreeGone: !existsSync(lot.worktree),
		landed: readLanded({ lotFolder: lot.lotFolder }),
		archived: archivedDeclarationOf(lot),
		entry: lotEntryStateOf(lot),
		branchTip: lotBranchTipOf(lot),
	}
}

describe('lot close: the landing state', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of CLOSE_ROWS)
		it(row.title, () => {
			const lot = landingLotOf()
			const { names, host } = row.arrange(lot)

			expect(
				closeLeft({ lot, result: runLotClose(closeArgumentsOf({ lot, names, host })) }),
			).toMatchObject(row.expected(lot))
		})
})

/**
 * The 0169 shape: the lot's pull request opened by hand (no landing.json), squash-merged, main editing the same lines
 * since, and origin's branch deleted after the merge: git alone cannot prove the landing, nothing says the lot was
 * pushed.
 */
function squashedUnpushed(lot: LandingLot): void {
	mergeOnOrigin({ repository: lot.repository, how: 'squash' })
	editOnOrigin({ repository: lot.repository, files: { [LANDING_LOT_FILE]: MAIN_EDIT_TEXT } })
	deleteOriginBranch({ repository: lot.repository })
}

/** A close row whose arrange names a commit its expected outcome reads (made before the close moves anything). */
type RemovalRow = {
	title: string
	arrange: (lot: LandingLot) => { names: string[]; host: HostAdapter; commit?: string }
	expected: (params: { lot: LandingLot; commit: string | undefined }) => Record<string, unknown>
}

const REMOVAL_ROWS: RemovalRow[] = [
	{
		title:
			'the 0191 shape: two rebases, the second resolving a conflict, squash-merged, main editing the same lines since, the host says merged → closed, the branch kept',
		arrange: (lot) => {
			editOnOrigin({
				repository: lot.repository,
				files: { 'src/main.ts': 'export const main = 1\n' },
			})
			rebaseOnto({ worktree: lot.worktree, onto: ORIGIN_MAIN })
			editOnOrigin({
				repository: lot.repository,
				files: { [LANDING_LOT_FILE]: 'export const x = 5\n' },
			})
			const resolved = rebaseResolving({
				worktree: lot.worktree,
				onto: ORIGIN_MAIN,
				files: { [LANDING_LOT_FILE]: 'export const x = 15\n' },
			})
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			editOnOrigin({ repository: lot.repository, files: { [LANDING_LOT_FILE]: MAIN_EDIT_TEXT } })
			return {
				names: [lot.name],
				host: landingHostOf({
					byBranch: {
						[lot.branch]: pullRequestOf({
							number: LANDING_PULL_NUMBER,
							state: 'merged',
							head: resolved,
						}),
					},
				}).host,
				commit: resolved,
			}
		},
		expected: ({ commit }) => ({
			outcomes: [{ closed: true }],
			worktreeGone: true,
			landed: { how: 'host', tip: commit },
			branchTip: commit,
		}),
	},
	{
		title:
			'the 0169 shape: a pull request opened outside lot land, squash-merged, main editing the same lines, origin s branch deleted, the host merged by branch → landed.json written, no registry entry forged, the declaration archived, closed',
		arrange: (lot) => {
			addOwnDeclaration(lot)
			squashedUnpushed(lot)
			return { names: [lot.name], host: mergedByHost(lot) }
		},
		expected: ({ lot }) => ({
			outcomes: [{ closed: true, landed: expect.stringContaining(`#${LANDING_PULL_NUMBER}`) }],
			worktreeGone: true,
			landed: { how: 'host', tip: lot.tip, pull: { number: LANDING_PULL_NUMBER } },
			entry: undefined,
			archived: OWN_DECLARATION,
		}),
	},
	{
		title:
			'a merged pull request found by branch whose head the branch never reached, origin s branch deleted → kept, nothing written',
		arrange: (lot) => {
			squashedUnpushed(lot)
			return {
				names: [lot.name],
				host: landingHostOf({
					byBranch: {
						[lot.branch]: pullRequestOf({
							number: LANDING_PULL_NUMBER,
							state: 'merged',
							head: strayCommitOf({ root: lot.workspace.repository, parent: lot.repository.cut }),
						}),
					},
				}).host,
			}
		},
		expected: () => ({
			outcomes: [{ closed: false }],
			worktreeGone: false,
			landed: undefined,
		}),
	},
	{
		title:
			'the host refusing, the lot squash-merged, main editing the same lines, origin s branch deleted → kept, naming the refusal',
		arrange: (lot) => {
			squashedUnpushed(lot)
			return { names: [lot.name], host: landingHostOf({ refusal: 'gh: offline' }).host }
		},
		expected: () => ({
			outcomes: [{ closed: false, kept: expect.stringContaining('gh: offline') }],
			worktreeGone: false,
			landed: undefined,
		}),
	},
	{
		title:
			'no base branch resolves, a landed lot whose worktree made a commit on a detached HEAD → kept, naming the commit (the loss check runs without a base)',
		arrange: (lot) => {
			writeLandedFact({ lot, tip: lot.tip })
			const entry = registerLotEntry({ lot })
			configureMissingBase(lot)
			const detached = commitDetached({
				worktree: lot.worktree,
				files: { 'src/detached.ts': 'export const detached = 1\n' },
				reattach: true,
			})
			return { names: [entry], host: silentHost(), commit: detached }
		},
		expected: ({ commit }) => ({
			outcomes: [
				{
					closed: false,
					kept: expect.stringContaining((commit ?? '').slice(0, SHORT_SHA_LENGTH)),
				},
			],
			worktreeGone: false,
		}),
	},
]

describe(
	'lot close: what a removal loses, and the host asked by branch',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of REMOVAL_ROWS)
			it(row.title, () => {
				const lot = landingLotOf()
				const { names, host, commit } = row.arrange(lot)

				expect(
					closeLeft({ lot, result: runLotClose(closeArgumentsOf({ lot, names, host })) }),
				).toMatchObject(row.expected({ lot, commit }))
			})
	},
)

describe('lot close: no real gh in the suite', { timeout: STORE_CASE_TIMEOUT }, () => {
	it("a close built with no fake host, in a repository with no vendor → kept on the default host's own no-vendor refusal, gh never run", () => {
		const lot = landingLotOf()
		squashedUnpushed(lot)
		const { host: _faked, ...withoutHost } = closeArgumentsOf({
			lot,
			names: [lot.name],
			host: silentHost(),
		})

		// the suite never runs the real gh: the refusing gh's record stays empty
		expect({
			outcomes: closeOutcomesOf(runLotClose(withoutHost)),
			calls: takeRefusingGhCalls(),
		}).toEqual({
			outcomes: [
				{
					closed: false,
					kept: expect.stringMatching(/^(?=.*no host vendor)(?=.*github)(?=.*the key `?host`?)/s),
				},
			],
			calls: [],
		})
	})
})

describe('lot status: the landing state', { timeout: STORE_CASE_TIMEOUT }, () => {
	const STATUS_ROWS = [
		{
			title: 'lot status of a squash-merged lot → committed, nothing written',
			arrange: (lot: LandingLot) => mergeOnOrigin({ repository: lot.repository, how: 'squash' }),
			expected: { state: 'committed', landed: false },
		},
	]
	for (const row of STATUS_ROWS)
		it(row.title, () => {
			const lot = landingLotOf()
			row.arrange(lot)

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
			}).toEqual(row.expected)
		})
})
