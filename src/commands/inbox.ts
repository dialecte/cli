/**
 * `dialecte inbox [--repository <name>] [--simulated] [--json]` (33S section 7): what waits on someone, across
 * every store of the store list and the store of the current folder. Reads files only, writes nothing, starts no
 * process (nothing this module reaches imports a child process).
 */
import { existsSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { renderCommandSection } from '../lib/command-map/render-help.ts'
import { realPathOf } from '../lib/file-system.ts'
import { readStoreEntries, registryOfCommonFolder } from '../lib/handover/handover-store-read.ts'
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { readIdentity } from '../lib/store/identity.ts'
import { answerNextOf } from '../lib/store/lot-next.ts'
import { readCheckedLotState } from '../lib/store/lot-records.ts'
import { locateStore } from '../lib/store/store-folder.ts'
import { readStoreList } from '../lib/store/store-list.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { printableOf } from '../lib/store/text-escape.ts'
import {
	HIDDEN_NAME_PREFIX,
	INBOX_COMMAND,
	INBOX_COLUMN_SEPARATOR,
	INBOX_COUNT_LINE,
	INBOX_DAMAGE_REASONS,
	INBOX_DAMAGED_LINE,
	INBOX_FLAGS,
	INBOX_GROUPS,
	INBOX_VALUE_OPTIONS,
	INBOX_WHAT,
} from './inbox.constants.ts'
import { lotStatusOfInput } from './lot-status.ts'
import { printsOnStandardError } from './lot-streams.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { StoreEntry } from '../lib/handover/handover.types.ts'
import type { LotStateInput } from '../lib/store/store.types.ts'
import type {
	InboxItem,
	InboxJson,
	InboxListing,
	InboxParams,
	InboxReading,
	InboxSeams,
} from './inbox.types.ts'
import type { LotStatusJson } from './lot-status.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runInbox({ cwd: process.cwd(), argv })
	;(printsOnStandardError({ verb: INBOX_COMMAND, exitCode: result.exitCode })
		? console.error
		: console.log)(result.output)
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

/**
 * The lots that wait on someone, grouped (person questions, caller questions, ready, failed), then the count of
 * working and simulated lots; a damaged lot is a line of its own. Exit 0 when something waits or is damaged, else 1,
 * 2 for a usage error.
 */
export function runInbox(params: InboxParams): CommandResult {
	const read = readArguments({
		argv: params.argv,
		valueOptions: INBOX_VALUE_OPTIONS,
		flags: INBOX_FLAGS,
	})
	if (typeof read === 'string')
		return inboxUsageExit({ reason: read, json: params.argv.includes(JSON_FLAG) })
	const json = read.flags.has('json')
	if (read.words.length > 0)
		return inboxUsageExit({ reason: `inbox takes no word: ${read.words.join(' ')}`, json })
	const listing: InboxListing = { items: [], working: 0, simulated: 0, damaged: [] }
	const reading: InboxReading = {
		repository: read.values.get('repository'),
		withSimulated: read.flags.has('simulated'),
		seams: params.seams,
		listing,
	}
	for (const store of storesOf(params.cwd)) readStore({ store, reading })
	const items = [...listing.items].sort(compareItems)
	const exitCode = items.length > 0 || listing.damaged.length > 0 ? 0 : 1
	if (json) return { exitCode, output: JSON.stringify(inboxJsonOf({ items, listing }), null, 2) }
	return { exitCode, output: inboxText({ items, listing }) }
}

/** The stores read: the current folder's, then those of the store list, each once by real path, a gone one skipped. */
function storesOf(cwd: string): string[] {
	const own = locateStore({ from: cwd })?.store
	const stores = [...(own === undefined ? [] : [own]), ...readStoreList({})]
	return [...new Set(stores.filter((store) => existsSync(store)).map(realPathOf))]
}

/** Adds the lots of `store` to the listing: its registry read once, every folder read as a lot or a damaged one. */
function readStore(params: { store: string; reading: InboxReading }): void {
	const { store, reading } = params
	const common = dirname(store)
	const registry = registryOfCommonFolder(common)
	const entries = readRegistry({ registry, seams: reading.seams })
	for (const name of lotFolderNamesOf(store)) {
		const lotFolder = join(store, name)
		// an identity that does not read, or a record that does not hold (its fields never printed)
		const identityDamage = damageOf({ lotFolder, name })
		const checked =
			identityDamage === undefined
				? readCheckedLotState({ lotFolder, registry, entries })
				: undefined
		const damage = identityDamage ?? (checked && 'damage' in checked ? checked.damage : undefined)
		if (damage !== undefined) {
			// a damaged lot names no repository: the store's own repository folder stands for it
			if (matchesRepository({ repository: dirname(common), wanted: reading.repository }))
				reading.listing.damaged.push({ folder: lotFolder, reason: damage })
			continue
		}
		if (checked === undefined || !('input' in checked)) continue
		const { input } = checked
		if (!matchesRepository({ repository: input.identity.repository, wanted: reading.repository }))
			continue
		addLot({ input, status: lotStatusOfInput({ input, lotFolder, entries }), reading })
	}
}

/** The registry's entries, read once for every lot of its store; the read the seam reports. */
function readRegistry(params: { registry: string; seams: InboxSeams | undefined }): StoreEntry[] {
	params.seams?.onRegistryRead?.(params.registry)
	return readStoreEntries(params.registry)
}

/** The folders of a store that may be lots: every folder but a hidden one (a folder being built among them). */
function lotFolderNamesOf(store: string): string[] {
	return readdirSync(store, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith(HIDDEN_NAME_PREFIX))
		.map((entry) => entry.name)
		.sort()
}

/** Why the folder `name` of a store is no readable lot; undefined when its identity reads and names it. */
function damageOf(params: { lotFolder: string; name: string }): string | undefined {
	if (!existsSync(join(params.lotFolder, STORE_FILES.identity))) return INBOX_DAMAGE_REASONS.missing
	const identity = readIdentity({ lotFolder: params.lotFolder })
	if (identity === undefined) return INBOX_DAMAGE_REASONS.unreadable
	if (identity.name !== params.name) return INBOX_DAMAGE_REASONS.otherName
	return undefined
}

/** A repository folder matches `--repository <name>` by its basename exactly; every one matches without it. */
function matchesRepository(params: { repository: string; wanted: string | undefined }): boolean {
	return params.wanted === undefined || basename(params.repository) === params.wanted
}

/**
 * Counts or lists a lot: committed and canceled neither; a simulated one counted, listed when it waits and
 * `--simulated` asks; a real working one counted; one line per open question, a ready and a failed lot one line.
 */
function addLot(params: {
	input: LotStateInput
	status: LotStatusJson
	reading: InboxReading
}): void {
	const { input, status, reading } = params
	const { listing } = reading
	const { state } = status
	if (state === 'committed' || state === 'canceled') return
	if (status.simulated) {
		listing.simulated++
		if (!reading.withSimulated) return
	} else if (state === 'working') listing.working++
	listing.items.push(...itemsOf({ input, status }))
}

/** The lines of a lot that waits on someone; none for a working lot. */
function itemsOf(params: { input: LotStateInput; status: LotStatusJson }): InboxItem[] {
	// the item keeps the status as stored (the JSON form); its columns take every value escaped once
	const item = { index: params.status.index, name: params.status.lot, status: params.status }
	const status = printableOf(params.status)
	const reason = printableOf(params.input.transitions.at(-1)?.cause.reason ?? '')
	const first = [status.index, basename(status.repository), status.branch]
	if (status.state === 'input-required')
		return status.questions.map((question, order) => ({
			...item,
			group: params.status.questions[order].audience,
			order,
			columns: [
				...first,
				INBOX_WHAT.question.replace('{id}', question.id).replace('{audience}', question.audience),
				question.text,
				answerNextOf({ name: status.lot, question }),
			],
		}))
	if (status.state === 'ready')
		return [
			{
				...item,
				group: 'ready',
				order: 0,
				columns: [...first, INBOX_WHAT.ready, status.next ?? ''],
			},
		]
	if (status.state === 'failed')
		return [
			{
				...item,
				group: 'failed',
				order: 0,
				columns: [...first, INBOX_WHAT.failed, reason, status.next ?? ''],
			},
		]
	return []
}

/** By group, then index, then name (two stores may hold one index), then the question's place. */
function compareItems(first: InboxItem, second: InboxItem): number {
	return (
		INBOX_GROUPS.indexOf(first.group) - INBOX_GROUPS.indexOf(second.group) ||
		first.index.localeCompare(second.index) ||
		first.name.localeCompare(second.name) ||
		first.order - second.order
	)
}

/** `--json`: the status of each waiting lot once, in the order of the text; the counts; the damaged lots. */
function inboxJsonOf(params: { items: InboxItem[]; listing: InboxListing }): InboxJson {
	const seen = new Set<string>()
	const waiting = params.items.flatMap(function statusOnce(item): LotStatusJson[] {
		if (seen.has(item.status.folder)) return []
		seen.add(item.status.folder)
		return [item.status]
	})
	const { working, simulated, damaged } = params.listing
	return { waiting, working, simulated, damaged }
}

/** The text: one line per item, one per damaged lot, then the count line. */
function inboxText(params: { items: InboxItem[]; listing: InboxListing }): string {
	const { listing } = params
	return [
		...params.items.map((item) => item.columns.join(INBOX_COLUMN_SEPARATOR)),
		...printableOf(listing.damaged).map((damaged) =>
			INBOX_DAMAGED_LINE.replace('{folder}', damaged.folder).replace('{reason}', damaged.reason),
		),
		INBOX_COUNT_LINE.replace('{working}', String(listing.working)).replace(
			'{simulated}',
			String(listing.simulated),
		),
	].join('\n')
}

/** A usage error, exit 2: the reason and the inbox section; `{ error, usage, next: null }` with `--json`. */
function inboxUsageExit(params: { reason: string; json: boolean }): CommandResult {
	const usage = renderCommandSection({ name: INBOX_COMMAND, entry: COMMAND_MAP.inbox })
	if (params.json)
		return {
			exitCode: 2,
			output: JSON.stringify({ error: params.reason, usage, next: null }, null, 2),
		}
	// the reason quotes a word as typed: escaped once in the text form
	return { exitCode: 2, output: `inbox: ${printableOf(params.reason)}\n\n${usage}` }
}
