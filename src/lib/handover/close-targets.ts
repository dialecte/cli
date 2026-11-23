/**
 * What `lot close` closes, per argument: lot-shaped (a store lot's id, name or index: the lot's own
 * worktree, every registry entry of it beside), entry-shaped (a hand-over of the registry by name or index), or unknown
 * (its own outcome: the other arguments still close). Then each lot the arguments reach settled once
 * (`settleLotLanding`, with the host): a merged lot's entry committed and its landed line kept; a lot target kept when
 * its lot is open or cannot be read.
 */
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { CARDS_LOG_FILE } from '../events/cards-log.constants.ts'
import { readCardsLog } from '../events/cards-log.ts'
import { realPathOf } from '../file-system.ts'
import { hostNounsOf } from '../host/select-host.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { landedLineOf, settleLotLanding } from '../landing/lot-landing.ts'
import { readIdentity } from '../store/identity.ts'
import { requiredLotOf } from '../store/resolve-lot.ts'
import { listLotIdentities, locateStore } from '../store/store-folder.ts'
import { LOT_LINK_SEGMENTS } from '../store/store.constants.ts'
import { CLOSE_TARGET_TEXTS } from './close-targets.constants.ts'
import { readStoreEntries, readStoreEntry } from './handover-store-read.ts'
import {
	entryOfArgument,
	findHandoverStore,
	handoverStoreOf,
	recordHandoverState,
	registeredEntryOf,
} from './handover-store.ts'

import type { HostAdapter } from '../host/host.types.ts'
import type { RecordedTips, SettledLot } from '../landing/lot-landing.types.ts'
import type { ListedWorktree } from '../worktree/worktree.types.ts'
import type { CloseSettle } from './close-targets.types.ts'
import type { CloseTarget, StoreEntry } from './handover.types.ts'

/**
 * Each argument as a close target, in order: an exact registry entry name is entry-shaped; else a store lot (its id,
 * name or index) is lot-shaped; else an entry by index; else unknown. Reads files and one worktree list.
 *
 * @intent tell what each lot close argument names before anything is decided
 * @internal
 */
export function closeTargetsOf(params: {
	main: string
	names: readonly string[]
	/** The repository's registered worktrees, parked ones left out. */
	worktrees: readonly ListedWorktree[]
}): CloseTarget[] {
	const { main } = params
	const store = findHandoverStore(main)
	const lotStore = locateStore({ from: main })?.store
	const entries = store === undefined ? [] : readStoreEntries(store)
	return params.names.map(function targetOf(argument): CloseTarget {
		const named = store === undefined ? undefined : readStoreEntry({ store, name: argument })
		const lotFolder = named === undefined ? lotFolderOf({ argument, main }) : undefined
		if (lotFolder !== undefined)
			return lotTargetOf({ argument, lotFolder, store, entries, worktrees: params.worktrees })
		const entry = named ?? entryOfArgument({ argument, store, lotStore })
		if (entry === undefined)
			return { kind: 'unknown', argument, entry: undefined, worktree: undefined }
		return {
			kind: 'entry',
			argument,
			entry,
			worktreePath: realPathOf(entry.worktree),
			branch: entry.branch,
			worktree: listedAt({ worktrees: params.worktrees, path: entry.worktree }),
			lotFolder: entryLotFolderOf({ entry, lotStore }),
		}
	})
}

/**
 * Each lot the targets reach settled once with `host` (its own lot, and the store lots naming an entry's worktree and
 * branch): a merged lot's entry is committed; each target gets its landed lines and, for a lot target whose lot is
 * open or cannot be read, why it stays; a lot target's lot state is the settled one (landed: committed).
 *
 * @intent settle every lot a close reaches once, before any decision
 * @internal
 */
export function settleCloseTargets(params: {
	main: string
	targets: readonly CloseTarget[]
	host: HostAdapter | undefined
	now: Date
}): CloseSettle {
	const { main, now } = params
	const store = findHandoverStore(main)
	const lotStore = locateStore({ from: main })?.store
	// each store lot with its folder's real path: the lots an entry's worktree and branch reach
	const storeLots =
		lotStore === undefined
			? []
			: listLotIdentities({ store: lotStore }).map((lot) => ({
					...lot,
					folder: realPathOf(join(lotStore, lot.name)),
				}))
	const recorded = readRecordedTips({ main, store })
	const settled = new Map<string, SettledLot>()
	function settle(lotFolder: string): SettledLot {
		const known = settled.get(lotFolder)
		if (known !== undefined) return known
		const lot = settleLotLanding({
			lotFolder,
			...(params.host !== undefined && { host: params.host }),
			now,
			recorded,
		})
		// a merged lot's entry is committed, whichever verb wrote its landed fact
		if ('landed' in lot) recordHandoverState({ store, folder: lotFolder, state: 'committed' })
		settled.set(lotFolder, lot)
		return lot
	}
	return params.targets.map(function settleTarget(target) {
		const reaching =
			target.kind === 'entry'
				? storeLots
						.filter(
							(lot) =>
								lot.identity.branch === target.entry.branch &&
								typeof lot.identity.worktree === 'string' &&
								realPathOf(lot.identity.worktree) === realPathOf(target.entry.worktree),
						)
						.map((lot) => lot.folder)
				: []
		const own = target.kind === 'unknown' ? undefined : target.lotFolder
		const lots = [...new Set([...(own === undefined ? [] : [own]), ...reaching])].map(settle)
		const landed = landedLinesOf({ lots, main: params.main })
		if (target.kind !== 'lot') return { target, landed }
		const lot = settle(target.lotFolder)
		const name = basename(target.lotFolder)
		if ('notRead' in lot) return { target, landed, kept: lot.notRead }
		if ('open' in lot)
			return {
				target,
				landed,
				kept: fillMessage({
					template: CLOSE_TARGET_TEXTS.open,
					values: { lot: name, state: lot.open, why: lot.why },
				}),
			}
		return {
			target: { ...target, lotState: 'canceled' in lot ? 'canceled' : 'committed' },
			landed,
			...('landed' in lot && { landedTip: lot.landed.tip }),
		}
	})
}

/** The store lot an argument names (its id, name or index); undefined for none. */
function lotFolderOf(params: { argument: string; main: string }): string | undefined {
	const required = requiredLotOf({ argument: params.argument, cwd: params.main, mode: 'read' })
	return 'lot' in required ? realPathOf(required.lot) : undefined
}

/** A lot target: the lot's own worktree and branch, the entry registering its folder when it has one. */
function lotTargetOf(params: {
	argument: string
	lotFolder: string
	store: string | undefined
	entries: readonly StoreEntry[]
	worktrees: readonly ListedWorktree[]
}): CloseTarget {
	const { lotFolder } = params
	const identity = readIdentity({ lotFolder })
	const worktreePath =
		typeof identity?.worktree === 'string' ? realPathOf(identity.worktree) : undefined
	return {
		kind: 'lot',
		argument: params.argument,
		lotFolder,
		lot: basename(lotFolder),
		entry:
			params.store === undefined
				? undefined
				: registeredEntryOf({ store: params.store, folder: lotFolder }),
		worktreePath,
		branch: identity?.branch,
		worktree:
			worktreePath === undefined
				? undefined
				: listedAt({ worktrees: params.worktrees, path: worktreePath }),
		lotState: undefined,
	}
}

/**
 * The store lot whose landing an entry closes by: the lot folder it registers; else, for an entry of a hand-over
 * folder, the lot folder its worktree's `.dialecte/lot` link resolves to, when that is a lot of this store on the
 * entry's branch (a lot committed through a hand-over keeps its landed fact in its own folder).
 */
function entryLotFolderOf(params: {
	entry: StoreEntry
	lotStore: string | undefined
}): string | undefined {
	const { entry, lotStore } = params
	if (lotStore === undefined) return undefined
	const store = realPathOf(lotStore)
	const folder = realPathOf(entry.folder)
	if (dirname(folder) === store) return folder
	const link = join(entry.worktree, ...LOT_LINK_SEGMENTS)
	if (!existsSync(link)) return undefined
	const linked = realPathOf(link)
	if (linked === link || dirname(linked) !== store) return undefined
	return readIdentity({ lotFolder: linked })?.branch === entry.branch ? linked : undefined
}

/** The registered worktree at `path`, compared by real path; undefined when none is. */
function listedAt(params: {
	worktrees: readonly ListedWorktree[]
	path: string
}): ListedWorktree | undefined {
	const real = realPathOf(params.path)
	return params.worktrees.find((worktree) => realPathOf(worktree.path) === real)
}

/** The repository's `cards.log` cards and registry entries, read once: where a stale lot's recorded tip is read. */
function readRecordedTips(params: { main: string; store: string | undefined }): RecordedTips {
	const store = params.store ?? handoverStoreOf(params.main)
	const file = join(store, CARDS_LOG_FILE)
	return {
		cards: existsSync(file) ? readCardsLog({ file }).cards : [],
		entries: params.store === undefined ? [] : readStoreEntries(params.store),
	}
}

// dialecte-allow duplicate-read: it maps settled lots through landedLineOf, the one landed-line writer
/** The landed line of each settled lot that landed, in the host's nouns of the repository at `main`. */
function landedLinesOf(params: { lots: readonly SettledLot[]; main: string }): string[] {
	const nouns = hostNounsOf({ root: params.main })
	return params.lots.flatMap(function landedLine(lot) {
		return 'landed' in lot ? [landedLineOf({ fact: lot.landed, nouns })] : []
	})
}
