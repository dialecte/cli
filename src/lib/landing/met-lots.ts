/**
 * The lots a scope meets that merged on the host but were never closed, settled for the verbs that already write
 * (`lot start`, `lot scope`; FIX-start-settles-landed, design section 2.1): a pushed lot read merged, offline first and
 * by the host only when offline is not decisive, gets its landed fact and no longer holds its scope. A lot with work
 * since the landing, or uncommitted changes in its worktree, keeps holding; so does every lot not read merged.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { tryReadGit } from '../git.ts'
import { readLanding } from '../handover/land-record.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { jsonOf, textOf } from '../print/print.ts'
import { readIdentity } from '../store/identity.ts'
import { workSinceLanding } from './lost-work.ts'
import { isPushed, readLotLanding, recordLandedOrWhy } from './lot-landing.ts'
import { MET_LOT_LINES } from './met-lots.constants.ts'

import type { CommandResult } from '../command-result.types.ts'
import type { HostAdapter } from '../host/host.types.ts'
import type { PrintedText } from '../print/print.types.ts'
import type { LotOverlap } from '../store/store.types.ts'
import type { LotLanding } from './lot-landing.types.ts'
import type { LandedMetLot, LazyHost, MetLotsSettled } from './met-lots.types.ts'

// dialecte-allow duplicate-read: chooses the met lots and reads them offline first; settleLotLanding settles one lot for close and prune with the host given
/**
 * The met lots of `store` that landed (`met`, from `overlappingOpenLots`), their landed facts written when `write`;
 * a damaged lot is never read (it holds until a person moves it aside).
 *
 * @intent let a merged lot stop holding at the next verb that meets it
 * @internal
 */
export function settleMetLots(params: {
	store: string
	met: readonly LotOverlap[]
	host: LazyHost
	now: Date
	write: boolean
}): MetLotsSettled {
	const settled = params.met
		.filter((overlap) => overlap.damage === undefined)
		.map(function settleOne(overlap) {
			return settleMetLot({ ...params, lotFolder: join(params.store, overlap.name) })
		})
	return {
		landed: settled.flatMap((one) => (one.landed === undefined ? [] : [one.landed])),
		warnings: settled.flatMap((one) => (one.warning === undefined ? [] : [one.warning])),
	}
}

/**
 * A pushed lot git alone reads merged, read only (no host, nothing written): its base and the tip that landed;
 * undefined for a lot not pushed, not read merged offline, or whose records do not read. Every forecast skips it.
 *
 * @intent let a forecast leave out a lot that merged but was never closed
 * @internal
 */
export function mergedOfflineOf(params: {
	lotFolder: string
}): { name: string; base: string; tip: string } | undefined {
	// a lot never pushed costs no landing read
	if (!isPushedLot(params)) return undefined
	const landing = readLotLanding({ lotFolder: params.lotFolder })
	if ('refusal' in landing || landing.state.kind !== 'merged') return undefined
	const { state } = landing
	const values = { lot: landing.lot, base: landing.base.branch, tip: state.tip }
	// work since the landing keeps it holding, as lot start reads it: it is compared
	if (heldWorkOf({ landing, tip: state.tip, values }) !== undefined) return undefined
	return { name: landing.lot, base: landing.base.branch, tip: state.tip }
}

/**
 * The host a settle asks, made on the first call and kept: `given` when a verb was handed one, else the repository's.
 *
 * @intent ask the host at most once per verb, and only when a met lot needs it
 * @internal
 */
export function lazyHostOf(params: {
	given: HostAdapter | undefined
	make: () => HostAdapter
}): LazyHost {
	let made: HostAdapter | undefined = params.given
	return function hostOnce(): HostAdapter {
		made ??= params.make()
		return made
	}
}

/**
 * The overlaps the settle leaves standing: every met lot but those that landed.
 *
 * @intent drop the settled lots from what a scope meets
 * @internal
 */
export function unsettledOf(params: {
	met: readonly LotOverlap[]
	settle: MetLotsSettled | undefined
}): LotOverlap[] {
	const landed = new Set(params.settle?.landed.map((lot) => lot.name))
	return params.met.filter((overlap) => !landed.has(overlap.name))
}

/** Whether the lot in `lotFolder` was pushed: its landing names a change request, or origin holds its branch. */
function isPushedLot(params: { lotFolder: string }): boolean {
	const identity = readIdentity({ lotFolder: params.lotFolder })
	if (identity === undefined) return false
	return isPushed({
		root: identity.repository,
		branch: identity.branch,
		changeRequestNumber: readLanding({ lotFolder: params.lotFolder })?.number,
	})
}

// dialecte-allow duplicate-read: the settled and would-settle lines of a start or a scope, not the landed line of close, prune or the hook
/** The lines of the landed met lots: settled, or would settle for a read only. */
export function landedMetLinesOf(landed: readonly LandedMetLot[]): string[] {
	return landed.map(function lineOf(lot) {
		return fillMessage({
			template: lot.written ? MET_LOT_LINES.settled : MET_LOT_LINES.wouldSettle,
			values: {
				lot: lot.name,
				base: lot.base,
				tip: lot.tip.slice(0, SHORT_SHA_LENGTH),
				how: lot.how,
			},
		})
	})
}

/**
 * `result` with what the settle found named first: the settled (or would settle) lines and the warnings, `! ` before
 * each; under `--json`, its object gains `settled` and `settleWarnings`. Unchanged when nothing landed or warned.
 *
 * @intent show the lots a verb settled on every exit it takes
 * @internal
 */
export function withSettledLines(params: {
	result: CommandResult
	settle: MetLotsSettled | undefined
	json: boolean
}): CommandResult {
	const { result, settle } = params
	if (settle === undefined || (settle.landed.length === 0 && settle.warnings.length === 0))
		return result
	if (params.json) return withSettledJson({ result, settle })
	const lines = [
		...landedMetLinesOf(settle.landed),
		...settle.warnings.map((warning) => `! ${warning}`),
	]
	// the result's text is printed already: the settle's lines are printed and joined before it
	return { ...result, output: `${textOf(lines)}\n${result.output}` as PrintedText }
}

/** The JSON object of `result` with `settled` and `settleWarnings`; `result` as it is when it holds no object. */
function withSettledJson(params: { result: CommandResult; settle: MetLotsSettled }): CommandResult {
	const { result, settle } = params
	let value: unknown
	try {
		value = JSON.parse(result.output)
	} catch {
		return result
	}
	// every --json exit a settle reaches prints one object; any other output is left as it is
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return result
	return {
		...result,
		output: jsonOf(
			{
				...value,
				settled: settle.landed.map((lot) => ({
					lot: lot.name,
					base: lot.base,
					tip: lot.tip,
					how: lot.how,
					written: lot.written,
				})),
				...(settle.warnings.length > 0 && { settleWarnings: settle.warnings }),
			},
			2,
		),
	}
}

// dialecte-allow duplicate-read: the host asked only when git cannot tell, a pushed lot only, and work since the landing keeps the hold; settleLotLanding asks the host it is given
/** One met lot: landed, or why a merged lot still holds; nothing for a lot not pushed or not read merged. */
function settleMetLot(params: { lotFolder: string; host: LazyHost; now: Date; write: boolean }): {
	landed?: LandedMetLot
	warning?: string
} {
	const { lotFolder } = params
	if (!isPushedLot({ lotFolder })) return {}
	const offline = readLotLanding({ lotFolder })
	if ('refusal' in offline) return {}
	// git cannot tell (origin stale, a squash main edited again): only the host can
	const undecided = offline.state.kind === 'unlanded' && offline.state.proof === 'offline-unproven'
	const landing = undecided ? readLotLanding({ lotFolder, host: params.host() }) : offline
	if ('refusal' in landing || landing.state.kind !== 'merged') return {}
	const { state } = landing
	const values = {
		lot: landing.lot,
		base: landing.base.branch,
		tip: state.tip.slice(0, SHORT_SHA_LENGTH),
	}
	const held = heldWorkOf({ landing, tip: state.tip, values })
	if (held !== undefined) return { warning: held }
	const landed = { name: landing.lot, base: landing.base.branch, tip: state.tip, how: state.how }
	if (!params.write) return { landed: { ...landed, written: false } }
	const written = recordLandedOrWhy({ landing, now: params.now })
	if (typeof written === 'string')
		return {
			warning: fillMessage({
				template: MET_LOT_LINES.notWritten,
				values: { ...values, why: written },
			}),
		}
	return { landed: { ...landed, written: true } }
}

/** Why a merged lot still holds: commits on its branch after the landed tip, or uncommitted changes in its worktree. */
function heldWorkOf(params: {
	landing: LotLanding
	tip: string
	values: Record<string, string>
}): string | undefined {
	const { landing } = params
	const since = workSinceLanding({
		root: landing.root,
		branch: landing.identity.branch,
		cut: landing.identity.base.commit,
		landedTip: params.tip,
	})
	if (since.length > 0)
		return fillMessage({
			template: MET_LOT_LINES.workSince,
			values: { ...params.values, count: String(since.length) },
		})
	const { worktree } = landing.identity
	if (worktree === null || !existsSync(worktree)) return undefined
	const status = tryReadGit({
		root: worktree,
		args: ['status', '--porcelain', '--untracked-files=no'],
	})
	// a worktree git cannot read is not known clean: it keeps the hold
	if (status === undefined || status.trim() !== '')
		return fillMessage({ template: MET_LOT_LINES.uncommitted, values: params.values })
	return undefined
}
