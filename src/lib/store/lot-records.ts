/**
 * The records of a lot folder read from disk, as `lotState` takes them: file reads only, no git and no child
 * process, so every reader of a state (the overlap, `status`) builds its input the same way.
 */
import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { isPresent } from '../file-system.ts'
import { readAbandonedMarker, readRunMarker } from '../handover/handover-marker-read.ts'
import {
	entryOfFolder,
	readStoreEntries,
	registryOfCommonFolder,
} from '../handover/handover-store-read.ts'
import { readAnswerFiles } from './answer-files.ts'
import { normaliseScopeEntry, overlaps } from './brief-scope.ts'
import { committedElsewhereEntry, isResumedAfterEntry } from './committed-elsewhere.ts'
import { readIdentity } from './identity.ts'
import { isCanceledByMarkerOnly, lotState } from './lot-state.ts'
import {
	answerDamageOf,
	entryDamageOf,
	identityDamageOf,
	markerDamageOf,
	scenarioDamageOf,
	transitionDamageOf,
} from './record-checks.ts'
import { readScenario } from './scenario-file.ts'
import { listLotFolderNames } from './store-folder.ts'
import {
	DAMAGED_OVERLAP_LABEL,
	MET_PAIRS_SEPARATOR,
	RECORD_DAMAGE_REASONS,
	REREAD_PAUSE_MS,
	SCOPE_UNREADABLE,
	STORE_FILES,
} from './store.constants.ts'
import { readTransitions } from './transitions.ts'

import type { HandoverRunMarker, StoreEntry } from '../handover/handover.types.ts'
import type {
	CheckedLotState,
	LotIdentity,
	LotOverlap,
	LotStateInput,
	LotStateReadParams,
	SynchronousPause,
	Transition,
} from './store.types.ts'

/** The hand-over registry of the repository whose store holds `lotFolder`: beside the store in the git common folder. */
export function registryOfLotFolder(lotFolder: string): string {
	return registryOfCommonFolder(commonFolderOfLotFolder(lotFolder))
}

/** The git common folder of the repository whose store holds `lotFolder` (`<common>/dialecte-lots/<name>`). */
export function commonFolderOfLotFolder(lotFolder: string): string {
	return dirname(dirname(lotFolder))
}

/**
 * The input of `lotState` for a lot folder: its identity, transitions and answers, the registry entry naming it,
 * its markers; a run marker counts only while its pid runs. Undefined when nothing is at the folder (no lot) or a
 * record does not hold (a damaged lot, one with an unreadable identity included).
 */
export function readLotStateInput(params: LotStateReadParams): LotStateInput | undefined {
	const checked = readCheckedLotState(params)
	return checked !== undefined && 'input' in checked ? checked.input : undefined
}

/**
 * The lot of a folder read once, its records validated once (`record-checks.ts`): its `lotState` input, or why it is
 * damaged (P2.1) - an identity that does not read, one naming another folder, a record that does not hold - with
 * its identity when that reads. Undefined only when nothing is at the folder. The registry entry is the one naming the
 * lot folder, else a closed hand-over committed for its worktree and branch outside the folder (`closedElsewhereEntry`).
 */
export function readCheckedLotState(params: LotStateReadParams): CheckedLotState | undefined {
	const { lotFolder } = params
	if (!isPresent(lotFolder)) return undefined
	const identity = readIdentity({ lotFolder })
	if (identity === undefined)
		return { damage: RECORD_DAMAGE_REASONS.identityUnreadable, identity: undefined }
	// the name it holds is never printed: the folder's own name stands for the lot
	if (identity.name !== basename(lotFolder))
		return { damage: RECORD_DAMAGE_REASONS.identityName, identity }
	const transitions = readTransitions({ lotFolder })
	const answerFiles = readAnswerFiles({ lotFolder })
	const entries = params.entries ?? readStoreEntries(params.registry)
	const abandoned = readAbandonedMarker(lotFolder)
	// the reader leaves out a marker whose process is gone: row 2 counts only a live run
	const runMarker = readRunMarker(lotFolder)
	const registryEntry =
		entryOfFolder({ entries, folder: lotFolder }) ??
		closedElsewhereEntry({ entries, identity, lotFolder, transitions, runMarker })
	const damage =
		identityDamageOf(identity) ??
		firstDamageOf(transitions.map(transitionDamageOf)) ??
		firstDamageOf(answerFiles.map(answerDamageOf)) ??
		(registryEntry && entryDamageOf(registryEntry)) ??
		markerDamageOf(abandoned?.at) ??
		markerDamageOf(runMarker?.startedAt) ??
		(identity.simulated ? scenarioDamageOf(readScenario({ lotFolder })) : undefined)
	if (damage !== undefined) return { damage, identity }
	return {
		input: {
			identity,
			transitions,
			answers: answerFiles.map((file) => file.record),
			registryEntry,
			abandonedMarker: abandoned && { at: abandoned.at },
			runMarker,
		},
	}
}

/**
 * The entry a lot reads `committed` from, files only, when no entry registers its folder: the hand-over committed
 * for its worktree and branch outside its folder (every such entry committed), whose worktree `lot close` closed.
 * None when that entry does not hold, or the lot runs or was resumed after it (a live run marker, a later transition).
 */
function closedElsewhereEntry(params: {
	entries: readonly StoreEntry[]
	identity: LotIdentity
	lotFolder: string
	transitions: readonly Transition[]
	runMarker: HandoverRunMarker | undefined
}): StoreEntry | undefined {
	const entry = committedElsewhereEntry(params)
	if (entry === undefined || entry.closed === undefined || entryDamageOf(entry) !== undefined)
		return undefined
	return isResumedAfterEntry({ ...params, entry }) ? undefined : entry
}

/** The first reason among the checks of a lot's records; undefined when every record holds. */
function firstDamageOf(reasons: readonly (string | undefined)[]): string | undefined {
	return reasons.find((reason) => reason !== undefined)
}

/**
 * The input read of a lot, settled: when `abandoned.json` is its only evidence of `canceled` (the residual seam of
 * row 2), `pause` waits once (100 ms) and the lot is read again, so an abandon a crossing run takes back reads
 * open. The pause blocks this thread when left out.
 */
export function settledLotStateInput(params: {
	input: LotStateInput
	lotFolder: string
	registry: string
	pause?: SynchronousPause
}): LotStateInput | undefined {
	if (!isCanceledByMarkerOnly(params.input)) return params.input
	const pause = params.pause ?? pauseThisThread
	pause(REREAD_PAUSE_MS)
	return readLotStateInput({ lotFolder: params.lotFolder, registry: params.registry })
}

/** Blocks this thread for `milliseconds` (the overlap check is synchronous). */
function pauseThisThread(milliseconds: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

/** D12: a lot whose scope another real lot must not overlap (not simulated, committed, canceled, nor failed by an overlap). */
export function isOpenRealLot(input: LotStateInput): boolean {
	if (input.identity.simulated) return false
	const { state } = lotState(input)
	if (state === 'committed' || state === 'canceled') return false
	return !(state === 'failed' && input.transitions.at(-1)?.cause.kind === 'overlap')
}

/**
 * The open real lots of `store` (D12) a normalised `scope` overlaps, each with the pairs of entries that meet;
 * `except` (a lot name) is left out. Every lot folder is read (P2.2): a damaged lot is open until a person moves it
 * aside, with the scope of its `brief.json` when that reads as a list of texts, else holding every path; one whose
 * identity reads simulated holds none, as every simulated lot. An open lot whose records hold and whose brief gives
 * no scope holds every path too. The check never fails open on a record it cannot read.
 */
export function overlappingOpenLots(params: {
	store: string
	registry: string
	scope: readonly string[]
	caseInsensitive: boolean
	except?: string
	/** What waits before the one re-read of a lot only `abandoned.json` marks canceled; blocks the thread by default. */
	pause?: SynchronousPause
}): LotOverlap[] {
	const { store } = params
	// the registry read once for every lot; the one re-read of a marker-only lot reads it again
	const entries = readStoreEntries(params.registry)
	return listLotFolderNames({ store }).flatMap(function overlapOf(name): LotOverlap[] {
		if (name === params.except) return []
		const lotFolder = join(store, name)
		const checked = readCheckedLotState({ lotFolder, registry: params.registry, entries })
		if (checked === undefined) return []
		if ('damage' in checked)
			return damagedOverlapOf({ ...params, name, lotFolder, damage: checked.damage, checked })
		const first = checked.input
		// a simulated lot is never open: no re-read can change that
		const input = first.identity.simulated
			? first
			: settledLotStateInput({
					input: first,
					lotFolder,
					registry: params.registry,
					pause: params.pause,
				})
		if (!input || !isOpenRealLot(input)) return []
		const theirs = readBriefScope({ lotFolder })
		// a brief that gives no scope holds every path: the check never fails open
		if (theirs === undefined) return [{ name, met: [], everyPath: true }]
		const met = metPairsOf({ ...params, theirs })
		return met.length === 0 ? [] : [{ name, met }]
	})
}

/**
 * The overlap of a damaged lot: none when its identity reads simulated; every path when its brief gives no scope;
 * else the pairs that meet, as for any open lot.
 */
function damagedOverlapOf(params: {
	name: string
	lotFolder: string
	damage: string
	checked: { identity: LotIdentity | undefined }
	scope: readonly string[]
	caseInsensitive: boolean
}): LotOverlap[] {
	const { name, damage } = params
	if (params.checked.identity?.simulated === true) return []
	const theirs = readBriefScope({ lotFolder: params.lotFolder })
	if (theirs === undefined) return [{ name, met: [], damage, everyPath: true }]
	const met = metPairsOf({ ...params, theirs })
	return met.length === 0 ? [] : [{ name, met, damage }]
}

/** Each pair of an entry of `scope` and an entry of `theirs` that overlap, as `<ours> meets <theirs>`. */
function metPairsOf(params: {
	scope: readonly string[]
	theirs: readonly string[]
	caseInsensitive: boolean
}): string[] {
	const { caseInsensitive } = params
	return params.scope.flatMap((entry) =>
		params.theirs
			.filter((other) => overlaps({ a: entry, b: other, caseInsensitive }))
			.map((other) => `${entry} meets ${other}`),
	)
}

/**
 * How a refusal or a failure names the lot an overlap met: its name, with `(damaged: <reason>)` for a damaged lot.
 */
export function overlapLotLabelOf(overlap: LotOverlap): string {
	return overlap.damage === undefined
		? overlap.name
		: DAMAGED_OVERLAP_LABEL.replace('{name}', overlap.name).replace('{reason}', overlap.damage)
}

/** What met in an overlap: the pairs joined by `; `, or that the damaged lot's scope cannot be read. */
export function overlapMetText(overlap: LotOverlap): string {
	return overlap.everyPath === true ? SCOPE_UNREADABLE : overlap.met.join(MET_PAIRS_SEPARATOR)
}

/** The scope of the lot's `brief.json`, each entry normalised; none when the brief does not parse. */
export function readLotScope(params: { lotFolder: string }): string[] {
	const scope = briefScopeValueOf(params)
	if (!Array.isArray(scope)) return []
	return scope
		.filter((entry): entry is string => typeof entry === 'string')
		.map(normaliseScopeEntry)
}

/**
 * The scope of the lot's `brief.json` when it reads as a list of texts, each entry normalised; undefined when the
 * brief is missing, does not parse, or its scope is no such list.
 */
function readBriefScope(params: { lotFolder: string }): string[] | undefined {
	const scope = briefScopeValueOf(params)
	if (!Array.isArray(scope) || !scope.every((entry) => typeof entry === 'string')) return undefined
	return (scope as string[]).map(normaliseScopeEntry)
}

/**
 * The number of steps of the lot's `brief.json` (33L1 D13): at least 1, and 1 when the brief is missing, does not
 * parse, or its steps are no list or an empty one.
 */
export function readBriefStepCount(params: { lotFolder: string }): number {
	const steps = briefValueOf({ lotFolder: params.lotFolder, field: 'steps' })
	return Array.isArray(steps) && steps.length > 0 ? steps.length : 1
}

/** The `scope` value of the lot's `brief.json` as parsed; undefined when the brief is missing or does not parse. */
function briefScopeValueOf(params: { lotFolder: string }): unknown {
	return briefValueOf({ lotFolder: params.lotFolder, field: 'scope' })
}

/** A field of the lot's `brief.json` as parsed; undefined when the brief is missing or does not parse. */
function briefValueOf(params: { lotFolder: string; field: string }): unknown {
	try {
		const brief: unknown = JSON.parse(
			readFileSync(join(params.lotFolder, STORE_FILES.brief), 'utf8'),
		)
		return (brief as Record<string, unknown> | null)?.[params.field]
	} catch {
		return undefined
	}
}
