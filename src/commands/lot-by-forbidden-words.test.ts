/**
 * Every lot verb's `--by` refuses a word of the machine's forbidden list (33L1 section 15 Q-B, FIX-by-words), as
 * `lot verify` and `lot snapshot --beyond-cap` do: `lot answer`, `lot stop` and `lot choice` exit 2 with
 * `lot <verb>: --by holds a forbidden word: nothing written` and write nothing; a clean `--by` behaves as before.
 * The list is the git config of the lot's repository (answer, stop) or of the working folder (choice), and the
 * user file.
 */
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { DAMAGED_NAME } from '../../test/damaged-lot-workspace.constants.ts'
import { damagedLotIn } from '../../test/damaged-lot-workspace.ts'
import { FIRST_WORD } from '../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../test/forbidden-words-workspace.ts'
import { KEEP_OR_REPLACE, QUESTION_LOT, QUESTION_NOW } from '../../test/lot-questions.constants.ts'
import { createQuestionLot } from '../../test/lot-questions.ts'
import { createStartWorkspace, snapshotOf, withJson } from '../../test/lot-start-workspace.ts'
import { STOP_NOW, STOP_REASON } from '../../test/lot-stop-workspace.constants.ts'
import { git, temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A clean `--by`, never a word of the list. */
const CLEAN_BY = 'person-a'

/** Where the list holds the word: the repository's git config, or the user file. */
type WordSource = 'git config' | 'user file'

/** What a case runs: the call, and a reading of everything the call may write. */
type Arranged = {
	call: { cwd: string; argv: string[]; now: Date }
	written: () => string
}

type VerbRow = {
	verb: 'answer' | 'stop' | 'choice'
	title: string
	/** Sets up a lot (or folder) whose repository is `repository`, and the call with `by` (and `--json`). */
	arrange: (params: { by: string; json: boolean }) => Arranged & { repository: string }
	/** The exit and output of the same call with a clean `--by`. */
	clean: { exitCode: number; output: RegExp }
	json: boolean
}

/** `lot answer <q1> keep --by <by>` of a lot asking a caller question; `from` is the lot's repository, or a folder outside every repository naming the lot by its folder's path. */
function answerCase(params: { by: string; json: boolean; from: 'repository' | 'elsewhere' }) {
	const lot = createQuestionLot({ question: KEEP_OR_REPLACE })
	const repository = lot.workspace.repository
	const elsewhere = params.from === 'elsewhere'
	return {
		repository,
		call: {
			cwd: elsewhere ? realpathSync(temporaryFolder('dialecte-elsewhere-')) : repository,
			argv: [
				'answer',
				elsewhere ? lot.lotFolder : QUESTION_LOT,
				'q1',
				'keep',
				'--by',
				params.by,
				...(params.json ? ['--json'] : []),
			],
			now: QUESTION_NOW,
		},
		written: () => JSON.stringify([snapshotOf(lot.lotFolder), snapshotOf(lot.workspace.registry)]),
	}
}

/** `lot stop <lot> --reason <text> --by <by>`; `from` is the lot's repository, or a folder outside every repository naming the lot by its folder's path. */
function stopCase(params: { by: string; json: boolean; from: 'repository' | 'elsewhere' }) {
	const lot = createQuestionLot()
	const repository = lot.workspace.repository
	const elsewhere = params.from === 'elsewhere'
	return {
		repository,
		call: {
			cwd: elsewhere ? realpathSync(temporaryFolder('dialecte-elsewhere-')) : repository,
			argv: [
				'stop',
				elsewhere ? lot.lotFolder : QUESTION_LOT,
				'--reason',
				STOP_REASON,
				'--by',
				params.by,
				...(params.json ? ['--json'] : []),
			],
			now: STOP_NOW,
		},
		written: () => JSON.stringify([snapshotOf(lot.lotFolder), snapshotOf(lot.workspace.registry)]),
	}
}

/** `lot stop` of a damaged lot (its identity missing): a clean stop moves its folder aside. */
function damagedStopCase(params: { by: string; json: boolean }) {
	const start = createStartWorkspace()
	const lot = damagedLotIn({ start, kind: 'identityMissing' })
	const aside = join(start.workspace.store, '..', 'dialecte-lots-aside')
	return {
		repository: start.repository,
		call: {
			cwd: start.repository,
			argv: [
				'stop',
				lot.name,
				'--reason',
				STOP_REASON,
				'--by',
				params.by,
				...(params.json ? ['--json'] : []),
			],
			now: STOP_NOW,
		},
		written: () =>
			JSON.stringify([
				snapshotOf(lot.lotFolder),
				snapshotOf(start.workspace.registry),
				existsSync(aside),
			]),
	}
}

/** `lot choice <folder> --by <by> <decision>` from inside a repository, the hand-over folder outside it. */
function choiceCase(params: { by: string; json: boolean }) {
	const repository = realpathSync(temporaryFolder('dialecte-choice-repository-'))
	git({ root: repository, args: ['init', '--quiet'] })
	const folder = join(realpathSync(temporaryFolder('dialecte-choice-')), 'lot')
	mkdirSync(folder, { recursive: true })
	return {
		repository,
		call: {
			cwd: repository,
			argv: ['choice', folder, '--by', params.by, 'Keep the old flag'],
			now: QUESTION_NOW,
		},
		written: () => JSON.stringify(snapshotOf(folder)),
	}
}

const VERB_ROWS: VerbRow[] = [
	{
		verb: 'answer',
		title: 'lot answer',
		arrange: (params) => answerCase({ ...params, from: 'repository' }),
		clean: { exitCode: 0, output: /q1/ },
		json: false,
	},
	{
		verb: 'answer',
		title:
			"lot answer of the lot's folder from outside every repository (the lot's repository's list)",
		arrange: (params) => answerCase({ ...params, from: 'elsewhere' }),
		clean: { exitCode: 0, output: /q1/ },
		json: false,
	},
	{
		verb: 'answer',
		title: 'lot answer --json',
		arrange: (params) => answerCase({ ...params, from: 'repository' }),
		clean: { exitCode: 0, output: /"recorded"/ },
		json: true,
	},
	{
		verb: 'stop',
		title: 'lot stop',
		arrange: (params) => stopCase({ ...params, from: 'repository' }),
		clean: { exitCode: 0, output: /stopped/ },
		json: false,
	},
	{
		verb: 'stop',
		title: 'lot stop --json',
		arrange: (params) => stopCase({ ...params, from: 'repository' }),
		clean: { exitCode: 0, output: /"canceled"/ },
		json: true,
	},
	{
		verb: 'stop',
		title:
			"lot stop of the lot's folder from outside every repository (the lot's repository's list)",
		arrange: (params) => stopCase({ ...params, from: 'elsewhere' }),
		clean: { exitCode: 0, output: /stopped/ },
		json: false,
	},
	{
		verb: 'stop',
		title: 'lot stop of a damaged lot (its folder not moved aside)',
		arrange: damagedStopCase,
		clean: { exitCode: 0, output: new RegExp(`stopped ${DAMAGED_NAME}: damaged`) },
		json: false,
	},
	{
		verb: 'choice',
		title: 'lot choice',
		arrange: choiceCase,
		clean: { exitCode: 0, output: /^lot choice: by person-a - / },
		json: false,
	},
]

const SOURCES: WordSource[] = ['git config', 'user file']

/** Puts `FIRST_WORD` on the list: in the repository's git config, or in the user file. */
function listTheWord(params: { source: WordSource; repository: string }): void {
	configureMachine({ userFileLines: params.source === 'user file' ? [FIRST_WORD] : undefined })
	if (params.source === 'git config')
		git({ root: params.repository, args: ['config', 'dialecte.forbiddenWords', FIRST_WORD] })
}

/** The refusal, as text or as the JSON a lot verb answers it with. */
function refusalOf(params: { verb: string; json: boolean }): unknown {
	const line = `lot ${params.verb}: --by holds a forbidden word: nothing written`
	return params.json
		? { exitCode: 2, json: { error: line, next: null } }
		: { exitCode: 2, output: line }
}

describe(
	'lot verbs - a forbidden word in --by (FIX-by-words)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of VERB_ROWS)
			for (const source of SOURCES)
				it(`${row.title}, --by holding a word of the ${source} list -> exit 2, nothing written`, () => {
					const arranged = row.arrange({ by: FIRST_WORD.toUpperCase(), json: row.json })
					listTheWord({ source, repository: arranged.repository })
					const before = arranged.written()

					const result = runLot(arranged.call)

					expect(row.json ? withJson(result) : result).toEqual(
						refusalOf({ verb: row.verb, json: row.json }),
					)
					expect(arranged.written()).toBe(before)
				})

		for (const row of VERB_ROWS)
			it(`${row.title}, a clean --by with a list configured -> as before`, () => {
				const arranged = row.arrange({ by: CLEAN_BY, json: row.json })
				listTheWord({ source: 'git config', repository: arranged.repository })

				const result = runLot(arranged.call)

				expect(result).toMatchObject({
					exitCode: row.clean.exitCode,
					output: expect.stringMatching(row.clean.output),
				})
			})
	},
)
