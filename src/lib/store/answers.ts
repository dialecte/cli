/** The answers of a lot: `answers/q<k>.json`, one per answered question, each published once. */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ANSWER_FILE_PATTERN, ANSWER_NUMBER_PATTERN, STORE_FILES } from './store.constants.ts'

import type { AnswerRecord } from './store.types.ts'

/** The answers of a lot, by question number; only strict names count (`^q\d+\.json$`). */
export function readAnswers(params: { lotFolder: string }): AnswerRecord[] {
	const folder = join(params.lotFolder, STORE_FILES.answers)
	if (!existsSync(folder)) return []
	return readdirSync(folder)
		.filter((name) => ANSWER_FILE_PATTERN.test(name))
		.sort((first, second) => questionNumberOf(first) - questionNumberOf(second))
		.flatMap(function answerOf(name): AnswerRecord[] {
			try {
				return [JSON.parse(readFileSync(join(folder, name), 'utf8')) as AnswerRecord]
			} catch {
				return []
			}
		})
}

/** The question number of an answer's file name (`q12.json` → 12). */
function questionNumberOf(name: string): number {
	return Number(ANSWER_NUMBER_PATTERN.exec(name)?.[1])
}
