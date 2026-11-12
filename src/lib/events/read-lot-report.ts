/**
 * The file reads that feed the lot report (33L0 section 7): the lot's records, its events, the ledger, the round
 * folders, the registry entry, the lot's `cards.log` lines, the live or frozen record times of each worktree and the
 * repository's mutation run files. Reads files only: no git, no child process.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { registryOfCommonFolder } from '../handover/handover-store-read.ts'
import { findLedgerTable, tableCells } from '../review-rounds/findings-ledger.ts'
import { LEDGER_FILE } from '../review-rounds/review-rounds.constants.ts'
import { nextCommandsOf } from '../store/lot-next.ts'
import {
	commonFolderOfLotFolder,
	readLotStateInput,
	registryOfLotFolder,
} from '../store/lot-records.ts'
import { lotState } from '../store/lot-state.ts'
import { listLotIdentities, locateStore } from '../store/store-folder.ts'
import { readStoreList } from '../store/store-list.ts'
import { LOTS_KEEPING_NOTHING, NEXT_COMMANDS, STORE_FILES } from '../store/store.constants.ts'
import { CARDS_LOG_FILE } from './cards-log.constants.ts'
import { finalCardOf, linesOfLot, readCardsLog } from './cards-log.ts'
import { STEP_KIND_PREFIX } from './events.constants.ts'
import { buildLotReport, skillCounts } from './lot-report.ts'
import { readEvents } from './read-events.ts'
import { SEVERITY_CELL, STATE_CELL, STATE_WORD_PATTERN } from './read-lot-report.constants.ts'
import { readMutationRunFiles, readRecordTimes } from './record-times.ts'
import { sumLotTotals, sumStationTotals } from './token-totals.ts'
import { SUITE_FAMILIES } from './unrecorded-steps.constants.ts'

import type { LotStateInput, LotStateName } from '../store/store.types.ts'
import type { QuestionTime } from './attribute-steps.types.ts'
import type { CardLine, FrozenRecords, Removal } from './cards-log.types.ts'
import type { AgentCount, LedgerFinding } from './lot-report.types.ts'
import type {
	FeatureLot,
	FeatureReport,
	FeatureTotals,
	ReportedLot,
} from './read-lot-report.types.ts'
import type { LotTokenTotal, StationTokenTotal } from './token-totals.types.ts'
import type { WorktreeRecordTimes } from './unrecorded-steps.types.ts'

/**
 * The report of the lot folder `lotFolder` at `now` (the model and its `next`); `undefined` when the folder holds no
 * readable identity. Record times are read live while a worktree's top exists, else frozen from the latest `removing`
 * line (the final `card` for the lot's worktree), else the worktree's records are gone; an unreadable tdd ledger makes
 * the tdd families unknown.
 */
export function readLotReport(params: { lotFolder: string; now: Date }): ReportedLot | undefined {
	const { lotFolder } = params
	const registry = registryOfLotFolder(lotFolder)
	const input = readLotStateInput({ lotFolder, registry })
	if (input === undefined) return undefined
	const { identity } = input
	const state = lotState(input)
	const read = readEvents({ file: join(lotFolder, STORE_FILES.events) })
	const cards = linesOfLot({
		read: readCardsLog({ file: join(registry, CARDS_LOG_FILE) }),
		lot: identity.name,
	})
	// every worktree the report compares is a real path: the identity, the events, the removals, the mutation runs
	const realOf = realPathCache()
	const lotWorktree = identity.worktree === null ? null : realOf(identity.worktree)
	const events = read.events.map((event) =>
		typeof event.worktree === 'string' ? { ...event, worktree: realOf(event.worktree) } : event,
	)
	const removals = cards.removals.map((removal) =>
		removal.item === 'branch' ? removal : { ...removal, path: realOf(removal.path) },
	)
	const worktrees = worktreesOf({ worktree: lotWorktree, events, removals })
	const times = recordTimesOf({
		worktrees,
		lotWorktree,
		removals,
		finalCard: finalCardOf({ cards: cards.cards, lot: identity.name }),
	})
	const lastTransition = input.transitions.at(-1)
	const report = buildLotReport({
		now: params.now.toISOString(),
		identity: {
			name: identity.name,
			state: state.state,
			feature: identity.feature,
			effort: identity.effort.level,
			effortSource: identity.effort.source,
			steps: lastTransition?.position.of ?? null,
			created: identity.created,
			worktree: lotWorktree,
		},
		transitions: input.transitions.map((transition) => ({
			at: transition.at,
			to: transition.state,
		})),
		questions: questionsOf({ input }),
		events,
		damaged: read.damaged,
		unknownKinds: read.unknownKinds,
		ledger: readLedger({ lotFolder }),
		roundFolders: folderNamesOf({ folder: lotFolder }),
		records: times.records,
		goneWorktrees: times.gone,
		mutationRuns: readMutationRunFiles({ commonFolder: commonFolderOfLotFolder(lotFolder) }).map(
			(run) => ({ ...run, worktree: realOf(run.worktree) }),
		),
	})
	return {
		...report,
		next: nextOf({ input, state: state.state, worktree: identity.worktree }),
		simulated: identity.simulated,
	}
}

/**
 * The report of every lot of `feature` in the stores of the user's store list and the store of `cwd`; a lot whose
 * folder is gone is read from its final `card` line.
 */
export function readFeatureReport(params: {
	feature: string
	cwd: string
	now: Date
}): FeatureReport {
	const real: { lot: FeatureLot; report: ReportedLot | undefined }[] = []
	const simulated: { lot: FeatureLot; report: ReportedLot }[] = []
	const named = new Set<string>()
	const stores = storesOf({ cwd: params.cwd })
	for (const store of stores)
		for (const entry of listLotIdentities({ store })) {
			if (entry.identity.feature !== params.feature) continue
			const report = readLotReport({ lotFolder: join(store, entry.name), now: params.now })
			if (report === undefined) continue
			named.add(entry.name)
			const lot = featureLotOf({ report })
			if (lot.simulated) simulated.push({ lot, report })
			else real.push({ lot, report })
		}
	for (const store of stores)
		for (const card of goneLotCards({ store, feature: params.feature, named })) {
			named.add(card.lot ?? '')
			real.push({ lot: cardLotOf({ card }), report: undefined })
		}
	real.sort((left, right) => left.lot.lot.localeCompare(right.lot.lot))
	simulated.sort((left, right) => left.lot.lot.localeCompare(right.lot.lot))
	return {
		feature: params.feature,
		lots: real.map((entry) => entry.lot),
		totals: featureTotalsOf({ lots: real }),
		simulated: {
			count: simulated.length,
			lots: simulated.map((entry) => entry.lot),
			totals: featureTotalsOf({ lots: simulated }),
		},
	}
}

/** `realPathOf`, each path resolved once per report. */
function realPathCache(): (path: string) => string {
	const known = new Map<string, string>()
	return function realOf(path: string): string {
		const cached = known.get(path)
		if (cached !== undefined) return cached
		const real = realPathOf(path)
		known.set(path, real)
		return real
	}
}

/** The lot's worktree, the throwaways its step events name, and the paths its `removing` lines name. */
function worktreesOf(params: {
	worktree: string | null
	events: readonly { kind: string; throwaway?: unknown; worktree?: unknown }[]
	removals: readonly Removal[]
}): string[] {
	const paths = new Set<string>()
	if (params.worktree !== null) paths.add(params.worktree)
	for (const event of params.events)
		if (
			event.kind.startsWith(STEP_KIND_PREFIX) &&
			event.throwaway === true &&
			typeof event.worktree === 'string'
		)
			paths.add(event.worktree)
	for (const removal of params.removals) if (removal.item !== 'branch') paths.add(removal.path)
	return [...paths]
}

/**
 * Each worktree's record times: live while its top holds a git folder; else frozen from its latest `removing` line
 * holding records, or (the lot's worktree) its final card's; else gone.
 */
function recordTimesOf(params: {
	worktrees: readonly string[]
	lotWorktree: string | null
	removals: readonly Removal[]
	finalCard: CardLine | undefined
}): { records: WorktreeRecordTimes[]; gone: string[] } {
	const records: WorktreeRecordTimes[] = []
	const gone: string[] = []
	for (const worktree of params.worktrees) {
		const live = readRecordTimes({ worktree })
		if (!live.gone) {
			// the step events name the worktree as given; the reader answers its real path
			records.push({ ...live.times, worktree })
			continue
		}
		const removal = params.removals
			.filter((line) => line.path === worktree && line.records !== null)
			.at(-1)
		const frozen =
			removal?.records ??
			(worktree === params.lotWorktree ? (params.finalCard?.records ?? null) : null)
		if (frozen === null) gone.push(worktree)
		else records.push(frozenTimesOf({ worktree, records: frozen }))
	}
	return { records, gone }
}

/** The record times a line froze, as the model takes them. */
function frozenTimesOf(params: { worktree: string; records: FrozenRecords }): WorktreeRecordTimes {
	const { records } = params
	return {
		worktree: params.worktree,
		gateFast: records['gate-fast'] ?? null,
		gateFull: records['gate-full'] ?? null,
		gateRelease: records['gate-release'] ?? null,
		contrib: records.contrib ?? null,
		gateHook: records['gate-hook'] ?? null,
		// a ledger the writer could not read stays unknown
		tdd: records.tdd === null ? null : Array.isArray(records.tdd) ? records.tdd : [],
		// so does a gate record it could not read; a family the reader does not count is dropped
		...(Array.isArray(records.unreadable) && {
			unreadableGates: SUITE_FAMILIES.filter((family) => records.unreadable?.includes(family)),
		}),
	}
}

/** The questions of the lot: asked at their transition, answered at their answer's `at` (`null` while open). */
function questionsOf(params: { input: LotStateInput }): QuestionTime[] {
	return params.input.transitions.flatMap((transition) => {
		const { question } = transition
		if (question === null) return []
		const answer = params.input.answers.find((record) => record.question === question.id)
		return [{ asked: transition.at, answered: answer?.at ?? null }]
	})
}

/** The findings of the lot's ledger: each row's round, severity and state word; none without a ledger. */
function readLedger(params: { lotFolder: string }): LedgerFinding[] {
	const path = join(params.lotFolder, LEDGER_FILE)
	if (!existsSync(path)) return []
	const lines = readFileSync(path, 'utf8').split('\n')
	const table = findLedgerTable(lines)
	if (table === undefined) return []
	return table.rows.flatMap((row) => {
		const cells = tableCells(lines[row.line] ?? '') ?? []
		const state = STATE_WORD_PATTERN.exec(cells[STATE_CELL] ?? '')?.[0]
		if (row.round === undefined || state === undefined) return []
		return [{ round: row.round, severity: cells[SEVERITY_CELL] ?? '', state }]
	})
}

/** The names in a folder; none when it cannot be read. */
function folderNamesOf(params: { folder: string }): string[] {
	try {
		return readdirSync(params.folder)
	} catch {
		return []
	}
}

/**
 * The lot's next command: the state's (`nextCommandsOf`); for a committed or canceled lot whose worktree is on disk
 * and which has a registry entry (the one the lot's state read), `lot close` of that entry (no `lot prune` before
 * L0b: a throwaway alone, or a lot with no entry, has no next).
 */
function nextOf(params: {
	input: LotStateInput
	state: LotStateName
	worktree: string | null
}): string | null {
	const { input, state, worktree } = params
	if (!LOTS_KEEPING_NOTHING.includes(state))
		return nextCommandsOf({ input, report: lotState(input) }).next
	if (worktree === null || !existsSync(worktree)) return null
	const entry = input.registryEntry
	return entry === undefined ? null : NEXT_COMMANDS.close.replace('{handover}', entry.name)
}

/** The stores to read: the one of `cwd`, then the store list's, each once. */
function storesOf(params: { cwd: string }): string[] {
	const located = locateStore({ from: params.cwd })?.store
	const stores = [...(located === undefined ? [] : [located]), ...readStoreList({})]
	return [...new Set(stores.map((store) => realPathOf(store)))]
}

/** The final cards of the lots of the feature whose folder is gone from the store, from its registry's `cards.log`. */
function goneLotCards(params: {
	store: string
	feature: string
	named: ReadonlySet<string>
}): CardLine[] {
	const registry = registryOfCommonFolder(dirname(params.store))
	const { cards } = readCardsLog({ file: join(registry, CARDS_LOG_FILE) })
	const lots = new Set(
		cards
			.filter((card) => card.feature === params.feature && card.lot !== null)
			.map((card) => card.lot as string)
			.filter((lot) => !params.named.has(lot)),
	)
	return [...lots].flatMap((lot) => {
		const card = finalCardOf({ cards, lot })
		return card === undefined ? [] : [card]
	})
}

/** A lot of a feature from its report. */
function featureLotOf(params: { report: ReportedLot }): FeatureLot {
	const { report } = params
	return {
		lot: report.lot,
		state: report.state,
		simulated: report.simulated === true,
		fromCardsLog: false,
		tokens: report.totals.tokens.total,
		elapsed: report.totals.time.elapsed,
		runs: report.runs.length,
		agents: report.agents.length,
		rounds: report.rounds,
		findings: report.review.reduce((sum, round) => sum + round.findings, 0),
		suites: Object.fromEntries(
			SUITE_FAMILIES.map((family) => [family, report.suites.families[family].runs]),
		),
	}
}

/**
 * A lot whose folder is gone, from its final card: its state, and the tokens, runs and agents its `usage` froze;
 * what the usage lacks is unknown, never 0, and its tokens count as not exact.
 */
function cardLotOf(params: { card: CardLine }): FeatureLot {
	const { usage } = params.card
	return {
		lot: params.card.lot ?? '',
		state: params.card.state,
		simulated: false,
		fromCardsLog: true,
		tokens: usageTokensOf({ usage }),
		elapsed: null,
		runs: countOf({ value: usage?.runs }),
		agents: countOf({ value: usage?.agents }),
		rounds: null,
		findings: null,
		// a card line freezes no suite count
		suites: null,
	}
}

/**
 * The lot total a card's `usage` froze; none readable: unknown, and one count not exact (the lot itself), so a
 * feature total over it is never exact.
 */
function usageTokensOf(params: { usage: Record<string, unknown> | null }): LotTokenTotal {
	const tokens = params.usage?.tokens as { total?: Partial<LotTokenTotal> } | null | undefined
	const total = tokens?.total
	const readable =
		total !== undefined &&
		total !== null &&
		(total.value === null || typeof total.value === 'number') &&
		typeof total.exact === 'boolean' &&
		typeof total.notExact === 'number' &&
		typeof total.stations === 'number'
	return readable
		? (total as LotTokenTotal)
		: { value: null, exact: false, notExact: 1, stations: 1 }
}

/** A count a card's `usage` froze: a whole number of at least 0, else `null` (unknown). */
function countOf(params: { value: unknown }): number | null {
	const { value } = params
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/** A feature's totals over lots: tokens, by station name, by tier, agents and skills of the lots read from folders. */
function featureTotalsOf(params: {
	lots: readonly { lot: FeatureLot; report: ReportedLot | undefined }[]
}): FeatureTotals {
	const reports = params.lots.flatMap((entry) => (entry.report === undefined ? [] : [entry.report]))
	const byStation = new Map<string, StationTokenTotal[]>()
	const byTier = new Map<string, StationTokenTotal[]>()
	for (const report of reports) {
		for (const station of report.stations)
			byStation.set(station.station, [...(byStation.get(station.station) ?? []), station.tokens])
		for (const run of report.runs)
			if (run.tier !== null) byTier.set(run.tier, [...(byTier.get(run.tier) ?? []), run.tokens])
	}
	return {
		tokens: sumLotTotals({ totals: params.lots.map((entry) => entry.lot.tokens) }),
		byStation: summedByName({ groups: byStation }),
		byTier: summedByName({ groups: byTier }),
		agents: summedAgents({ lists: reports.map((report) => report.agents) }),
		skills: skillCounts({ lists: reports.map((report) => report.skills) }),
	}
}

/** Each group's totals added up, by name. */
function summedByName(params: {
	groups: ReadonlyMap<string, StationTokenTotal[]>
}): Record<string, StationTokenTotal> {
	return Object.fromEntries(
		[...params.groups].map(([name, totals]) => [name, sumStationTotals({ totals })]),
	)
}

/** Agents' runs added up by name, in the order of their first appearance. */
function summedAgents(params: { lists: readonly (readonly AgentCount[])[] }): AgentCount[] {
	const byName = new Map<string, number>()
	for (const agent of params.lists.flat())
		byName.set(agent.name, (byName.get(agent.name) ?? 0) + agent.runs)
	return [...byName].map(([name, runs]) => ({ name, runs }))
}
