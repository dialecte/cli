/**
 * `dialecte mutants record`'s write: the committed record of each survivor, then its ledger item moved to `recorded`.
 * Both happen inside one hold of the ledger lock, the records file first: two calls never lose each other's records,
 * and a crash between the two writes leaves the item `new` until the next run (or call) takes the record in.
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { itemsOf, ledgerKeyOf, withLedgerLock } from './ledger.ts'
import {
	LEADING_DOT_SLASH,
	RECORD_REASON_MAX_CHARS,
	UNCLASSIFIED_FAMILY,
} from './mutation-agent.constants.ts'
import {
	MUTATION_FAMILIES,
	MUTATION_RECORDS_PATH,
	REMOVABLE_FAMILIES,
} from './mutation.constants.ts'
import { readRecordsFile } from './records-file.ts'
import { packageNameOf, writeAtomically } from './run-store.ts'

import type { RecordedItem, RecordResult } from './mutation-agent.types.ts'
import type {
	KeyedLedgerItem,
	LockedLedger,
	MutationFamily,
	MutationRecord,
	MutationRecords,
} from './mutation.types.ts'

/** Writes the records of these survivors (or of every pending survivor of a file), then moves their ledger items to `recorded`. */
export function recordKeys(params: {
	root: string
	keys?: readonly string[]
	file?: string
	family: MutationFamily
	reason: string
	removable: boolean
	/** A test seam: called between the records write and the ledger move. */
	afterRecordsWritten?: () => void
}): RecordResult {
	const { root, keys, family, removable, afterRecordsWritten } = params
	const reason = params.reason.trim()
	const refused = refusalOf({ family, reason, removable, keys, file: params.file })
	if (refused !== undefined) return { ok: false, reason: refused }
	const packageName = packageNameOf(root)
	return withLedgerLock({
		root,
		work: function recordUnderLock(state): RecordResult {
			const chosen = chosenItems({ state, packageName, keys, file: params.file })
			if ('refused' in chosen) return { ok: false, reason: chosen.refused }
			writeRecords({ root, items: chosen.items, family, reason, removable })
			afterRecordsWritten?.()
			return {
				ok: true,
				family,
				items: moveToRecorded({ state, packageName, items: chosen.items }),
			}
		},
	})
}

/** Why the call is refused before the ledger is read; undefined when it may go on. */
function refusalOf(params: {
	family: string
	reason: string
	removable: boolean
	keys: readonly string[] | undefined
	file: string | undefined
}): string | undefined {
	const { family, reason, removable, keys, file } = params
	const families = MUTATION_FAMILIES.filter((each) => each !== UNCLASSIFIED_FAMILY)
	if (!(families as readonly string[]).includes(family))
		return family === UNCLASSIFIED_FAMILY
			? `${UNCLASSIFIED_FAMILY} is the placeholder of an unjudged record, not a family (a gap gets a test): one of ${families.join(', ')}`
			: `${family} is no family: one of ${families.join(', ')}`
	if (reason === '') return 'the reason is empty: say why no output can change'
	if (reason.length > RECORD_REASON_MAX_CHARS)
		return `the reason is ${reason.length} characters long: at most ${RECORD_REASON_MAX_CHARS}`
	if (removable && !(REMOVABLE_FAMILIES as readonly string[]).includes(family))
		return `removable is for ${REMOVABLE_FAMILIES.join(' and ')} only, not ${family}`
	if ((keys === undefined || keys.length === 0) === (file === undefined))
		return 'name the survivors by key, or a file: one of the two'
	return undefined
}

/** The package's items the call names: its keys (each known), or the `new` and `scheduled` items of its file. */
function chosenItems(params: {
	state: LockedLedger
	packageName: string
	keys: readonly string[] | undefined
	file: string | undefined
}): { items: KeyedLedgerItem[] } | { refused: string } {
	const { state, packageName, keys } = params
	const items = itemsOf({ ledger: state.ledger, packageName })
	if (keys !== undefined && keys.length > 0) {
		const byKey = new Map(items.map((item) => [item.key, item]))
		const named = [...new Set(keys)]
		const unknown = named.filter((key) => !byKey.has(key))
		if (unknown.length > 0)
			return {
				refused: `no survivor ${unknown.join(', ')} of ${packageName} in the ledger: dialecte mutants status lists the keys`,
			}
		return { items: named.flatMap((key) => byKey.get(key) ?? []) }
	}
	const file = (params.file ?? '').replace(LEADING_DOT_SLASH, '')
	const pending = items.filter(
		(item) => item.file === file && (item.state === 'new' || item.state === 'scheduled'),
	)
	if (pending.length === 0)
		return { refused: `no new or scheduled survivor of ${packageName} in ${file}` }
	return { items: pending }
}

/** The records file with a record for each item, every other record kept; files and records in order. */
function writeRecords(params: {
	root: string
	items: readonly KeyedLedgerItem[]
	family: MutationFamily
	reason: string
	removable: boolean
}): void {
	const { root, items, family, reason, removable } = params
	const next: Record<string, Record<string, MutationRecord>> = Object.fromEntries(
		Object.entries(readRecordsFile({ root })).map(([file, records]) => [file, { ...records }]),
	)
	for (const item of items)
		(next[item.file] ??= {})[item.key] = recordOf({ item, family, reason, removable })
	const path = join(root, MUTATION_RECORDS_PATH)
	mkdirSync(dirname(path), { recursive: true })
	writeAtomically({ path, text: `${JSON.stringify(sortedRecords(next), null, '\t')}\n` })
}

function recordOf(params: {
	item: KeyedLedgerItem
	family: MutationFamily
	reason: string
	removable: boolean
}): MutationRecord {
	const { item, family, reason, removable } = params
	const base = {
		line: item.line,
		mutation: item.mutation,
		reason,
		lineHash: item.lineHash,
		...(item.testsHash === undefined ? {} : { testsHash: item.testsHash }),
	}
	if (isRemovableFamily(family)) return { ...base, family, removable }
	return { ...base, family }
}

/** A family whose records carry `removable`. */
function isRemovableFamily(family: MutationFamily): family is (typeof REMOVABLE_FAMILIES)[number] {
	return (REMOVABLE_FAMILIES as readonly string[]).includes(family)
}

/** Files by name, each file's records by line then key. */
function sortedRecords(records: MutationRecords): MutationRecords {
	return Object.fromEntries(
		Object.keys(records)
			.sort(byText)
			.map((file) => [
				file,
				Object.fromEntries(
					Object.entries(records[file]).sort(
						([firstKey, first], [secondKey, second]) =>
							first.line - second.line || byText(firstKey, secondKey),
					),
				),
			]),
	)
}

/** Moves each `new` or `scheduled` item to `recorded` (moved by `record`); a killed or recorded one stays as it is. */
function moveToRecorded(params: {
	state: LockedLedger
	packageName: string
	items: readonly KeyedLedgerItem[]
}): RecordedItem[] {
	const { state, packageName, items } = params
	const ledger = { ...state.ledger }
	const moved = items.map(({ key, ...item }): RecordedItem => {
		const pending = item.state === 'new' || item.state === 'scheduled'
		if (pending)
			ledger[ledgerKeyOf({ packageName, key })] = {
				...item,
				state: 'recorded',
				movedBy: 'record',
			}
		return {
			key,
			file: item.file,
			line: item.line,
			from: item.state,
			to: pending ? 'recorded' : item.state,
		}
	})
	if (moved.some(({ from, to }) => from !== to)) {
		state.ledger = ledger
		state.changed = true
	}
	return moved
}

function byText(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}
