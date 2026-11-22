/**
 * `dialecte worktree prune`: the keep rule of the lot store (33S section 11). A worktree that a lot of the
 * repository's store names (`identity.worktree`, by real path) while the lot is not `committed` nor `canceled` is
 * kept, with the reason `lot <full name> <state>`, checked before every other rule; the store is read once for the
 * repository. Every case sets the other keep reasons up so that they would NOT keep, but one: its reflog holds two
 * entries, no hygiene baseline stands in for its tip, no `.dialecte/` folder, no link, nothing uncommitted; an open
 * lot's branch is not merged into the base (a merged one has landed: prune reads it committed), a closed lot's is.
 */
import { appendFileSync, existsSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace } from '../../test/brief-workspace.ts'
import { replaceRecord } from '../../test/damaged-lot-workspace.ts'
import { damageLot, worktreePruneItemsOf } from '../../test/keep-decision-workspace.ts'
import { KEEP_NOW, REMOVABLE } from '../../test/lot-keep-workspace.constants.ts'
import {
	addBareWorktree,
	addLotWithoutWorktree,
	addLotWorktree,
	markHandoverPending,
	pointIdentityAt,
	worktreeFatesOf,
} from '../../test/lot-keep-workspace.ts'
import { stopOf } from '../../test/lot-stop-workspace.ts'
import { linkLot } from '../../test/lot-stores.ts'
import { git, temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import {
	handoverStoreOf,
	recordHandoverState,
	registerHandover,
} from '../lib/handover/handover-store.ts'
import { runWorktreePrune } from './worktree.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'
import type { WorktreePruneItems } from '../../test/keep-decision-workspace.types.ts'
import type { LotKeepState, LotWorktree } from '../../test/lot-keep-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const ASKING = '0001-repo-asking'
const OTHER = '0002-repo-other'

/** The keep reason prune shows for a worktree on `branch` kept by the lot `name` in `state`. */
function lotReason(params: { branch: string; name: string; state: string }): string {
	return `${params.branch}: lot ${params.name} ${params.state}`
}

const UNREADABLE = '0003-repo-unreadable'

/** The identity text no reader parses. */
const UNPARSABLE_IDENTITY = '{ "schema": 1, '

/** The command prune offers for a worktree it removes, whatever the `cd` before it. */
const REMOVE_COMMAND = expect.stringContaining('git worktree remove')

/**
 * `.dialecte/` ignored by the repository, as a lot's worktree has it: its root link alone makes no worktree dirty and
 * leaves no ignored file `git worktree remove` would delete.
 */
function ignoreLotLinks(workspace: BriefWorkspace): void {
	appendFileSync(join(workspace.repository, '.git', 'info', 'exclude'), '.dialecte/\n')
}

/**
 * The lot `name` with its clean merged worktree (nothing else keeps it), then its `identity.json` made unparsable, as
 * a hand that broke it leaves it; its root link `.dialecte/lot` to the lot folder when `link`.
 */
function unreadableLot(params: {
	workspace: BriefWorkspace
	name: string
	link: boolean
}): LotWorktree {
	const { workspace } = params
	ignoreLotLinks(workspace)
	const lot = addLotWorktree({ workspace, name: params.name, state: 'working' })
	replaceRecord({ folder: lot.lotFolder, name: 'identity.json', text: UNPARSABLE_IDENTITY })
	if (params.link) linkLot({ worktree: lot.worktree, lotFolder: lot.lotFolder })
	return lot
}

/** The registry entry the lot's landing writes: it names the lot folder, its worktree and its branch. */
function registerLotFolder(params: { workspace: BriefWorkspace; lot: LotWorktree }): void {
	const { lot } = params
	registerHandover({ root: lot.worktree, folder: lot.lotFolder, branch: lot.branch, now: KEEP_NOW })
	recordHandoverState({
		store: handoverStoreOf(params.workspace.repository),
		folder: lot.lotFolder,
		state: 'committed',
	})
}

/** Every item of the plan `worktree prune --json` makes for the workspace, keyed `<kind> <name>`. */
async function pruneItemsOf(workspace: BriefWorkspace): Promise<WorktreePruneItems> {
	const result = await runWorktreePrune({
		argv: ['--root', workspace.workspace, '--json'],
		cwd: workspace.workspace,
		scratchRoot: temporaryFolder('dialecte-scratch-root-'),
		isTerminal: false,
		confirm: async function never() {
			return false
		},
	})
	return worktreePruneItemsOf(result)
}

/** The number of git processes the trace file holds, each process once (its children left out). */
function gitProcessCount(traceFile: string): number {
	if (!existsSync(traceFile)) return 0
	return readFileSync(traceFile, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map(function parse(line) {
			return JSON.parse(line) as { event: string; sid: string }
		})
		.filter((event) => event.event === 'start' && !event.sid.includes('/')).length
}

/** The fates of `worktreeFatesOf` with the git processes it started, counted from git's own trace. */
async function tracedFates(workspace: BriefWorkspace) {
	const traceFile = join(temporaryFolder('dialecte-prune-trace-'), 'trace.json')
	vi.stubEnv('GIT_TRACE2_EVENT', traceFile)
	// a trace nested in another process's session would count no top-level start: the counts must not depend on it
	vi.stubEnv('GIT_TRACE2_PARENT_SID', '')
	let fates: Record<string, string>
	try {
		fates = await worktreeFatesOf(workspace)
	} finally {
		vi.stubEnv('GIT_TRACE2_EVENT', '')
	}
	return { fates, gitProcesses: gitProcessCount(traceFile) }
}

describe('worktree prune: the lot keep rule', { timeout: STORE_CASE_TIMEOUT }, () => {
	const KEPT_STATES: LotKeepState[] = ['input-required', 'working', 'ready', 'failed']
	for (const state of KEPT_STATES)
		it(`a clean worktree of a lot ${state}, its branch not landed → kept, reason "lot <name> ${state}" (case 22)`, async () => {
			const workspace = createBriefWorkspace()
			const lot = addLotWorktree({ workspace, name: ASKING, state, merged: false })

			await expect(worktreeFatesOf(workspace)).resolves.toEqual({
				[ASKING]: lotReason({ branch: lot.branch, name: ASKING, state }),
			})
		})

	const LISTED_STATES: LotKeepState[] = ['canceled', 'committed']
	for (const state of LISTED_STATES)
		it(`the same worktree with the lot ${state}, beside a worktree of a lot input-required → kept as the lot's own, naming lot prune, no removal; the other kept (case 22)`, async () => {
			const workspace = createBriefWorkspace()
			const closed = addLotWorktree({ workspace, name: ASKING, state })
			const asking = addLotWorktree({
				workspace,
				name: OTHER,
				state: 'input-required',
				merged: false,
			})

			await expect(worktreeFatesOf(workspace)).resolves.toEqual({
				[ASKING]: `${closed.branch}: lot ${ASKING} ${state}: its own item, removed by dialecte lot prune ${ASKING}`,
				[OTHER]: lotReason({ branch: asking.branch, name: OTHER, state: 'input-required' }),
			})
		})

	it('a merged clean worktree that no lot names, beside one a working lot names and a lot whose worktree is gone → only the named one is kept', async () => {
		const workspace = createBriefWorkspace()
		const named = addLotWorktree({ workspace, name: ASKING, state: 'working', merged: false })
		addLotWithoutWorktree({ workspace, name: '0003-repo-gone', state: 'working' })
		addBareWorktree({ workspace, name: OTHER })

		await expect(worktreeFatesOf(workspace)).resolves.toEqual({
			[ASKING]: lotReason({ branch: named.branch, name: ASKING, state: 'working' }),
			[OTHER]: REMOVABLE,
		})
	})

	it('a worktree with a commit not in main, named by a working lot → the reason shown is the lot', async () => {
		const workspace = createBriefWorkspace()
		const lot = addLotWorktree({ workspace, name: ASKING, state: 'working', merged: false })

		await expect(worktreeFatesOf(workspace)).resolves.toEqual({
			[ASKING]: lotReason({ branch: lot.branch, name: ASKING, state: 'working' }),
		})
	})

	it('a worktree where a hand-over is pending, named by a ready lot → the reason shown is the lot, not "a hand-over is pending in it"', async () => {
		const workspace = createBriefWorkspace()
		const lot = addLotWorktree({ workspace, name: ASKING, state: 'ready', merged: false })
		markHandoverPending(lot)

		await expect(worktreeFatesOf(workspace)).resolves.toEqual({
			[ASKING]: lotReason({ branch: lot.branch, name: ASKING, state: 'ready' }),
		})
	})

	it('a worktree with an uncommitted file, named by a lot input-required → the reason shown is the lot', async () => {
		const workspace = createBriefWorkspace()
		const lot = addLotWorktree({
			workspace,
			name: ASKING,
			state: 'input-required',
			dirty: true,
			merged: false,
		})

		await expect(worktreeFatesOf(workspace)).resolves.toEqual({
			[ASKING]: lotReason({ branch: lot.branch, name: ASKING, state: 'input-required' }),
		})
	})

	it('a lot whose identity names its worktree through a symbolic link → kept all the same (compared by real path)', async () => {
		const workspace = createBriefWorkspace()
		const lot = addLotWorktree({ workspace, name: ASKING, state: 'input-required', merged: false })
		const link = join(temporaryFolder('dialecte-worktree-link-'), 'link')
		symlinkSync(lot.worktree, link)
		pointIdentityAt({ lotFolder: lot.lotFolder, worktree: link })

		await expect(worktreeFatesOf(workspace)).resolves.toEqual({
			[ASKING]: lotReason({ branch: lot.branch, name: ASKING, state: 'input-required' }),
		})
	})

	it('a store of several lots (a simulated one, ones whose worktree is gone, canceled and committed ones) → the same fates and the same git processes as a store of one lot', async () => {
		const single = createBriefWorkspace()
		const singleLot = addLotWorktree({
			workspace: single,
			name: ASKING,
			state: 'input-required',
			merged: false,
		})
		const singleRun = await tracedFates(single)

		const several = createBriefWorkspace()
		const open = addLotWorktree({
			workspace: several,
			name: ASKING,
			state: 'input-required',
			merged: false,
		})
		addLotWithoutWorktree({
			workspace: several,
			name: '0002-repo-simulated',
			state: 'working',
			simulated: true,
		})
		addLotWithoutWorktree({ workspace: several, name: '0003-repo-gone', state: 'input-required' })
		// closed lots naming the open lot's real worktree: a git process per lot would show, and they never override it
		addLotWithoutWorktree({
			workspace: several,
			name: '0004-repo-stopped',
			state: 'canceled',
			worktree: open.worktree,
		})
		addLotWithoutWorktree({
			workspace: several,
			name: '0005-repo-landed',
			state: 'committed',
			worktree: open.worktree,
		})
		addLotWithoutWorktree({ workspace: several, name: '0006-repo-waiting', state: 'working' })
		const severalRun = await tracedFates(several)

		expect(singleRun.gitProcesses).toBeGreaterThan(0)
		expect(severalRun).toEqual({
			fates: {
				[ASKING]: lotReason({ branch: singleLot.branch, name: ASKING, state: 'input-required' }),
			},
			gitProcesses: singleRun.gitProcesses,
		})
	})
})

describe(
	'worktree prune: a lot whose identity does not read still holds',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a clean merged worktree of a lot whose identity.json does not parse, its root link there, no registry entry → kept, lot <name> damaged; its branch not offered', async () => {
			const workspace = createBriefWorkspace()
			const lot = unreadableLot({ workspace, name: UNREADABLE, link: true })

			const items = await pruneItemsOf(workspace)

			expect({
				worktree: items[`worktree ${UNREADABLE}`],
				branch: items[`branch ${lot.branch}`],
			}).toEqual({
				worktree: lotReason({ branch: lot.branch, name: UNREADABLE, state: 'damaged' }),
				branch: undefined,
			})
		})

		it('the same lot, its root link gone, a registry entry naming its folder → its worktree kept by the entry, lot <name> damaged', async () => {
			const workspace = createBriefWorkspace()
			const lot = unreadableLot({ workspace, name: UNREADABLE, link: false })
			registerLotFolder({ workspace, lot })

			await expect(pruneItemsOf(workspace)).resolves.toMatchObject({
				[`worktree ${UNREADABLE}`]: lotReason({
					branch: lot.branch,
					name: UNREADABLE,
					state: 'damaged',
				}),
			})
		})

		it('the same lot, its worktree removed and unregistered, a registry entry naming its folder → its merged branch kept by the entry’s branch, lot <name> damaged', async () => {
			const workspace = createBriefWorkspace()
			const lot = unreadableLot({ workspace, name: UNREADABLE, link: false })
			registerLotFolder({ workspace, lot })
			rmSync(lot.worktree, { recursive: true, force: true })
			git({ root: workspace.repository, args: ['worktree', 'prune'] })

			await expect(pruneItemsOf(workspace)).resolves.toMatchObject({
				[`branch ${lot.branch}`]: `lot ${UNREADABLE} damaged`,
			})
		})

		for (const suffix of ['round-1', 'verify'])
			it(`its clean merged throwaway <worktree>-${suffix}, the lot found by its root link → kept with the lot’s reason`, async () => {
				const workspace = createBriefWorkspace()
				unreadableLot({ workspace, name: UNREADABLE, link: true })
				const throwaway = addBareWorktree({ workspace, name: `${UNREADABLE}-${suffix}` })

				await expect(pruneItemsOf(workspace)).resolves.toMatchObject({
					[`worktree ${throwaway.name}`]: lotReason({
						branch: throwaway.branch,
						name: UNREADABLE,
						state: 'damaged',
					}),
				})
			})

		it('a worktree whose identity-named lot is committed, its root link naming a damaged lot → kept with the damaged lot’s reason', async () => {
			const workspace = createBriefWorkspace()
			ignoreLotLinks(workspace)
			const committed = addLotWorktree({ workspace, name: ASKING, state: 'committed' })
			const damaged = addLotWithoutWorktree({ workspace, name: OTHER, state: 'working' })
			damageLot({ lotFolder: damaged })
			linkLot({ worktree: committed.worktree, lotFolder: damaged })

			await expect(pruneItemsOf(workspace)).resolves.toMatchObject({
				[`worktree ${ASKING}`]: lotReason({
					branch: committed.branch,
					name: OTHER,
					state: 'damaged',
				}),
			})
		})

		it('a committed lot’s own worktree, its root link naming that lot → still its own item naming lot prune', async () => {
			// guard: the link candidate never turns a closed lot's own item into a removal (prune keeps on any item)
			const workspace = createBriefWorkspace()
			ignoreLotLinks(workspace)
			const committed = addLotWorktree({ workspace, name: ASKING, state: 'committed' })
			linkLot({ worktree: committed.worktree, lotFolder: committed.lotFolder })

			await expect(pruneItemsOf(workspace)).resolves.toMatchObject({
				[`worktree ${ASKING}`]: `${committed.branch}: lot ${ASKING} committed: its own item, removed by dialecte lot prune ${ASKING}`,
			})
		})

		it('a clean merged worktree whose root link names a closed unkept lot naming another worktree and branch → decided by prune’s own rules: its removal offered', async () => {
			// guard: main has no link candidate; a link alone to a closed lot must not strand the worktree as its item
			const workspace = createBriefWorkspace()
			ignoreLotLinks(workspace)
			const closed = addLotWithoutWorktree({ workspace, name: ASKING, state: 'committed' })
			const linked = addBareWorktree({ workspace, name: OTHER })
			linkLot({ worktree: linked.worktree, lotFolder: closed })

			await expect(pruneItemsOf(workspace)).resolves.toMatchObject({
				[`worktree ${OTHER}`]: REMOVE_COMMAND,
			})
		})

		it('the unreadable lot moved aside by lot stop, its root link left dangling → its clean merged worktree offered for removal', async () => {
			// guard: a lot folder gone from the store releases what it held (KEEP 3.7); main never held it
			const workspace = createBriefWorkspace()
			unreadableLot({ workspace, name: UNREADABLE, link: true })
			const stopped = stopOf({ cwd: workspace.repository, id: UNREADABLE })
			const items = await pruneItemsOf(workspace)

			expect({ stopped: stopped.exitCode, worktree: items[`worktree ${UNREADABLE}`] }).toEqual({
				stopped: 0,
				worktree: REMOVE_COMMAND,
			})
		})
	},
)
