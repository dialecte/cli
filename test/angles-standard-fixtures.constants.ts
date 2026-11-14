/** Constants of the angles tests that read an index: the question, the message the explained code holds. */
import type { ExplainedCode } from '../src/lib/run/explain-code.types.ts'

/** A question whose only content word is `about`: it shares no term with the index families. */
export const INDEX_ANGLES_QUESTION = 'what about this'

/** One explained error entry whose message names the vocabulary tag `AA_1`. */
export const EXPLAINED_ENTRY: ExplainedCode = {
	kind: 'error',
	catalogue: 'core-test',
	code: 'EX0001',
	key: 'EXAMPLE_FAILURE',
	message: 'The AA_1 failed to load.',
}
