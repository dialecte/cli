/**
 * The records of a lot folder read from disk, as `lotState` takes them: file reads only, no git and no child
 * process, so every reader of a state (the overlap, `status`) builds its input the same way.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { readAbandonedMarker, readRunMarker } from '../handover/handover-marker-read.ts'
import { registeredEntryOf } from '../handover/handover-store-read.ts'
import { readAnswers } from './answers.ts'
import { normaliseScopeEntry, overlaps } from './brief-scope.ts'
import { readIdentity } from './identity.ts'
import { lotState } from './lot-state.ts'
import { listLotNames } from './store-folder.ts'
import { STORE_FILES } from './store.constants.ts'
import { readTransitions } from './transitions.ts'

import type { LotOverlap, LotStateInput } from './store.types.ts'

/**
 * The input of `lotState` for a lot folder: its identity, transitions and answers, the registry entry naming it,
 * its markers; a run marker counts only while its pid runs. Undefined when the folder holds no readable identity
 * (no lot).
 */
export function readLotStateInput(params: {
	lotFolder: string
	/** The repository's hand-over registry (`<git common folder>/dialecte-handover`). */
	registry: string
}): LotStateInput | undefined {
	const identity = readIdentity({ lotFolder: params.lotFolder })
	if (identity === undefined) return undefined
	const abandoned = readAbandonedMarker(params.lotFolder)
	return {
		identity,
		transitions: readTransitions({ lotFolder: params.lotFolder }),
		answers: readAnswers({ lotFolder: params.lotFolder }),
		registryEntry: registeredEntryOf({ store: params.registry, folder: params.lotFolder }),
		abandonedMarker: abandoned && { at: abandoned.at },
		// the reader leaves out a marker whose process is gone: row 2 counts only a live run
		runMarker: readRunMarker(params.lotFolder),
	}
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
}): LotOverlap[] {
	const { store, caseInsensitive } = params
	return listLotNames({ store }).flatMap(function overlapOf(name): LotOverlap[] {
		if (name === params.except) return []
		const lotFolder = join(store, name)
		const input = readLotStateInput({ lotFolder, registry: params.registry })
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
