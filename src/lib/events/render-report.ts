/**
 * The text of the lot report and of the feature report (33L0 section 7), as arrays of lines the print boundary
 * escapes (the station table's cells escaped first: the table is laid out on what prints), tokens through
 * `formatTokens`, unknown as `unknown`, a lower bound as `≥ n`.
 */
import { counted } from '../counted.ts'
import { escapeControlCharacters } from '../print/print.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { MS_PER_SECOND } from './attribute-steps.constants.ts'
import { OUTSIDE_OWNER, SHARED_OWNER } from './attribute-steps.constants.ts'
import { formatAgentTime } from './format-agent-time.ts'
import { AT_LEAST_PREFIX, UNKNOWN_TEXT } from './format-tokens.constants.ts'
import { formatLotTokens, formatTokens, formatTokenTotal } from './format-tokens.ts'
import { HEAVY_PART_SEPARATOR } from './lot-report.constants.ts'
import {
	ALWAYS_LISTED_FAMILIES,
	COLUMN_GAP,
	EMPTY_CELL,
	ITEM_SEPARATOR,
	LABEL_WIDTH,
	LEGEND_LABEL,
	LEGEND_LINES,
	LIMIT_RULES,
	MONEY_UNKNOWN_STATIONS,
	NO_STATIONS_LINE,
	NOTHING_TEXT,
	OUTSIDE_ROW,
	OVER_LIMIT_MARK,
	PART_SEPARATOR,
	REPORT_AGENT_TIME,
	SHARED_ROW,
	SKILL_HASH_LENGTH,
	STATION_COLUMNS,
	STATION_SUITE_LABELS,
	SUITE_LINE_LABELS,
	SUITES_COLUMN,
	UNKNOWN_EFFORT_SOURCE,
	WORKTREE_ADD_SOURCE_TEXTS,
} from './render-report.constants.ts'
import { SUITE_FAMILIES } from './unrecorded-steps.constants.ts'

import type { RunAttributedStep } from './attribute-steps.types.ts'
import type { AgentCount, SkillCount, StationRunRow } from './lot-report.types.ts'
import type {
	FeatureLot,
	FeatureReport,
	FeatureTotals,
	ReportedLot,
} from './read-lot-report.types.ts'
import type { LotTokenTotal, MoneySum } from './token-totals.types.ts'
import type { SuiteFamily, SuiteRow, ThrowawayRow } from './unrecorded-steps.types.ts'

/**
 * The lines of one lot's report: header, a row per station, `outside stations`, then `agents`, `time`, `skills`,
 * `suites`, `heavy`, `review`, `folders`, `events`, `next`, and the legend lines (the gate-record residual, the
 * attribution by time).
 */
export function renderLotReport(params: { report: ReportedLot }): string[] {
	const { report } = params
	return [
		headerLine({ report }),
		...stationTable({ report }),
		labelled({ label: 'agents', value: agentsText({ report }) }),
		labelled({ label: 'time', value: timeText({ report }) }),
		labelled({ label: 'skills', value: skillsText({ skills: report.skills }) }),
		...suitesLines({ report }),
		labelled({ label: 'heavy', value: heavyText({ report }) }),
		labelled({ label: 'review', value: reviewText({ report }) }),
		labelled({ label: 'folders', value: foldersText({ report }) }),
		labelled({ label: 'events', value: eventsText({ report }) }),
		labelled({
			label: 'next',
			value: report.next === null ? NOTHING_TEXT : report.next,
		}),
		...LEGEND_LINES.map((line, index) =>
			labelled({ label: index === 0 ? LEGEND_LABEL : '', value: line }),
		),
	]
}

/** The lines of a feature report: one per lot, then the totals; the simulated lots listed only with `simulated`. */
export function renderFeatureReport(params: {
	report: FeatureReport
	simulated: boolean
}): string[] {
	const { report } = params
	const simulatedCount = report.simulated.count
	const lines = [
		[
			`feature ${report.feature}`,
			counted({ count: report.lots.length, noun: 'lot' }),
			...(simulatedCount > 0 && !params.simulated
				? [`${simulatedCount} simulated (--simulated lists them)`]
				: []),
		].join(PART_SEPARATOR),
		...report.lots.map((lot) => featureLotLine({ lot })),
		...featureTotalsLines({ totals: report.totals, prefix: '' }),
	]
	if (!params.simulated || simulatedCount === 0) return lines
	return [
		...lines,
		`simulated ${counted({ count: simulatedCount, noun: 'lot' })}`,
		...report.simulated.lots.map((lot) => featureLotLine({ lot })),
		...featureTotalsLines({ totals: report.simulated.totals, prefix: 'simulated ' }),
	]
}

/** `<label>` padded to the label width, then the value. */
function labelled(params: { label: string; value: string }): string {
	return `${params.label.padEnd(LABEL_WIDTH)}${params.value}`
}

/** A duration in seconds as `formatDuration` prints it; `unknown` when not known. */
function durationText(params: { seconds: number | null }): string {
	return params.seconds === null ? UNKNOWN_TEXT : formatDuration(params.seconds * MS_PER_SECOND)
}

/** `lot <name>  <state> · feature <f> · effort <e> (<source>) · <S> steps · <R> rounds`. */
function headerLine(params: { report: ReportedLot }): string {
	const { report } = params
	const steps =
		report.steps === null ? `steps ${UNKNOWN_TEXT}` : counted({ count: report.steps, noun: 'step' })
	return [
		`lot ${report.lot}  ${report.state}`,
		`feature ${report.feature === null ? NOTHING_TEXT : report.feature}`,
		`effort ${report.effort ?? UNKNOWN_TEXT} (${report.effortSource ?? UNKNOWN_EFFORT_SOURCE})`,
		steps,
		counted({ count: report.rounds, noun: 'round' }),
	].join(PART_SEPARATOR)
}

/** The station table: its column header, a row per station run (or none recorded), `shared`, `outside stations`. */
function stationTable(params: { report: ReportedLot }): string[] {
	const { report } = params
	const rows = report.runs.map((run) =>
		runCells({ run, suites: suitesCell({ steps: report.stepOwners, stationRun: run.run }) }),
	)
	const table = [STATION_COLUMNS, ...rows]
	const widths = STATION_COLUMNS.map((_, column) =>
		Math.max(...table.map((cells) => (cells[column] ?? '').length)),
	)
	const lines = table.map((cells) => alignedRow({ cells, widths }))
	if (rows.length === 0) lines.push(NO_STATIONS_LINE)
	const offset = widths
		.slice(0, SUITES_COLUMN)
		.reduce((sum, width) => sum + width + COLUMN_GAP.length, 0)
	for (const [owner, label] of [
		[SHARED_OWNER, SHARED_ROW],
		[OUTSIDE_OWNER, OUTSIDE_ROW],
	] as const) {
		const steps = report.stepOwners.filter((step) => step.owner === owner)
		if (steps.length === 0) continue
		const lead =
			label.length + COLUMN_GAP.length > offset ? `${label}${COLUMN_GAP}` : label.padEnd(offset)
		lines.push(`${lead}${suitesCell({ steps, stationRun: undefined })}`)
	}
	return lines
}

/** A row's cells joined, each padded to its column's width but the last. */
function alignedRow(params: { cells: readonly string[]; widths: readonly number[] }): string {
	const last = params.cells.length - 1
	return params.cells
		.map((cell, column) => (column === last ? cell : cell.padEnd(params.widths[column] ?? 0)))
		.join(COLUMN_GAP)
}

/** The cells of one station run. */
function runCells(params: { run: StationRunRow; suites: string }): string[] {
	const { run } = params
	return [
		escapedCell(run.station),
		run.step === null ? EMPTY_CELL : String(run.step),
		run.round === null ? EMPTY_CELL : String(run.round),
		textCell({ value: run.agent }),
		textCell({ value: run.tier }),
		textCell({ value: run.model }),
		formatTokenTotal(run.tokens),
		run.status === 'ended' ? durationText({ seconds: run.time.seconds }) : run.status,
		params.suites,
		run.skills.length === 0
			? EMPTY_CELL
			: run.skills.map((skill) => escapedCell(skill.name)).join(ITEM_SEPARATOR),
	]
}

/** A host text cell, escaped; `-` when not given. */
function textCell(params: { value: string | null }): string {
	return params.value === null ? EMPTY_CELL : escapedCell(params.value)
}

/** A table cell as the boundary prints it, so the columns are measured on what prints (escaping again changes nothing). */
function escapedCell(text: string): string {
	return escapeControlCharacters({ text })
}

/**
 * The suites of the steps a station run held (or, `stationRun` undefined, of every step given), by family in the
 * order of their first run: `tdd green 1, fast 1`; `-` when none.
 */
function suitesCell(params: {
	steps: readonly RunAttributedStep[]
	stationRun: string | undefined
}): string {
	const counts = new Map<string, number>()
	for (const step of params.steps) {
		if (params.stationRun !== undefined && step.stationRun !== params.stationRun) continue
		counts.set(step.step, (counts.get(step.step) ?? 0) + 1)
	}
	if (counts.size === 0) return EMPTY_CELL
	return [...counts]
		.map(
			([step, runs]) => `${STATION_SUITE_LABELS[step as SuiteFamily] ?? escapedCell(step)} ${runs}`,
		)
		.join(ITEM_SEPARATOR)
}

/** `5 runs · 5 agents · ≥ 592k tokens (4 of 5 not exact) · in 300k (4 unknown) · out 110k · money unknown`. */
function agentsText(params: { report: ReportedLot }): string {
	const { report } = params
	const { total, fields } = report.totals.tokens
	const parts = [
		counted({ count: report.runs.length, noun: 'run' }),
		counted({ count: report.agents.length, noun: 'agent' }),
	]
	parts.push(formatLotTokens({ total }))
	if (total.value !== null) {
		for (const [field, label] of [
			['input', 'in'],
			['output', 'out'],
			['cacheRead', 'cache read'],
			['cacheWrite', 'cache write'],
		] as const) {
			const sum = fields[field]
			if (sum.known === null) continue
			const unknown = sum.unknownStations > 0 ? ` (${sum.unknownStations} unknown)` : ''
			parts.push(`${label} ${formatTokens(sum.known)}${unknown}`)
		}
	}
	parts.push(moneyText({ money: report.totals.money, stations: report.runs.length }))
	return parts.join(PART_SEPARATOR)
}

/**
 * `money 1.5 EUR, 3 USD`, with `(n of m unknown)` when some of the `stations` reported none; `money unknown` when no
 * station reported any.
 */
function moneyText(params: { money: readonly MoneySum[]; stations: number }): string {
	const [first] = params.money
	if (first === undefined) return `money ${UNKNOWN_TEXT}`
	// every sum counts the same stations without money
	const unknown =
		first.unknownStations !== undefined
			? ` ${MONEY_UNKNOWN_STATIONS.replace('{unknown}', String(first.unknownStations)).replace('{stations}', String(params.stations))}`
			: ''
	return `money ${params.money
		.map((sum) => `${sum.amount} ${sum.currency}`)
		.join(ITEM_SEPARATOR)}${unknown}`
}

/** The elapsed time and its five categories, the agent time apart. */
function timeText(params: { report: ReportedLot }): string {
	const time = params.report.totals.time
	return [
		`${durationText({ seconds: time.elapsed })} elapsed: agents ${durationText({ seconds: time.agents })} (${formatAgentTime({ agentTime: time.agentTime, runs: params.report.runs.length, texts: REPORT_AGENT_TIME })})`,
		`cli steps ${durationText({ seconds: time.cliSteps })}`,
		`waiting for answers ${durationText({ seconds: time.waiting })}`,
		`waiting for the machine ${durationText({ seconds: time.machine })}`,
		`other ${durationText({ seconds: time.other })}`,
	].join(PART_SEPARATOR)
}

/** Each skill with its hash's start, the runs that saw it, and the flag when asked and never seen. */
function skillsText(params: { skills: readonly SkillCount[] }): string {
	if (params.skills.length === 0) return NOTHING_TEXT
	return params.skills
		.map((skill) => {
			const hash = skill.hash === null ? '' : ` ${skill.hash.slice(0, SKILL_HASH_LENGTH)}`
			const counts = [
				...(skill.seen > 0 ? [`${skill.seen} seen`] : []),
				...(skill.askedNotSeen ? [`${skill.asked} asked not seen`] : []),
			]
			return `${skill.name}${hash} (${counts.join(ITEM_SEPARATOR)})`
		})
		.join(PART_SEPARATOR)
}

/** The `suites` line and its second line (reuse, reruns, cut parts, the old code, the agents' own suites). */
function suitesLines(params: { report: ReportedLot }): string[] {
	const { report } = params
	if (report.events.count === 0) return [labelled({ label: 'suites', value: UNKNOWN_TEXT })]
	const { families, throwaways } = report.suites
	const listed = SUITE_FAMILIES.filter(
		(family) => ALWAYS_LISTED_FAMILIES.includes(family) || families[family].atLeast > 0,
	)
	const first = listed.map((family) => familyText({ family, row: families[family] }))
	const rows = SUITE_FAMILIES.map((family) => families[family])
	const reused = rows.reduce((sum, row) => sum + row.reused, 0)
	const partly = rows.reduce((sum, row) => sum + row.partlyReused, 0)
	const reruns = rows.reduce((sum, row) => sum + row.reruns, 0)
	const notShown = rows.reduce((sum, row) => sum + row.failingPartsNotShown, 0)
	const second = [
		...(reused + partly > 0 ? [`reused ${reused} whole, ${partly} partly`] : []),
		...(reruns > 0 ? [`reruns ${reruns}`] : []),
		...(notShown > 0 ? [`${counted({ count: notShown, noun: 'failing part' })} not shown`] : []),
		...oldCodeText({ rows: Object.values(throwaways) }),
		...reportedText({ reported: report.reportedSuites }),
	]
	return [
		labelled({ label: 'suites', value: first.join(PART_SEPARATOR) }),
		...(second.length === 0 ? [] : [labelled({ label: '', value: second.join(PART_SEPARATOR) })]),
	]
}

/** One family: `gate --fast 6 (limit 5: S+R-1) !`, or `gate --fast ≥ 1 (<why unknown>)`. */
function familyText(params: { family: SuiteFamily; row: SuiteRow }): string {
	const { family, row } = params
	const label = SUITE_LINE_LABELS[family]
	if (row.runs === null)
		return `${label} ${AT_LEAST_PREFIX}${row.atLeast} (${row.unknownReason ?? UNKNOWN_TEXT})`
	const interrupted = row.interrupted > 0 ? ` (${row.interrupted} interrupted)` : ''
	const rule = LIMIT_RULES[family]
	const limit =
		row.limit === null ? '' : ` (limit ${row.limit}${rule === undefined ? '' : `: ${rule}`})`
	return `${label} ${row.runs}${interrupted}${limit}${row.over ? OVER_LIMIT_MARK : ''}`
}

/** `fixes on the old code 2 (limit 3)`: the throwaway runs summed; none when no family ran in a throwaway. */
function oldCodeText(params: { rows: readonly (ThrowawayRow | undefined)[] }): string[] {
	const rows = params.rows.filter((row): row is ThrowawayRow => row !== undefined)
	if (rows.length === 0) return []
	const atLeast = rows.reduce((sum, row) => sum + row.atLeast, 0)
	const unknown = rows.find((row) => row.runs === null)
	if (unknown !== undefined)
		return [
			`fixes on the old code ${AT_LEAST_PREFIX}${atLeast} (${unknown.unknownReason ?? UNKNOWN_TEXT})`,
		]
	const limit = rows[0]?.limit ?? null
	const over = limit !== null && atLeast > limit
	const limitText = limit === null ? '' : ` (limit ${limit})`
	return [`fixes on the old code ${atLeast}${limitText}${over ? OVER_LIMIT_MARK : ''}`]
}

/** `reported by agents: unit 6`: the suites the stations reported themselves; none when there are none. */
function reportedText(params: { reported: Record<string, number> }): string[] {
	const entries = Object.entries(params.reported)
	if (entries.length === 0) return []
	return [
		`reported by agents: ${entries.map(([name, runs]) => `${name} ${runs}`).join(ITEM_SEPARATOR)}`,
	]
}

/** The heavy steps with their durations: `gate --full 3 m 40 s · gate --fast: e2e 2 m 5 s`. */
function heavyText(params: { report: ReportedLot }): string {
	if (params.report.heavy.length === 0) return NOTHING_TEXT
	return params.report.heavy
		.map((heavy) => {
			const [step = '', ...part] = heavy.step.split(HEAVY_PART_SEPARATOR)
			const label = SUITE_LINE_LABELS[step as SuiteFamily] ?? step
			const name = [label, ...part].join(HEAVY_PART_SEPARATOR)
			return `${name} ${durationText({ seconds: heavy.seconds })}`
		})
		.join(PART_SEPARATOR)
}

/** Each round: `round 1: 4 findings (2 fixed, 1 accepted, 1 gone)`, `round 2: 1 (fixed)`, `round 3: approve`. */
function reviewText(params: { report: ReportedLot }): string {
	const { review } = params.report
	if (review.length === 0) return NOTHING_TEXT
	return review
		.map((round, index) => {
			if (round.findings === 0) return `round ${round.round}: approve`
			const states = Object.entries(round.byState)
			const detail =
				states.length === 1
					? (states[0]?.[0] ?? '')
					: states.map(([state, count]) => `${count} ${state}`).join(ITEM_SEPARATOR)
			const findings =
				index === 0 ? counted({ count: round.findings, noun: 'finding' }) : String(round.findings)
			return `round ${round.round}: ${findings} (${detail})`
		})
		.join(PART_SEPARATOR)
}

/** The folder-heavy steps: `worktree add 46 s (cloned) · throwaways 2 (12 s) · trash 3`. */
function foldersText(params: { report: ReportedLot }): string {
	const { worktreeAdd, throwaways, actions } = params.report.folders
	const parts: string[] = []
	if (worktreeAdd.count > 0) {
		const sources = Object.keys(worktreeAdd.nodeModules).map((source) =>
			Object.hasOwn(WORKTREE_ADD_SOURCE_TEXTS, source) ? WORKTREE_ADD_SOURCE_TEXTS[source] : source,
		)
		const how = sources.length === 0 ? '' : ` (${sources.join(ITEM_SEPARATOR)})`
		parts.push(`worktree add ${durationText({ seconds: worktreeAdd.seconds })}${how}`)
	}
	if (throwaways.count > 0)
		parts.push(`throwaways ${throwaways.count} (${durationText({ seconds: throwaways.seconds })})`)
	for (const [action, done] of Object.entries(actions)) parts.push(`${action} ${done.count}`)
	return parts.length === 0 ? NOTHING_TEXT : parts.join(PART_SEPARATOR)
}

/** `41 · 2 by the host without a start · 1 duplicate · 0 damaged · 2 unknown kinds`. */
function eventsText(params: { report: ReportedLot }): string {
	const { events, endsWithoutStart } = params.report
	return [
		String(events.count),
		...(endsWithoutStart > 0 ? [`${endsWithoutStart} by the host without a start`] : []),
		counted({ count: events.duplicates, noun: 'duplicate' }),
		`${events.damaged} damaged`,
		...(events.unknownKinds > 0
			? [counted({ count: events.unknownKinds, noun: 'unknown kind' })]
			: []),
	].join(PART_SEPARATOR)
}

/** One lot of a feature: state, tokens, time, runs, rounds, findings, suites; where it was read from. */
function featureLotLine(params: { lot: FeatureLot }): string {
	const { lot } = params
	const suites = Object.entries(lot.suites ?? {})
		.filter(([, runs]) => runs !== 0)
		.map(
			([family, runs]) =>
				`${STATION_SUITE_LABELS[family as SuiteFamily] ?? family} ${runs ?? UNKNOWN_TEXT}`,
		)
	const suitesValue =
		lot.suites === null
			? UNKNOWN_TEXT
			: suites.length === 0
				? EMPTY_CELL
				: suites.join(ITEM_SEPARATOR)
	return [
		`${lot.lot}  ${lot.state}`,
		`tokens ${lotTokensText({ total: lot.tokens })}`,
		`time ${durationText({ seconds: lot.elapsed })}`,
		lot.runs === null ? `runs ${UNKNOWN_TEXT}` : counted({ count: lot.runs, noun: 'run' }),
		`rounds ${lot.rounds ?? UNKNOWN_TEXT}`,
		`findings ${lot.findings ?? UNKNOWN_TEXT}`,
		`suites ${suitesValue}`,
		...(lot.fromCardsLog ? ['from cards.log'] : []),
		...(lot.simulated ? ['simulated'] : []),
	].join(PART_SEPARATOR)
}

/** A feature lot's total: `unknown`, `≥ n` when not exact, else the count. */
function lotTokensText(params: { total: LotTokenTotal }): string {
	const { total } = params
	if (total.value === null) return UNKNOWN_TEXT
	return total.exact ? formatTokens(total.value) : `${AT_LEAST_PREFIX}${formatTokens(total.value)}`
}

/** The totals of a feature: tokens, by station, by tier, agents, skills. */
function featureTotalsLines(params: { totals: FeatureTotals; prefix: string }): string[] {
	const { totals, prefix } = params
	return [
		// not exact: how many of its stations are not (rule 3)
		`${prefix}total    ${formatLotTokens({ total: totals.tokens })}`,
		`${prefix}by station ${tokensByName({ totals: totals.byStation })}`,
		`${prefix}by tier  ${tokensByName({ totals: totals.byTier })}`,
		`${prefix}agents   ${agentsListText({ agents: totals.agents })}`,
		`${prefix}skills   ${skillsText({ skills: totals.skills })}`,
	]
}

/** `implementer 100k, reviewer ≥ 20k`, or `none`. */
function tokensByName(params: { totals: FeatureTotals['byStation'] }): string {
	const entries = Object.entries(params.totals)
	if (entries.length === 0) return NOTHING_TEXT
	return entries.map(([name, total]) => `${name} ${formatTokenTotal(total)}`).join(ITEM_SEPARATOR)
}

/** `agent-a (2) · agent-b (1)`, or `none`. */
function agentsListText(params: { agents: readonly AgentCount[] }): string {
	if (params.agents.length === 0) return NOTHING_TEXT
	return params.agents.map((agent) => `${agent.name} (${agent.runs})`).join(PART_SEPARATOR)
}
