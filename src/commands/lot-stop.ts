/**
 * `dialecte lot stop <id> --reason <text> [--by <who>] [--json]` (33S section 7, steps 1-3): ends a lot, abandoning
 * its pending hand-over first. The one store command that writes outside the lot folder (33S section 2): the
 * abandon of `handover abandon`. It moves no worktree and deletes nothing.
 */
import { abandonHandover } from '../lib/handover/abandon-handover.ts'
import { linkedWorktreeLockPath } from '../lib/handover/handover-lock.ts'
import { registeredEntryOf } from '../lib/handover/handover-store-read.ts'
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { lotRefusalExit, lotUsageExit } from '../lib/store/lot-exits.ts'
import {
	commonFolderOfLotFolder,
	readLotStateInput,
	registryOfLotFolder,
} from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { refuseUnlessOneLine, refuseWrongBy } from '../lib/store/record-rules.ts'
import { noLotRefusal, requireLot } from '../lib/store/resolve-lot.ts'
import { CALLER, NO_POSITION, STORE_REFUSAL } from '../lib/store/store.constants.ts'
import { printableOf } from '../lib/store/text-escape.ts'
import { appendTransitionIfAny } from '../lib/store/transitions.ts'
import { lotStatusOf, lotStatusText } from './lot-status.ts'
import { STOP_FLAGS, STOP_TEXTS, STOP_VALUE_OPTIONS } from './lot-stop.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type {
	AbandonHandoverParams,
	AbandonHandoverResult,
} from '../lib/handover/abandon-handover.types.ts'
import type { LotIdentity, Transition, TransitionDraft } from '../lib/store/store.types.ts'
import type { LotStopParams } from './lot-stop.types.ts'

/**
 * Stops the lot `<id>` names (an index unique across every store): a `committed` lot is refused (exit 2); a lot
 * `canceled` with no `pending` entry exits 0 with nothing written; a `pending` hand-over is abandoned first (a run
 * in progress or a hand-over committed meanwhile refuses, exit 2, nothing published); then a `canceled` transition
 * (cause `stop`, `--by` or `caller`, the reason) unless the last one is already; then the registry is read once
 * more and a `pending` entry registered meanwhile is abandoned at once. Exit 0 with the status after the stop.
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
		return lotRefusalExit({ message: (error as Error).message, json })
	}
	const required = requireLot({ argument: id, cwd: params.cwd, mode: 'write' })
	if ('exitCode' in required) return lotRefusalExit({ message: required.output, json })
	const lotFolder = required.lot
	const registry = registryOfLotFolder(lotFolder)
	const input = readLotStateInput({ lotFolder, registry })
	if (!input) return lotRefusalExit({ message: noLotRefusal(id), json })
	const { identity } = input
	// the name as the text lines print it: escaped once; JSON carries it as stored
	const name = json ? identity.name : printableOf(identity.name)
	const { state } = lotState(input)
	if (state === 'committed')
		return lotRefusalExit({ message: STOP_TEXTS.committed.replace('{name}', name), json })
	const now = params.now ?? new Date()
	const pending = input.registryEntry?.state === 'pending'
	if (state === 'canceled' && !pending)
		return stoppedExit({ lotFolder, json, line: STOP_TEXTS.already.replace('{name}', name) })
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
	if (pending) {
		const refused = abandonRefusalOf({ ...target, afterCheck: params.seams?.afterCheck })
		if (refused !== undefined)
			return lotRefusalExit({ message: shownRefusal({ message: refused, json }), json })
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
		const late = abandonRefusalOf(target)
		if (late !== undefined)
			return lotRefusalExit({ message: shownRefusal({ message: late, json }), json })
	}
	return stoppedExit({ lotFolder, json, line: STOP_TEXTS.stopped.replace('{name}', name) })
}

/** An abandon's refusal as `lot stop` prints it: escaped once in the text form (it quotes hand-over records), JSON as it is. */
function shownRefusal(params: { message: string; json: boolean }): string {
	return params.json ? params.message : printableOf(params.message)
}

/**
 * Abandons the hand-over of `params.folder`: undefined once done, else why not - the abandon's refusal, or the
 * parse error of a hand-over record that does not read (a hand-edited `merges.json`), nothing written either way.
 */
function abandonRefusalOf(params: AbandonHandoverParams): string | undefined {
	let abandoned: AbandonHandoverResult
	try {
		abandoned = abandonHandover(params)
	} catch (error) {
		if (!(error instanceof SyntaxError)) throw error
		return error.message
	}
	return abandoned.state === 'refused' ? abandoned.message : undefined
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

/** Exit 0 with the lot's status after the stop: the JSON under `--json`, else `line` then the status text. */
function stoppedExit(params: { lotFolder: string; json: boolean; line: string }): CommandResult {
	const status = lotStatusOf({ lotFolder: params.lotFolder })
	if (!status) return { exitCode: 0, output: params.line }
	if (params.json) return { exitCode: 0, output: JSON.stringify(status, null, 2) }
	return { exitCode: 0, output: `${params.line}\n${lotStatusText(status)}` }
}
