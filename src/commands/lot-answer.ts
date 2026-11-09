/**
 * `dialecte lot answer <id> <question> "<answer>" [--by <who>] [--json]` (33S section 4, Answers): records the answer
 * once, then prints the lot's status after it with `recorded` and the wait line as `next`. A refusal exits 2; an
 * `onAnswered` hook that throws exits 1, the answer kept.
 */
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { recordAnswer } from '../lib/store/answers.ts'
import { lotFailureExit, lotRefusalExit, lotUsageExit } from '../lib/store/lot-exits.ts'
import { waitNextOf } from '../lib/store/lot-next.ts'
import { noLotRefusal, requireLot } from '../lib/store/resolve-lot.ts'
import { STORE_REFUSAL } from '../lib/store/store.constants.ts'
import { printableOf } from '../lib/store/text-escape.ts'
import {
	ANSWER_FLAGS,
	ANSWER_LINE,
	ANSWER_VALUE_OPTIONS,
	ANSWER_WORDS,
} from './lot-answer.constants.ts'
import { lotStatusOf, lotStatusText } from './lot-status.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { RecordedAnswer } from '../lib/store/answers.types.ts'
import type { LotAnswerJson, LotAnswerParams } from './lot-answer.types.ts'

/**
 * Answers a question of the lot `<id>` names (an index unique across every store), as text or `--json`: exit 0
 * with the status after the answer, 2 for a usage error or a refusal, 1 when a hook threw after the answer was
 * recorded (JSON `{ error, next: null }` for both under `--json`). The agent text the text form prints is escaped
 * (the status's fields by `lotStatusText`, the options, answers and by a refusal quotes by escaping that one-line
 * message whole); JSON carries the text as stored.
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
	const required = requireLot({ argument: id, cwd: params.cwd, mode: 'write' })
	if ('exitCode' in required) return lotRefusalExit({ message: required.output, json })
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
		const stored = (error as Error).message
		// one line of the store's own words around the agent's options, answers and by: escaped whole, a line feed
		// in them prints as \u{a}; JSON keeps them as stored
		const message = json ? stored : printableOf(stored)
		return (error as Error).name === STORE_REFUSAL
			? lotRefusalExit({ message, json })
			: lotFailureExit({ message, json })
	}
	const status = lotStatusOf({ lotFolder })
	if (!status) return lotRefusalExit({ message: noLotRefusal(id), json })
	const output: LotAnswerJson = {
		...status,
		recorded: recorded.recorded,
		next: waitNextOf({ name: status.lot, simulated: status.simulated }),
		also: [],
	}
	if (json) return { exitCode: 0, output: JSON.stringify(output, null, 2) }
	const shown = printableOf(recorded)
	const line = ANSWER_LINE.replace('{question}', shown.answer.question).replace(
		'{recorded}',
		shown.recorded,
	)
	return { exitCode: 0, output: `${line}\n${lotStatusText(output)}` }
}
