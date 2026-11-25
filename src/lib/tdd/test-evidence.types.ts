import type { GateRecordMode } from '../gate-records/gate-records.types.ts'
import type { TestFailure } from './tests-record.types.ts'

/** One failure on record, with whether it is of the committed HEAD's tree (`current`; an unknown entry has no tree). */
export type EvidenceFailure =
	| { part: 'gate'; failure: TestFailure; current: boolean }
	| {
			part: 'gate-counts'
			mode: GateRecordMode | null
			head: string
			current: boolean
			failed: number
	  }
	| { part: 'tdd'; head: string; current: boolean; cases: string[] }

/**
 * What the lot's tests record says of its committed HEAD: it cannot be read, it holds a failure, every part passes on
 * this tree, nothing fails but a part is of another tree or there is no gate part, or there is no record.
 */
export type TestEvidence =
	| { state: 'unreadable'; why: string }
	| { state: 'failing'; failures: EvidenceFailure[] }
	| { state: 'passing' }
	| { state: 'stale' }
	| { state: 'none' }
