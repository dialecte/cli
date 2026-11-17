/**
 * `dialecte inbox [--repository <name>] [--simulated] [--json]` (33S section 7): what waits on someone, across
 * every store of the store list and the store of the current folder. Reads files only, writes nothing, starts no
 * process (nothing this module reaches imports a child process).
 */
import { basename, dirname, join } from 'node:path'

import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { renderCommandSection } from '../lib/command-map/render-help.ts'
import { readStoreEntries, registryOfCommonFolder } from '../lib/handover/handover-store-read.ts'
import { collectFindings } from '../lib/health/collect-findings.ts'
import { RULE_LABELS, SCRATCH_REPOSITORY, SEVERITY_MARKS } from '../lib/health/health.constants.ts'
import { readHealthRepository } from '../lib/health/read-health-context.ts'
import { readMachineScratch } from '../lib/health/read-scratch.ts'
import { walkStores } from '../lib/health/walk-stores.ts'
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { jsonOf, linesOf, printOut, textOf } from '../lib/print/print.ts'
import { isProcessAlive } from '../lib/process-alive.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { answerNextOf } from '../lib/store/lot-next.ts'
import { readCheckedLotState } from '../lib/store/lot-records.ts'
import { NEXT_COMMANDS } from '../lib/store/store.constants.ts'
import {
	INBOX_COMMAND,
	INBOX_COLUMN_SEPARATOR,
	INBOX_COUNT_LINE,
	INBOX_DAMAGED_LINE,
	INBOX_FLAGS,
	INBOX_GROUPS,
	INBOX_HEALTH_LINE,
	INBOX_HEALTH_NEXT,
	INBOX_HEALTH_WINDOW_MS,
	INBOX_SKIPPED_LINE,
	INBOX_VALUE_OPTIONS,
	INBOX_WHAT,
} from './inbox.constants.ts'
import { lotStatusOfInput } from './lot-status.ts'
import { printsOnStandardError } from './lot-streams.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { StoreEntry } from '../lib/handover/handover.types.ts'
import type { HealthFinding } from '../lib/health/health.types.ts'
import type { ListedStore } from '../lib/health/walk-stores.types.ts'
import type { LotStateInput } from '../lib/store/store.types.ts'
import type {
	DamagedLot,
	InboxItem,
	InboxJson,
	InboxHealthReading,
	InboxListing,
	InboxParams,
	InboxReading,
	InboxSeams,
	LotListing,
	StoreReading,
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
 * The health findings first (the windowed rules over the last 24 hours, the others as they are now), then the lots that wait on someone, grouped (person questions,
 * caller questions, ready, failed), then the count of working and simulated lots; a damaged lot is a line of its own.
 * Exit 0 when something waits (a lot, a red finding) or is damaged, else 1 (an amber finding is listed and waits on
 * nobody), 2 for a usage error.
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
	const walked = walkStores({ cwd: params.cwd })
	const listed = walked.flatMap((store) => ('lotNames' in store ? [store] : []))
	// a store that cannot be listed holds no lot to read: a line of its own
	const skipped = walked.flatMap((store) => ('reason' in store ? [store] : []))
	const reading: InboxReading = {
		repository: read.values.get('repository'),
		withSimulated: read.flags.has('simulated'),
		seams: params.seams,
	}
	const stores = listed.map((store) => readStore({ listed: store, reading }))
	const listing: InboxListing = {
		items: stores.flatMap((store) => store.items),
		working: sumOf(stores.map((store) => store.working)),
		simulated: sumOf(stores.map((store) => store.simulated)),
		damaged: stores.flatMap((store) => store.damaged),
		skipped,
	}
	const health = inboxFindingsOf({
		stores,
		repository: reading.repository,
		now: params.now ?? new Date(),
		cwd: params.cwd,
		tmp: params.tmp,
		isAlive: params.isAlive ?? isProcessAlive,
		seams: params.seams,
	})
	const items = [...listing.items].sort(compareItems)
	const waits =
		items.length > 0 ||
		listing.damaged.length > 0 ||
		health.some((finding) => finding.severity === 'red')
	const exitCode = waits ? 0 : 1
	if (json) return { exitCode, output: jsonOf(inboxJsonOf({ items, listing, health }), 2) }
	return { exitCode, output: textOf(inboxLines({ items, listing, health })) }
}

function sumOf(counts: readonly number[]): number {
	return counts.reduce((total, count) => total + count, 0)
}

/**
 * The health findings of the read stores' repositories (the windowed rules over the last 24 hours), red first, then newest first; with
 * `--repository`, that repository's only, the others not read (the scratch folders belong to none, so they are left
 * out). Each repository is read with the registry entries its store read, so no registry is read twice.
 */
function inboxFindingsOf(params: InboxHealthReading): HealthFinding[] {
	const { now, repository: wanted } = params
	const repositories = params.stores
		.filter((store) => matchesRepository({ repository: dirname(store.common), wanted }))
		.map(function healthOf(store) {
			params.seams?.onHealthRead?.(store.common)
			return readHealthRepository({ common: store.common, entries: store.entries })
		})
	const scratch =
		wanted === undefined ? readMachineScratch({ cwd: params.cwd, tmp: params.tmp }) : []
	return collectFindings({
		repositories,
		scratch,
		window: { since: new Date(now.getTime() - INBOX_HEALTH_WINDOW_MS), now },
		isAlive: params.isAlive,
	})
}

/** The lots of a listed store: its registry read once, every folder read as a lot or a damaged one. */
function readStore(params: { listed: ListedStore; reading: InboxReading }): StoreReading {
	const { reading } = params
	const { store, lotNames: names } = params.listed
	const common = dirname(store)
	const registry = registryOfCommonFolder(common)
	const entries = readRegistry({ registry, seams: reading.seams })
	const lots: LotListing[] = []
	const damaged: DamagedLot[] = []
	for (const name of names) {
		const lotFolder = join(store, name)
		// an identity that does not read, or a record that does not hold (its fields never printed)
		const checked = readCheckedLotState({ lotFolder, registry, entries })
		if (checked === undefined) continue
		if ('damage' in checked) {
			// a damaged lot names no repository: the store's own repository folder stands for it
			if (matchesRepository({ repository: dirname(common), wanted: reading.repository }))
				damaged.push({ folder: lotFolder, reason: checked.damage })
			continue
		}
		const { input } = checked
		if (!matchesRepository({ repository: input.identity.repository, wanted: reading.repository }))
			continue
		lots.push(
			lotListingOf({ input, status: lotStatusOfInput({ input, lotFolder, entries }), reading }),
		)
	}
	return {
		common,
		entries,
		items: lots.flatMap((lot) => lot.items),
		working: sumOf(lots.map((lot) => lot.working)),
		simulated: sumOf(lots.map((lot) => lot.simulated)),
		damaged,
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
 * What a lot adds: committed and canceled nothing; a simulated one counted, listed when it waits and
 * `--simulated` asks; a real working one counted; one line per open question, a ready and a failed lot one line.
 */
function lotListingOf(params: {
	input: LotStateInput
	status: LotStatusJson
	reading: InboxReading
}): LotListing {
	const { input, status, reading } = params
	const { state } = status
	if (state === 'committed' || state === 'canceled') return { items: [], working: 0, simulated: 0 }
	if (status.simulated) {
		const items = reading.withSimulated ? itemsOf({ input, status }) : []
		return { items, working: 0, simulated: 1 }
	}
	return { items: itemsOf({ input, status }), working: state === 'working' ? 1 : 0, simulated: 0 }
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
function inboxJsonOf(params: {
	items: InboxItem[]
	listing: InboxListing
	health: HealthFinding[]
}): InboxJson {
	const seen = new Set<string>()
	const waiting = params.items.flatMap(function statusOnce(item): LotStatusJson[] {
		if (seen.has(item.status.folder)) return []
		seen.add(item.status.folder)
		return [item.status]
	})
	const { working, simulated, damaged, skipped } = params.listing
	return {
		waiting,
		working,
		simulated,
		damaged,
		...(skipped.length > 0 && { skipped }),
		health: params.health,
	}
}

/** The text: one line per health finding, one per item, one per damaged lot, one per store skipped, then the count line. */
function inboxLines(params: {
	items: InboxItem[]
	listing: InboxListing
	health: HealthFinding[]
}): string[] {
	const { listing } = params
	return [
		...params.health.map(healthLineOf),
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

/**
 * A finding's inbox line (no detail lines): its mark, its repository and lot, its rule and text, its next command or
 * the health report of its repository. Values go in through a function, so a `$` they hold is printed as it is.
 */
function healthLineOf(finding: HealthFinding): string {
	const next =
		finding.next ??
		(finding.repository === SCRATCH_REPOSITORY
			? INBOX_HEALTH_NEXT.scratch
			: INBOX_HEALTH_NEXT.repository.replace('{repository}', () => finding.repository))
	return INBOX_HEALTH_LINE.replace('{mark}', SEVERITY_MARKS[finding.severity])
		.replace('{repository}', () => finding.repository)
		.replace('{lot}', () =>
			finding.lot === undefined ? '' : `${INBOX_COLUMN_SEPARATOR}${finding.lot}`,
		)
		.replace('{label}', RULE_LABELS[finding.rule])
		.replace('{text}', () => finding.text)
		.replace('{next}', () => next)
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
