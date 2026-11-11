/**
 * `dialecte lot station <id> start|end <station> ... | --from <file.json> [--json]` (33L0 sections 3, 4 "Station
 * events", 5, 12): records one station event in the lot's `events.jsonl`. The pairing and retry rules read the file
 * before the one append (no lock); concurrent retries are resolved by readers.
 */
import { join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { EVENT_LINE_LIMIT } from '../lib/events/events.constants.ts'
import { pairRuns } from '../lib/events/pair-runs.ts'
import { readEvents } from '../lib/events/read-events.ts'
import { STATION_COST_FIELDS } from '../lib/events/station-event.constants.ts'
import { readStationRequest } from '../lib/events/station-event.ts'
import { worktreeCliOf } from '../lib/events/worktree-cli.ts'
import {
	eventLineOf,
	makeEnvelope,
	overLimitMessage,
	writeEvent,
} from '../lib/events/write-event.ts'
import { isPathArgument } from '../lib/handover/handover-store-read.ts'
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { jsonOf, textOf } from '../lib/print/print.ts'
import { readCliVersion } from '../lib/read-cli-version.ts'
import { SKILL_NAME_PATTERN } from '../lib/skills/skill-file.constants.ts'
import { AGENT_SKILL_FOLDERS } from '../lib/skills/sync-skills.constants.ts'
import { lotFailureExit, lotRefusalExit, lotUsageExit } from '../lib/store/lot-exits.ts'
import { readLotStateInput, registryOfLotFolder } from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { noLotRefusal, requiredLotOf } from '../lib/store/resolve-lot.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { hashFile } from '../lib/tdd/tdd-files.ts'
import {
	NOT_HOST_GIVEN_FIELDS,
	SKILL_FILE_NAME,
	STATION_PAIRING_FIELDS,
	STATION_START_REFUSED_STATES,
} from './lot-station.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { LotEvent } from '../lib/events/event.types.ts'
import type { NamedSkill, StationRequest } from '../lib/events/station-event.types.ts'
import type { LotIdentity } from '../lib/store/store.types.ts'
import type {
	LotStationParams,
	StationCall,
	StationDecision,
	StationOutcome,
} from './lot-station.types.ts'

/** `dialecte lot station <id> start|end <station> ...` / `--from <file.json>`: records one station event. */
export function lotStation(params: LotStationParams): CommandResult {
	const json = params.argv.includes(JSON_FLAG)
	const request = readStationRequest({ argv: params.argv, cwd: params.cwd })
	if ('faults' in request)
		return request.usage
			? lotUsageExit({ reason: request.faults.join('; '), json })
			: lotRefusalExit({ lines: ['lot station: refused', ...request.faults], json })
	const required = requiredLotOf({ argument: request.id, cwd: params.cwd, mode: 'write' })
	if ('exitCode' in required) return lotRefusalExit({ lines: required.lines, json })
	const lotFolder = required.lot
	const input = readLotStateInput({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	if (!input) return lotRefusalExit({ lines: [noLotRefusal(request.id)], json })
	const { identity } = input
	const { state } = lotState(input)
	const file = join(lotFolder, STORE_FILES.events)
	try {
		const decision = decide({
			request,
			identity,
			state,
			event: eventOf({ request, identity, cwd: params.cwd, now: params.now }),
			events: needsEvents(request) ? readEvents({ file }).events : [],
		})
		if ('refusal' in decision) return lotRefusalExit({ lines: decision.refusal, json })
		if ('write' in decision) {
			const bytes = eventLineOf({ event: decision.write }).length
			if (bytes > EVENT_LINE_LIMIT)
				return lotRefusalExit({
					lines: [`lot station: refused: ${overLimitMessage({ bytes, limit: EVENT_LINE_LIMIT })}`],
					json,
				})
			writeEvent({ file, event: decision.write, limit: EVENT_LINE_LIMIT })
		}
		return answerOf({ outcome: decision.outcome, request, identity, json })
	} catch (error) {
		return lotFailureExit({
			lines: [
				`lot station: the event could not be written in ${file}: ${(error as Error).message}`,
			],
			json,
		})
	}
}

/** True when the call must read the events first: an end (pairing, retries) or an `--event` id. */
function needsEvents(request: StationRequest): boolean {
	return request.phase === 'end' || request.hostEvent !== null
}

/** The event the call would write: the envelope, then its fields (skills with their hashes); no `run` yet. */
function eventOf(params: {
	request: StationRequest
	identity: LotIdentity
	cwd: string
	now: Date | undefined
}): LotEvent {
	const { request, identity, now } = params
	const fields = { ...request.fields }
	if (fields.skills !== undefined)
		fields.skills = (fields.skills as NamedSkill[]).map(function withHash(skill) {
			return {
				name: skill.name,
				hash: skillHashOf({ name: skill.name, cwd: params.cwd, repository: identity.repository }),
				how: skill.how,
			}
		})
	return {
		...makeEnvelope({
			lot: identity.name,
			kind: `station.${request.phase}`,
			by: 'host',
			cli: readCliVersion(),
			simulated: identity.simulated,
			hostEvent: request.hostEvent,
			worktreeCli: worktreeCliOf({ worktree: identity.worktree }),
			now:
				now === undefined
					? undefined
					: function givenTime() {
							return now
						},
		}),
		...fields,
	}
}

/**
 * The call decided against the events already written: a repeated `--event` answers the first event, whatever the
 * lot's state now (or is refused when its fields or its `--run` differ); a start is refused on a closed lot, else
 * writes a new run; an end pairs with its start, or is a retry, or is recorded alone.
 */
function decide(call: StationCall): StationDecision {
	const { request, identity, state, event, events } = call
	if (request.hostEvent !== null) {
		const first = events.find(function sameHostEvent(each) {
			return each.hostEvent === request.hostEvent
		})
		if (first !== undefined) {
			if (
				!isDeepStrictEqual(hostGivenOf(first), hostGivenOf(event)) ||
				(request.run !== undefined && request.run !== runOf(first))
			)
				return {
					refusal: [
						`lot station: --event ${request.hostEvent} is the event ${first.id} already, with other fields`,
					],
				}
			return { outcome: outcomeOf({ call, recorded: 'already', run: runOf(first) }) }
		}
	}
	if (request.phase === 'start') {
		if (STATION_START_REFUSED_STATES.includes(state))
			return {
				refusal: [`lot station: the lot ${identity.name} is ${state}: no station starts on it`],
			}
		const write = { ...event, run: event.id }
		return { write: orderedOf(write), outcome: outcomeOf({ call, recorded: 'new', run: event.id }) }
	}
	if (request.run !== undefined) return endOfRun({ call, run: request.run })
	return endWithoutRun(call)
}

/**
 * An end naming its run: refused when no start of the lot has that id, or when its station, step, round or attempt
 * differs from that start's; a second end of the run is `already` when its host-given fields are the first end's,
 * refused otherwise.
 */
function endOfRun(params: { call: StationCall; run: string }): StationDecision {
	const { call, run } = params
	const start = call.events.find(function isThatStart(each) {
		return each.kind === 'station.start' && each.id === run
	})
	if (start === undefined)
		return {
			refusal: [`lot station: --run ${run} names no start of the lot ${call.identity.name}`],
		}
	if (!keyGivenMatches({ start, end: call.event }))
		return {
			refusal: [
				`lot station: --run ${run} is the start ${start.id} of another station, step, round or attempt`,
			],
		}
	const firstEnd = call.events.find(function isEndOfRun(each) {
		return each.kind === 'station.end' && each.run === run
	})
	if (firstEnd !== undefined) {
		if (!isDeepStrictEqual(hostGivenOf(firstEnd), hostGivenOf(call.event)))
			return {
				refusal: [
					`lot station: the run ${run} has the end ${firstEnd.id} already, with other fields`,
				],
			}
		return { outcome: outcomeOf({ call, recorded: 'already', run }) }
	}
	return {
		write: orderedOf({ ...call.event, run }),
		outcome: outcomeOf({ call, recorded: 'new', run }),
	}
}

/**
 * An end without `--run`: the one open start of its station, step, round and attempt; several are refused; with
 * none, a retry of the last end of that key when it carries a cost field and the same host-given fields, else an
 * end recorded alone (`run` its own id, `started: null`).
 */
function endWithoutRun(call: StationCall): StationDecision {
	const { event, events } = call
	const open = pairRuns({ events })
		.runs.filter(function isOpenStartOfKey(run) {
			return run.start !== undefined && run.end === undefined && sameKey(run.start, event)
		})
		.map(function startId(run) {
			return run.run
		})
	if (open.length > 1)
		return {
			refusal: [
				`lot station: ${open.length} starts of ${event.station} are open: give --run <run>`,
				...open.map(function runLine(run) {
					return `  ${run}`
				}),
			],
		}
	if (open.length === 1)
		return {
			write: orderedOf({ ...event, run: open[0] }),
			outcome: outcomeOf({ call, recorded: 'new', run: open[0] }),
		}
	const last = [...events].reverse().find(function isEndOfKey(each) {
		return each.kind === 'station.end' && sameKey(each, event)
	})
	if (
		last !== undefined &&
		carriesCost(last) &&
		isDeepStrictEqual(hostGivenOf(last), hostGivenOf(event))
	)
		return { outcome: outcomeOf({ call, recorded: 'already', run: runOf(last) }) }
	return {
		write: orderedOf({ ...event, run: event.id, started: null }),
		outcome: { ...outcomeOf({ call, recorded: 'new', run: event.id }), alone: true },
	}
}

/** The event with `run` right after the envelope (the order a reader sees first). */
function orderedOf(event: LotEvent): LotEvent {
	const { run, ...rest } = event
	const ordered: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(rest)) {
		ordered[key] = value
		if (key === 'hostEvent') ordered.run = run
	}
	return ordered as LotEvent
}

/** The outcome of a call: what was recorded, the run, and the end command after a start. */
function outcomeOf(params: {
	call: StationCall
	recorded: 'new' | 'already'
	run: string
}): StationOutcome {
	const { call, recorded, run } = params
	const next =
		call.request.phase === 'start'
			? `dialecte lot station ${call.identity.name} end ${call.request.station} --run ${run}`
			: null
	return { recorded, run, next, alone: false }
}

/** Exit 0: `{ recorded, run, next }` under `--json`, else the lines saying it. */
function answerOf(params: {
	outcome: StationOutcome
	request: StationRequest
	identity: LotIdentity
	json: boolean
}): CommandResult {
	const { outcome, request } = params
	if (params.json) {
		const { recorded, run, next } = outcome
		return { exitCode: 0, output: jsonOf({ recorded, run, next }, 2) }
	}
	const named = `lot station: ${params.identity.name} ${request.station}`
	const lines =
		outcome.recorded === 'already'
			? [`${named} ${request.phase}: already recorded, run ${outcome.run}`]
			: [
					`${named} ${request.phase === 'start' ? 'started' : 'ended'}, run ${outcome.run}${outcome.alone ? ' (no open start: recorded alone)' : ''}`,
				]
	if (outcome.next !== null) lines.push(`next: ${outcome.next}`)
	return { exitCode: 0, output: textOf(lines) }
}

/** The fields the host gave: every field but the envelope, the run and `started`; a skill as its name and how. */
function hostGivenOf(event: LotEvent): Record<string, unknown> {
	const given: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(event))
		if (!NOT_HOST_GIVEN_FIELDS.includes(key)) given[key] = value
	// the hash is the cli's reading of the skill file, never the host's: a changed file is the same skill given
	if (Array.isArray(given.skills))
		given.skills = (given.skills as NamedSkill[]).map(function nameAndHow(skill) {
			return { name: skill.name, how: skill.how }
		})
	return given
}

/** True when both events name the same station, step, round and attempt. */
function sameKey(first: LotEvent, second: LotEvent): boolean {
	return STATION_PAIRING_FIELDS.every(function sameField(field) {
		return first[field] === second[field]
	})
}

/**
 * True when every pairing field the end gives (station always; step, round, attempt when given) is its start's: an
 * end naming its run need not say the key again, but never says another.
 */
function keyGivenMatches(params: { start: LotEvent; end: LotEvent }): boolean {
	const { start, end } = params
	return STATION_PAIRING_FIELDS.every(function sameWhenGiven(field) {
		return end[field] === undefined || end[field] === start[field]
	})
}

/** True when the event carries one cost field at least. */
function carriesCost(event: LotEvent): boolean {
	return STATION_COST_FIELDS.some(function holdsField(field) {
		return event[field] !== undefined
	})
}

/** The run of an event: its `run`, else its own id. */
function runOf(event: LotEvent): string {
	return typeof event.run === 'string' ? event.run : event.id
}

/**
 * A skill's hash: the sha256 of the path given, or of `<repository>/<folder>/<name>/SKILL.md` for the first synced
 * skill folder holding it; null when the cli cannot read it.
 */
function skillHashOf(params: { name: string; cwd: string; repository: string }): string | null {
	const { name } = params
	if (isPathArgument(name)) return hashOrNull(resolve(params.cwd, name))
	if (!SKILL_NAME_PATTERN.test(name)) return null
	for (const folder of Object.values(AGENT_SKILL_FOLDERS)) {
		const hash = hashOrNull(join(params.repository, folder, name, SKILL_FILE_NAME))
		if (hash !== null) return hash
	}
	return null
}

/** The sha256 of a file, null when it does not read. */
function hashOrNull(path: string): string | null {
	try {
		return hashFile(path)
	} catch {
		return null
	}
}
