/** Records of a lot store, as the tests write them (plain files: no code of the store under test). */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { RECORD_TIME } from './store-records.constants.ts'

import type { StoreEntry } from '../src/lib/handover/handover.types.ts'
import type {
	AnswerRecord,
	EngineState,
	LotIdentity,
	QuestionRecord,
	Transition,
	TransitionCauseKind,
} from '../src/lib/store/store.types.ts'

/** A transition numbered `seq`, `working` unless said, at `at`. */
export function transitionOf(params: {
	seq: number
	state?: EngineState
	kind?: TransitionCauseKind
	at?: string
	question?: QuestionRecord
}): Transition {
	return {
		seq: params.seq,
		at: params.at ?? RECORD_TIME,
		lot: '0001-repo-branch',
		state: params.state ?? 'working',
		position: { step: 1, of: 3, station: null, round: null },
		cause: { kind: params.kind ?? 'station', by: 'engine', reason: 'a reason' },
		question: params.question ?? null,
		simulated: false,
	}
}

/** A question record `q<number>`. */
export function questionOf(number: number): QuestionRecord {
	return {
		id: `q${number}`,
		audience: 'caller',
		station: 'test-reviewer',
		text: 'One question, one line.',
	}
}

/** The transition that asks question `number`. */
export function questionTransitionOf(params: { seq: number; number: number }): Transition {
	return transitionOf({
		seq: params.seq,
		kind: 'question',
		question: questionOf(params.number),
	})
}

/** The answer `fix`, given by the caller, to question `q<number>`. */
export function answerOf(number: number): AnswerRecord {
	return { question: `q${number}`, answer: 'fix', by: 'caller', at: RECORD_TIME }
}

/** The identity of the lot `name` (the fixed lot of the tests unless said); its index is the name's first four characters. */
export function identityOf(params: { name?: string } = {}): LotIdentity {
	const name = params.name ?? '0001-repo-branch'
	return {
		schema: 1,
		name,
		index: name.slice(0, 4),
		repository: '/work/repo',
		store: '/work/repo/.git/dialecte-lots',
		worktree: '/work/.worktrees/0001-repo-branch',
		branch: 'feat/branch',
		base: { ref: 'main', commit: 'a'.repeat(40) },
		feature: 'branch',
		effort: { level: 'medium', source: 'default' },
		simulated: false,
		scenario: null,
		cli: '1.0.0',
		briefHash: 'b'.repeat(64),
		planHash: 'c'.repeat(64),
		created: RECORD_TIME,
	}
}

/** A registry entry as `handover write` records it. */
export function entryOf(params: {
	state: StoreEntry['state']
	written?: string
	folder?: string
}): StoreEntry {
	return {
		name: '2026-11-08-feat-branch',
		folder: params.folder ?? '/work/repo/.git/dialecte-lots/0001-repo-branch',
		branch: 'feat/branch',
		worktree: '/work/.worktrees/0001-repo-branch',
		written: params.written ?? RECORD_TIME,
		state: params.state,
	}
}

/** Writes `text` at `<folder>/<name>`, making the folders above it. */
export function writeRecordFile(params: { folder: string; name: string; text: string }): string {
	const path = join(params.folder, params.name)
	mkdirSync(join(path, '..'), { recursive: true })
	writeFileSync(path, params.text)
	return path
}
