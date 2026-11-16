/**
 * Event builders for the tests of the node reporter: each returns an event shaped as node hands it to a custom
 * reporter (the keys and their values were checked against the stream of a real run), so a test lists the events
 * of a run in order.
 */
import { relative } from 'node:path'

import { RUN_ROOT } from './tdd-runners-node-events.constants.ts'

import type { NodeTestEvent } from '../src/lib/tdd/tdd-node-reporter.types.ts'
import type {
	NodeEventKind,
	NodeEventOutcome,
	NodeEventPlace,
} from './tdd-runners-node-events.types.ts'

/** `test:start` of a test or suite. */
export function startEvent(place: NodeEventPlace): NodeTestEvent {
	return { type: 'test:start', data: { ...place } }
}

/** `test:pass` or `test:fail` of a test (`kind: 'test'`) or a suite (`kind: 'suite'`). */
export function endEvent(params: {
	place: NodeEventPlace
	kind: NodeEventKind
	outcome: NodeEventOutcome
}): NodeTestEvent {
	const { place, kind, outcome } = params
	if (outcome.result === 'fail')
		return {
			type: 'test:fail',
			data: { ...place, details: { type: kind, error: outcome.error } },
		}
	return {
		type: 'test:pass',
		data: {
			...place,
			...(outcome.skip && { skip: true }),
			...(outcome.todo && { todo: true }),
			details: { type: kind },
		},
	}
}

/**
 * `test:stderr`: one chunk of what a test file's process printed on its error output. As in a real run, `file`
 * is the path as given on the command line (relative to the run's root) and `entryFile` the absolute one.
 */
export function stderrEvent(params: { entryFile: string; message: string }): NodeTestEvent {
	return {
		type: 'test:stderr',
		data: {
			file: relative(RUN_ROOT, params.entryFile),
			entryFile: params.entryFile,
			message: params.message,
		},
	}
}

/**
 * `test:stderr` as node 22 and 24 send it: `file` only, the path as given on the command line (relative to the
 * run's working folder), no `entryFile`.
 */
export function stderrEventWithoutEntryFile(params: {
	file: string
	message: string
}): NodeTestEvent {
	return { type: 'test:stderr', data: { file: params.file, message: params.message } }
}

/**
 * The events node also sends around a test that a reporter writing a report ignores: `test:enqueue`,
 * `test:dequeue`, `test:complete` (it repeats the outcome, error included, so reading it would count the test
 * twice), `test:plan`, `test:summary` and `test:diagnostic`.
 */
export function noiseEvents(params: {
	place: NodeEventPlace
	kind: NodeEventKind
	outcome: NodeEventOutcome
}): NodeTestEvent[] {
	const { place, kind, outcome } = params
	const completed = endEvent({ place, kind, outcome }).data
	return [
		{ type: 'test:enqueue', data: { ...place } },
		{ type: 'test:dequeue', data: { ...place } },
		{ type: 'test:complete', data: completed },
		{ type: 'test:plan', data: { nesting: place.nesting, file: place.file } },
		{ type: 'test:summary', data: { file: place.file } },
		{ type: 'test:diagnostic', data: { nesting: 0, message: 'tests 1' } },
	]
}
