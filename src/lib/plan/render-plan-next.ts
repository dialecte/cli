/**
 * What `plan next` prints (33N section 9): the text as plain lines (head, open, start, held, landed, person, spec,
 * waiting, parked, unknown, heavy, next), or the `--json` object. Exit 0 when a lot or fix can start, else 1.
 */
import { dirname, relative } from 'node:path'

import { MEMORY_LIMIT_BYTES } from '../heavy/machine-load.constants.ts'
import { loadLimitOf, gigabytesOf } from '../heavy/machine-load.ts'
import { jsonOf, textOf } from '../print/print.ts'
import { landedLineFrom } from '../store/lot-entry.ts'
import { clockTimeOf, stepTextOf } from './plan-heavy.ts'
import {
	HEAD_SEPARATOR,
	LIST_SEPARATOR,
	MEMORY_SOURCE_TEXTS,
	MARKERS_UNKNOWN_TEXT,
	MEMORY_UNKNOWN_TEXT,
	MILLISECONDS_PER_SECOND,
	NO_LOT_LINE,
	PART_SEPARATOR,
	PLAN_COMMAND,
	PLAN_ID_WIDTH,
	PLAN_JSON_INDENT,
	PLAN_LABEL_WIDTH,
	REASON_SEPARATOR,
	SECONDS_PER_MINUTE,
	SHORT_MACHINE_END,
	SHORT_MACHINE_START,
} from './plan.constants.ts'

import type { CommandResult } from '../command-result.types.ts'
import type { EntryStatus, OutsideWork } from './entry-state.types.ts'
import type { PlanEntry } from './plan-block.types.ts'
import type { Proposal } from './propose.types.ts'
import type { PlanNextJson, PlanNextReport } from './render-plan-next.types.ts'

/** The answer of `plan next`: its text lines or its JSON object; exit 0 when a lot or fix can start, else 1. */
export function renderPlanNext(params: { report: PlanNextReport; json: boolean }): CommandResult {
	const { report } = params
	return {
		exitCode: report.proposals.proposals.length > 0 ? 0 : 1,
		output: params.json
			? jsonOf(planNextJsonOf({ report }), PLAN_JSON_INDENT)
			: textOf(planNextLinesOf({ report })),
	}
}

/** The text of `plan next` as plain lines, each group under its label (a continuation line leaves it blank). */
export function planNextLinesOf(params: { report: PlanNextReport }): string[] {
	const { report } = params
	return [
		headLineOf({ report }),
		...labelled({ label: 'open', lines: openLinesOf({ report }) }),
		...labelled({ label: 'start', lines: startLinesOf({ report }) }),
		...labelled({ label: 'held', lines: heldLinesOf({ report }) }),
		...labelled({ label: 'landed', lines: landedLinesOf({ report }) }),
		...labelled({ label: 'person', lines: personLinesOf({ report }) }),
		...labelled({ label: 'spec', lines: joinedOf({ parts: specPartsOf({ report }) }) }),
		...labelled({ label: 'waiting', lines: joinedOf({ parts: waitingPartsOf({ report }) }) }),
		...labelled({ label: 'parked', lines: joinedOf({ parts: parkedPartsOf({ report }) }) }),
		...labelled({ label: 'unknown', lines: unknownLinesOf({ report }) }),
		...labelled({
			label: 'done',
			lines: report.all ? joinedOf({ parts: doneIdsOf({ report }) }) : [],
		}),
		...labelled({ label: 'heavy', lines: [heavyPartsOf({ report }).join(PART_SEPARATOR)] }),
		...labelled({ label: 'next', lines: [`${PLAN_COMMAND} next ${report.plan} --json`] }),
	]
}

/** The `--json` object of `plan next` (33N section 9). */
export function planNextJsonOf(params: { report: PlanNextReport }): PlanNextJson {
	const { report } = params
	const { machine } = report
	return {
		plan: report.plan,
		repositories: Object.keys(report.block.repositories),
		counts: report.proposals.counts,
		entries: report.states.entries.map((status) => {
			const entry = entryOf({ report, id: status.id })
			return {
				id: status.id,
				group: entry?.group ?? null,
				kind: status.kind,
				state: status.state,
				lotState: status.lotState,
				realizedBy: status.realizedBy,
				waitsFor: status.waitsFor,
				parked: entry?.parked ?? null,
				spec: status.spec,
			}
		}),
		proposals: report.proposals.proposals,
		held: report.proposals.held,
		landed: report.landed,
		specWork: report.proposals.specWork,
		heavy: {
			markers: report.heavy.markers,
			...(report.heavy.markersUnknown !== undefined && {
				markersUnknown: report.heavy.markersUnknown,
			}),
			load: { now: machine.load, limit: loadLimitOf({ machine }), cores: machine.cores },
			memory: {
				available: machine.available ?? null,
				limit: MEMORY_LIMIT_BYTES,
				source: machine.source,
			},
			short: (report.heavy.shortReasons ?? []).length > 0,
		},
		unknown: report.states.entries
			.filter((status) => status.state === 'unknown')
			.map((status) => ({ id: status.id, reason: status.reason ?? '' })),
	}
}

/** `plan <plan>  ·  repositories <names>  ·  done d · open o · ready r (h held) · waiting w · parked p[ · unknown u]`. */
function headLineOf(params: { report: PlanNextReport }): string {
	const { report } = params
	const { counts } = report.proposals
	const ready =
		counts.held > 0 ? `ready ${counts.ready} (${counts.held} held)` : `ready ${counts.ready}`
	const tally = [
		`done ${counts.done}`,
		`open ${counts.open}`,
		ready,
		`waiting ${counts.waiting}`,
		`parked ${counts.parked}`,
		...(counts.unknown > 0 ? [`unknown ${counts.unknown}`] : []),
	].join(PART_SEPARATOR)
	return [
		`plan ${report.plan}`,
		`repositories ${Object.keys(report.block.repositories).join(LIST_SEPARATOR)}`,
		tally,
	].join(HEAD_SEPARATOR)
}

/** The open entries (how each is open), then the open work no entry accounts for. */
function openLinesOf(params: { report: PlanNextReport }): string[] {
	const { report } = params
	const entries = report.states.entries
		.filter((status) => status.state === 'open')
		.map(
			(status) =>
				`${cellOf({ text: status.id })}${repositoriesOf({ report, status })}  ${openHowOf({ status })}`,
		)
	const outside = report.states.outside.map(
		(work) => `${cellOf({ text: '-' })}${work.repository}  ${outsideHowOf({ work })}`,
	)
	return [...entries, ...outside]
}

/** How an entry is open: by its worktree alone, a pending hand-over, a store lot. */
function openHowOf(params: { status: EntryStatus }): string {
	const { status } = params
	const realizedBy = status.realizedBy
	if (realizedBy === null) return status.note ?? 'open'
	if (realizedBy.kind === 'worktree') return `${status.note ?? ''} (worktree ${realizedBy.name})`
	if (realizedBy.kind === 'registry')
		return `hand-over ${realizedBy.name} ${status.note ?? ''}`.trimEnd()
	return `store lot ${realizedBy.name} (${status.lotState ?? 'open'})`
}

/** How open work outside the plan is said. */
function outsideHowOf(params: { work: OutsideWork }): string {
	const { work } = params
	const note = work.note === undefined ? '' : ` - ${work.note}`
	const scope = work.scope === null ? 'unknown' : work.scope.join(LIST_SEPARATOR)
	const of = work.note !== undefined && work.scope !== null
	if (work.kind === 'registry')
		return `${of ? '' : 'unattributed: '}hand-over ${work.name} pending since ${work.since ?? '?'} (scope ${scope})${note}`
	if (work.kind === 'worktree')
		return `${of ? '' : 'unattributed: '}worktree ${work.name} (scope ${scope})${note}`
	return `${of ? '' : 'outside the plan: '}store lot ${work.name} (scope ${scope})${note}`
}

/** The repositories an open entry holds, else the ones its scope names. */
function repositoriesOf(params: { report: PlanNextReport; status: EntryStatus }): string {
	const held = Object.keys(params.status.heldScope)
	const names =
		held.length > 0
			? held
			: Object.keys(entryOf({ report: params.report, id: params.status.id })?.scope ?? {})
	return names.length > 0 ? names.join(',') : '-'
}

/** One line per proposal, or the line saying no lot can start. */
function startLinesOf(params: { report: PlanNextReport }): string[] {
	const { proposals } = params.report.proposals
	if (proposals.length === 0) return [NO_LOT_LINE]
	return proposals.map((proposal) => proposalLineOf({ proposal }))
}

/** `<id>  <kind>  unblocks u (chain c) · after · merge · unverified · stacks · wait · next`. */
function proposalLineOf(params: { proposal: Proposal }): string {
	const { proposal } = params
	const parts = [
		`unblocks ${proposal.unblocks} (chain ${proposal.chain})`,
		...(proposal.after === null ? [] : [`after ${proposal.after}`]),
		...listPartOf({ name: 'merge', items: proposal.merge }),
		...listPartOf({ name: 'unverified', items: proposal.unverified }),
		...listPartOf({ name: 'stacks', items: proposal.stacks }),
		...(proposal.wait === undefined ? [] : [proposal.wait]),
		`next: ${proposal.next}`,
	]
	return `${cellOf({ text: proposal.id })}${proposal.kind}  ${parts.join(PART_SEPARATOR)}`
}

/** `<name>: a, b` when there are items; nothing otherwise. */
function listPartOf(params: { name: string; items: string[] }): string[] {
	return params.items.length === 0 ? [] : [`${params.name}: ${params.items.join(LIST_SEPARATOR)}`]
}

/** One line per held entry with every pair it meets. */
function heldLinesOf(params: { report: PlanNextReport }): string[] {
	return params.report.proposals.held.map(
		(held) => `${cellOf({ text: held.id })}${held.met.join(PART_SEPARATOR)}`,
	)
}

/** One line per landed lot: its repository, then the line that says why it reads committed. */
function landedLinesOf(params: { report: PlanNextReport }): string[] {
	return params.report.landed.map(
		(landed) =>
			`${cellOf({ text: landed.repository })}${landedLineFrom({ ...landed, name: landed.lot })}`,
	)
}

/** One line per person entry ready without a mark, with the command that records it. */
function personLinesOf(params: { report: PlanNextReport }): string[] {
	const { report } = params
	return report.states.entries
		.filter((status) => status.kind === 'person' && status.state === 'ready')
		.map(
			(status) =>
				`${cellOf({ text: status.id })}ready, no mark (${PLAN_COMMAND} mark ${report.plan} ${status.id} done --by <who>)`,
		)
}

/** `<spec file> <status> (<ids>)`, the file relative to the plan's folder. */
function specPartsOf(params: { report: PlanNextReport }): string[] {
	const folder = dirname(params.report.planPath)
	return params.report.proposals.specWork.map(
		(work) => `${relative(folder, work.file)} ${work.status} (${work.ids.join(LIST_SEPARATOR)})`,
	)
}

/** `<id> for <ids> (<state>)`, the dependencies of one state grouped. */
function waitingPartsOf(params: { report: PlanNextReport }): string[] {
	return params.report.states.entries
		.filter((status) => status.state === 'waiting')
		.map((status) => {
			const byState = new Map<string, string[]>()
			for (const dependency of status.waitsFor)
				byState.set(dependency.state, [...(byState.get(dependency.state) ?? []), dependency.id])
			const groups = [...byState].map(([state, ids]) => `${ids.join(LIST_SEPARATOR)} (${state})`)
			return `${status.id} for ${groups.join(LIST_SEPARATOR)}`
		})
}

/** `<id> (<why it is parked>)`. */
function parkedPartsOf(params: { report: PlanNextReport }): string[] {
	return params.report.states.entries
		.filter((status) => status.state === 'parked')
		.map((status) => `${status.id} (${status.reason ?? ''})`)
}

/** One line per entry that cannot be read, with the reason. */
function unknownLinesOf(params: { report: PlanNextReport }): string[] {
	return params.report.states.entries
		.filter((status) => status.state === 'unknown')
		.map((status) => `${cellOf({ text: status.id })}${status.reason ?? ''}`)
}

/** The done entries' ids. */
function doneIdsOf(params: { report: PlanNextReport }): string[] {
	return params.report.states.entries
		.filter((status) => status.state === 'done')
		.map((status) => status.id)
}

/** The heavy steps running (step, worktree, start, age), the load against its limit, the memory, the shortness. */
function heavyPartsOf(params: { report: PlanNextReport }): string[] {
	const { report } = params
	const { machine } = report
	const reasons = report.heavy.shortReasons ?? []
	const markers = report.heavy.markers.map(
		(marker) =>
			`${stepTextOf({ step: marker.step })} in ${marker.worktree} since ${clockTimeOf({ time: marker.since })} (${ageOf({ since: marker.since, now: report.now })})`,
	)
	const memory =
		machine.available === undefined
			? MEMORY_UNKNOWN_TEXT
			: `memory ${gigabytesOf({ bytes: machine.available })} GB ${MEMORY_SOURCE_TEXTS[machine.source] ?? machine.source}`
	const unknown = report.heavy.markersUnknown
	return [
		...(unknown === undefined ? [] : [`${MARKERS_UNKNOWN_TEXT} (${unknown})`]),
		...markers,
		`load ${machine.load.toFixed(1)} / ${loadLimitOf({ machine })}`,
		memory,
		...(reasons.length === 0
			? []
			: [`${SHORT_MACHINE_START} (${reasons.join(REASON_SEPARATOR)})${SHORT_MACHINE_END}`]),
	]
}

/** How long a step has run: `40s`, `4m`, `1h 5m`. */
function ageOf(params: { since: string; now: Date }): string {
	const seconds = Math.max(
		0,
		Math.floor((params.now.getTime() - new Date(params.since).getTime()) / MILLISECONDS_PER_SECOND),
	)
	if (seconds < SECONDS_PER_MINUTE) return `${seconds}s`
	const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)
	if (minutes < SECONDS_PER_MINUTE) return `${minutes}m`
	return `${Math.floor(minutes / SECONDS_PER_MINUTE)}h ${minutes % SECONDS_PER_MINUTE}m`
}

/** The parts of a group on one line; no line when there is none. */
function joinedOf(params: { parts: string[] }): string[] {
	return params.parts.length === 0 ? [] : [params.parts.join(PART_SEPARATOR)]
}

/** The lines of a group: the label on the first, blank on the others. */
function labelled(params: { label: string; lines: string[] }): string[] {
	return params.lines.map(
		(line, index) => `${(index === 0 ? params.label : '').padEnd(PLAN_LABEL_WIDTH)}${line}`,
	)
}

/** A text in the id column, followed by at least two spaces. */
function cellOf(params: { text: string }): string {
	return params.text.length < PLAN_ID_WIDTH
		? params.text.padEnd(PLAN_ID_WIDTH + 1)
		: `${params.text}  `
}

/** The block entry of an id. */
function entryOf(params: { report: PlanNextReport; id: string }): PlanEntry | undefined {
	return params.report.block.lots.find((entry) => entry.id === params.id)
}
