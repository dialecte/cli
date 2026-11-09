/** Lots holding an open question, and what the question and answer tests read back from their folders. */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from './brief-workspace.ts'
import { PERMISSION_BITS, QUESTION_LOT, QUESTION_NOW } from './lot-questions.constants.ts'
import { RECORD_TIME } from './store-records.constants.ts'
import { questionOf, transitionOf, writeRecordFile } from './store-records.ts'

import type { RecordAnswerParams } from '../src/lib/store/answers.types.ts'
import type { AnswerRecord, QuestionRecord, Transition } from '../src/lib/store/store.types.ts'
import type { QuestionLot, QuestionLotParams } from './lot-questions.types.ts'

/** The answer `keep` by the caller to q1 at `QUESTION_NOW`; a caller overrides what it tests. */
export function answerParamsOf(
	overrides: Partial<RecordAnswerParams> & { lotFolder: string },
): RecordAnswerParams {
	return { question: 'q1', answer: 'keep', by: 'caller', now: QUESTION_NOW, ...overrides }
}

/** The record an earlier answer left (`keep` by the caller at `RECORD_TIME`), written by hand. */
export function recordedOf(overrides: Partial<AnswerRecord> = {}): AnswerRecord {
	return { question: 'q1', answer: 'keep', by: 'caller', at: RECORD_TIME, ...overrides }
}

/** A lot of a fresh workspace (`XDG_STATE_HOME` into the test's folder): its first transition, then q1's question when given, then `later`. */
export function createQuestionLot(params: QuestionLotParams = {}): QuestionLot {
	const workspace = createBriefWorkspace()
	const asked = params.question
		? [transitionOf({ seq: 2, kind: 'question', question: params.question })]
		: []
	const written = writeStoreLot({
		workspace,
		name: QUESTION_LOT,
		scope: ['src/'],
		simulated: params.simulated,
		later: [...asked, ...(params.later ?? [])],
		registry: params.registry,
	})
	return { workspace, lotFolder: realpathSync(written) }
}

/** The question q1 (a caller's, no options) with `overrides` applied. */
export function questionWith(overrides: Partial<QuestionRecord> = {}): QuestionRecord {
	return { ...questionOf(1), ...overrides }
}

/** A pattern that matches a text holding every one of `words`, in any order (none: any text). */
export function holdingAll(words: readonly string[]): RegExp {
	return new RegExp(
		words.map((word) => `(?=[\\s\\S]*${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`).join(''),
	)
}

/** A text of `length` characters with no line break. */
export function textOfLength(length: number): string {
	return 'a'.repeat(length)
}

/** Writes `answers/q<number>.json` by hand, as a record the store published. */
export function writeAnswerFile(params: { lotFolder: string; record: AnswerRecord }): void {
	writeRecordFile({
		folder: params.lotFolder,
		name: `answers/${params.record.question}.json`,
		text: `${JSON.stringify(params.record, null, 2)}\n`,
	})
}

/** The record of `answers/q<number>.json`; undefined when the file is not there. */
export function readAnswerFile(params: { lotFolder: string; number: number }): unknown {
	const path = join(params.lotFolder, 'answers', `q${params.number}.json`)
	return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined
}

/** The permission bits of `answers/q<number>.json`; undefined when the file is not there. */
export function answerFileMode(params: { lotFolder: string; number: number }): number | undefined {
	const path = join(params.lotFolder, 'answers', `q${params.number}.json`)
	return existsSync(path) ? statSync(path).mode & PERMISSION_BITS : undefined
}

/** The transitions of the lot folder as the files hold them, by number. */
export function transitionFilesOf(lotFolder: string): Transition[] {
	const folder = join(lotFolder, 'transitions')
	return readdirSync(folder)
		.filter((name) => /^\d{6}\.json$/.test(name))
		.sort()
		.map((name) => JSON.parse(readFileSync(join(folder, name), 'utf8')) as Transition)
}
