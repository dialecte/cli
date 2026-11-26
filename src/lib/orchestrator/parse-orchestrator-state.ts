import { isMapping } from '../config/config-checks.ts'

import type {
	HeldItem,
	NextItem,
	OrchestratorLane,
	OrchestratorLot,
	OrchestratorChangeRequest,
	OrchestratorRun,
	OrchestratorRunner,
	OrchestratorState,
	OrchestratorWorkspace,
	ParseOrchestratorStateParams,
	SeenItem,
	WaitingItem,
} from './orchestrator.types.ts'

export function parseOrchestratorState(params: ParseOrchestratorStateParams): OrchestratorState {
	let parsed: unknown
	try {
		parsed = JSON.parse(params.text)
	} catch (error) {
		if (error instanceof SyntaxError) throw new Error('invalid JSON')
		throw error
	}
	const state = readRecord({ value: parsed, path: 'state' })
	const value: OrchestratorState = {
		schema: readSchema({ value: state.schema, path: 'schema' }),
		workspace: readWorkspace({ value: state.workspace, path: 'workspace' }),
		updatedAt: readString({ value: state.updatedAt, path: 'updatedAt' }),
		lanes: readList({ value: state.lanes, path: 'lanes', read: readLane }),
		lots: readList({ value: state.lots, path: 'lots', read: readLot }),
		runs: readList({ value: state.runs, path: 'runs', read: readRun }),
		runners: readList({
			value: state.runners,
			path: 'runners',
			read: readRunner,
		}),
		held: readList({ value: state.held, path: 'held', read: readHeldItem }),
		waitingOnYou: readList({
			value: state.waitingOnYou,
			path: 'waitingOnYou',
			read: readWaitingItem,
		}),
		prs: readList({ value: state.prs, path: 'prs', read: parseChangeRequest }),
		next: readList({ value: state.next, path: 'next', read: readNextItem }),
		seen: readList({ value: state.seen, path: 'seen', read: readSeenItem }),
	}
	rejectUnknown({
		record: state,
		path: 'state',
		allowed: [
			'schema',
			'workspace',
			'updatedAt',
			'lanes',
			'lots',
			'runs',
			'runners',
			'held',
			'waitingOnYou',
			'prs',
			'next',
			'seen',
		],
	})
	return value
}

function readWorkspace(params: { value: unknown; path: string }): OrchestratorWorkspace {
	const workspace = readRecord(params)
	const value: OrchestratorWorkspace = {
		root: readString({ value: workspace.root, path: `${params.path}.root` }),
		key: readString({ value: workspace.key, path: `${params.path}.key` }),
	}
	rejectUnknown({ record: workspace, path: params.path, allowed: ['root', 'key'] })
	return value
}

function readLane(params: { value: unknown; path: string }): OrchestratorLane {
	const lane = readRecord(params)
	const value: OrchestratorLane = {
		name: readString({ value: lane.name, path: `${params.path}.name` }),
		repos: readStringList({ value: lane.repos, path: `${params.path}.repos` }),
		holds: readStringList({ value: lane.holds, path: `${params.path}.holds` }),
		owns: readStringList({ value: lane.owns, path: `${params.path}.owns` }),
		mode: readLaneMode({ value: lane.mode, path: `${params.path}.mode` }),
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

function readLot(params: { value: unknown; path: string }): OrchestratorLot {
	const lot = readRecord(params)
	const value: OrchestratorLot = {
		id: readString({ value: lot.id, path: `${params.path}.id` }),
		lane: readString({ value: lot.lane, path: `${params.path}.lane` }),
		repo: readString({ value: lot.repo, path: `${params.path}.repo` }),
		state: parseLotState({ value: lot.state, path: `${params.path}.state` }),
		station: readString({ value: lot.station, path: `${params.path}.station` }),
		attempt: readNumber({ value: lot.attempt, path: `${params.path}.attempt` }),
		pr: readString({ value: lot.pr, path: `${params.path}.pr` }),
		head: readString({ value: lot.head, path: `${params.path}.head` }),
	}
	const run = readOptionalRecord({
		value: lot.run,
		path: `${params.path}.run`,
	})
	const complete =
		run === undefined
			? value
			: {
					...value,
					run: readLotRun({ record: run, path: `${params.path}.run` }),
				}
	rejectUnknown({
		record: lot,
		path: params.path,
		allowed: ['id', 'lane', 'repo', 'state', 'station', 'attempt', 'pr', 'head', 'run'],
	})
	return complete
}

function readRun(params: { value: unknown; path: string }): OrchestratorRun {
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

function readRunner(params: { value: unknown; path: string }): OrchestratorRunner {
	const runner = readRecord(params)
	const id = readString({ value: runner.id, path: `${params.path}.id` })
	const available = readBoolean({
		value: runner.available,
		path: `${params.path}.available`,
	})
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

function readHeldItem(params: { value: unknown; path: string }): HeldItem {
	const held = readRecord(params)
	const value: HeldItem = {
		item: readString({ value: held.item, path: `${params.path}.item` }),
		by: readHeldBy({ value: held.by, path: `${params.path}.by` }),
		since: readString({ value: held.since, path: `${params.path}.since` }),
	}
	const until = readOptionalString({ value: held.until, path: `${params.path}.until` })
	const complete = until === undefined ? value : { ...value, until }
	rejectUnknown({ record: held, path: params.path, allowed: ['item', 'by', 'since', 'until'] })
	return complete
}

function readWaitingItem(params: { value: unknown; path: string }): WaitingItem {
	const waiting = readRecord(params)
	const value: WaitingItem = {
		id: readString({ value: waiting.id, path: `${params.path}.id` }),
		kind: readWaitingKind({ value: waiting.kind, path: `${params.path}.kind` }),
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
function parseChangeRequest(params: { value: unknown; path: string }): OrchestratorChangeRequest {
	const changeRequest = readRecord(params)
	const value: OrchestratorChangeRequest = {
		repo: readString({ value: changeRequest.repo, path: `${params.path}.repo` }),
		head: readString({ value: changeRequest.head, path: `${params.path}.head` }),
		ci: readString({ value: changeRequest.ci, path: `${params.path}.ci` }),
		review: readString({
			value: changeRequest.review,
			path: `${params.path}.review`,
		}),
	}
	rejectUnknown({
		record: changeRequest,
		path: params.path,
		allowed: ['repo', 'head', 'ci', 'review'],
	})
	return value
}

function readNextItem(params: { value: unknown; path: string }): NextItem {
	const next = readRecord(params)
	const value: NextItem = {
		lane: readString({ value: next.lane, path: `${params.path}.lane` }),
		lot: readString({ value: next.lot, path: `${params.path}.lot` }),
	}
	rejectUnknown({ record: next, path: params.path, allowed: ['lane', 'lot'] })
	return value
}

function readSeenItem(params: { value: unknown; path: string }): SeenItem {
	const seen = readRecord(params)
	const value: SeenItem = {
		source: readString({ value: seen.source, path: `${params.path}.source` }),
		event: readString({ value: seen.event, path: `${params.path}.event` }),
	}
	rejectUnknown({ record: seen, path: params.path, allowed: ['source', 'event'] })
	return value
}

function readList<Item>(params: {
	value: unknown
	path: string
	read: (params: { value: unknown; path: string }) => Item
}): Item[] {
	if (!Array.isArray(params.value)) throw invalid({ path: params.path, expected: 'array' })
	const values: unknown[] = params.value
	return values.map((value, index) =>
		params.read({ value, path: `${params.path}[${String(index)}]` }),
	)
}

function readStringList(params: { value: unknown; path: string }): string[] {
	return readList({ ...params, read: readString })
}

function readOptionalStringList(params: { value: unknown; path: string }): string[] | undefined {
	if (params.value === undefined) return undefined
	return readStringList(params)
}

function readRecord(params: { value: unknown; path: string }): Record<string, unknown> {
	if (!isMapping(params.value)) throw invalid({ path: params.path, expected: 'object' })
	return params.value
}

function readOptionalRecord(params: {
	value: unknown
	path: string
}): Record<string, unknown> | undefined {
	if (params.value === undefined) return undefined
	return readRecord(params)
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

function rejectUnknown(params: {
	record: Record<string, unknown>
	path: string
	allowed: readonly string[]
}): void {
	const field = Object.keys(params.record)
		.filter((candidate) => !params.allowed.includes(candidate))
		.sort()[0]
	if (field !== undefined) throw new Error(`${params.path}: unknown field "${field}"`)
}

function readString(params: { value: unknown; path: string }): string {
	if (typeof params.value !== 'string') throw invalid({ path: params.path, expected: 'string' })
	return params.value
}

function readOptionalString(params: { value: unknown; path: string }): string | undefined {
	if (params.value === undefined) return undefined
	return readString(params)
}

function readNumber(params: { value: unknown; path: string }): number {
	if (typeof params.value !== 'number' || !Number.isFinite(params.value))
		throw invalid({ path: params.path, expected: 'number' })
	return params.value
}

function readBoolean(params: { value: unknown; path: string }): boolean {
	if (typeof params.value !== 'boolean') throw invalid({ path: params.path, expected: 'boolean' })
	return params.value
}

function readSchema(params: { value: unknown; path: string }): 1 {
	if (params.value === undefined) throw invalid({ path: params.path, expected: '1' })
	if (params.value !== 1) throw new Error(`${params.path}: unknown version ${String(params.value)}`)
	return 1
}

function readLaneMode(params: { value: unknown; path: string }): OrchestratorLane['mode'] {
	const value = params.value
	if (value === 'running' || value === 'hold' || value === 'paused') return value
	throw invalid({ path: params.path, expected: 'running, hold, or paused' })
}

// dialecte-allow duplicate-read: this narrows one JSON word, not a stored lot record
function parseLotState(params: { value: unknown; path: string }): OrchestratorLot['state'] {
	const value = params.value
	if (
		value === 'working' ||
		value === 'ready' ||
		value === 'failed' ||
		value === 'canceled' ||
		value === 'input-required' ||
		value === 'committed'
	)
		return value
	throw invalid({ path: params.path, expected: 'known lot state' })
}

function readHeldBy(params: { value: unknown; path: string }): HeldItem['by'] {
	const value = params.value
	if (value === 'user' || value === 'runner' || value === 'overlap') return value
	throw invalid({ path: params.path, expected: 'user, runner, or overlap' })
}

function readWaitingKind(params: { value: unknown; path: string }): WaitingItem['kind'] {
	const value = params.value
	if (value === 'gate' || value === 'question') return value
	throw invalid({ path: params.path, expected: 'gate or question' })
}

function invalid(params: { path: string; expected: string }): Error {
	return new Error(`${params.path}: expected ${params.expected}`)
}
