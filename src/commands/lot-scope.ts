/**
 * `dialecte lot scope <id> [--drop <path>]... [--add <path>]... --by <who> --reason <text>` (FIX-lot-scope): a started
 * lot's scope changes on the record, appended to its `scope-changes.jsonl` with a `scope.changed` event; the brief stays
 * as it was published. Every refusal exits 2 and writes nothing.
 */
import { basename, dirname, join } from 'node:path'

import { resultOf } from '../lib/command-result.ts'
import { EVENT_LINE_LIMIT } from '../lib/events/events.constants.ts'
import { makeEnvelope, overLimitMessage, writeEvent } from '../lib/events/write-event.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { readCliVersion } from '../lib/read-cli-version.ts'
import { forbiddenWordRefusal, isOneLine } from '../lib/review-rounds/option-checks.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { listStatusPaths } from '../lib/review-rounds/worktree-state.ts'
import {
	isInsideEntry,
	literalPartOf,
	normaliseScopeEntry,
	scopeFaultOf,
} from '../lib/store/brief-scope.ts'
import { probeCaseInsensitive } from '../lib/store/brief.ts'
import {
	appendLotOverlaps,
	isAcceptableOverlap,
	lotOverlapsText,
	overlapRecordsOf,
} from '../lib/store/lot-overlaps.ts'
import {
	commonFolderOfLotFolder,
	overlapLotLabelOf,
	overlapMetText,
	overlappingOpenLots,
	readCheckedLotState,
	readLotScope,
	registryOfLotFolder,
} from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { noLotRefusal, requiredLotOf } from '../lib/store/resolve-lot.ts'
import {
	SCOPE_CHANGE_LINE_LIMIT,
	SCOPE_CHANGE_SCHEMA,
} from '../lib/store/scope-changes.constants.ts'
import {
	appendScopeChanges,
	effectiveScopeOf,
	isDroppedBy,
	isCoveredBy,
	readScopeChanges,
	scopeChangesBufferOf,
	scopeChangesFileOf,
} from '../lib/store/scope-changes.ts'
import { QUESTIONS_CLOSED_STATES, STORE_FILES } from '../lib/store/store.constants.ts'
import {
	LOT_SCOPE_LIST_SEPARATOR,
	LOT_SCOPE_FLAGS,
	LOT_SCOPE_PATH_OPTIONS,
	LOT_SCOPE_TEXTS,
	LOT_SCOPE_USAGE,
	LOT_SCOPE_VALUE_OPTIONS,
	LOT_SCOPE_VERB,
	NO_WORKTREE,
	RESTORED_REASON_PREFIX,
	SCOPE_CHANGED_KIND,
} from './lot-scope.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { ScopeChange } from '../lib/store/scope-changes.types.ts'
import type { LotOverlap } from '../lib/store/store.types.ts'
import type { ScopeRequest, ScopeSeams, ScopeTarget } from './lot-scope.types.ts'

/** `lot scope` on its words (after the verb). */
export function runLotScope(params: {
	cwd: string
	argv: string[]
	now?: Date
	seams?: ScopeSeams
}): CommandResult {
	const request = requestOf({ argv: params.argv })
	if (request === undefined) return answerOf({ exitCode: 2, lines: [LOT_SCOPE_USAGE] })
	const required = requiredLotOf({ argument: request.id, cwd: params.cwd, mode: 'write' })
	if ('exitCode' in required) return answerOf({ exitCode: 2, lines: required.lines })
	const target = targetOf({ lotFolder: required.lot, id: request.id })
	if (typeof target === 'string') return answerOf({ exitCode: 2, lines: [target] })
	const wordRefusal = forbiddenWordRefusal({
		root: commonFolderOfLotFolder(target.lotFolder),
		verb: LOT_SCOPE_VERB,
		options: [
			...(request.by === undefined ? [] : [{ option: '--by', text: request.by }]),
			...(request.reason === undefined ? [] : [{ option: '--reason', text: request.reason }]),
		],
	})
	if (wordRefusal !== undefined) return answerOf({ exitCode: 2, lines: [wordRefusal] })
	const read = readScopeChanges({ lotFolder: target.lotFolder })
	if (read.unreadable > 0)
		return refused({
			template: LOT_SCOPE_TEXTS.unreadable,
			values: {
				name: target.name,
				file: scopeChangesFileOf({ lotFolder: target.lotFolder }),
				count: String(read.unreadable),
			},
		})
	const scope = readLotScope({ lotFolder: target.lotFolder })
	return changeScope({
		request,
		target,
		scope,
		now: params.now ?? new Date(),
		seams: params.seams,
	})
}

/**
 * The request the words make; undefined for a usage fault: no path, or `--by` / `--reason` missing, blank or not one
 * line (both are required on every drop and every add, FIX-scope-narrow D4).
 */
function requestOf(params: { argv: string[] }): ScopeRequest | undefined {
	const read = readArguments({
		argv: params.argv,
		valueOptions: LOT_SCOPE_VALUE_OPTIONS,
		flags: LOT_SCOPE_FLAGS,
		repeatable: LOT_SCOPE_PATH_OPTIONS,
	})
	if (typeof read === 'string' || read.words.length !== 1) return undefined
	const [id] = read.words
	const drops = read.lists.get('drop') ?? []
	const adds = read.lists.get('add') ?? []
	const by = read.values.get('by')
	const reason = read.values.get('reason')
	if (drops.length === 0 && adds.length === 0) return undefined
	if (!isOneLine(by) || !isOneLine(reason)) return undefined
	return { id, drops, adds, by, reason, overlapOk: read.flags.has('overlap-ok') }
}

/** The lot to change, or the refusal of a lot that is gone, damaged, or committed, canceled or failed. */
function targetOf(params: { lotFolder: string; id: string }): ScopeTarget | string {
	const { lotFolder } = params
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	if (checked === undefined) return noLotRefusal(params.id)
	if ('damage' in checked)
		return fillMessage({
			template: LOT_SCOPE_TEXTS.damaged,
			values: { name: basename(lotFolder), reason: checked.damage },
		})
	const { identity } = checked.input
	// a simulated lot holds no scope: nothing to change, never an overlap of any other lot
	if (identity.simulated)
		return fillMessage({ template: LOT_SCOPE_TEXTS.simulated, values: { name: identity.name } })
	const { state } = lotState(checked.input)
	if (QUESTIONS_CLOSED_STATES.includes(state))
		return fillMessage({
			template: LOT_SCOPE_TEXTS.terminal,
			values: { name: identity.name, state },
		})
	return {
		lotFolder,
		name: identity.name,
		worktree: identity.worktree,
		repository: identity.repository,
	}
}

/**
 * A change of the scope - a drop, an add, or both in one call (FIX-scope-narrow D1): the adds well-formed scope
 * entries, those not equal to an entry written (D3); each drop an entry or a folder holding entries, never a path
 * inside a wider entry; the scope left never empty; every file the worktree changed inside a dropped entry covered by
 * the entries left, the call's adds counted (D2); the adds never meeting another open lot's scope.
 */
function changeScope(params: {
	request: ScopeRequest
	target: ScopeTarget
	scope: string[]
	now: Date
	seams?: ScopeSeams
}): CommandResult {
	const { request, target, scope } = params
	for (const path of request.adds) {
		const fault = scopeFaultOf({ entry: normaliseScopeEntry(path) })
		if (fault !== undefined)
			return refused({
				template: LOT_SCOPE_TEXTS.fault,
				values: { name: target.name, path, fault },
			})
	}
	const normalisedAdds = [...new Set(request.adds.map(normaliseScopeEntry))]
	const dropped = [...new Set(request.drops.map(normaliseScopeEntry))]
	// an add equal to an entry the same call drops is written: only an entry that stays holds it already (R1-1)
	const kept = scope.filter((entry) => !dropped.some((path) => isDroppedBy({ entry, path })))
	const added = normalisedAdds.filter((path) => !kept.includes(path))
	const entryRefusal = dropEntryRefusal({ target, scope, dropped })
	if (entryRefusal !== undefined) return entryRefusal
	if (dropped.length === 0 && added.length === 0)
		return answerOf({
			exitCode: 0,
			lines: [
				fillMessage({
					template: LOT_SCOPE_TEXTS.already,
					values: { name: target.name, paths: normalisedAdds.join(LOT_SCOPE_LIST_SEPARATOR) },
				}),
			],
		})
	const at = params.now.toISOString()
	const who = { by: request.by, reason: request.reason }
	const changes: ScopeChange[] = [
		...(dropped.length > 0
			? [{ schema: SCOPE_CHANGE_SCHEMA, at, op: 'drop' as const, paths: dropped, ...who }]
			: []),
		...(added.length > 0
			? [{ schema: SCOPE_CHANGE_SCHEMA, at, op: 'add' as const, paths: added, ...who }]
			: []),
	]
	const removed = scope.filter((entry) => !kept.includes(entry))
	if (dropped.length > 0) {
		const coverage = coverageRefusal({ target, scope, dropped, changes })
		if (coverage !== undefined) return coverage
	}
	const overlap = overlapDecisionOf({ request: params.request, target, added })
	if ('refusal' in overlap) return overlap.refusal
	return recordChanges({
		...params,
		changes,
		added,
		removed,
		accepted: overlap.accepted,
		recheck: overlap.recheck,
	})
}

/** Why a dropped path is refused before anything else: it is no entry, or lies inside a wider one; none when each holds entries. */
function dropEntryRefusal(params: {
	target: ScopeTarget
	scope: string[]
	dropped: string[]
}): CommandResult | undefined {
	const { target, scope } = params
	for (const path of params.dropped) {
		if (scope.some((entry) => isDroppedBy({ entry, path }))) continue
		// a glob path names no folder an entry could be cut from: it is an entry, or none
		const wider =
			literalPartOf(path) === path
				? scope.find((entry) => isInsideEntry({ path, entry }))
				: undefined
		return wider === undefined
			? refused({ template: LOT_SCOPE_TEXTS.noEntry, values: { name: target.name, path } })
			: refused({
					template: LOT_SCOPE_TEXTS.insideEntry,
					values: { name: target.name, path, entry: wider },
				})
	}
	return undefined
}

/**
 * Why the drop cannot keep the lot's work held: it leaves no scope, the worktree cannot be read, or a changed file
 * inside a dropped entry is covered by no entry left (the call's adds counted, D2); none when the drop may go.
 */
function coverageRefusal(params: {
	target: ScopeTarget
	scope: string[]
	dropped: string[]
	changes: ScopeChange[]
}): CommandResult | undefined {
	const { target, scope } = params
	const left = effectiveScopeOf({ brief: scope, changes: params.changes })
	// a brief never holds an empty scope: a lot that hands back everything stops instead
	if (left.length === 0)
		return refused({ template: LOT_SCOPE_TEXTS.emptied, values: { name: target.name } })
	const changed = changedFilesOf({ worktree: target.worktree })
	if (changed === undefined)
		return refused({
			template: LOT_SCOPE_TEXTS.worktreeUnreadable,
			values: { name: target.name, worktree: target.worktree ?? NO_WORKTREE },
		})
	for (const path of params.dropped) {
		const holding = scope.filter((entry) => isDroppedBy({ entry, path }))
		const file = changed.find(
			(each) =>
				// a removed glob entry holds every changed file under its literal folder, matched or not: stricter than
				// the coverage of the entries left on purpose (fails closed, FIX-lot-scope R1-7)
				holding.some((entry) => isInsideEntry({ path: each, entry })) &&
				!left.some((entry) => isCoveredBy({ path: each, entry })),
		)
		if (file !== undefined)
			return refused({
				template: LOT_SCOPE_TEXTS.changed,
				values: { name: target.name, path, file },
			})
	}
	return undefined
}

/**
 * What the add's overlaps allow: with `--overlap-ok`, every overlap that names its paths is accepted, any other refuses
 * the call; without it, the first refuses. The re-check after the write takes the add back for a lot that started or
 * widened meanwhile and was never named by the go-ahead.
 */
function overlapDecisionOf(params: {
	request: ScopeRequest
	target: ScopeTarget
	added: string[]
}):
	| { refusal: CommandResult }
	| { accepted: LotOverlap[]; recheck: (() => LotOverlap | undefined) | undefined } {
	const { target, added } = params
	if (added.length === 0) return { accepted: [], recheck: undefined }
	const overlaps = addOverlapsOf({ target, added })
	const accepted = params.request.overlapOk ? overlaps.filter(isAcceptableOverlap) : []
	const [unaccepted] = overlaps.filter((overlap) => !accepted.includes(overlap))
	if (unaccepted !== undefined)
		return {
			refusal: refused({
				template: LOT_SCOPE_TEXTS.overlap,
				values: {
					name: target.name,
					lot: overlapLotLabelOf(unaccepted),
					met: overlapMetText(unaccepted),
				},
			}),
		}
	const acceptedNames = accepted.map((overlap) => overlap.name)
	return {
		accepted,
		recheck: function recheckAdd() {
			return addOverlapsOf({ target, added }).find(
				(overlap) => !acceptedNames.includes(overlap.name),
			)
		},
	}
}

/** The open lots, other than the target, whose effective scope the added paths meet; none when they meet none. */
function addOverlapsOf(params: { target: ScopeTarget; added: string[] }): LotOverlap[] {
	const { target } = params
	return overlappingOpenLots({
		store: dirname(target.lotFolder),
		registry: registryOfLotFolder(target.lotFolder),
		scope: params.added,
		caseInsensitive: probeCaseInsensitive({ path: target.repository }),
		except: basename(target.lotFolder),
	})
}

/** The files the lot's worktree lists as changed (git status); undefined when it has none or it cannot be read. */
function changedFilesOf(params: { worktree: string | null }): string[] | undefined {
	if (params.worktree === null) return undefined
	try {
		return listStatusPaths(params.worktree).paths
	} catch {
		return undefined
	}
}

/**
 * Writes the call's changes in one append - refused before the write when they are over the line limit - then their
 * `scope.changed` events; an event that cannot be written adds one line and never changes the exit code (D6). An add a
 * lot that started or widened meanwhile meets is taken back (`undoneChanges`).
 */
function recordChanges(params: {
	request: ScopeRequest
	target: ScopeTarget
	changes: ScopeChange[]
	scope: string[]
	added: string[]
	removed: string[]
	now: Date
	seams?: ScopeSeams
	/** The overlaps `--overlap-ok` accepted: recorded once the add stands. */
	accepted: readonly LotOverlap[]
	recheck?: () => LotOverlap | undefined
}): CommandResult {
	const { target, changes } = params
	const bytes = scopeChangesBufferOf({ changes }).length
	if (bytes > SCOPE_CHANGE_LINE_LIMIT)
		return refused({
			template: LOT_SCOPE_TEXTS.overLimit,
			values: {
				name: target.name,
				message: overLimitMessage({ bytes, limit: SCOPE_CHANGE_LINE_LIMIT }),
			},
		})
	// the take-back must fit too, or a late overlap would leave the add in place: checked before the first write (R1-3)
	if (params.added.length > 0) {
		const takeBackBytes = scopeChangesBufferOf({ changes: takeBackOf(params) }).length
		if (takeBackBytes > SCOPE_CHANGE_LINE_LIMIT)
			return refused({
				template: LOT_SCOPE_TEXTS.takeBackOverLimit,
				values: {
					name: target.name,
					message: overLimitMessage({ bytes: takeBackBytes, limit: SCOPE_CHANGE_LINE_LIMIT }),
				},
			})
	}
	try {
		appendScopeChanges({ lotFolder: target.lotFolder, changes })
	} catch (error) {
		return answerOf({
			exitCode: 1,
			lines: [
				fillMessage({
					template: LOT_SCOPE_TEXTS.writeFailure,
					values: { message: (error as Error).message },
				}),
			],
		})
	}
	params.seams?.afterAppend?.()
	const late = params.recheck?.()
	if (late !== undefined) return undoneChanges({ ...params, overlap: late })
	const overlapLines = recordAcceptedOverlaps(params)
	if (overlapLines.failure !== undefined) return overlapLines.failure
	const effective = effectiveScopeOf({ brief: params.scope, changes })
	const changedLine = fillMessage({
		template: changedTemplateOf({ changes }),
		values: {
			name: target.name,
			dropped: pathsOf({ changes, op: 'drop' }),
			added: pathsOf({ changes, op: 'add' }),
			by: params.request.by,
			scope: effective.join(LOT_SCOPE_LIST_SEPARATOR),
		},
	})
	const failures = changes
		.map((change) => writeScopeEvent({ target, change }))
		.filter((line): line is string => line !== undefined)
	return answerOf({ exitCode: 0, lines: [changedLine, ...overlapLines.lines, ...failures] })
}

/**
 * Records the overlaps `--overlap-ok` accepted, the add written: the line naming them, or, when they cannot be written,
 * the add taken back (an overlap is never held without its record) and the failure (exit 1).
 */
function recordAcceptedOverlaps(params: {
	request: ScopeRequest
	target: ScopeTarget
	added: string[]
	removed: string[]
	accepted: readonly LotOverlap[]
	now: Date
}): { lines: string[]; failure?: CommandResult } {
	const { request, target } = params
	if (params.accepted.length === 0) return { lines: [] }
	const records = overlapRecordsOf({
		overlaps: params.accepted,
		verb: LOT_SCOPE_VERB,
		at: params.now.toISOString(),
		by: request.by,
		reason: request.reason,
	})
	try {
		appendLotOverlaps({ lotFolder: target.lotFolder, records })
	} catch (error) {
		const failureLine = fillMessage({
			template: LOT_SCOPE_TEXTS.overlapRecordFailure,
			values: { name: target.name, message: (error as Error).message },
		})
		const takeBack = takeBackLines({ ...params, failureLine })
		return { lines: [], failure: answerOf({ exitCode: 1, lines: takeBack }) }
	}
	return {
		lines: [
			fillMessage({
				template: LOT_SCOPE_TEXTS.overlapAccepted,
				values: { name: target.name, overlaps: lotOverlapsText(records) ?? '' },
			}),
		],
	}
}

/** Takes the call back after its overlap record failed: the failure line, then the take-back's own failure if any. */
function takeBackLines(params: {
	request: ScopeRequest
	target: ScopeTarget
	added: string[]
	removed: string[]
	now: Date
	failureLine: string
}): string[] {
	try {
		appendScopeChanges({ lotFolder: params.target.lotFolder, changes: takeBackOf(params) })
	} catch (error) {
		return [
			params.failureLine,
			fillMessage({
				template: LOT_SCOPE_TEXTS.writeFailure,
				values: { message: (error as Error).message },
			}),
		]
	}
	return [params.failureLine]
}

/** The line a written change prints: a drop, an add, or a drop with its adds. */
function changedTemplateOf(params: { changes: ScopeChange[] }): string {
	const ops = params.changes.map((change) => change.op)
	if (ops.includes('drop') && ops.includes('add')) return LOT_SCOPE_TEXTS.narrowed
	return ops.includes('drop') ? LOT_SCOPE_TEXTS.dropped : LOT_SCOPE_TEXTS.added
}

/** The paths of the change of `op`, as a printed list. */
function pathsOf(params: { changes: ScopeChange[]; op: ScopeChange['op'] }): string {
	const change = params.changes.find((each) => each.op === params.op)
	return (change?.paths ?? []).join(LOT_SCOPE_LIST_SEPARATOR)
}

/**
 * Takes back a call whose adds a lot that started or widened meanwhile meets, the way `lot start` fails its own lot on
 * a late overlap: in one write, an `undo` of the adds and, when the call dropped, an add putting back exactly the
 * entries the drop removed (`restored: <reason>`, never wider than before, D5/D7); no event, exit 2 naming that lot;
 * a take-back that cannot be written exits 1 naming the paths and the lot.
 */
function undoneChanges(params: {
	request: ScopeRequest
	target: ScopeTarget
	added: string[]
	removed: string[]
	overlap: LotOverlap
	now: Date
}): CommandResult {
	const { target, added, removed, overlap } = params
	const changes = takeBackOf(params)
	try {
		appendScopeChanges({ lotFolder: target.lotFolder, changes })
	} catch (error) {
		return answerOf({
			exitCode: 1,
			lines: [
				fillMessage({
					template: LOT_SCOPE_TEXTS.undoFailure,
					values: {
						name: target.name,
						paths: added.join(LOT_SCOPE_LIST_SEPARATOR),
						lot: overlapLotLabelOf(overlap),
						message: (error as Error).message,
					},
				}),
			],
		})
	}
	return refused({
		template:
			removed.length > 0 ? LOT_SCOPE_TEXTS.lateOverlapNarrowed : LOT_SCOPE_TEXTS.lateOverlap,
		values: { name: target.name, lot: overlapLotLabelOf(overlap), met: overlapMetText(overlap) },
	})
}

/**
 * The lines that take a call back on a late overlap: an `undo` of its adds and, when it dropped, an add putting back
 * exactly the entries the drop removed (`restored: <reason>`).
 */
function takeBackOf(params: {
	request: ScopeRequest
	added: string[]
	removed: string[]
	now: Date
}): ScopeChange[] {
	const at = params.now.toISOString()
	return [
		{ schema: SCOPE_CHANGE_SCHEMA, at, op: 'undo', paths: params.added },
		...(params.removed.length > 0
			? [
					{
						schema: SCOPE_CHANGE_SCHEMA,
						at,
						op: 'add' as const,
						paths: params.removed,
						by: params.request.by,
						reason: `${RESTORED_REASON_PREFIX}${params.request.reason}`,
					},
				]
			: []),
	]
}

/** Writes the change's `scope.changed` event into the lot's events; the line to print when it could not be written. */
function writeScopeEvent(params: { target: ScopeTarget; change: ScopeChange }): string | undefined {
	const { target, change } = params
	const file = join(target.lotFolder, STORE_FILES.events)
	try {
		writeEvent({
			file,
			event: {
				...makeEnvelope({
					lot: target.name,
					kind: SCOPE_CHANGED_KIND,
					by: 'cli',
					cli: readCliVersion(),
					// a simulated lot is refused before any change: an event of lot scope is never simulated
					simulated: false,
					hostEvent: null,
				}),
				op: change.op,
				paths: change.paths,
			},
			limit: EVENT_LINE_LIMIT,
		})
		return undefined
	} catch (error) {
		return fillMessage({
			template: LOT_SCOPE_TEXTS.eventFailure,
			values: { file, message: (error as Error).message },
		})
	}
}

/** A refusal: exit 2, its one line. */
function refused(params: { template: string; values: Record<string, string> }): CommandResult {
	return answerOf({ exitCode: 2, lines: [fillMessage(params)] })
}

/** A result of its lines. */
function answerOf(params: { exitCode: number; lines: readonly string[] }): CommandResult {
	return resultOf({ exitCode: params.exitCode, lines: params.lines })
}
