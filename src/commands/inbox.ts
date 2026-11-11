/**
 * `dialecte inbox [--repository <name>] [--simulated] [--json]` (33S section 7): what waits on someone, across
 * every store of the store list and the store of the current folder. Reads files only, writes nothing, starts no
 * process (nothing this module reaches imports a child process).
 */
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { renderCommandSection } from '../lib/command-map/render-help.ts'
import { realPathOf } from '../lib/file-system.ts'
import { readStoreEntries, registryOfCommonFolder } from '../lib/handover/handover-store-read.ts'
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { jsonOf, linesOf, printOut, textOf } from '../lib/print/print.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { answerNextOf } from '../lib/store/lot-next.ts'
import { readCheckedLotState } from '../lib/store/lot-records.ts'
import { listLotFolderNames, locateStore } from '../lib/store/store-folder.ts'
import { readStoreList } from '../lib/store/store-list.ts'
import { NEXT_COMMANDS } from '../lib/store/store.constants.ts'
import {
	INBOX_COMMAND,
	INBOX_COLUMN_SEPARATOR,
	INBOX_COUNT_LINE,
	INBOX_DAMAGED_LINE,
	INBOX_FLAGS,
	INBOX_GROUPS,
	INBOX_SKIPPED_LINE,
	INBOX_SKIPPED_REASONS,
	INBOX_VALUE_OPTIONS,
	INBOX_WHAT,
	NOT_A_FOLDER_CODE,
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
	printOut({
		stream: printsOnStandardError({ verb: INBOX_COMMAND, exitCode: result.exitCode })
			? 'stderr'
			: 'stdout',
		text: result.output,
	})
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
	const listing: InboxListing = { items: [], working: 0, simulated: 0, damaged: [], skipped: [] }
	const reading: InboxReading = {
		repository: read.values.get('repository'),
		withSimulated: read.flags.has('simulated'),
		seams: params.seams,
		listing,
	}
	for (const store of storesOf(params.cwd)) readStore({ store, reading })
	const items = [...listing.items].sort(compareItems)
	const exitCode = items.length > 0 || listing.damaged.length > 0 ? 0 : 1
	if (json) return { exitCode, output: jsonOf(inboxJsonOf({ items, listing }), 2) }
	return { exitCode, output: textOf(inboxLines({ items, listing })) }
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
	const names = lotFolderNamesOf({ store, listing: reading.listing })
	if (names === undefined) return
	const common = dirname(store)
	const registry = registryOfCommonFolder(common)
	const entries = readRegistry({ registry, seams: reading.seams })
	for (const name of names) {
		const lotFolder = join(store, name)
		// an identity that does not read, or a record that does not hold (its fields never printed)
		const checked = readCheckedLotState({ lotFolder, registry, entries })
		if (checked === undefined) continue
		if ('damage' in checked) {
			// a damaged lot names no repository: the store's own repository folder stands for it
			if (matchesRepository({ repository: dirname(common), wanted: reading.repository }))
				reading.listing.damaged.push({ folder: lotFolder, reason: checked.damage })
			continue
		}
		const { input } = checked
		if (!matchesRepository({ repository: input.identity.repository, wanted: reading.repository }))
			continue
		addLot({ input, status: lotStatusOfInput({ input, lotFolder, entries }), reading })
	}
}

/**
 * The lot folder names of `store`; undefined when it cannot be listed (a line of the store list naming a file, or a
 * folder that cannot be read), the store then skipped with its reason in the listing.
 */
function lotFolderNamesOf(params: { store: string; listing: InboxListing }): string[] | undefined {
	try {
		return listLotFolderNames({ store: params.store })
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code
		const reason =
			code === NOT_A_FOLDER_CODE
				? INBOX_SKIPPED_REASONS.notFolder
				: INBOX_SKIPPED_REASONS.unreadable.replace('{detail}', code ?? (error as Error).message)
		params.listing.skipped.push({ store: params.store, reason })
		return undefined
	}
}

/** The registry's entries, read once for every lot of its store; the read the seam reports. */
function readRegistry(params: { registry: string; seams: InboxSeams | undefined }): StoreEntry[] {
	params.seams?.onRegistryRead?.(params.registry)
	return readStoreEntries(params.registry)
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
	// the item keeps the status as stored (the JSON form); its columns are escaped by the print boundary
	const item = { index: params.status.index, name: params.status.lot, status: params.status }
	const { status } = params
	const reason = params.input.transitions.at(-1)?.cause.reason ?? ''
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
	const { working, simulated, damaged, skipped } = params.listing
	return { waiting, working, simulated, damaged, ...(skipped.length > 0 && { skipped }) }
}

/** The text: one line per item, one per damaged lot, one per store skipped, then the count line. */
function inboxLines(params: { items: InboxItem[]; listing: InboxListing }): string[] {
	const { listing } = params
	return [
		...params.items.map((item) => item.columns.join(INBOX_COLUMN_SEPARATOR)),
		...listing.damaged.map((damaged) =>
			INBOX_DAMAGED_LINE.replace('{folder}', damaged.folder)
				.replace('{reason}', damaged.reason)
				.replace('{stop}', NEXT_COMMANDS.stop.replace('{name}', basename(damaged.folder))),
		),
		...listing.skipped.map((skipped) =>
			INBOX_SKIPPED_LINE.replace('{store}', skipped.store).replace('{reason}', skipped.reason),
		),
		INBOX_COUNT_LINE.replace('{working}', String(listing.working)).replace(
			'{simulated}',
			String(listing.simulated),
		),
	]
}

/** A usage error, exit 2: the reason and the inbox section; `{ error, usage, next: null }` with `--json`. */
function inboxUsageExit(params: { reason: string; json: boolean }): CommandResult {
	const usage = renderCommandSection({ name: INBOX_COMMAND, entry: COMMAND_MAP.inbox })
	if (params.json)
		return {
			exitCode: 2,
			output: jsonOf({ error: params.reason, usage, next: null }, 2),
		}
	// the reason quotes a word as typed: one line, escaped by the boundary; the section's lines spliced
	return { exitCode: 2, output: textOf([`inbox: ${params.reason}`, '', ...linesOf(usage)]) }
}
