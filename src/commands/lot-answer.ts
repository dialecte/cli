/**
 * `dialecte lot answer <id> <question> "<answer>" [--by <who>] [--json]` (33S section 4, Answers): records the answer
 * once, then prints the lot's status after it with `recorded` and the wait line as `next`. A refusal exits 2; an
 * `onAnswered` hook that throws exits 1, the answer kept.
 */
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { jsonOf, textOf } from '../lib/print/print.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { recordAnswer } from '../lib/store/answers.ts'
import { lotFailureExit, lotRefusalExit, lotUsageExit } from '../lib/store/lot-exits.ts'
import { waitNextOf } from '../lib/store/lot-next.ts'
import { noLotRefusal, requiredLotOf } from '../lib/store/resolve-lot.ts'
import { STORE_REFUSAL } from '../lib/store/store.constants.ts'
import {
	ANSWER_FLAGS,
	ANSWER_LINE,
	ANSWER_VALUE_OPTIONS,
	ANSWER_WORDS,
} from './lot-answer.constants.ts'
import { lotStatusLines, lotStatusOf } from './lot-status.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { RecordedAnswer } from '../lib/store/answers.types.ts'
import type { LotAnswerJson, LotAnswerParams } from './lot-answer.types.ts'

/**
 * Answers a question of the lot `<id>` names (an index unique across every store), as text or `--json`: exit 0
 * with the status after the answer, 2 for a usage error or a refusal, 1 when a hook threw after the answer was
 * recorded (JSON `{ error, next: null }` for both under `--json`). The text form prints its lines through the
 * print boundary (a refusal's one-line message escaped whole); JSON carries the text as stored.
 */
export function lotAnswer(params: LotAnswerParams): CommandResult {
	const read = readArguments({
		argv: params.argv,
		valueOptions: ANSWER_VALUE_OPTIONS,
		flags: ANSWER_FLAGS,
	})
	if (typeof read === 'string')
		return lotUsageExit({ reason: read, json: params.argv.includes(JSON_FLAG) })
	const json = read.flags.has('json')
	if (read.words.length !== ANSWER_WORDS)
		return lotUsageExit({
			reason: `lot answer takes <id> <question> "<answer>", not ${read.words.length} words`,
			json,
		})
	const [id, question, answer] = read.words
	const required = requiredLotOf({ argument: id, cwd: params.cwd, mode: 'write' })
	if ('exitCode' in required) return lotRefusalExit({ lines: required.lines, json })
	const lotFolder = required.lot
	let recorded: RecordedAnswer
	try {
		recorded = recordAnswer({
			lotFolder,
			question,
			answer,
			by: read.values.get('by'),
			now: params.now ?? new Date(),
		})
	} catch (error) {
		// one line of the store's own words around the agent's options, answers and by: the boundary escapes it
		// whole, a line feed in them prints as \u{a}; JSON keeps them as stored
		const lines = [(error as Error).message]
		return (error as Error).name === STORE_REFUSAL
			? lotRefusalExit({ lines, json })
			: lotFailureExit({ lines, json })
	}
	const status = lotStatusOf({ lotFolder })
	if (!status) return lotRefusalExit({ lines: [noLotRefusal(id)], json })
	const output: LotAnswerJson = {
		...status,
		recorded: recorded.recorded,
		next: waitNextOf({ name: status.lot, simulated: status.simulated }),
		also: [],
	}
	if (json) return { exitCode: 0, output: jsonOf(output, 2) }
	const line = ANSWER_LINE.replace('{question}', recorded.answer.question).replace(
		'{recorded}',
		recorded.recorded,
	)
	return { exitCode: 0, output: textOf([line, ...lotStatusLines(output)]) }
}
