/**
 * A store lot's landing (FIX-ci-loop design, sections 1 and 2): what the lot verbs that act (land, close, prune) and
 * `lot status` read of a lot through the one landing state reader, and the landed fact the acting verbs write once.
 * Reading never writes: only `recordLanded` writes `landed.json`, and only its callers that act call it.
 */
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { ORIGIN_BRANCH_REF_PREFIX } from '../gate/gate-base.constants.ts'
import { findBaseBranchRef } from '../gate/gate-base.ts'
import { readCommitOrNone, readGit, tryReadGit } from '../git.ts'
import { readLanding } from '../handover/land-record.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { readPackageJson } from '../package-json.ts'
import { readIdentity } from '../store/identity.ts'
import {
	commonFolderOfLotFolder,
	readCheckedLotState,
	registryOfLotFolder,
} from '../store/lot-records.ts'
import { lotState } from '../store/lot-state.ts'
import { listLotFolderNames, locateStore } from '../store/store-folder.ts'
import { LANDED_SCHEMA } from './landed-record.constants.ts'
import { readLanded, writeLanded } from './landed-record.ts'
import { readLandingState } from './landing-state.ts'
import {
	HOST_SILENT_TEXT,
	LANDED_LINES,
	LOT_LANDING_REFUSALS,
	NOT_LANDED_TEXTS,
	NOT_PROVABLE_OFFLINE,
} from './lot-landing.constants.ts'
import { unlandedWork, unlandedWorkText } from './unlanded-work.ts'

import type { HostAdapter } from '../host/host.types.ts'
import type { LandedFact } from './landed-record.types.ts'
import type { LotLanding, PruneLotLanding, StatusLanding } from './lot-landing.types.ts'

/**
 * The landing of the store lot in `lotFolder`: from its landed fact when its folder holds one (no git, no host), else
 * the landing state git reads now, with `host` asked only for a lot that was pushed (a pull request recorded, or its
 * branch on origin: a lot never pushed has no pull request); refused when its identity or its base branch does not
 * read.
 *
 * @intent read whether a store lot landed, once, for every verb
 * @internal
 */
export function readLotLanding(params: {
	lotFolder: string
	/** The repository its refs are read in; the store's own repository when left out. */
	root?: string
	host?: HostAdapter
}): LotLanding | { refusal: string } {
	const { lotFolder } = params
	const lot = basename(lotFolder)
	const identity = readIdentity({ lotFolder })
	if (identity === undefined)
		return { refusal: fillMessage({ template: LOT_LANDING_REFUSALS.noIdentity, values: { lot } }) }
	const root = params.root ?? repositoryOfLotFolder(lotFolder)
	const base = findBaseBranchRef({ root, packageJson: readPackageJson(root) })
	if ('refusal' in base)
		return {
			refusal: fillMessage({
				template: LOT_LANDING_REFUSALS.noBase,
				values: { reason: base.refusal },
			}),
		}
	const recorded = readLanded({ lotFolder })
	if (recorded !== undefined && 'tip' in recorded)
		return {
			lot,
			lotFolder,
			identity,
			root,
			base,
			recorded,
			state: { kind: 'merged', how: recorded.how, tip: recorded.tip },
		}
	const landing = readLanding({ lotFolder })
	const pullNumber = landing?.number
	// a lot its records read committed (a hand-over committed, a landing confirmed before landed.json existed) landed
	const committedTip = isCommittedLot({ lotFolder })
		? (landing?.head ?? readCommitOrNone({ root, ref: `refs/heads/${identity.branch}` }))
		: undefined
	if (committedTip !== undefined)
		return {
			lot,
			lotFolder,
			identity,
			root,
			base,
			state: {
				kind: 'merged',
				how: landing === undefined ? 'ancestor' : 'host',
				tip: committedTip,
			},
		}
	const pushed = isPushed({ root, branch: identity.branch, pullNumber })
	const state = readLandingState({
		root,
		branch: identity.branch,
		baseRef: base.ref,
		cut: identity.base.commit,
		pullNumber,
		...(pushed && params.host !== undefined && { host: params.host }),
	})
	return { lot, lotFolder, identity, root, base, state }
}

/**
 * The lot's landed fact written once its landing state is merged and its folder holds none (a merge is final); the fact
 * it holds then. Undefined while the lot is not merged.
 *
 * @intent record once that a lot merged, from the verbs that act
 * @internal
 */
export function recordLanded(params: { landing: LotLanding; now: Date }): LandedFact | undefined {
	const { landing } = params
	if (landing.recorded !== undefined) return landing.recorded
	const { state } = landing
	if (state.kind !== 'merged') return undefined
	const fact: LandedFact = {
		schema: LANDED_SCHEMA,
		how: state.how,
		tip: state.tip,
		base: landing.base.branch,
		...(state.pull !== undefined && { pull: { number: state.pull.number, url: state.pull.url } }),
		at: params.now.toISOString(),
	}
	writeLanded({ lotFolder: landing.lotFolder, fact })
	return fact
}

/**
 * The line that names a landed lot: its base, the tip that landed and what proved it.
 *
 * @intent say how a lot was read merged
 * @internal
 */
export function landedLineOf(fact: LandedFact): string {
	return fillMessage({
		template: LANDED_LINES[fact.how],
		values: {
			base: fact.base,
			commit: fact.tip.slice(0, SHORT_SHA_LENGTH),
			number: fact.pull === undefined ? '' : String(fact.pull.number),
		},
	})
}

/**
 * Why a lot is not landed, as `lot close` keeps it: its work not in the base (with the host's silence when it could
 * not say), its pull request closed, nothing of its own, or a landing that cannot be read.
 *
 * @intent say why a lot does not close
 * @internal
 */
export function notLandedTextOf(landing: LotLanding): string {
	const { state } = landing
	const base = landing.base.branch
	if (state.kind === 'closed')
		return fillMessage({
			template: NOT_LANDED_TEXTS.closed,
			values: { number: String(state.pull.number) },
		})
	if (state.kind === 'empty') return NOT_LANDED_TEXTS.empty
	if (state.kind === 'unknown')
		return fillMessage({ template: NOT_LANDED_TEXTS.unknown, values: { reason: state.reason } })
	const since = workSinceLandingOf(landing)
	const unlanded =
		since === undefined
			? fillMessage({ template: NOT_LANDED_TEXTS.unlanded, values: { base } })
			: unlandedWorkText({ commits: since, base })
	if (state.kind !== 'unlanded' || state.hostRefusal === undefined) return unlanded
	return `${unlanded}; ${fillMessage({ template: HOST_SILENT_TEXT, values: { reason: state.hostRefusal } })}`
}

/**
 * The work a lot holds since part of it landed: its unlanded commits (`unlandedWork`) when at least one commit of its
 * branch beyond the base is contained in the base (a squash, then commits after it); undefined when none of its work
 * is proven landed, or nothing is left.
 *
 * @intent name the commits made after a lot's landing
 * @internal
 */
export function workSinceLandingOf(landing: LotLanding): string[] | undefined {
	const { root, identity, base } = landing
	const branchRef = `refs/heads/${identity.branch}`
	if (readCommitOrNone({ root, ref: branchRef }) === undefined) return undefined
	const beyond = readGit({ root, args: ['rev-list', branchRef, '--not', base.ref] })
		.split('\n')
		.filter(Boolean)
	const unlanded = unlandedWork({
		root,
		branch: identity.branch,
		baseRef: base.ref,
		...(typeof identity.worktree === 'string' && { worktree: identity.worktree }),
	})
	if (unlanded.length === 0 || beyond.every((commit) => unlanded.includes(commit))) return undefined
	return unlanded
}

/**
 * What `lot status` reads beyond files, built by its caller: `host` for the stack line, and the merged tip git alone
 * reads for a lot (never written, never the host).
 *
 * @intent hand lot status its landing reads without making it start a process
 * @internal
 */
export function statusLandingOf(host: HostAdapter): StatusLanding {
	return {
		host,
		mergedTipOf: function mergedTipOf(params: { lotFolder: string }): string | undefined {
			const landing = readLotLanding({ lotFolder: params.lotFolder })
			return 'state' in landing && landing.state.kind === 'merged' ? landing.state.tip : undefined
		},
	}
}

/**
 * The lots of the store of `repository` that name a worktree, by its real path, as `worktree prune` reads them from git
 * alone (no host): a committed lot landed; an open lot merged gets its landed fact (prune acts) and landed; an open lot
 * not merged stays, with the work it holds since part of it landed, or, pushed (a pull request recorded or a branch on
 * origin), the line that sends the person to `lot close`, which asks the host.
 *
 * @intent let prune remove a squash-merged lot and say why it keeps the others
 * @internal
 */
export function settlePruneLandings(params: {
	repository: string
	now: Date
}): ReadonlyMap<string, PruneLotLanding> {
	const landings = new Map<string, PruneLotLanding>()
	const location = locateStore({ from: params.repository })
	if (location === undefined) return landings
	const { store, registry } = location
	for (const lot of listLotFolderNames({ store })) {
		const lotFolder = join(store, lot)
		const checked = readCheckedLotState({ lotFolder, registry })
		if (checked === undefined || 'damage' in checked) continue
		const { input } = checked
		const { worktree } = input.identity
		// a lot whose worktree is gone has nothing for prune to remove: its landing is not read
		if (typeof worktree !== 'string' || !existsSync(worktree)) continue
		const read = pruneLandingOf({ lot, lotFolder, root: params.repository, input, now: params.now })
		if (read !== undefined) landings.set(realPathOf(worktree), read)
	}
	return landings
}

/** One lot's landing as prune reads it; undefined when it cannot be read (its lot keep rule decides alone). */
function pruneLandingOf(params: {
	lot: string
	lotFolder: string
	root: string
	input: Parameters<typeof lotState>[0]
	now: Date
}): PruneLotLanding | undefined {
	const { lot, input } = params
	const { state } = lotState(input)
	if (state === 'committed') return { lot, landed: true, landedTip: input.landed?.tip }
	if (state === 'canceled') return { lot, landed: false }
	const landing = readLotLanding({ lotFolder: params.lotFolder, root: params.root })
	if ('refusal' in landing) return undefined
	const fact = recordLanded({ landing, now: params.now })
	if (fact !== undefined) return { lot, landed: true, landedTip: fact.tip }
	if (landing.state.kind !== 'unlanded') return { lot, landed: false }
	const since = workSinceLandingOf(landing)
	if (since !== undefined)
		return {
			lot,
			landed: false,
			reason: unlandedWorkText({ commits: since, base: landing.base.branch }),
		}
	const pushed = isPushed({
		root: params.root,
		branch: landing.identity.branch,
		pullNumber: readLanding({ lotFolder: params.lotFolder })?.number,
	})
	return pushed
		? {
				lot,
				landed: false,
				reason: fillMessage({ template: NOT_PROVABLE_OFFLINE, values: { lot } }),
			}
		: { lot, landed: false }
}

/** The lot's records read committed (its registry entry or its transitions), files only. */
function isCommittedLot(params: { lotFolder: string }): boolean {
	const checked = readCheckedLotState({
		lotFolder: params.lotFolder,
		registry: registryOfLotFolder(params.lotFolder),
	})
	return (
		checked !== undefined && 'input' in checked && lotState(checked.input).state === 'committed'
	)
}

/** The lot was pushed: its landing recorded a pull request, or origin holds its branch. */
function isPushed(params: {
	root: string
	branch: string
	pullNumber: number | undefined
}): boolean {
	return (
		params.pullNumber !== undefined ||
		readCommitOrNone({ root: params.root, ref: `${ORIGIN_BRANCH_REF_PREFIX}${params.branch}` }) !==
			undefined
	)
}

/** The repository whose store holds `lotFolder`: the main checkout above its common folder, else that folder. */
function repositoryOfLotFolder(lotFolder: string): string {
	const common = commonFolderOfLotFolder(lotFolder)
	if (basename(common) === '.git') return dirname(common)
	// a bare or unusual layout: git answers where the work tree is, else the common folder itself serves
	return tryReadGit({ root: common, args: ['rev-parse', '--show-toplevel'] })?.trim() || common
}
