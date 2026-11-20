/**
 * A lot of a brief workspace's store landing through a bare origin, for the verbs that read its landing (close, prune,
 * status): the lot's records written by the store's own writer, its worktree, branch and commits real, origin's main
 * moved by real merges from another clone (`mergeOnOrigin`), the host faked (`landingHostOf`).
 */
import { spawnSync } from 'node:child_process'
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'

import { runLot } from '../src/commands/lot.ts'
import { CARDS_LOG_FILE } from '../src/lib/events/cards-log.constants.ts'
import { writeCard } from '../src/lib/events/cards-log.ts'
import { registeredEntryOf } from '../src/lib/handover/handover-store-read.ts'
import {
	handoverStoreOf,
	recordHandoverClosed,
	recordHandoverState,
	registerHandover,
} from '../src/lib/handover/handover-store.ts'
import { LANDED_SCHEMA } from '../src/lib/landing/landed-record.constants.ts'
import { writeLanded } from '../src/lib/landing/landed-record.ts'
import { readIdentity } from '../src/lib/store/identity.ts'
import { STACK_SCHEMA } from '../src/lib/store/stack.constants.ts'
import { writeStack } from '../src/lib/store/stack.ts'
import { createBriefWorkspace, writeStoreLot } from './brief-workspace.ts'
import {
	LANDING_LOT,
	LANDING_LOT_BRANCH,
	LANDING_LOT_FILE,
	LANDING_LOT_TEXT,
	LANDING_NOW,
	MISSING_BASE_BRANCH,
	OWN_DECLARATION,
} from './landing-lot.constants.ts'
import { commitIn, headOf } from './landing-repository.ts'
import { writeHookRecordAtHead } from './lot-close-final-record.ts'
import { REMOVABLE } from './lot-keep-workspace.constants.ts'
import { git, temporaryFolder } from './scratch-repository.ts'
import { createRecordingSpawner } from './worktree-pool.ts'

import type { runLotClose } from '../src/commands/lot-close.ts'
import type { runWorktreePrune } from '../src/commands/worktree.ts'
import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { HostAdapter } from '../src/lib/host/host.types.ts'
import type { Transition } from '../src/lib/store/store.types.ts'
import type { LandingLot } from './landing-lot.types.ts'

/**
 * A brief workspace whose repository's main is pushed to a bare origin, and the store lot `name` (`0001-repo-x` by
 * default) on its own worktree `.worktrees/<name>`, its branch cut from main with one commit of its own (`src/x.ts`).
 * The caller restores the environment (`vi.unstubAllEnvs`).
 */
export function landingLotOf(params: { name?: string; branch?: string } = {}): LandingLot {
	const workspace = createBriefWorkspace()
	const root = workspace.repository
	const origin = join(temporaryFolder('dialecte-landing-origin-'), 'origin.git')
	git({ root, args: ['init', '-q', '--bare', '-b', 'main', origin] })
	git({ root, args: ['remote', 'add', 'origin', origin] })
	git({ root, args: ['push', '-q', '-u', 'origin', 'main'] })
	// the lot's own declaration is ignored, as a lot worktree's is
	appendFileSync(join(root, '.git', 'info', 'exclude'), '.dialecte/\n')
	const name = params.name ?? LANDING_LOT
	const branch = params.branch ?? LANDING_LOT_BRANCH
	const path = join(workspace.workspace, '.worktrees', name)
	git({ root, args: ['worktree', 'add', '-q', '-b', branch, path, 'main'] })
	const worktree = realpathSync(path)
	const tip = commitIn({
		root: worktree,
		files: { [LANDING_LOT_FILE]: LANDING_LOT_TEXT },
		message: 'feat(x): x',
	})
	const lotFolder = realpathSync(
		writeStoreLot({
			workspace,
			name,
			scope: [LANDING_LOT_FILE],
			branch,
			worktree,
			repository: root,
			base: { ref: 'main', commit: workspace.commit },
		}),
	)
	return {
		workspace,
		name,
		lotFolder,
		branch,
		worktree,
		tip,
		repository: { root, origin, worktree, branch, cut: workspace.commit, tip },
	}
}

/**
 * A second store lot `name` in the same workspace as `lot`, on its own worktree and branch `branch` cut from main with
 * one commit of its own (`src/<name>.ts`): the same shape `landingLotOf` makes.
 */
export function addLandingLot(params: {
	lot: LandingLot
	name: string
	branch: string
	/** Where its branch is cut; main when left out. */
	from?: string
	/** Its transitions after the first (`working`): a `failed` one makes it failed. */
	later?: Transition[]
	/** Its identity's feature; the records' fixed one when left out. */
	feature?: string
}): LandingLot {
	const { lot, name, branch } = params
	const { workspace } = lot
	const root = workspace.repository
	const path = join(workspace.workspace, '.worktrees', name)
	git({ root, args: ['worktree', 'add', '-q', '-b', branch, path, params.from ?? 'main'] })
	const worktree = realpathSync(path)
	const file = `src/${name}.ts`
	const tip = commitIn({
		root: worktree,
		files: { [file]: LANDING_LOT_TEXT },
		message: `feat: ${name}`,
	})
	const lotFolder = realpathSync(
		writeStoreLot({
			workspace,
			name,
			scope: [file],
			branch,
			worktree,
			repository: root,
			base: { ref: 'main', commit: workspace.commit },
			later: params.later,
			feature: params.feature,
		}),
	)
	return {
		workspace,
		name,
		lotFolder,
		branch,
		worktree,
		tip,
		repository: { ...lot.repository, worktree, branch, tip },
	}
}

/**
 * A store lot `name` started on `lot` (`lot start --on`): its branch cut from the lot's branch tip, one commit of its
 * own, its `stack.json` naming the lot, its worktree's `.dialecte/lot` link to its folder (its tdd base reads it).
 */
export function addStackedLot(params: {
	lot: LandingLot
	name: string
	branch: string
}): LandingLot {
	const child = addLandingLot({ ...params, from: params.lot.branch })
	writeStack({
		lotFolder: child.lotFolder,
		record: { schema: STACK_SCHEMA, parent: params.lot.name },
	})
	addOwnDeclaration(child)
	return child
}

/** The lot's worktree removed by git (`--force`), its branch left: as an earlier close or a person left it. */
export function removeLotWorktree(lot: LandingLot): void {
	git({ root: lot.workspace.repository, args: ['worktree', 'remove', '--force', lot.worktree] })
}

/** The lot's worktree removed and its branch deleted, as an old hand-over's clean-up left them. */
export function removeBranchAndWorktree(lot: LandingLot): void {
	removeLotWorktree(lot)
	git({ root: lot.workspace.repository, args: ['branch', '-D', lot.branch] })
}

/** A hand-over committed for the lot's worktree and branch, outside the store, then closed (the 0022 shape): its name. */
export function closedHandoverOf(lot: LandingLot): string {
	const handover = registerCommittedHandover(lot)
	recordHandoverClosed({
		store: handoverStoreOf(lot.workspace.repository),
		name: handover,
		at: LANDING_NOW,
	})
	return handover
}

/** A `card` line of the hand-over (`lot: null`) on the lot's branch at `head`, `offset` ms after the lot's creation. */
export function writeHandoverCard(params: {
	lot: LandingLot
	handover: string
	head: string
	offset: number
}): void {
	const { lot } = params
	const created = Date.parse(readIdentity({ lotFolder: lot.lotFolder })?.created ?? '')
	writeCard({
		file: cardsLogOf(lot),
		line: {
			at: new Date(created + params.offset).toISOString(),
			lot: null,
			name: params.handover,
			state: 'committed',
			feature: null,
			repository: lot.workspace.repository,
			branch: lot.branch,
			head: params.head,
			base: 'main',
			card: null,
			usage: null,
			records: null,
			by: 'handover-run',
		},
	})
}

/** The lot stopped as `lot stop` stops it: canceled, its reason `dropped`. */
export function cancelLot(lot: LandingLot): void {
	const stopped = runLot({
		cwd: lot.workspace.repository,
		argv: ['stop', lot.name, '--reason', 'dropped'],
	})
	if (stopped.exitCode !== 0) throw new Error(stopped.output)
}

/** The `cards.log` beside the lot's repository's hand-over registry. */
export function cardsLogOf(lot: LandingLot): string {
	return join(handoverStoreOf(lot.workspace.repository), CARDS_LOG_FILE)
}

/**
 * A hand-over committed for the lot's worktree and branch, registered in a folder of its own outside the lot folder
 * (the lot committed through a hand-over, no landing of its own), its hook record at the worktree's HEAD: its name.
 */
export function registerCommittedHandover(lot: LandingLot): string {
	const folder = realpathSync(temporaryFolder('dialecte-handover-'))
	const name = registerHandover({
		root: lot.worktree,
		folder,
		branch: lot.branch,
		now: LANDING_NOW,
	})
	recordHandoverState({
		store: handoverStoreOf(lot.workspace.repository),
		folder,
		state: 'committed',
	})
	writeHookRecordAtHead(lot.worktree)
	return name
}

/** The lot's landing record: pull request `number` pushed at the lot's first tip, as `lot land` writes it. */
export function writeLandingRecord(params: { lot: LandingLot; number: number }): void {
	const { lot } = params
	writeFileSync(
		join(lot.lotFolder, 'landing.json'),
		`${JSON.stringify({
			schema: 1,
			number: params.number,
			url: `https://host.test/pull/${params.number}`,
			branch: lot.branch,
			head: lot.tip,
			at: LANDING_NOW.toISOString(),
		})}\n`,
	)
}

/**
 * The lot's folder registered as its own hand-over entry, `state` (`committed` when left out), closed by an earlier
 * close when `closed` (as an older cli closed a landed lot without writing its landed fact): the entry's name.
 */
export function registerLotEntry(params: {
	lot: LandingLot
	state?: 'committed' | 'pending'
	closed?: boolean
}): string {
	const { lot } = params
	const name = registerHandover({
		root: lot.worktree,
		folder: lot.lotFolder,
		branch: lot.branch,
		now: LANDING_NOW,
	})
	const store = handoverStoreOf(lot.workspace.repository)
	if (params.state !== 'pending')
		recordHandoverState({ store, folder: lot.lotFolder, state: 'committed' })
	if (params.closed === true) recordHandoverClosed({ store, name, at: LANDING_NOW })
	return name
}

/** The lot's own declaration in its worktree: `.dialecte/lot.json` and the `.dialecte/lot` link to its folder. */
export function addOwnDeclaration(lot: LandingLot): void {
	const folder = join(lot.worktree, '.dialecte')
	mkdirSync(folder, { recursive: true })
	writeFileSync(join(folder, 'lot.json'), OWN_DECLARATION)
	symlinkSync(lot.lotFolder, join(folder, 'lot'))
}

/** A review throwaway of the lot (`<lot worktree>-round-<round>` on `<lot branch>-round-<round>`, at the lot's tip). */
export function addRoundOf(params: { lot: LandingLot; round: number }): string {
	const { lot } = params
	const path = `${lot.worktree}-round-${params.round}`
	git({
		root: lot.workspace.repository,
		args: ['worktree', 'add', '-q', '-b', `${lot.branch}-round-${params.round}`, path, lot.branch],
	})
	return realpathSync(path)
}

/** A commit of the lot's worktree after its landing (`src/after.ts`): work its base does not hold. */
export function commitAfterLanding(params: { lot: LandingLot; file: string }): string {
	return commitIn({
		root: params.lot.worktree,
		files: { [params.file]: 'export const after = 1\n' },
		message: 'feat(x): after the landing',
	})
}

/** The arguments of `runLotClose` for `names` from the main checkout, `--json`, the removals recorded, the host given. */
export function closeArgumentsOf(params: {
	lot: LandingLot
	names: string[]
	host: HostAdapter
}): Parameters<typeof runLotClose>[0] {
	const { spawner } = createRecordingSpawner()
	return {
		cwd: params.lot.workspace.repository,
		argv: [...params.names, '--json'],
		now: LANDING_NOW,
		spawner,
		listProcesses: function none() {
			return []
		},
		scratchRoots: [],
		host: params.host,
	}
}

/**
 * Each outcome of `lot close --json`: closed, or kept with why; the landing line when one was read. A refusal of the
 * whole close (no JSON) reads as one kept outcome naming it.
 */
export function closeOutcomesOf(
	result: CommandResult,
): { closed: boolean; already?: true; kept?: string; landed?: string }[] {
	if (!result.output.trimStart().startsWith('[')) return [{ closed: false, kept: result.output }]
	const outcomes = JSON.parse(result.output) as {
		closed?: true
		already?: true
		kept?: string
		landed?: string
	}[]
	return outcomes.map((outcome) => ({
		closed: outcome.closed === true,
		...(outcome.already === true && { already: true as const }),
		...(outcome.kept !== undefined && { kept: outcome.kept }),
		...(outcome.landed !== undefined && { landed: outcome.landed }),
	}))
}

/** The arguments of `runWorktreePrune --json` over the lot's workspace (the plan only, nothing removed). */
export function pruneArgumentsOf(lot: LandingLot): Parameters<typeof runWorktreePrune>[0] {
	return {
		argv: ['--root', lot.workspace.workspace, '--json'],
		cwd: lot.workspace.workspace,
		scratchRoot: temporaryFolder('dialecte-scratch-root-'),
		isTerminal: false,
		confirm: async function never() {
			return false
		},
	}
}

/** The worktrees of a prune plan, by folder name: the keep reason, or `removable`. */
export async function pruneFatesOf(
	planned: Promise<CommandResult>,
): Promise<Record<string, string>> {
	const result = await planned
	const plan = JSON.parse(result.output) as {
		repositories: { items: { kind: string; name: string; kept?: string }[] }[]
	}
	return Object.fromEntries(
		plan.repositories
			.flatMap((repository) => repository.items)
			.filter((item) => item.kind === 'worktree')
			.map((item) => [basename(item.name), item.kept ?? REMOVABLE]),
	)
}

/** The commit the lot's worktree HEAD names. */
export function lotHeadOf(lot: LandingLot): string {
	return headOf(lot.worktree)
}

/** The declaration archived in the lot's folder (`lot.json`); undefined when none is. */
export function archivedDeclarationOf(lot: LandingLot): string | undefined {
	const path = join(lot.lotFolder, 'lot.json')
	return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

/** The lot's landed fact written as a verb that acts writes it: landed on main at `tip`, by ancestry. */
export function writeLandedFact(params: { lot: LandingLot; tip: string }): void {
	writeLanded({
		lotFolder: params.lot.lotFolder,
		fact: {
			schema: LANDED_SCHEMA,
			how: 'ancestor',
			tip: params.tip,
			base: 'main',
			at: LANDING_NOW.toISOString(),
		},
	})
}

/** The main checkout's package.json naming a base branch that exists nowhere: no base branch resolves. */
export function configureMissingBase(lot: LandingLot): void {
	writeFileSync(
		join(lot.workspace.repository, 'package.json'),
		`${JSON.stringify({ name: 'scratch', dialecte: { baseBranch: MISSING_BASE_BRANCH } })}\n`,
	)
}

/** The state of the registry entry registering the lot's folder; undefined when none does. */
export function lotEntryStateOf(lot: LandingLot): string | undefined {
	return registeredEntryOf({
		store: handoverStoreOf(lot.workspace.repository),
		folder: lot.lotFolder,
	})?.state
}

/** The commit the lot's branch names; undefined once the branch is gone. */
export function lotBranchTipOf(lot: LandingLot): string | undefined {
	const read = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${lot.branch}`], {
		cwd: lot.workspace.repository,
		encoding: 'utf8',
	})
	return read.status === 0 ? read.stdout.trim() : undefined
}
