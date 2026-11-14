/** The exact next command of a lot (33S section 7, D18), with its full name: one rule for `start` and `status`. */
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { shellQuote } from '../shell-quote.ts'
import { CHECK_NEXT_COMMANDS, NEXT_COMMANDS, STATION_NEXT_COMMANDS } from './store.constants.ts'

import type {
	LotStateInput,
	LotStateReport,
	NextCommands,
	QuestionRecord,
	StationNext,
} from './store.types.ts'

/** The manual line: what a real working lot asks for while no runner exists (S). */
export function manualNextOf(name: string): string {
	return NEXT_COMMANDS.manual.replace('{name}', name)
}

/** The real start a dry run asks for: the brief path as it was given, shell-quoted. */
export function startNextOf(briefPath: string): string {
	return NEXT_COMMANDS.start.replace('{brief}', shellQuote(briefPath))
}

/** The simulated start a simulated dry run names: the same brief, the same scenario (a name of the scenario table). */
export function simulatedStartNextOf(params: { briefPath: string; scenario: string }): string {
	return NEXT_COMMANDS.simulatedStart
		.replace('{brief}', shellQuote(params.briefPath))
		.replace('{scenario}', params.scenario)
}

/** The wait line: what follows an answer, and a simulated working lot; a simulated lot's carries `--timeout 60`. */
export function waitNextOf(params: { name: string; simulated: boolean }): string {
	const template = params.simulated ? NEXT_COMMANDS.simulated : NEXT_COMMANDS.wait
	return template.replace('{name}', params.name)
}

/**
 * The answer line of an open question: a person's names who answers (`--by <who>`), a caller's leaves it out (it
 * defaults to `caller`).
 */
export function answerNextOf(params: { name: string; question: QuestionRecord }): string {
	const template =
		params.question.audience === 'person' ? NEXT_COMMANDS.answerPerson : NEXT_COMMANDS.answer
	return template.replace('{name}', params.name).replace('{question}', params.question.id)
}

/** The stop line: what a failed lot asks for. */
export function failedNextOf(name: string): string {
	return NEXT_COMMANDS.stop.replace('{name}', name)
}

/**
 * `next` and `also` per state: working -> the next station's command with the manual line in `also` when `station`
 * is given (`lot status`, 33L1 D14), else the manual line (the wait line when simulated); input-required -> the
 * answer line of the first open question; ready -> show and run the pending hand-over, or `lot result` without one;
 * failed -> the stop line; committed and canceled -> none.
 */
export function nextCommandsOf(params: {
	input: LotStateInput
	report: LotStateReport
	/** The next station of a real lot (`lot status` reads it); left out, a working lot gets the manual line. */
	station?: StationNext | null
}): NextCommands {
	const { input, report } = params
	const name = input.identity.name
	const handover = input.registryEntry?.state === 'pending' ? input.registryEntry.name : undefined
	if (report.state === 'working' && input.identity.simulated)
		return { next: waitNextOf({ name, simulated: true }), also: [] }
	if (report.state === 'working') {
		const stationCommand = params.station && stationCommandOf({ name, station: params.station })
		return stationCommand
			? { next: stationCommand, also: [manualNextOf(name)] }
			: { next: manualNextOf(name), also: [] }
	}
	const [firstOpen] = report.openQuestions
	if (report.state === 'input-required' && firstOpen !== undefined)
		return { next: answerNextOf({ name, question: firstOpen }), also: [] }
	if (report.state === 'ready' && handover !== undefined)
		return {
			next: NEXT_COMMANDS.show.replace('{handover}', handover),
			also: [NEXT_COMMANDS.run.replace('{handover}', handover)],
		}
	if (report.state === 'ready')
		return { next: NEXT_COMMANDS.result.replace('{name}', name), also: [] }
	if (report.state === 'failed') return { next: failedNextOf(name), also: [] }
	return { next: null, also: [] }
}

/**
 * The command of the next station (33L1 D14): a station to start (with `--step` or `--round` when the walk names
 * one), a running one to end, a check, a snapshot, the beyond-cap snapshot of the cap question; undefined for a
 * hand-over to write, an unknown position and any other answer (the manual line stands).
 */
function stationCommandOf(params: { name: string; station: StationNext }): string | undefined {
	const { name } = params
	const { next, run } = params.station
	const round = String(next.round)
	// a station name or a run read from events.jsonl is filled as written (R1-4)
	if (next.kind === 'station' && next.station !== null)
		return `${fillMessage({ template: STATION_NEXT_COMMANDS.start, values: { name, station: next.station } })}${positionOptionOf(next)}`
	if (next.kind === 'running' && next.station !== null && run !== null)
		return fillMessage({
			template: STATION_NEXT_COMMANDS.end,
			values: { name, station: next.station, run },
		})
	if (next.kind === 'check' && next.check !== null) return CHECK_NEXT_COMMANDS[next.check]
	if (next.kind === 'snapshot' && next.round !== null)
		return fillMessage({ template: STATION_NEXT_COMMANDS.snapshot, values: { name, round } })
	if (next.kind === 'question' && next.round !== null)
		return fillMessage({ template: STATION_NEXT_COMMANDS.beyondCap, values: { name, round } })
	return undefined
}

/** ` --step <k>` or ` --round <r>` when the walk names the station's step or round; empty otherwise. */
function positionOptionOf(next: StationNext['next']): string {
	if (next.step !== null)
		return fillMessage({
			template: STATION_NEXT_COMMANDS.step,
			values: { step: String(next.step) },
		})
	if (next.round !== null)
		return fillMessage({
			template: STATION_NEXT_COMMANDS.round,
			values: { round: String(next.round) },
		})
	return ''
}
