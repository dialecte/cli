import { LOT_STATE_NAMES } from '../store/store.constants.ts'
import {
	parseOrchestratorJson,
	readBoolean,
	readList,
	readNumber,
	readOneOf,
	readOptionalRecord,
	readOptionalString,
	readOptionalStringList,
	readRecord,
	readSchemaVersion,
	readString,
	readStringList,
	rejectUnknown,
} from './orchestrator-json.ts'
import {
	ORCHESTRATOR_HELD_BY,
	ORCHESTRATOR_LANE_MODES,
	ORCHESTRATOR_STATE_FIELDS,
	ORCHESTRATOR_WAITING_KINDS,
} from './orchestrator.constants.ts'

import type {
	HeldItem,
	NextItem,
	OrchestratorChangeRequest,
	OrchestratorJsonValue,
	OrchestratorLane,
	OrchestratorLot,
	OrchestratorRun,
	OrchestratorRunner,
	OrchestratorState,
	OrchestratorWorkspace,
	ParseOrchestratorStateParams,
	SeenItem,
	WaitingItem,
} from './orchestrator.types.ts'

/**
 * The typed state of a `state.json` text, or an `OrchestratorFault` naming the first broken field: the JSON first,
 * then each known field in schema order, depth first, then the unknown keys in lexical order.
 */
export function parseOrchestratorState(params: ParseOrchestratorStateParams): OrchestratorState {
	const state = readRecord({ value: parseOrchestratorJson(params), path: 'state' })
	const value: OrchestratorState = {
		schema: readSchemaVersion({ value: state.schema, path: 'schema' }),
		workspace: readWorkspace({ value: state.workspace, path: 'workspace' }),
		updatedAt: readString({ value: state.updatedAt, path: 'updatedAt' }),
		lanes: readList({ value: state.lanes, path: 'lanes', read: readLane }),
		lots: readList({ value: state.lots, path: 'lots', read: readLot }),
		runs: readList({ value: state.runs, path: 'runs', read: readRun }),
		runners: readList({ value: state.runners, path: 'runners', read: readRunner }),
		held: readList({ value: state.held, path: 'held', read: readHeldItem }),
		waitingOnYou: readList({
			value: state.waitingOnYou,
			path: 'waitingOnYou',
			read: readWaitingItem,
		}),
		prs: readList({ value: state.prs, path: 'prs', read: readChangeRequest }),
		next: readList({ value: state.next, path: 'next', read: readNextItem }),
		seen: readList({ value: state.seen, path: 'seen', read: readSeenItem }),
	}
	rejectUnknown({ record: state, path: 'state', allowed: ORCHESTRATOR_STATE_FIELDS, root: true })
	return value
}

function readWorkspace(params: OrchestratorJsonValue): OrchestratorWorkspace {
	const workspace = readRecord(params)
	const value: OrchestratorWorkspace = {
		root: readString({ value: workspace.root, path: `${params.path}.root` }),
		key: readString({ value: workspace.key, path: `${params.path}.key` }),
	}
	rejectUnknown({ record: workspace, path: params.path, allowed: ['root', 'key'] })
	return value
}

function readLane(params: OrchestratorJsonValue): OrchestratorLane {
	const lane = readRecord(params)
	const value: OrchestratorLane = {
		name: readString({ value: lane.name, path: `${params.path}.name` }),
		repos: readStringList({ value: lane.repos, path: `${params.path}.repos` }),
		holds: readStringList({ value: lane.holds, path: `${params.path}.holds` }),
		owns: readStringList({ value: lane.owns, path: `${params.path}.owns` }),
		mode: readOneOf({
			value: lane.mode,
			path: `${params.path}.mode`,
			allowed: ORCHESTRATOR_LANE_MODES,
			expected: 'running, hold, or paused',
		}),
		plan: readString({ value: lane.plan, path: `${params.path}.plan` }),
		queue: readStringList({ value: lane.queue, path: `${params.path}.queue` }),
	}
	const pin = readOptionalString({ value: lane.pin, path: `${params.path}.pin` })
	const complete = pin === undefined ? value : { ...value, pin }
	rejectUnknown({
		record: lane,
		path: params.path,
		allowed: ['name', 'repos', 'holds', 'owns', 'mode', 'plan', 'queue', 'pin'],
	})
	return complete
}

function readLot(params: OrchestratorJsonValue): OrchestratorLot {
	const lot = readRecord(params)
	const value: OrchestratorLot = {
		id: readString({ value: lot.id, path: `${params.path}.id` }),
		lane: readString({ value: lot.lane, path: `${params.path}.lane` }),
		repo: readString({ value: lot.repo, path: `${params.path}.repo` }),
		state: readOneOf({
			value: lot.state,
			path: `${params.path}.state`,
			allowed: LOT_STATE_NAMES,
			expected: 'known lot state',
		}),
		station: readString({ value: lot.station, path: `${params.path}.station` }),
		attempt: readNumber({ value: lot.attempt, path: `${params.path}.attempt` }),
		pr: readString({ value: lot.pr, path: `${params.path}.pr` }),
		head: readString({ value: lot.head, path: `${params.path}.head` }),
	}
	const run = readOptionalRecord({ value: lot.run, path: `${params.path}.run` })
	const complete =
		run === undefined
			? value
			: { ...value, run: readLotRun({ record: run, path: `${params.path}.run` }) }
	rejectUnknown({
		record: lot,
		path: params.path,
		allowed: ['id', 'lane', 'repo', 'state', 'station', 'attempt', 'pr', 'head', 'run'],
	})
	return complete
}

function readLotRun(params: {
	record: Record<string, unknown>
	path: string
}): NonNullable<OrchestratorLot['run']> {
	const value = {
		runner: readString({ value: params.record.runner, path: `${params.path}.runner` }),
		handle: readString({ value: params.record.handle, path: `${params.path}.handle` }),
	}
	rejectUnknown({ record: params.record, path: params.path, allowed: ['runner', 'handle'] })
	return value
}

function readRun(params: OrchestratorJsonValue): OrchestratorRun {
	const run = readRecord(params)
	const value: OrchestratorRun = {
		id: readString({ value: run.id, path: `${params.path}.id` }),
		kind: readString({ value: run.kind, path: `${params.path}.kind` }),
		subject: readString({ value: run.subject, path: `${params.path}.subject` }),
		runner: readString({ value: run.runner, path: `${params.path}.runner` }),
		attempt: readNumber({ value: run.attempt, path: `${params.path}.attempt` }),
		status: readString({ value: run.status, path: `${params.path}.status` }),
		started: readString({ value: run.started, path: `${params.path}.started` }),
	}
	const until = readOptionalString({ value: run.until, path: `${params.path}.until` })
	const complete = until === undefined ? value : { ...value, until }
	rejectUnknown({
		record: run,
		path: params.path,
		allowed: ['id', 'kind', 'subject', 'runner', 'attempt', 'status', 'started', 'until'],
	})
	return complete
}

function readRunner(params: OrchestratorJsonValue): OrchestratorRunner {
	const runner = readRecord(params)
	const id = readString({ value: runner.id, path: `${params.path}.id` })
	const available = readBoolean({ value: runner.available, path: `${params.path}.available` })
	const until = readOptionalString({ value: runner.until, path: `${params.path}.until` })
	const tokensSinceReset = readNumber({
		value: runner.tokensSinceReset,
		path: `${params.path}.tokensSinceReset`,
	})
	const usage = readOptionalString({ value: runner.usage, path: `${params.path}.usage` })
	const value: OrchestratorRunner = {
		id,
		available,
		...(until === undefined ? {} : { until }),
		tokensSinceReset,
		...(usage === undefined ? {} : { usage }),
	}
	rejectUnknown({
		record: runner,
		path: params.path,
		allowed: ['id', 'available', 'until', 'tokensSinceReset', 'usage'],
	})
	return value
}

function readHeldItem(params: OrchestratorJsonValue): HeldItem {
	const held = readRecord(params)
	const value: HeldItem = {
		item: readString({ value: held.item, path: `${params.path}.item` }),
		by: readOneOf({
			value: held.by,
			path: `${params.path}.by`,
			allowed: ORCHESTRATOR_HELD_BY,
			expected: 'user, runner, or overlap',
		}),
		since: readString({ value: held.since, path: `${params.path}.since` }),
	}
	const until = readOptionalString({ value: held.until, path: `${params.path}.until` })
	const complete = until === undefined ? value : { ...value, until }
	rejectUnknown({ record: held, path: params.path, allowed: ['item', 'by', 'since', 'until'] })
	return complete
}

function readWaitingItem(params: OrchestratorJsonValue): WaitingItem {
	const waiting = readRecord(params)
	const value: WaitingItem = {
		id: readString({ value: waiting.id, path: `${params.path}.id` }),
		kind: readOneOf({
			value: waiting.kind,
			path: `${params.path}.kind`,
			allowed: ORCHESTRATOR_WAITING_KINDS,
			expected: 'gate or question',
		}),
		text: readString({ value: waiting.text, path: `${params.path}.text` }),
	}
	const line = readOptionalString({ value: waiting.line, path: `${params.path}.line` })
	const withLine: WaitingItem = line === undefined ? value : { ...value, line }
	const options = readOptionalStringList({
		value: waiting.options,
		path: `${params.path}.options`,
	})
	const complete = options === undefined ? withLine : { ...withLine, options }
	rejectUnknown({
		record: waiting,
		path: params.path,
		allowed: ['id', 'kind', 'text', 'line', 'options'],
	})
	return complete
}

// dialecte-allow duplicate-read: this narrows one state record, not a host result
function readChangeRequest(params: OrchestratorJsonValue): OrchestratorChangeRequest {
	const changeRequest = readRecord(params)
	const value: OrchestratorChangeRequest = {
		repo: readString({ value: changeRequest.repo, path: `${params.path}.repo` }),
		head: readString({ value: changeRequest.head, path: `${params.path}.head` }),
		ci: readString({ value: changeRequest.ci, path: `${params.path}.ci` }),
		review: readString({ value: changeRequest.review, path: `${params.path}.review` }),
	}
	rejectUnknown({
		record: changeRequest,
		path: params.path,
		allowed: ['repo', 'head', 'ci', 'review'],
	})
	return value
}

function readNextItem(params: OrchestratorJsonValue): NextItem {
	const next = readRecord(params)
	const value: NextItem = {
		lane: readString({ value: next.lane, path: `${params.path}.lane` }),
		lot: readString({ value: next.lot, path: `${params.path}.lot` }),
	}
	rejectUnknown({ record: next, path: params.path, allowed: ['lane', 'lot'] })
	return value
}

function readSeenItem(params: OrchestratorJsonValue): SeenItem {
	const seen = readRecord(params)
	const value: SeenItem = {
		source: readString({ value: seen.source, path: `${params.path}.source` }),
		event: readString({ value: seen.event, path: `${params.path}.event` }),
	}
	rejectUnknown({ record: seen, path: params.path, allowed: ['source', 'event'] })
	return value
}
