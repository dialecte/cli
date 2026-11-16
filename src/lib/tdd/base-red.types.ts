import type { CaseFailure } from './tdd.types.ts'

/**
 * The test-code files of the change laid over the base's tree for a base run: `write` at their current bytes
 * (new and changed ones), `remove` for those the change deletes. Production is never in either list.
 */
export type BaseOverlay = { write: string[]; remove: string[] }

/**
 * What a revised case does on the base's production with the lot's current test code: red (the failure and the
 * production hash of the base), passing, or a run that proves nothing (its reason).
 */
export type BaseRedVerdict =
	| { kind: 'red'; failure: CaseFailure; productionHash: string }
	| { kind: 'passes' }
	| { kind: 'refused'; reason: string }
