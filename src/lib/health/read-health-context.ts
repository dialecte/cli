import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { pairRuns } from '../events/pair-runs.ts'
import { readEvents } from '../events/read-events.ts'
import { realPathOf } from '../file-system.ts'
import { readStoredRecords } from '../gate-records/check-records.ts'
import { CHECK_STORE_FOLDER } from '../gate-records/gate-records.constants.ts'
import { readStoreEntries, registryOfCommonFolder } from '../handover/handover-store-read.ts'
import { REHEARSAL_DECISIONS_FILE } from '../handover/handover.constants.ts'
import { readIdentity } from '../store/identity.ts'
import { keptByDecision } from '../store/lot-keep.ts'
import { readCheckedLotState } from '../store/lot-records.ts'
import { lotState } from '../store/lot-state.ts'
import { listLotFolderNames } from '../store/store-folder.ts'
import { DAMAGED_STATE, STORE_FILES, STORE_FOLDER } from '../store/store.constants.ts'
import { STORE_FILE_EXTENSION } from './health.constants.ts'
import { readRegisteredWorktrees } from './read-worktrees.ts'

import type { LotEvent } from '../events/event.types.ts'
import type { GateRecord } from '../gate-records/gate-records.types.ts'
import type { RehearsalDecision, StoreEntry } from '../handover/handover.types.ts'
import type { HealthLot, HealthRepository, RehearsalPlan } from './health.types.ts'

/**
 * One read of a repository's git common dir: every lot's events, runs, rehearsal plan, state and worktree, every record
 * of its check store, and its registered worktrees. Starts no git process and never throws on one file: a broken store
 * file, event line or rehearsal plan is skipped, an events file that cannot be read reads as no events. The hand-over
 * registry is read once for every lot's state and every worktree's hand-over, not at all when its `entries` are given
 * (a caller that already read them).
 */
export function readHealthRepository(params: {
	common: string
	entries?: readonly StoreEntry[]
}): HealthRepository {
	const { common } = params
	const store = join(common, STORE_FOLDER)
	const registry = registryOfCommonFolder(common)
	const entries = params.entries ?? readStoreEntries(registry)
	return {
		name: basename(dirname(common)),
		common,
		lots: listLotFolderNames({ store }).map(function lotOf(name) {
			return readHealthLot({ folder: join(store, name), name, registry, entries })
		}),
		records: readStoreRecords({ common }),
		worktrees: readRegisteredWorktrees({ common, entries }),
	}
}

function readHealthLot(params: {
	folder: string
	name: string
	registry: string
	entries: readonly StoreEntry[]
}): HealthLot {
	const { folder, name } = params
	const events = readLotEvents({ file: join(folder, STORE_FILES.events) })
	const { runs } = pairRuns({ events })
	const rehearsal = readRehearsalPlan({ file: join(folder, REHEARSAL_DECISIONS_FILE) })
	const { state, kept } = readLotStateName(params)
	const worktree = readIdentity({ lotFolder: folder })?.worktree
	return {
		name,
		folder,
		events,
		runs,
		...(rehearsal === undefined ? {} : { rehearsal }),
		...(state === undefined ? {} : { state }),
		// by real path, as git registers it: a lot held by an identity spelled through a link is held all the same
		...(typeof worktree === 'string' ? { worktree: realPathOf(worktree) } : {}),
		...(kept ? { kept } : {}),
	}
}

/**
 * The lot's state as the store reads it, `damaged` when a record does not hold (an identity that does not read
 * included), and whether it is kept on purpose (`keptByDecision`, KEEP 3.5.5); no state when the folder holds no
 * `identity.json` (no lot records, only events for instance).
 */
function readLotStateName(params: {
	folder: string
	registry: string
	entries: readonly StoreEntry[]
}): Pick<HealthLot, 'state' | 'kept'> {
	const { folder, registry, entries } = params
	if (!existsSync(join(folder, STORE_FILES.identity))) return {}
	const checked = readCheckedLotState({ lotFolder: folder, registry, entries })
	if (checked === undefined) return {}
	const state = 'damage' in checked ? DAMAGED_STATE : lotState(checked.input).state
	return keptByDecision({ keep: checked.keep }) === undefined ? { state } : { state, kept: true }
}

/** The lot's events, sorted; none when the file cannot be read (no access, for instance). */
function readLotEvents(params: { file: string }): LotEvent[] {
	try {
		return readEvents(params).events
	} catch {
		return []
	}
}

/**
 * The plan a rehearsal wrote, when the file holds `{ at: string, lots: array }` and every lot of it holds its number,
 * its tree and its decision; undefined otherwise.
 */
function readRehearsalPlan(params: { file: string }): RehearsalPlan | undefined {
	if (!existsSync(params.file)) return undefined
	try {
		const parsed: unknown = JSON.parse(readFileSync(params.file, 'utf8'))
		return isRehearsalPlan(parsed) ? parsed : undefined
	} catch {
		return undefined
	}
}

function isRehearsalPlan(value: unknown): value is RehearsalPlan {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		'at' in value &&
		typeof value.at === 'string' &&
		'lots' in value &&
		Array.isArray(value.lots) &&
		value.lots.every(isRehearsalDecision)
	)
}

function isRehearsalDecision(value: unknown): value is RehearsalDecision {
	return (
		typeof value === 'object' &&
		value !== null &&
		'lot' in value &&
		typeof value.lot === 'number' &&
		'tree' in value &&
		typeof value.tree === 'string' &&
		'decision' in value &&
		typeof value.decision === 'string'
	)
}

/**
 * Every record of every store file of the common dir (a broken file reads as none, a folder that cannot be read as no
 * records).
 */
function readStoreRecords(params: { common: string }): GateRecord[] {
	const { common } = params
	const folder = join(common, CHECK_STORE_FOLDER)
	if (!existsSync(folder)) return []
	return readFolderNames({ folder })
		.filter((name) => name.endsWith(STORE_FILE_EXTENSION))
		.sort()
		.flatMap(function recordsOf(name) {
			const tree = name.slice(0, -STORE_FILE_EXTENSION.length)
			return readStoredRecords({ folder, tree })
		})
}

/** The names in the folder; none when it cannot be read (no access, for instance). */
function readFolderNames(params: { folder: string }): string[] {
	try {
		return readdirSync(params.folder)
	} catch {
		return []
	}
}
