/**
 * `dialecte lot scope <id> --drop <path>... | --add <path>... --by <who> --reason <text>` (FIX-lot-scope): a started
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
	appendScopeChange,
	effectiveScopeOf,
	isDroppedBy,
	isHeldBy,
	readScopeChanges,
	scopeChangeLineOf,
	scopeChangesFileOf,
} from '../lib/store/scope-changes.ts'
import { QUESTIONS_CLOSED_STATES, STORE_FILES } from '../lib/store/store.constants.ts'
import {
	LOT_SCOPE_LIST_SEPARATOR,
	LOT_SCOPE_PATH_OPTIONS,
	LOT_SCOPE_TEXTS,
	LOT_SCOPE_USAGE,
	LOT_SCOPE_VALUE_OPTIONS,
	LOT_SCOPE_VERB,
	NO_WORKTREE,
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
	const now = params.now ?? new Date()
	const step = { request, target, scope, now, seams: params.seams }
	return request.op === 'add' ? addPaths(step) : dropPaths(step)
}

/** The request the words make; undefined for a usage fault (both ops or none, no path, who and why misplaced). */
function requestOf(params: { argv: string[] }): ScopeRequest | undefined {
	const read = readArguments({
		argv: params.argv,
		valueOptions: LOT_SCOPE_VALUE_OPTIONS,
		repeatable: LOT_SCOPE_PATH_OPTIONS,
	})
	if (typeof read === 'string' || read.words.length !== 1) return undefined
	const [id] = read.words
	const drops = read.lists.get('drop') ?? []
	const adds = read.lists.get('add') ?? []
	const by = read.values.get('by')
	const reason = read.values.get('reason')
	if (drops.length > 0 === adds.length > 0) return undefined
	if (drops.length > 0)
		return by === undefined && reason === undefined ? { id, op: 'drop', paths: drops } : undefined
	if (!isOneLine(by) || !isOneLine(reason)) return undefined
	return { id, op: 'add', paths: adds, by, reason }
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
 * An add: each path a well-formed scope entry, those not already inside the effective scope written, refused when
 * they meet another open lot's effective scope; nothing to add answers `already holds`.
 */
function addPaths(params: {
	request: ScopeRequest
	target: ScopeTarget
	scope: string[]
	now: Date
	seams?: ScopeSeams
}): CommandResult {
	const { request, target, scope } = params
	for (const path of request.paths) {
		const fault = scopeFaultOf({ entry: normaliseScopeEntry(path) })
		if (fault !== undefined)
			return refused({
				template: LOT_SCOPE_TEXTS.fault,
				values: { name: target.name, path, fault },
			})
	}
	const normalised = [...new Set(request.paths.map(normaliseScopeEntry))]
	const added = normalised.filter((path) => !scope.some((entry) => isHeldBy({ path, entry })))
	if (added.length === 0)
		return answerOf({
			exitCode: 0,
			lines: [
				fillMessage({
					template: LOT_SCOPE_TEXTS.already,
					values: { name: target.name, paths: normalised.join(LOT_SCOPE_LIST_SEPARATOR) },
				}),
			],
		})
	const overlap = addOverlapOf({ target, added })
	if (overlap !== undefined)
		return refused({
			template: LOT_SCOPE_TEXTS.overlap,
			values: { name: target.name, lot: overlapLotLabelOf(overlap), met: overlapMetText(overlap) },
		})
	return recordChange({
		...params,
		change: {
			schema: SCOPE_CHANGE_SCHEMA,
			at: params.now.toISOString(),
			op: 'add',
			paths: added,
			by: request.by,
			reason: request.reason,
		},
		recheck: () => addOverlapOf({ target, added }),
	})
}

/** The first open lot, other than the target, whose effective scope the added paths meet; none when they meet none. */
function addOverlapOf(params: { target: ScopeTarget; added: string[] }): LotOverlap | undefined {
	const { target } = params
	const [overlap] = overlappingOpenLots({
		store: dirname(target.lotFolder),
		registry: registryOfLotFolder(target.lotFolder),
		scope: params.added,
		caseInsensitive: probeCaseInsensitive({ path: target.repository }),
		except: basename(target.lotFolder),
	})
	return overlap
}

/**
 * A drop: each path an entry of the effective scope or one holding entries, never a path inside a wider entry;
 * refused when a file the lot's worktree changed lies inside a dropped entry, or the worktree cannot be read.
 */
function dropPaths(params: {
	request: ScopeRequest
	target: ScopeTarget
	scope: string[]
	now: Date
	seams?: ScopeSeams
}): CommandResult {
	const { request, target, scope } = params
	const normalised = [...new Set(request.paths.map(normaliseScopeEntry))]
	for (const path of normalised) {
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
	// a brief never holds an empty scope: a lot that hands back everything stops instead
	const left = effectiveScopeOf({
		brief: scope,
		changes: [dropOf({ paths: normalised, now: params.now })],
	})
	if (left.length === 0)
		return refused({ template: LOT_SCOPE_TEXTS.emptied, values: { name: target.name } })
	const changed = changedFilesOf({ worktree: target.worktree })
	if (changed === undefined)
		return refused({
			template: LOT_SCOPE_TEXTS.worktreeUnreadable,
			values: { name: target.name, worktree: target.worktree ?? NO_WORKTREE },
		})
	for (const path of normalised) {
		const dropped = scope.filter((entry) => isDroppedBy({ entry, path }))
		const file = changed.find((each) =>
			dropped.some((entry) => isInsideEntry({ path: each, entry })),
		)
		if (file !== undefined)
			return refused({
				template: LOT_SCOPE_TEXTS.changed,
				values: { name: target.name, path, file },
			})
	}
	return recordChange({ ...params, change: dropOf({ paths: normalised, now: params.now }) })
}

/** The drop line of `paths` at `now`. */
function dropOf(params: { paths: string[]; now: Date }): ScopeChange {
	return {
		schema: SCOPE_CHANGE_SCHEMA,
		at: params.now.toISOString(),
		op: 'drop',
		paths: params.paths,
	}
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
 * Writes the change - refused before the write when its line is over the limit - then its `scope.changed` event; an
 * event that cannot be written adds one line and never changes the exit code (D6).
 */
function recordChange(params: {
	target: ScopeTarget
	change: ScopeChange
	scope: string[]
	seams?: ScopeSeams
	now?: Date
	/** An add's overlap read again once it is appended: a lot that started or widened meanwhile (D12). */
	recheck?: () => LotOverlap | undefined
}): CommandResult {
	const { target, change } = params
	const bytes = scopeChangeLineOf({ change }).length
	if (bytes > SCOPE_CHANGE_LINE_LIMIT)
		return refused({
			template: LOT_SCOPE_TEXTS.overLimit,
			values: {
				name: target.name,
				message: overLimitMessage({ bytes, limit: SCOPE_CHANGE_LINE_LIMIT }),
			},
		})
	try {
		appendScopeChange({ lotFolder: target.lotFolder, change })
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
	if (late !== undefined) return undoneAdd({ target, change, overlap: late, now: params.now })
	const effective = effectiveScopeOf({ brief: params.scope, changes: [change] })
	const changedLine = fillMessage({
		template: change.op === 'add' ? LOT_SCOPE_TEXTS.added : LOT_SCOPE_TEXTS.dropped,
		values: {
			name: target.name,
			paths: change.paths.join(LOT_SCOPE_LIST_SEPARATOR),
			by: change.by ?? '',
			scope: effective.join(LOT_SCOPE_LIST_SEPARATOR),
		},
	})
	const eventFailure = writeScopeEvent({ target, change })
	return answerOf({
		exitCode: 0,
		lines: eventFailure === undefined ? [changedLine] : [changedLine, eventFailure],
	})
}

/**
 * Undoes an add a lot that started or widened meanwhile meets, the way `lot start` fails its own lot on a late
 * overlap: an `undo` line taking back exactly the add's paths, no event, exit 2 naming that lot; an undo that cannot be
 * written exits 1 naming the paths and the lot (D13).
 */
function undoneAdd(params: {
	target: ScopeTarget
	change: ScopeChange
	overlap: LotOverlap
	now?: Date
}): CommandResult {
	const { target, change } = params
	try {
		appendScopeChange({
			lotFolder: target.lotFolder,
			change: {
				schema: SCOPE_CHANGE_SCHEMA,
				at: (params.now ?? new Date()).toISOString(),
				op: 'undo',
				paths: change.paths,
			},
		})
	} catch (error) {
		return answerOf({
			exitCode: 1,
			lines: [
				fillMessage({
					template: LOT_SCOPE_TEXTS.undoFailure,
					values: {
						name: target.name,
						paths: change.paths.join(LOT_SCOPE_LIST_SEPARATOR),
						lot: overlapLotLabelOf(params.overlap),
						message: (error as Error).message,
					},
				}),
			],
		})
	}
	return refused({
		template: LOT_SCOPE_TEXTS.lateOverlap,
		values: {
			name: target.name,
			lot: overlapLotLabelOf(params.overlap),
			met: overlapMetText(params.overlap),
		},
	})
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
