import { countedLines } from '../standard/cap-slice-range.ts'
import { fillMessage } from '../standard/fill-message.ts'
import { AskRefusal } from './ask-refusal.ts'
import {
	NAME_SEPARATOR,
	PACK_SEARCH_LIMIT,
	POOL_REFUSALS,
	SLICE_ID_PREFIX,
} from './ask.constants.ts'
import { ladderRequestOf } from './ladder-request-of.ts'
import { loadAskSetup } from './load-ask-setup.ts'
import { loadStandardIndexes } from './load-standard-indexes.ts'
import { identityOf } from './merge-slices.ts'
import { packPoolOf } from './pack-pool-of.ts'
import { aboutOf } from './parse-subject.ts'
import { placedDialecteOf } from './placed-dialecte-of.ts'
import { runLadder } from './run-ladder.ts'
import { sliceQualityOf } from './slice-quality-of.ts'
import { slicesOf } from './slices-of.ts'

import type { StandardSlice } from '../standard/standard-search.types.ts'
import type {
	AskPool,
	AskPoolOfParams,
	AskRecordView,
	AskRequestRecord,
	AskSetupBase,
	AskSlice,
	AskStandard,
	LoadedStandards,
	ManifestFile,
	PoolOfListAndSearchParams,
	PoolSlice,
	SliceQuality,
} from './ask.types.ts'

/**
 * The pool of a pack rebuilt from what the ask recorded (D3): the setup and the documents reloaded as the ask read
 * them (its request, the dialecte its question places, its folders), refused when a file of its manifest moved, was
 * removed or added since; then the ask's list first and a wider search's other slices (`PACK_SEARCH_LIMIT`), a
 * slice of the wider search the list holds keeping the list's id. A re-ask's record holds no angle nor slice: the
 * ladder's read, angle and slice steps run from its request (no fact read or written, D33).
 */
export async function askPoolOf(params: AskPoolOfParams): Promise<AskPool> {
	const { request } = params
	const documents = await documentsOf(params)
	if ('refused' in documents) return documents
	const { base, loaded } = documents
	const changed = changedFileOf({
		recorded: request.standard?.files ?? [],
		current: loaded.manifest,
		question: request.question,
	})
	if (changed !== undefined) return { refused: changed, exitCode: 2, fileChanged: true }
	const record = recordOf({ request, record: params.record, base, standard: loaded.standard })
	if ('refused' in record) return { refused: record.refused, exitCode: 2 }

	const files = new Map(
		loaded.standard.indexes.flatMap((index) => index.files).map((file) => [file.fileId, file]),
	)
	const listed = record.record.slices
	const found = slicesOf({
		question: request.question,
		angles: record.record.angles,
		indexes: loaded.standard.indexes,
		about:
			record.record.subject?.tags[0]?.tag ??
			aboutOf({ about: request.about ?? undefined }).tag?.tag,
		questionAbout: aboutOf({ about: request.about ?? undefined }).tag?.tag,
		limit: PACK_SEARCH_LIMIT,
	})
	const pool = poolOfListAndSearch({ listed, found, angles: record.record.angles, files })
	return {
		pool,
		files,
		manifest: loaded.manifest,
		record: record.record,
		base,
		standard: loaded.standard,
		originalLines: loaded.originalLines,
	}
}

/**
 * The pool of the ask's list and the wider search's slices (the list's ids kept), each slice read for its counted
 * lines and its quality in the file's index; the one pool a pack and the gold run (`standard eval --packs`) share.
 */
export function poolOfListAndSearch(params: PoolOfListAndSearchParams): PoolSlice[] {
	const { listed, found, files } = params
	return packPoolOf({
		listed,
		wider: widerWithListIds({ found, listed }),
		angles: params.angles,
		countedOf: function countedOfSlice({ slice }): number {
			const file = files.get(slice.file)
			return countedLines({ from: slice.from, to: slice.to, noiseRanges: file?.noiseRanges ?? [] })
		},
		qualityOf: function qualityOfSlice({ slice }): SliceQuality {
			const file = files.get(slice.file)
			// a slice of a file the documents no longer hold cannot be read: never given
			return file === undefined ? 'unreadable' : sliceQualityOf({ slice, file })
		},
	})
}

/** The setup (the caller's, else loaded without facts) and the ask's folders loaded, or the refusal. */
async function documentsOf(
	params: AskPoolOfParams,
): Promise<{ base: AskSetupBase; loaded: LoadedStandards } | { refused: string; exitCode: 1 | 2 }> {
	const { cwd, environment, request } = params
	const setup =
		params.base === undefined
			? await loadAskSetup({
					cwd,
					environment,
					...(request.package === null ? {} : { packageName: request.package }),
					facts: false,
				})
			: { setup: params.base }
	if ('refused' in setup) return { refused: setup.refused, exitCode: 2 }
	const placed = placedDialecteOf({ request: ladderRequestOf({ request }), base: setup.setup })
	if ('refused' in placed) return { refused: placed.refused, exitCode: 2 }
	const packageName = placed.dialecte?.packageName
	const loaded = await loadStandardIndexes({
		cwd,
		environment,
		standardIds: request.standard?.folders ?? [],
		...(packageName === undefined ? {} : { packageName }),
	})
	if (loaded.kind === 'refused') return { refused: loaded.message, exitCode: 2 }
	if (loaded.kind === 'aborted') return { refused: loaded.message, exitCode: 1 }
	if (loaded.kind === 'unknownPackage')
		return {
			refused: fillMessage({
				template: POOL_REFUSALS.unknownPackage,
				values: { name: loaded.name, installed: loaded.installed.join(NAME_SEPARATOR) },
			}),
			exitCode: 2,
		}
	return { base: setup.setup, loaded }
}

/**
 * The ask's record the pool is built from: as recorded, or (a re-ask: no subject, no angle) its subject, angles and
 * slices from the ladder run on its request, facts neither read nor written (D33); the refusal of the ladder.
 */
function recordOf(params: {
	request: AskRequestRecord
	record: AskRecordView
	base: AskSetupBase
	standard: Extract<AskStandard, { kind: 'documents' }>
}): { record: AskRecordView } | { refused: string } {
	const { record } = params
	if (record.subject !== null || record.angles.length > 0) return { record }
	try {
		const outcome = runLadder({
			request: ladderRequestOf({ request: params.request }),
			setup: { ...params.base, standard: params.standard },
			ask: null,
			lot: null,
		})
		return {
			record: {
				...record,
				subject: outcome.subject,
				angles: outcome.angles,
				slices: outcome.slices,
			},
		}
	} catch (error) {
		if (error instanceof AskRefusal) return { refused: error.message }
		throw error
	}
}

/** The refusal naming the first file not as the ask read it: moved, removed, or added since; none when all hold. */
function changedFileOf(params: {
	recorded: ManifestFile[]
	current: ManifestFile[]
	question: string
}): string | undefined {
	const { recorded, current, question } = params
	for (const file of recorded) {
		const now = current.find((candidate) => candidate.id === file.id)
		if (now === undefined)
			return changeRefusalOf({ file: file.id, how: POOL_REFUSALS.missing, question })
		if (now.sha256 !== file.sha256)
			return changeRefusalOf({ file: file.id, how: POOL_REFUSALS.moved, question })
	}
	const added = current.find((file) => !recorded.some((known) => known.id === file.id))
	return added === undefined
		? undefined
		: changeRefusalOf({ file: added.id, how: POOL_REFUSALS.added, question })
}

/** The `file-changed` refusal of a file, how it changed and the ask to make again. */
function changeRefusalOf(params: { file: string; how: string; question: string }): string {
	return fillMessage({ template: POOL_REFUSALS.fileChanged, values: params })
}

/**
 * The wider search's slices, each slice the ask listed (same file and lines) under the list's id, the others under
 * ids that follow the list's.
 */
function widerWithListIds(params: { found: AskSlice[]; listed: AskSlice[] }): AskSlice[] {
	const listedIds = new Map(
		params.listed.map((slice) => [identityOf({ slice: asFound(slice) }), slice.id]),
	)
	let next = params.listed.length
	return params.found.map(function withListId(slice): AskSlice {
		const known = listedIds.get(identityOf({ slice: asFound(slice) }))
		if (known !== undefined) return { ...slice, id: known }
		next += 1
		return { ...slice, id: `${SLICE_ID_PREFIX}${next}` }
	})
}

/** A slice as `identityOf` reads it (its file, first and last line). */
function asFound(slice: AskSlice): StandardSlice {
	return { ...slice, title: null, terms: [] }
}
