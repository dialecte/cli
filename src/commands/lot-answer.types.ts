import type { RecordedAnswer } from '../lib/store/answers.types.ts'
import type { LotStatusJson } from './lot-status.types.ts'

/** What `lotAnswer` takes: where it runs, the words after the verb, the time. */
export type LotAnswerParams = {
	cwd: string
	/** The words after the verb: `<id> <question> <answer>` and the options. */
	argv: string[]
	now?: Date
}

/** What `lot answer --json` prints: the status after the answer, whether it was new, `next` the wait line. */
export type LotAnswerJson = LotStatusJson & { recorded: RecordedAnswer['recorded'] }
