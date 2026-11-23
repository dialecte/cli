/**
 * A store lot's landing (FIX-ci-loop design, sections 1 and 2): what the lot verbs that act (land, close, prune) and
 * `lot status` read of a lot through the one landing state reader, and the landed fact the acting verbs write once.
 * Reading never writes: only `recordLanded` writes `landed.json`, and only its callers that act call it.
 */
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { finalCardWhere } from '../events/cards-log.ts'
import { realPathOf } from '../file-system.ts'
import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { ORIGIN_BRANCH_REF_PREFIX } from '../gate/gate-base.constants.ts'
import { findBaseBranchRef } from '../gate/gate-base.ts'
import { readCommitOrNone, readGit, tryReadGit } from '../git.ts'
import { readLanding } from '../handover/land-record.ts'
import { GENERIC_NOUNS } from '../host/host.constants.ts'
import { hostNounsOf } from '../host/select-host.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { readPackageJson } from '../package-json.ts'
import { readIdentity } from '../store/identity.ts'
import {
	commonFolderOfLotFolder,
	readCheckedLotState,
	registryOfLotFolder,
} from '../store/lot-records.ts'
import { lotState } from '../store/lot-state.ts'
import { STACK_CHANGE_REQUEST_STATES, STACK_TEXT } from '../store/stack.constants.ts'
import { changeRequestStateOf, readStack, stackLineText, stackTextOf } from '../store/stack.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { isContainedIn } from './contained.ts'
import { LANDED_SCHEMA } from './landed-record.constants.ts'
import { readLanded, writeLanded } from './landed-record.ts'
import { readLandingState } from './landing-state.ts'
import { workSinceLanding, workSinceLandingText } from './lost-work.ts'
import {
	HOST_SILENT_TEXT,
	LANDED_HOST_UNNUMBERED_LINE,
	LANDED_LINES,
	LOT_LANDING_REFUSALS,
	NOT_LANDED_TEXTS,
	NOT_PROVABLE_OFFLINE,
	SETTLE_NOT_A_LOT,
	STACK_UNREADABLE,
} from './lot-landing.constants.ts'

import type { HostAdapter, HostNouns } from '../host/host.types.ts'
import type { LotIdentity } from '../store/store.types.ts'
import type { LandedFact } from './landed-record.types.ts'
import type { LotLanding, RecordedTips, SettledLot, StatusLanding } from './lot-landing.types.ts'

/**
 * The landing of the store lot in `lotFolder`: from its landed fact when its folder holds one (no git, no host), else
 * the landing state git reads now, with `host` asked whenever it is given (a verb that acts: a change request opened by
 * hand, its branch deleted on origin after the merge, is still found), or only for a lot that was pushed when
 * `onlyPushed` (a verb that displays: a change request recorded, or its branch on origin); refused when its identity or
 * its base branch does not read.
 *
 * @intent read whether a store lot landed, once, for every verb
 * @internal
 */
export function readLotLanding(params: {
	lotFolder: string
	/** The repository its refs are read in; the store's own repository when left out. */
	root?: string
	host?: HostAdapter
	/** The host asked only for a lot that was pushed: `lot status`'s stack line never runs it for an unpushed parent. */
	onlyPushed?: boolean
	/** Where a stale lot's tip is read when its branch ref and worktree are both gone; none: never. */
	recorded?: RecordedTips
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
	// only a proof says merged: the landed fact above, else git (ancestor, tree) or the host. A registry `committed`
	// is no proof: a hand-over run commits on the lot's own branch, nothing pushed nor on the base
	const changeRequestNumber = readLanding({ lotFolder })?.number
	const asked =
		params.onlyPushed !== true || isPushed({ root, branch: identity.branch, changeRequestNumber })
	const recordedTip =
		params.recorded === undefined
			? undefined
			: recordedTipOf({ root, identity, lot, recorded: params.recorded })
	const state = readLandingState({
		root,
		branch: identity.branch,
		...(recordedTip !== undefined && { tip: recordedTip }),
		baseRef: base.ref,
		cut: identity.base.commit,
		since: identity.created,
		changeRequestNumber,
		...(asked && params.host !== undefined && { host: params.host }),
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
		...(state.changeRequest !== undefined && {
			changeRequest: { number: state.changeRequest.number, url: state.changeRequest.url },
		}),
		at: params.now.toISOString(),
	}
	writeLanded({ lotFolder: landing.lotFolder, fact })
	return fact
}

/**
 * The line that names a landed lot: its base, the tip that landed and what proved it; a host landing whose fact names
 * no change request (written before the key) says so without a number.
 *
 * @intent say how a lot was read merged
 * @internal
 */
export function landedLineOf(params: { fact: LandedFact; nouns: HostNouns }): string {
	const { fact } = params
	const { changeRequest } = fact
	const values = { ...params.nouns, base: fact.base, commit: fact.tip.slice(0, SHORT_SHA_LENGTH) }
	if (changeRequest === undefined)
		return fillMessage({
			template: fact.how === 'host' ? LANDED_HOST_UNNUMBERED_LINE : LANDED_LINES[fact.how],
			values,
		})
	return fillMessage({
		template: LANDED_LINES[fact.how],
		values: { ...values, number: String(changeRequest.number) },
	})
}

/**
 * Why a lot is not landed, as `lot close` keeps it: its work not in the base (with the host's silence when it could
 * not say), its change request closed, nothing of its own, or a landing that cannot be read.
 *
 * @intent say why a lot does not close
 * @internal
 */
export function notLandedTextOf(landing: LotLanding): string {
	const { state } = landing
	const nouns = hostNounsOf({ root: landing.root })
	const base = landing.base.branch
	if (state.kind === 'closed')
		return fillMessage({
			template: NOT_LANDED_TEXTS.closed,
			values: { ...nouns, number: String(state.changeRequest.number) },
		})
	if (state.kind === 'empty') return NOT_LANDED_TEXTS.empty
	if (state.kind === 'unknown')
		return fillMessage({ template: NOT_LANDED_TEXTS.unknown, values: { reason: state.reason } })
	const since = workSinceLandingOf(landing)
	const unlanded =
		since === undefined
			? fillMessage({ template: NOT_LANDED_TEXTS.unlanded, values: { base } })
			: workSinceLandingText(since)
	if (state.kind !== 'unlanded' || state.hostRefusal === undefined) return unlanded
	return `${unlanded}; ${fillMessage({ template: HOST_SILENT_TEXT, values: { ...nouns, reason: state.hostRefusal } })}`
}

/**
 * The work a lot holds since part of it landed (`workSinceLanding`): the commits of its branch beyond the newest one
 * whose work the base contains (a squash, then commits after it); undefined when none of its work is proven landed, or
 * nothing is left.
 */
function workSinceLandingOf(landing: LotLanding): string[] | undefined {
	const { root, identity, base } = landing
	const branchRef = `refs/heads/${identity.branch}`
	if (readCommitOrNone({ root, ref: branchRef }) === undefined) return undefined
	const beyond = readGit({ root, args: ['rev-list', branchRef, '--not', base.ref] })
		.split('\n')
		.filter(Boolean)
	const landedTip = beyond.find((commit) => isContainedIn({ root, baseRef: base.ref, commit }))
	if (landedTip === undefined) return undefined
	const since = workSinceLanding({
		root,
		branch: identity.branch,
		cut: identity.base.commit,
		landedTip,
	})
	return since.length === 0 ? undefined : since
}

/**
 * What `lot status` reads beyond files, built by its caller: the merged tip git alone reads for a lot (never written,
 * never the host), and the stack line of a stacked lot, its parent read through the one lot reader with `host`.
 *
 * @intent hand lot status its landing reads without making it start a process
 * @internal
 */
export function statusLandingOf(host: HostAdapter): StatusLanding {
	return {
		mergedTipOf: function mergedTipOf(params: { lotFolder: string }): string | undefined {
			const landing = readLotLanding({ lotFolder: params.lotFolder })
			return 'state' in landing && landing.state.kind === 'merged' ? landing.state.tip : undefined
		},
		stackLineOf: function stackLineOf(params: { lotFolder: string }): string | undefined {
			return stackLineFor({ lotFolder: params.lotFolder, host })
		},
	}
}

/**
 * The stack line of the lot in `lotFolder`: its parent (`stack.json`) read through `readLotLanding` with the host, its
 * change request (the one its landing state names, else its landing.json's) and that change request's state: merged once
 * the parent's landing is proven merged, else closed, queued, draft or open, or why the host cannot say. Undefined for
 * a lot not stacked.
 */
function stackLineFor(params: { lotFolder: string; host: HostAdapter }): string | undefined {
	const record = readStack({ lotFolder: params.lotFolder })
	if (record === undefined) return undefined
	if ('damage' in record) return stackTextOf({ lotFolder: params.lotFolder, nouns: GENERIC_NOUNS })
	const { parent } = record
	const parentFolder = join(dirname(params.lotFolder), parent)
	const number = readLanding({ lotFolder: parentFolder })?.number
	const landing = readLotLanding({ lotFolder: parentFolder, host: params.host, onlyPushed: true })
	if ('refusal' in landing)
		return stackLineText({
			parent,
			number,
			nouns: GENERIC_NOUNS,
			state: fillMessage({ template: STACK_UNREADABLE, values: { reason: landing.refusal } }),
		})
	const { state } = landing
	const nouns = hostNounsOf({ root: landing.root })
	const changeRequest = 'changeRequest' in state ? state.changeRequest : undefined
	const shown = changeRequest?.number ?? number
	if (state.kind === 'merged')
		return stackLineText({
			parent,
			number: shown,
			nouns,
			state: STACK_CHANGE_REQUEST_STATES.merged,
		})
	if (changeRequest !== undefined)
		return stackLineText({
			parent,
			number: shown,
			nouns,
			state: changeRequestStateOf(changeRequest),
		})
	if (state.kind === 'unlanded' && state.hostRefusal !== undefined)
		return stackLineText({
			parent,
			number: shown,
			nouns,
			state: fillMessage({
				template: STACK_TEXT.hostSilent,
				values: { reason: state.hostRefusal },
			}),
		})
	return stackLineText({ parent, number: shown, nouns, state: undefined })
}

/** The lot was pushed: its landing recorded a change request, or origin holds its branch. */
export function isPushed(params: {
	root: string
	branch: string
	changeRequestNumber: number | undefined
}): boolean {
	return (
		params.changeRequestNumber !== undefined ||
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

/**
 * One store lot's landing settled for a verb that closes or prunes: its landed fact when its folder holds one (no git,
 * no host), canceled without reading it, else read with `host` when given and its landed fact recorded once merged;
 * a committed lot not merged says why, an open one its state.
 *
 * @intent settle a lot's landing once, the same way for lot close and lot prune
 * @internal
 */
export function settleLotLanding(params: {
	lotFolder: string
	host?: HostAdapter
	now: Date
	/** Where a stale lot's tip is read (`readLotLanding`); none: its branch ref only. */
	recorded?: RecordedTips
}): SettledLot {
	const { lotFolder } = params
	// a folder holding no lot record is no lot: never read as a damaged one
	if (
		![STORE_FILES.identity, STORE_FILES.transitions].some((name) =>
			existsSync(join(lotFolder, name)),
		)
	)
		return { notRead: SETTLE_NOT_A_LOT }
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	if (checked === undefined) return { notRead: SETTLE_NOT_A_LOT }
	if ('damage' in checked) return { notRead: checked.damage }
	const fact = readLanded({ lotFolder })
	if (fact !== undefined && 'tip' in fact) return { landed: fact }
	const { state } = lotState(checked.input)
	// nothing of a canceled lot lands: its landing is not read (its branch is decided by the commits it would lose)
	if (state === 'canceled') return { canceled: true }
	const landing = readLotLanding({
		lotFolder,
		...(params.host !== undefined && { host: params.host }),
		...(params.recorded !== undefined && { recorded: params.recorded }),
	})
	if ('refusal' in landing) return { notRead: landing.refusal }
	const landed = recordLandedOrWhy({ landing, now: params.now })
	if (typeof landed === 'string') return { notRead: landed }
	if (landed !== undefined) return { landed }
	const why = notLandedOf({ landing, asked: params.host !== undefined })
	return state === 'committed' ? { notLanded: why } : { open: state, why }
}

/**
 * The lot's landed fact recorded once merged (`recordLanded`); undefined while not merged; why, when the fact cannot be
 * written (a fact not kept decides nothing: no verb acts on it).
 */
export function recordLandedOrWhy(params: {
	landing: LotLanding
	now: Date
}): LandedFact | string | undefined {
	try {
		return recordLanded(params)
	} catch (error) {
		return (error as Error).message.trim()
	}
}

/**
 * Why a committed lot is not landed: without a host, a pushed lot's landing is not provable offline (a squash main
 * edited again reads unlanded to git); else the text `lot close` keeps it with, the host's silence included.
 */
function notLandedOf(params: { landing: LotLanding; asked: boolean }): string {
	const { landing } = params
	const pushed = isPushed({
		root: landing.root,
		branch: landing.identity.branch,
		changeRequestNumber: readLanding({ lotFolder: landing.lotFolder })?.number,
	})
	return !params.asked && pushed && landing.state.kind === 'unlanded'
		? fillMessage({ template: NOT_PROVABLE_OFFLINE, values: { lot: landing.lot } })
		: notLandedTextOf(landing)
}

/**
 * A stale lot's tip from its final record, only when its branch ref is gone, its worktree is gone, and
 * the card was written at or after the lot's creation: the head of its latest `card` line whose `lot` is the lot, else
 * of a hand-over outside the store (`lot: null`) on its branch whose registry entry names the lot's worktree and index.
 * Undefined otherwise: the landing then reads its branch ref, as for any lot.
 */
function recordedTipOf(params: {
	root: string
	identity: LotIdentity
	lot: string
	recorded: RecordedTips
}): string | undefined {
	const { identity, lot, recorded } = params
	if (readCommitOrNone({ root: params.root, ref: `refs/heads/${identity.branch}` }) !== undefined)
		return undefined
	if (typeof identity.worktree === 'string' && existsSync(identity.worktree)) return undefined
	const worktree = typeof identity.worktree === 'string' ? realPathOf(identity.worktree) : undefined
	const created = Date.parse(identity.created)
	const final = finalCardWhere({
		cards: recorded.cards,
		selects: function isTheLots(card) {
			if (card.head === null || !(Date.parse(card.at) >= created)) return false
			if (card.lot === lot) return true
			if (card.lot !== null || card.branch !== identity.branch || worktree === undefined)
				return false
			return recorded.entries.some(
				(entry) =>
					entry.name === card.name &&
					realPathOf(entry.worktree) === worktree &&
					entry.index === identity.index,
			)
		},
	})
	return final?.head ?? undefined
}
