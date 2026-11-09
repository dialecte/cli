/**
 * The records of a lot folder read from disk, as `lotState` takes them: file reads only, no git and no child
 * process, so every reader of a state (the overlap, `status`) builds its input the same way.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { readAbandonedMarker, readRunMarker } from '../handover/handover-marker-read.ts'
import {
	entryOfFolder,
	readStoreEntries,
	registryOfCommonFolder,
} from '../handover/handover-store-read.ts'
import { readAnswerFiles } from './answer-files.ts'
import { normaliseScopeEntry, overlaps } from './brief-scope.ts'
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
import { listLotNames } from './store-folder.ts'
import { REREAD_PAUSE_MS, STORE_FILES } from './store.constants.ts'
import { readTransitions } from './transitions.ts'

import type {
	CheckedLotState,
	LotOverlap,
	LotStateInput,
	LotStateReadParams,
	SynchronousPause,
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
 * its markers; a run marker counts only while its pid runs. Undefined when the folder holds no readable identity
 * (no lot) or a record that does not hold (a damaged lot, as one with an unreadable identity).
 */
export function readLotStateInput(params: LotStateReadParams): LotStateInput | undefined {
	const checked = readCheckedLotState(params)
	return checked !== undefined && 'input' in checked ? checked.input : undefined
}

/**
 * The lot of a folder read once, its records validated once (`record-checks.ts`): its `lotState` input, or why a
 * transition or an answer file does not hold. Undefined when the folder holds no readable identity.
 */
export function readCheckedLotState(params: LotStateReadParams): CheckedLotState | undefined {
	const identity = readIdentity({ lotFolder: params.lotFolder })
	if (identity === undefined) return undefined
	const { lotFolder } = params
	const transitions = readTransitions({ lotFolder })
	const answerFiles = readAnswerFiles({ lotFolder })
	const registryEntry = entryOfFolder({
		entries: params.entries ?? readStoreEntries(params.registry),
		folder: lotFolder,
	})
	const abandoned = readAbandonedMarker(lotFolder)
	// the reader leaves out a marker whose process is gone: row 2 counts only a live run
	const runMarker = readRunMarker(lotFolder)
	const damage =
		identityDamageOf(identity) ??
		firstDamageOf(transitions.map(transitionDamageOf)) ??
		firstDamageOf(answerFiles.map(answerDamageOf)) ??
		(registryEntry && entryDamageOf(registryEntry)) ??
		markerDamageOf(abandoned?.at) ??
		markerDamageOf(runMarker?.startedAt) ??
		(identity.simulated ? scenarioDamageOf(readScenario({ lotFolder })) : undefined)
	if (damage !== undefined) return { damage }
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
 * `except` (a lot name) is left out.
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
	const { store, caseInsensitive } = params
	// the registry read once for every lot; the one re-read of a marker-only lot reads it again
	const entries = readStoreEntries(params.registry)
	return listLotNames({ store }).flatMap(function overlapOf(name): LotOverlap[] {
		if (name === params.except) return []
		const lotFolder = join(store, name)
		const first = readLotStateInput({ lotFolder, registry: params.registry, entries })
		// a simulated lot is never open: no re-read can change that
		const input =
			first && !first.identity.simulated
				? settledLotStateInput({
						input: first,
						lotFolder,
						registry: params.registry,
						pause: params.pause,
					})
				: first
		if (!input || !isOpenRealLot(input)) return []
		const theirs = readLotScope({ lotFolder })
		const met = params.scope.flatMap((entry) =>
			theirs
				.filter((other) => overlaps({ a: entry, b: other, caseInsensitive }))
				.map((other) => `${entry} meets ${other}`),
		)
		return met.length === 0 ? [] : [{ name, met }]
	})
}

/** The scope of the lot's `brief.json`, each entry normalised; none when the brief does not parse. */
export function readLotScope(params: { lotFolder: string }): string[] {
	let brief: unknown
	try {
		brief = JSON.parse(readFileSync(join(params.lotFolder, STORE_FILES.brief), 'utf8'))
	} catch {
		return []
	}
	const scope = (brief as { scope?: unknown } | null)?.scope
	if (!Array.isArray(scope)) return []
	return scope
		.filter((entry): entry is string => typeof entry === 'string')
		.map(normaliseScopeEntry)
}
