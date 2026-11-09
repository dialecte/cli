/**
 * The answer files of a lot read from disk (`answers/q<k>.json`): file reads only, so the state readers reach them
 * without the writer `recordAnswer`, which reads the lot's state itself.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	QUESTION_ID_PATTERN,
	QUESTION_ID_PREFIX,
	RECORD_EXTENSION,
	STORE_FILES,
} from './store.constants.ts'

import type { AnswerFile, AnswerRecord } from './store.types.ts'

/** The answers of a lot, by question number: the files named after a question id (`q<k>.json`, k 1 or more). */
export function readAnswers(params: { lotFolder: string }): AnswerRecord[] {
	return readAnswerFiles(params)
		.filter((file) => QUESTION_ID_PATTERN.test(file.question))
		.map((file) => file.record)
}

/**
 * The record files of `answers/`, by question number, each with the question its file name holds (`q12.json` →
 * q12). Every `.json` file is listed: whether its name is a question id is the lot reader's check
 * (`answerDamageOf`), so a file named after no question makes the lot damaged instead of being skipped.
 */
export function readAnswerFiles(params: { lotFolder: string }): AnswerFile[] {
	const folder = join(params.lotFolder, STORE_FILES.answers)
	if (!existsSync(folder)) return []
	return readdirSync(folder)
		.filter((name) => name.endsWith(RECORD_EXTENSION))
		.map((name) => name.slice(0, -RECORD_EXTENSION.length))
		.sort((first, second) => questionNumberOf(first) - questionNumberOf(second))
		.flatMap(function answerOf(question): AnswerFile[] {
			try {
				const record = JSON.parse(
					readFileSync(join(folder, `${question}${RECORD_EXTENSION}`), 'utf8'),
				) as AnswerRecord
				return [{ question, record }]
			} catch {
				return []
			}
		})
}

/** The path of the answer to the question `question` (`q<k>`) in a lot folder. */
export function answerPathOf(params: { lotFolder: string; question: string }): string {
	return join(params.lotFolder, STORE_FILES.answers, `${params.question}${RECORD_EXTENSION}`)
}

/** The number of a question id (`q12` → 12); 0 for a name that is no question id (the lot reads damaged). */
function questionNumberOf(question: string): number {
	return Number(question.slice(QUESTION_ID_PREFIX.length)) || 0
}
