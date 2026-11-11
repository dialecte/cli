/**
 * `dialecte lot stop <id> --reason <text> [--by <who>] [--json]` (33S section 7, steps 1-3): ends a lot, abandoning
 * its pending hand-over first. The one store command that writes outside the lot folder (33S section 2): the
 * abandon of `handover abandon`, and the move aside of a damaged lot's folder (P2.4). It moves no worktree and
 * deletes nothing.
 */
import { basename } from 'node:path'

import { abandonHandover } from '../lib/handover/abandon-handover.ts'
import { linkedWorktreeLockPath } from '../lib/handover/handover-lock.ts'
import { readRunMarker } from '../lib/handover/handover-marker-read.ts'
import { runningRefusal } from '../lib/handover/handover-run-marker.ts'
import { registeredEntryOf } from '../lib/handover/handover-store-read.ts'
import { HANDOVER_ABANDON_TEXTS } from '../lib/handover/handover.constants.ts'
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { jsonOf, textOf } from '../lib/print/print.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { moveLotAside } from '../lib/store/lot-aside.ts'
import { lotRefusalExit, lotUsageExit } from '../lib/store/lot-exits.ts'
import {
	commonFolderOfLotFolder,
	readCheckedLotState,
	registryOfLotFolder,
} from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { refuseUnlessOneLine, refuseWrongBy } from '../lib/store/record-rules.ts'
import { noLotRefusal, requiredLotOf } from '../lib/store/resolve-lot.ts'
import {
	CALLER,
	MOVED_ASIDE_STATE,
	NO_POSITION,
	STORE_REFUSAL,
} from '../lib/store/store.constants.ts'
import { appendTransitionIfAny } from '../lib/store/transitions.ts'
import { lotStatusLines, lotStatusOf } from './lot-status.ts'
import { STOP_FLAGS, STOP_TEXTS, STOP_VALUE_OPTIONS } from './lot-stop.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type {
	AbandonHandoverParams,
	AbandonHandoverResult,
} from '../lib/handover/abandon-handover.types.ts'
import type { InterleavingSeam } from '../lib/handover/handover.types.ts'
import type { LotIdentity, Transition, TransitionDraft } from '../lib/store/store.types.ts'
import type { LotStopParams, StopAbandon } from './lot-stop.types.ts'

/**
 * Stops the lot `<id>` names (an index unique across every store): a `committed` lot is refused (exit 2); a lot
 * `canceled` with no `pending` entry exits 0 with nothing written; a `pending` hand-over is abandoned first (a run
 * in progress or a hand-over committed meanwhile refuses, exit 2, nothing published); then a `canceled` transition
 * (cause `stop`, `--by` or `caller`, the reason) unless the last one is already; then the registry is read once
 * more and a `pending` entry registered meanwhile is abandoned at once. Exit 0 with the status after the stop. A
 * damaged lot is moved aside instead (`stopDamaged`).
 */
export function lotStop(params: LotStopParams): CommandResult {
	const read = readArguments({
		argv: params.argv,
		valueOptions: STOP_VALUE_OPTIONS,
		flags: STOP_FLAGS,
	})
	if (typeof read === 'string')
		return lotUsageExit({ reason: read, json: params.argv.includes(JSON_FLAG) })
	const json = read.flags.has('json')
	const [id, ...extra] = read.words
	if (id === undefined) return lotUsageExit({ reason: 'lot stop takes one id: none given', json })
	if (extra.length > 0)
		return lotUsageExit({ reason: `lot stop takes one id, not also ${extra.join(' ')}`, json })
	const reason = read.values.get('reason')
	if (reason === undefined) return lotUsageExit({ reason: 'lot stop needs --reason <text>', json })
	try {
		refuseUnlessOneLine({ text: reason, what: 'lot stop: the reason' })
		refuseWrongBy(read.values.get('by'))
	} catch (error) {
		if ((error as Error).name !== STORE_REFUSAL) throw error
		return lotRefusalExit({ lines: [(error as Error).message], json })
	}
	const required = requiredLotOf({ argument: id, cwd: params.cwd, mode: 'write' })
	if ('exitCode' in required) return lotRefusalExit({ lines: required.lines, json })
	const lotFolder = required.lot
	const registry = registryOfLotFolder(lotFolder)
	const checked = readCheckedLotState({ lotFolder, registry })
	if (checked === undefined) return lotRefusalExit({ lines: [noLotRefusal(id)], json })
	if ('damage' in checked)
		return stopDamaged({
			lotFolder,
			id,
			damage: checked.damage,
			reason,
			by: read.values.get('by') ?? CALLER,
			now: params.now ?? new Date(),
			json,
			beforeMoveAside: params.seams?.beforeMoveAside,
		})
	const { input } = checked
	const { identity } = input
	const { name } = identity
	const { state } = lotState(input)
	if (state === 'committed')
		return lotRefusalExit({ lines: [STOP_TEXTS.committed.replace('{name}', name)], json })
	const now = params.now ?? new Date()
	const pending = input.registryEntry?.state === 'pending'
	if (state === 'canceled' && !pending)
		return stoppedExit({ lotFolder, json, lines: [STOP_TEXTS.already.replace('{name}', name)] })
	// the lot's own registry and its worktree's lock: found without the worktree, which may be gone
	const lockPath =
		identity.worktree === null
			? undefined
			: linkedWorktreeLockPath({
					commonFolder: commonFolderOfLotFolder(lotFolder),
					worktree: identity.worktree,
				})
	const target = { folder: lotFolder, registry, lockPath, now }
	// step 2: the hand-over first; a refusal publishes nothing, the person's run decides
	const lockLines: string[] = []
	if (pending) {
		const abandoned = abandonOf({ ...target, afterCheck: params.seams?.afterCheck })
		if ('refused' in abandoned) return lotRefusalExit({ lines: [abandoned.refused], json })
		lockLines.push(...abandoned.lockLines)
	}
	appendTransitionIfAny({
		lotFolder,
		next: function canceledUnlessAlready({ last }) {
			if (last?.state === 'canceled') return undefined
			return canceledDraftOf({ identity, last, now, by: read.values.get('by'), reason })
		},
	})
	params.seams?.afterCanceled?.()
	// step 3: a `handover write` that crossed this stop registered its entry after the first read
	if (registeredEntryOf({ store: registry, folder: lotFolder })?.state === 'pending') {
		const late = abandonOf(target)
		if ('refused' in late) return lotRefusalExit({ lines: [late.refused], json })
		lockLines.push(...late.lockLines)
	}
	return stoppedExit({
		lotFolder,
		json,
		lines: [STOP_TEXTS.stopped.replace('{name}', name), ...lockLines],
	})
}

/**
 * The stop of a damaged lot (P2.4): refused (exit 2, nothing moved) while a live run marker's process runs, as
 * `handover abandon` refuses, and while a pending registry entry names its folder (moved aside, the entry and its
 * lock would name nothing); else its folder moved aside whole with `stopped.json` (nothing written into its own
 * records first), its worktree, branch and index claim kept. `no lot` when the folder went meanwhile (another stop
 * moved it). A run marker landing between the check and the move is an accepted residual.
 */
function stopDamaged(params: {
	lotFolder: string
	id: string
	damage: string
	reason: string
	by: string
	now: Date
	json: boolean
	beforeMoveAside: InterleavingSeam | undefined
}): CommandResult {
	const { lotFolder, damage, json } = params
	const running = readRunMarker(lotFolder)
	if (running !== undefined)
		return lotRefusalExit({
			lines: [
				runningRefusal({ template: HANDOVER_ABANDON_TEXTS.running, folder: lotFolder, running }),
			],
			json,
		})
	const entry = registeredEntryOf({ store: registryOfLotFolder(lotFolder), folder: lotFolder })
	if (entry?.state === 'pending')
		return lotRefusalExit({
			lines: [
				STOP_TEXTS.damagedPending
					.replace('{name}', basename(lotFolder))
					.replaceAll('{entry}', entry.name),
			],
			json,
		})
	params.beforeMoveAside?.()
	const moved = moveLotAside({
		lotFolder,
		reason: params.reason,
		by: params.by,
		now: params.now,
		damage,
	})
	if (moved.state === 'gone') return lotRefusalExit({ lines: [noLotRefusal(params.id)], json })
	const lot = basename(lotFolder)
	if (json)
		return {
			exitCode: 0,
			output: jsonOf({ lot, state: MOVED_ASIDE_STATE, damage, folder: moved.folder }, 2),
		}
	return {
		exitCode: 0,
		output: textOf([
			STOP_TEXTS.movedAside
				.replace('{name}', lot)
				.replace('{damage}', damage)
				.replace('{folder}', moved.folder),
		]),
	}
}

/**
 * Abandons the hand-over of `params.folder`: once done, the line saying what became of the repository's lock
 * (released, or left as it is; none without a lock); else why not - the abandon's refusal, or the parse error of a
 * hand-over record that does not read (a hand-edited `merges.json`), nothing written either way.
 */
function abandonOf(params: AbandonHandoverParams): StopAbandon {
	let abandoned: AbandonHandoverResult
	try {
		abandoned = abandonHandover(params)
	} catch (error) {
		if (!(error instanceof SyntaxError)) throw error
		return { refused: error.message }
	}
	if (abandoned.state === 'refused') return { refused: abandoned.message }
	return { lockLines: abandoned.lockLines ?? [] }
}

/** The `canceled` transition of a stop: the last position kept, cause `stop` by `by` (the caller without one). */
function canceledDraftOf(params: {
	identity: LotIdentity
	last: Transition | undefined
	now: Date
	by: string | undefined
	reason: string
}): TransitionDraft {
	return {
		at: params.now.toISOString(),
		lot: params.identity.name,
		state: 'canceled',
		position: params.last?.position ?? NO_POSITION,
		cause: { kind: 'stop', by: params.by ?? CALLER, reason: params.reason },
		question: null,
		simulated: params.identity.simulated,
	}
}

/** Exit 0 with the lot's status after the stop: the JSON under `--json`, else `lines` then the status text. */
function stoppedExit(params: { lotFolder: string; json: boolean; lines: string[] }): CommandResult {
	const status = lotStatusOf({ lotFolder: params.lotFolder })
	if (!status) return { exitCode: 0, output: textOf(params.lines) }
	if (params.json) return { exitCode: 0, output: jsonOf(status, 2) }
	return { exitCode: 0, output: textOf([...params.lines, ...lotStatusLines(status)]) }
}
