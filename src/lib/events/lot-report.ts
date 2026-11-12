import { ROUND_FOLDER_PATTERN } from '../gate-records/gate-records.constants.ts'
import { QUESTIONS_CLOSED_STATES } from '../store/store.constants.ts'
import { MS_PER_SECOND } from './attribute-steps.constants.ts'
import { attributeStepsToRuns, timeBreakdown } from './attribute-steps.ts'
import {
	FOLDER_KIND,
	STATION_KIND_PREFIX,
	STEP_KIND_PREFIX,
	STEP_WAIT_KIND,
} from './events.constants.ts'
import {
	HEAVY_PART_SEPARATOR,
	HEAVY_RUN_KINDS,
	THROWAWAY_ADD_STEP,
	WORKTREE_ADD_STEP,
} from './lot-report.constants.ts'
import { firstEventOf, pairRuns, runsOfKind } from './pair-runs.ts'
import { SKILL_ASKED, SKILL_SEEN } from './station-event.constants.ts'
import {
	lotTokenTotals,
	stationTokenTotal,
	sumLotMoney,
	sumMoney,
	sumStationTotals,
} from './token-totals.ts'
import { SUITE_FAMILIES } from './unrecorded-steps.constants.ts'
import { countSuites } from './unrecorded-steps.ts'

import type { LotStateName } from '../store/store.types.ts'
import type { RunAttributedStep, WaitTime } from './attribute-steps.types.ts'
import type { EventRun, LotEvent } from './event.types.ts'
import type {
	AgentCount,
	FoldersReport,
	HeavyStep,
	LedgerFinding,
	LotReport,
	LotReportInput,
	RoundRow,
	RunTime,
	SkillCount,
	StationRow,
	StationRunRow,
	StationRunsSummary,
} from './lot-report.types.ts'
import type { ReportedMoney, ReportedTokens } from './token-totals.types.ts'

/**
 * The report model of one lot from plain inputs (spec 7): stations and runs, tokens and money, the time in five
 * categories, agents and skills, the suites with their unknown rules, the review rounds. Pure: no disk, no clock.
 */
export function buildLotReport(params: LotReportInput): LotReport {
	const { identity } = params
	const paired = pairRuns({ events: [...params.events] })
	const stationRuns = runsOfKind({ runs: paired.runs, prefix: STATION_KIND_PREFIX })
	const stepRuns = runsOfKind({ runs: paired.runs, prefix: STEP_KIND_PREFIX })
	const terminal = QUESTIONS_CLOSED_STATES.includes(identity.state as LotStateName)
	const summary = summarizeStationRuns({ stationRuns, terminal })
	const { runs } = summary
	const roundNumbers = roundsOf({ ledger: params.ledger, roundFolders: params.roundFolders })
	const reported = new Map(stationRuns.map((run) => [run.run, reportedSuitesOf({ run })]))
	return {
		lot: identity.name,
		state: identity.state,
		feature: identity.feature,
		effort: identity.effort,
		steps: identity.steps,
		rounds: roundNumbers.length,
		stations: stationRows({ runs, reported }),
		runs,
		totals: {
			tokens: summary.tokens,
			money: summary.money,
			time: timeBreakdown({
				from: identity.created,
				to: terminal ? lastTimeOf({ params }) : params.now,
				now: params.now,
				stationRuns,
				stepRuns,
				questions: params.questions,
				waits: waitsOf({ events: paired.events }),
			}),
		},
		agents: summary.agents,
		skills: skillCounts({ lists: runs.map((row) => row.skills) }),
		suites: countSuites({
			now: params.now,
			worktree: identity.worktree,
			steps: identity.steps,
			rounds: roundNumbers.length,
			terminal,
			paired,
			ledger: params.ledger,
			records: params.records,
			goneWorktrees: params.goneWorktrees,
			mutationRuns: params.mutationRuns,
		}),
		reportedSuites: sumSuitesOf({ suites: [...reported.values()] }),
		heavy: heavySteps({ stepRuns }),
		folders: foldersOf({ stepRuns, events: paired.events }),
		review: roundNumbers.map((round) => roundRow({ round, ledger: params.ledger })),
		events: {
			count: paired.events.length,
			damaged: params.damaged,
			duplicates: paired.duplicates,
			unknownKinds: params.unknownKinds,
		},
		effortSource: identity.effortSource ?? null,
		endsWithoutStart: stationRuns.filter((run) => run.start === undefined).length,
		stepOwners: stepOwnersOf({ stationRuns, stepRuns, now: params.now }),
	}
}

/**
 * The station runs of a lot summed (spec 6): a row per run, the lot's tokens and money, the agents that ran them.
 * `terminal`: a run with no end is `no end` rather than `running`. Pure: what the report and the card's usage share.
 */
export function summarizeStationRuns(params: {
	stationRuns: readonly EventRun[]
	terminal: boolean
}): StationRunsSummary {
	const runs = params.stationRuns.map((run) => stationRunRow({ run, terminal: params.terminal }))
	return {
		runs,
		tokens: lotTokenTotals({ stations: params.stationRuns.map((run) => tokensOf({ run })) }),
		money: sumLotMoney({ money: runs.map((row) => row.money) }),
		agents: agentCounts({ runs }),
	}
}

/** The counted step runs of the lot's worktree with their owners: the folder steps and throwaway runs left out. */
function stepOwnersOf(params: {
	stationRuns: readonly EventRun[]
	stepRuns: readonly EventRun[]
	now: string
}): RunAttributedStep[] {
	const families: readonly string[] = SUITE_FAMILIES
	const counted = params.stepRuns.filter((run) => {
		const first = firstEventOf({ run })
		return first.throwaway !== true && families.includes(String(first.step))
	})
	return attributeStepsToRuns({
		stationRuns: params.stationRuns,
		stepRuns: counted,
		now: params.now,
	})
}

/** The end of a terminal lot: its last event or transition, never before its creation. */
function lastTimeOf(params: { params: LotReportInput }): string {
	const { identity, events, transitions } = params.params
	const times = [
		identity.created,
		...events.map((event) => event.at),
		...transitions.map((transition) => transition.at),
	]
	return times.reduce((last, at) => (Date.parse(at) > Date.parse(last) ? at : last))
}

/** The `step.wait` events as the time breakdown takes them. */
function waitsOf(params: { events: readonly LotEvent[] }): WaitTime[] {
	return params.events.flatMap((event) =>
		event.kind === STEP_WAIT_KIND && typeof event.waitedMs === 'number'
			? [{ at: event.at, waitedMs: event.waitedMs }]
			: [],
	)
}

/** One station run's row: its fields (the start's, else the end's), tokens, money, time, skills and status. */
function stationRunRow(params: { run: EventRun; terminal: boolean }): StationRunRow {
	const { run } = params
	return {
		run: run.run,
		station: textOf({ run, name: 'station' }) ?? '',
		step: numberOf({ run, name: 'step' }),
		round: numberOf({ run, name: 'round' }),
		attempt: numberOf({ run, name: 'attempt' }),
		agent: textOf({ run, name: 'agent' }),
		executor: textOf({ run, name: 'executor' }),
		vendor: textOf({ run, name: 'vendor' }),
		model: textOf({ run, name: 'model' }),
		tier: textOf({ run, name: 'tier' }),
		effort: textOf({ run, name: 'effort' }),
		session: textOf({ run, name: 'session' }),
		tokens: stationTokenTotal({ tokens: tokensOf({ run }) }),
		money: moneyOf({ run }),
		time: runTimeOf({ run }),
		verdict: textOf({ run, name: 'verdict' }),
		exit: numberOf({ run, name: 'exit' }),
		skills: skillCounts({ lists: [runSkills({ run })] }),
		status: run.end !== undefined ? 'ended' : params.terminal ? 'no end' : 'running',
	}
}

/** A run's field as text: the start's when it holds one, else the end's; `null` when neither does. */
function textOf(params: { run: EventRun; name: string }): string | null {
	const value = fieldOf(params)
	return typeof value === 'string' ? value : null
}

/** A run's field as a number: the start's when it holds one, else the end's; `null` when neither does. */
function numberOf(params: { run: EventRun; name: string }): number | null {
	const value = fieldOf(params)
	return typeof value === 'number' ? value : null
}

/** A run's field: the start's when it holds one, else the end's. */
function fieldOf(params: { run: EventRun; name: string }): unknown {
	return params.run.start?.[params.name] ?? params.run.end?.[params.name]
}

/** The tokens a station run's end reported, or `null`. */
function tokensOf(params: { run: EventRun }): ReportedTokens | null {
	const tokens = params.run.end?.tokens
	return tokens !== null && typeof tokens === 'object' ? (tokens as ReportedTokens) : null
}

/** The money a station run's end reported, or `null`. */
function moneyOf(params: { run: EventRun }): ReportedMoney | null {
	const money = params.run.end?.money as Partial<ReportedMoney> | null | undefined
	return typeof money?.amount === 'number' && typeof money.currency === 'string'
		? { amount: money.amount, currency: money.currency }
		: null
}

/** A run's time: measured by the cli's clock unless negative, reported by the host; measured wins. */
function runTimeOf(params: { run: EventRun }): RunTime {
	const { start, end } = params.run
	const difference =
		start === undefined || end === undefined
			? null
			: (Date.parse(end.at) - Date.parse(start.at)) / MS_PER_SECOND
	const measuredSeconds = difference !== null && difference >= 0 ? difference : null
	const reportedSeconds = typeof end?.duration === 'number' ? end.duration : null
	return { measuredSeconds, reportedSeconds, seconds: measuredSeconds ?? reportedSeconds }
}

/** The skills of one run (its start's and its end's): each name once, seen and asked as 0 or 1. */
function runSkills(params: { run: EventRun }): SkillCount[] {
	const byName = new Map<string, SkillCount>()
	for (const event of [params.run.start, params.run.end]) {
		const skills = event?.skills
		if (!Array.isArray(skills)) continue
		for (const skill of skills as { name?: unknown; hash?: unknown; how?: unknown }[]) {
			if (typeof skill?.name !== 'string') continue
			const count = byName.get(skill.name) ?? emptySkill({ name: skill.name })
			if (count.hash === null && typeof skill.hash === 'string') count.hash = skill.hash
			if (skill.how === SKILL_SEEN) count.seen = 1
			if (skill.how === SKILL_ASKED) count.asked = 1
			byName.set(skill.name, count)
		}
	}
	return [...byName.values()]
}

/** A skill counted nowhere yet. */
function emptySkill(params: { name: string }): SkillCount {
	return { name: params.name, hash: null, seen: 0, asked: 0, askedNotSeen: false }
}

/** Skill counts summed by name, alphabetically; the first hash known kept; flagged when asked and never seen. */
export function skillCounts(params: { lists: readonly (readonly SkillCount[])[] }): SkillCount[] {
	const byName = new Map<string, SkillCount>()
	for (const skill of params.lists.flat()) {
		const count = byName.get(skill.name) ?? emptySkill({ name: skill.name })
		count.hash ??= skill.hash
		count.seen += skill.seen
		count.asked += skill.asked
		byName.set(skill.name, count)
	}
	return [...byName.values()]
		.map((count) => ({ ...count, askedNotSeen: count.asked > 0 && count.seen === 0 }))
		.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
}

/** The agents of runs, each with its runs, in the order of its first run. */
function agentCounts(params: { runs: readonly StationRunRow[] }): AgentCount[] {
	const byName = new Map<string, AgentCount>()
	for (const row of params.runs) {
		if (row.agent === null) continue
		const count = byName.get(row.agent) ?? { name: row.agent, runs: 0 }
		count.runs += 1
		byName.set(row.agent, count)
	}
	return [...byName.values()]
}

/** The stations, in the order of their first run, each with its runs summed; `reported` holds each run's own suites. */
function stationRows(params: {
	runs: readonly StationRunRow[]
	reported: ReadonlyMap<string, Record<string, number>>
}): StationRow[] {
	const byStation = new Map<string, StationRunRow[]>()
	for (const row of params.runs)
		byStation.set(row.station, [...(byStation.get(row.station) ?? []), row])
	return [...byStation].map(([station, rows]) => {
		const seconds = rows.map((row) => row.time.seconds).filter((value) => value !== null)
		return {
			station,
			runs: rows.length,
			tokens: sumStationTotals({ totals: rows.map((row) => row.tokens) }),
			money: sumMoney({ money: rows.map((row) => row.money) }),
			seconds: seconds.length === 0 ? null : seconds.reduce((sum, value) => sum + value, 0),
			agents: agentCounts({ runs: rows }),
			skills: skillCounts({ lists: rows.map((row) => row.skills) }),
			reported: sumSuitesOf({ suites: rows.map((row) => params.reported.get(row.run) ?? {}) }),
		}
	})
}

/** The suites one station run's end reported: names and non-negative run counts. */
function reportedSuitesOf(params: { run: EventRun }): Record<string, number> {
	const suites = params.run.end?.suites
	if (suites === null || typeof suites !== 'object') return {}
	return Object.fromEntries(
		Object.entries(suites as Record<string, unknown>).filter(
			(entry): entry is [string, number] => typeof entry[1] === 'number',
		),
	)
}

/** Suite counts summed by name. */
function sumSuitesOf(params: {
	suites: readonly Record<string, number>[]
}): Record<string, number> {
	const sum: Record<string, number> = {}
	for (const suites of params.suites)
		for (const [name, runs] of Object.entries(suites)) sum[name] = (sum[name] ?? 0) + runs
	return sum
}

/** The heavy steps: a heavy kind's run with its duration, else each heavy part that ran with its own. */
function heavySteps(params: { stepRuns: readonly EventRun[] }): HeavyStep[] {
	const heavyKinds: readonly string[] = HEAVY_RUN_KINDS
	return params.stepRuns.flatMap((run): HeavyStep[] => {
		const step = String(firstEventOf({ run }).step ?? '')
		if (heavyKinds.includes(step)) {
			const seconds = stepSecondsOf({ run })
			return seconds === null ? [] : [{ step, seconds }]
		}
		const parts = Array.isArray(run.end?.parts) ? (run.end.parts as Record<string, unknown>[]) : []
		return parts.flatMap((part) =>
			part?.heavy === true && part.reused !== true && typeof part.name === 'string'
				? [
						{
							step: `${step}${HEAVY_PART_SEPARATOR}${part.name}`,
							seconds: typeof part.durationMs === 'number' ? part.durationMs / MS_PER_SECOND : 0,
						},
					]
				: [],
		)
	})
}

/** A step run's seconds: the cli's `durationMs`, else its end minus its start; `null` when neither is known. */
function stepSecondsOf(params: { run: EventRun }): number | null {
	const { start, end } = params.run
	if (typeof end?.durationMs === 'number') return end.durationMs / MS_PER_SECOND
	if (start === undefined || end === undefined) return null
	const difference = Date.parse(end.at) - Date.parse(start.at)
	return difference >= 0 ? difference / MS_PER_SECOND : null
}

/** The folder-heavy steps: the worktree made, the throwaways made, and the folder actions by action. */
function foldersOf(params: {
	stepRuns: readonly EventRun[]
	events: readonly LotEvent[]
}): FoldersReport {
	const folders: FoldersReport = {
		worktreeAdd: { count: 0, seconds: 0, nodeModules: {} },
		throwaways: { count: 0, seconds: 0 },
		actions: {},
	}
	for (const run of params.stepRuns) {
		const step = firstEventOf({ run }).step
		const seconds = stepSecondsOf({ run }) ?? 0
		if (step === WORKTREE_ADD_STEP) {
			folders.worktreeAdd.count += 1
			folders.worktreeAdd.seconds += seconds
			const parts = run.end?.parts as { nodeModules?: unknown } | null | undefined
			const source = parts?.nodeModules
			if (typeof source === 'string')
				folders.worktreeAdd.nodeModules[source] = (folders.worktreeAdd.nodeModules[source] ?? 0) + 1
		}
		if (step === THROWAWAY_ADD_STEP) {
			folders.throwaways.count += 1
			folders.throwaways.seconds += seconds
		}
	}
	for (const event of params.events) {
		if (event.kind !== FOLDER_KIND || typeof event.action !== 'string') continue
		const action = folders.actions[event.action] ?? { count: 0, seconds: 0 }
		action.count += 1
		action.seconds += typeof event.durationMs === 'number' ? event.durationMs / MS_PER_SECOND : 0
		folders.actions[event.action] = action
	}
	return folders
}

/** The rounds of the lot, ascending: the ledger's and those of the `round-<n>` folders, each once. */
function roundsOf(params: {
	ledger: readonly LedgerFinding[]
	roundFolders: readonly string[]
}): number[] {
	const rounds = new Set(params.ledger.map((finding) => finding.round))
	for (const name of params.roundFolders) {
		const match = ROUND_FOLDER_PATTERN.exec(name)
		if (match?.[1] !== undefined) rounds.add(Number(match[1]))
	}
	return [...rounds].sort((left, right) => left - right)
}

/** One round's findings by severity and by state. */
function roundRow(params: { round: number; ledger: readonly LedgerFinding[] }): RoundRow {
	const findings = params.ledger.filter((finding) => finding.round === params.round)
	const bySeverity: Record<string, number> = {}
	const byState: Record<string, number> = {}
	for (const finding of findings) {
		bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1
		byState[finding.state] = (byState[finding.state] ?? 0) + 1
	}
	return { round: params.round, findings: findings.length, bySeverity, byState }
}
