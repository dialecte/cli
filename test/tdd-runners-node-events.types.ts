import type { NodeTestError } from '../src/lib/tdd/tdd-node-reporter.types.ts'

/** Where `node --test` places a test or a suite in an event. */
export type NodeEventPlace = {
	name: string
	nesting: number
	file: string
	line: number
	column: number
}

/** The end of a test or suite: passed (with its modifiers) or failed (with node's error). */
export type NodeEventOutcome =
	| { result: 'pass'; skip?: boolean; todo?: boolean }
	| { result: 'fail'; error: NodeTestError }

/** An event of a case (`test`) or of a suite. */
export type NodeEventKind = 'test' | 'suite'
