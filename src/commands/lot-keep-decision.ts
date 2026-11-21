/**
 * `dialecte lot keep <id> --by <who> --reason <why> [--json]` and `dialecte lot unkeep <id> --by <who> --reason <why>
 * [--json]` (KEEP 3.3): a signed line appended to the lot's `keep.jsonl` and a `keep.changed` event; every refusal
 * exits 2 and writes nothing.
 */
import { basename, dirname, join } from 'node:path'

import { resultOf } from '../lib/command-result.ts'
import { EVENT_LINE_LIMIT } from '../lib/events/events.constants.ts'
import { lotItemsLeftOf } from '../lib/events/read-lot-report.ts'
import { makeEnvelope, writeEvent } from '../lib/events/write-event.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { jsonOf } from '../lib/print/print.ts'
import { readCliVersion } from '../lib/read-cli-version.ts'
import { isOneLine } from '../lib/review-rounds/option-checks.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { KEEP_REASON_LIMIT, KEEP_SCHEMA } from '../lib/store/keep-decisions.constants.ts'
import { appendKeepLine, keepFileOf, keepJsonOf } from '../lib/store/keep-decisions.ts'
import { lotFailureExit, lotRefusalExit } from '../lib/store/lot-exits.ts'
import { overlapGoAheadRefusal } from '../lib/store/lot-overlaps.ts'
import {
	commonFolderOfLotFolder,
	readCheckedLotState,
	registryOfLotFolder,
} from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { folderPlanEntryIds } from '../lib/store/public-text.ts'
import { noLotRefusal, requiredLotOf } from '../lib/store/resolve-lot.ts'
import { ownWorktreeRefusal, recordedByOf } from '../lib/store/signer-rules.ts'
import { LOTS_KEEPING_NOTHING, NEXT_COMMANDS, STORE_FILES } from '../lib/store/store.constants.ts'
import {
	KEEP_CHANGED_KIND,
	KEEP_VERB_FLAGS,
	KEEP_VERB_TEXTS,
	KEEP_VERB_VALUE_OPTIONS,
} from './lot-keep-decision.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { KeepLine, KeepOp } from '../lib/store/keep-decisions.types.ts'
import type { KeepRequest, KeepTarget, KeepVerbJson } from './lot-keep-decision.types.ts'

/** `lot keep` or `lot unkeep` on its words (the verb first). */
export function runLotKeepDecision(params: {
	cwd: string
	/** The verb (`keep` or `unkeep`), then its words. */
	argv: string[]
	now?: Date
}): CommandResult {
	const [verb, ...words] = params.argv
	const op: KeepOp = verb === 'unkeep' ? 'unkeep' : 'keep'
	const request = requestOf({ op, argv: words })
	if (typeof request === 'string')
		return lotRefusalExit({ lines: [request], json: words.includes(JSON_FLAG) })
	const { json } = request
	const required = requiredLotOf({ argument: request.id, cwd: params.cwd, mode: 'write' })
	if ('exitCode' in required) return lotRefusalExit({ lines: required.lines, json })
	const target = targetOf({ lotFolder: required.lot })
	if (target === undefined) return lotRefusalExit({ lines: [noLotRefusal(request.id)], json })
	const refusal =
		textRefusal({ request, target }) ??
		(op === 'unkeep'
			? ownWorktreeRefusal({
					lotFolder: target.lotFolder,
					cwd: params.cwd,
					command: fillMessage({ template: KEEP_VERB_TEXTS.command, values: { verb: op } }),
				})
			: undefined)
	if (refusal !== undefined) return lotRefusalExit({ lines: [refusal], json })
	// the keep as the one lot reader read it, checked before any append: a line that does not read, or a file that
	// cannot be read, is refused for a person to repair
	const { keep } = target.checked
	if (keep !== undefined && !('kept' in keep))
		return lotRefusalExit({ lines: [unreadableRefusal({ op, target, keep })], json })
	return decide({ request, target, keep, now: params.now ?? new Date() })
}

/** The request the words make, or the refusal of a usage fault or a reason over the limit. */
function requestOf(params: { op: KeepOp; argv: string[] }): KeepRequest | string {
	const { op } = params
	const usage = fillMessage({ template: KEEP_VERB_TEXTS.usage, values: { verb: op } })
	const read = readArguments({
		argv: params.argv,
		valueOptions: KEEP_VERB_VALUE_OPTIONS,
		flags: KEEP_VERB_FLAGS,
	})
	if (typeof read === 'string' || read.words.length !== 1) return usage
	const by = read.values.get('by')
	const reason = read.values.get('reason')
	if (!isOneLine(by) || !isOneLine(reason)) return usage
	if (reason.length > KEEP_REASON_LIMIT)
		return fillMessage({
			template: KEEP_VERB_TEXTS.overLimit,
			values: { verb: op, length: String(reason.length), limit: String(KEEP_REASON_LIMIT) },
		})
	return { op, id: read.words[0], by, reason, json: read.flags.has('json') }
}

/** The lot of a resolved folder, damaged included (its folder's name stands for it); undefined when it is gone. */
function targetOf(params: { lotFolder: string }): KeepTarget | undefined {
	const { lotFolder } = params
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	if (checked === undefined) return undefined
	const identity = 'damage' in checked ? checked.identity : checked.input.identity
	return {
		lotFolder,
		name: basename(lotFolder),
		// a lot whose identity does not read is checked against the repository of its store
		root: identity?.repository ?? dirname(commonFolderOfLotFolder(lotFolder)),
		simulated: identity?.simulated ?? false,
		checked,
	}
}

/** Why `--by` or `--reason` may not be recorded: a forbidden word, a path, a link, a reference or a plan entry id. */
function textRefusal(params: { request: KeepRequest; target: KeepTarget }): string | undefined {
	const { request, target } = params
	return overlapGoAheadRefusal({
		root: target.root,
		verb: request.op,
		by: request.by,
		reason: request.reason,
		ids: folderPlanEntryIds({ folder: target.lotFolder }),
	})
}

/** The refusal of a keep file that cannot be trusted: a person repairs it by hand. */
function unreadableRefusal(params: {
	op: KeepOp
	target: KeepTarget
	keep: { unreadable: number } | { unreadableFile: string }
}): string {
	const { op, target, keep } = params
	const file = keepFileOf({ lotFolder: target.lotFolder })
	return 'unreadable' in keep
		? fillMessage({
				template: KEEP_VERB_TEXTS.unreadableLines,
				values: { verb: op, name: target.name, file, count: String(keep.unreadable) },
			})
		: fillMessage({
				template: KEEP_VERB_TEXTS.unreadableFile,
				values: { verb: op, name: target.name, file, code: keep.unreadableFile },
			})
}

/**
 * The verb's decision on a keep that reads: nothing written when the lot is kept already with the same reason (keep) or
 * not kept (unkeep), else one line appended and its event written.
 */
function decide(params: {
	request: KeepRequest
	target: KeepTarget
	keep: { kept: KeepLine } | undefined
	now: Date
}): CommandResult {
	const { request, target, keep } = params
	const unchanged =
		request.op === 'keep'
			? keep !== undefined && keep.kept.reason === request.reason
			: keep === undefined
	if (unchanged)
		return answered({
			request,
			target,
			keep,
			written: false,
			lines: [
				fillMessage({
					template: request.op === 'keep' ? KEEP_VERB_TEXTS.keptAlready : KEEP_VERB_TEXTS.notKept,
					values: { name: target.name },
				}),
			],
		})
	const line: KeepLine = {
		schema: KEEP_SCHEMA,
		at: params.now.toISOString(),
		op: request.op,
		by: recordedByOf({ by: request.by }),
		reason: request.reason,
	}
	try {
		appendKeepLine({ lotFolder: target.lotFolder, line })
	} catch (error) {
		// a line that cannot be written exits 1, as every store verb's
		return lotFailureExit({
			json: request.json,
			lines: [
				fillMessage({
					template: KEEP_VERB_TEXTS.writeFailure,
					values: { verb: request.op, name: target.name, message: (error as Error).message },
				}),
			],
		})
	}
	const failure = writeKeepEvent({ target, line })
	const after = line.op === 'keep' ? { kept: line } : undefined
	return answered({
		request,
		target,
		keep: after,
		written: true,
		lines: [
			fillMessage({
				template: line.op === 'keep' ? KEEP_VERB_TEXTS.kept : KEEP_VERB_TEXTS.unkept,
				values: { name: target.name, reason: line.reason },
			}),
			...(failure === undefined ? [] : [failure]),
		],
	})
}

/**
 * The verb's answer, exit 0: its lines, then for a lot no longer kept whose items are left `lot prune`; under `--json`
 * `{ lot, kept, written, next }` (an event failure is still printed, as its own line).
 */
function answered(params: {
	request: KeepRequest
	target: KeepTarget
	keep: { kept: KeepLine } | undefined
	written: boolean
	lines: string[]
}): CommandResult {
	const { request, target } = params
	const next = params.keep === undefined ? pruneNextOf({ target }) : null
	if (request.json) {
		const json: KeepVerbJson = {
			lot: target.name,
			kept: keepJsonOf({ keep: params.keep }),
			written: params.written,
			next,
		}
		return { exitCode: 0, output: jsonOf(json, 2) }
	}
	const nextLine =
		next === null
			? []
			: [fillMessage({ template: KEEP_VERB_TEXTS.next, values: { command: next } })]
	return resultOf({ exitCode: 0, lines: [...params.lines, ...nextLine] })
}

/** `lot prune` of a terminal lot whose worktree or branch is left; null for an open or damaged lot, or nothing left. */
function pruneNextOf(params: { target: KeepTarget }): string | null {
	// the lot as the verb read it: a keep line changes no state, item nor identity
	const { lotFolder, name, checked } = params.target
	if ('damage' in checked) return null
	const { state } = lotState(checked.input)
	if (!LOTS_KEEPING_NOTHING.includes(state)) return null
	const { identity } = checked.input
	const left = lotItemsLeftOf({ lotFolder, worktree: identity.worktree, branch: identity.branch })
	return left.worktree || left.branch
		? fillMessage({ template: NEXT_COMMANDS.prune, values: { name } })
		: null
}

/** Writes the line's `keep.changed` event into the lot's events; the line to print when it could not be written. */
function writeKeepEvent(params: { target: KeepTarget; line: KeepLine }): string | undefined {
	const { target, line } = params
	const file = join(target.lotFolder, STORE_FILES.events)
	try {
		writeEvent({
			file,
			event: {
				...makeEnvelope({
					lot: target.name,
					kind: KEEP_CHANGED_KIND,
					by: 'cli',
					cli: readCliVersion(),
					simulated: target.simulated,
					hostEvent: null,
				}),
				op: line.op,
				reason: line.reason,
			},
			limit: EVENT_LINE_LIMIT,
		})
		return undefined
	} catch (error) {
		return fillMessage({
			template: KEEP_VERB_TEXTS.eventFailure,
			values: { verb: line.op, file, message: (error as Error).message },
		})
	}
}
