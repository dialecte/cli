/**
 * `dialecte inbox [--repository <name>] [--simulated] [--json]` (33S section 7, G13): the lots of every store of the
 * list and of the current folder's store that wait on someone, grouped (person questions, caller questions, ready,
 * failed) and by index within a group, one line each with the exact next command; then the count of the working and
 * the simulated lots; `--json` holds the status of each waiting lot; exit 0 when something waits or is damaged, 1
 * when nothing does, 2 for a usage error. It reads files only.
 */
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../test/brief-workspace.ts'
import {
	CALLER_QUESTION,
	CORE_LOTS,
	CORE_REPOSITORY,
	FAILURE_REASON,
	PERSON_QUESTION,
	SCL_LOTS,
	SCL_REPOSITORY,
} from '../../test/inbox-workspace.constants.ts'
import {
	countLineOf,
	createInboxWorkspaces,
	inboxIn,
	inboxLine,
	listedIndexesOf,
	lotBranchOf,
	questionTransitionFor,
	storePathOf,
	writeInboxLot,
} from '../../test/inbox-workspace.ts'
import { snapshotOf, withJson, withLines } from '../../test/lot-start-workspace.ts'
import { writeStoreListFile } from '../../test/lot-stores.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { lotStatusOf } from './lot-status.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'
import type { InboxWorkspaces } from '../../test/inbox-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The line of a lot waiting on `what`, its columns: index, repository, branch, what waits, the next command. */
function waitingLine(params: { name: string; repository: string; what: string[]; next: string }) {
	return inboxLine([
		params.name.slice(0, 4),
		params.repository,
		lotBranchOf(params.name),
		...params.what,
		params.next,
	])
}

/** The exact next command of a lot that asks `question` of `audience`: a person's answer names who gives it. */
function answerLine(params: {
	name: string
	audience: 'person' | 'caller'
	question?: string
}): string {
	const line = `dialecte lot answer ${params.name} ${params.question ?? 'q1'} "<answer>"`
	return params.audience === 'person' ? `${line} --by <who>` : line
}

/** The lines the default inbox of `createInboxWorkspaces` prints before its count line, in order. */
const DEFAULT_WAITING_LINES = [
	waitingLine({
		name: CORE_LOTS.person,
		repository: CORE_REPOSITORY,
		what: ['question q1 (person)', PERSON_QUESTION.text],
		next: answerLine({ name: CORE_LOTS.person, audience: 'person' }),
	}),
	waitingLine({
		name: SCL_LOTS.person,
		repository: SCL_REPOSITORY,
		what: ['question q1 (person)', PERSON_QUESTION.text],
		next: answerLine({ name: SCL_LOTS.person, audience: 'person' }),
	}),
	waitingLine({
		name: CORE_LOTS.caller,
		repository: CORE_REPOSITORY,
		what: ['question q1 (caller)', CALLER_QUESTION.text],
		next: answerLine({ name: CORE_LOTS.caller, audience: 'caller' }),
	}),
	waitingLine({
		name: SCL_LOTS.caller,
		repository: SCL_REPOSITORY,
		what: ['question q1 (caller)', CALLER_QUESTION.text],
		next: answerLine({ name: SCL_LOTS.caller, audience: 'caller' }),
	}),
	waitingLine({
		name: SCL_LOTS.ready,
		repository: SCL_REPOSITORY,
		what: ['READY'],
		next: `dialecte handover show ${SCL_LOTS.ready}`,
	}),
	waitingLine({
		name: CORE_LOTS.readyWithoutEntry,
		repository: CORE_REPOSITORY,
		what: ['READY'],
		next: `dialecte lot result ${CORE_LOTS.readyWithoutEntry}`,
	}),
	waitingLine({
		name: SCL_LOTS.failed,
		repository: SCL_REPOSITORY,
		what: ['FAILED', FAILURE_REASON],
		next: `dialecte lot stop ${SCL_LOTS.failed} --reason <text>`,
	}),
]

const SIMULATED_QUESTION_LINE = waitingLine({
	name: CORE_LOTS.simulatedQuestion,
	repository: CORE_REPOSITORY,
	what: ['question q1 (caller)', CALLER_QUESTION.text],
	next: answerLine({ name: CORE_LOTS.simulatedQuestion, audience: 'caller' }),
})

/** The forms of the command that list something. */
const ALL_FORMS: string[][] = [[], ['--simulated'], ['--json'], ['--repository', SCL_REPOSITORY]]

/** The whole state the inbox must leave as it was: both git folders (the stores) and the state folder (the list). */
function bytesOf(workspaces: InboxWorkspaces): Record<string, unknown> {
	return {
		scl: snapshotOf(join(workspaces.scl.repository, '.git')),
		core: snapshotOf(join(workspaces.core.repository, '.git')),
		state: snapshotOf(process.env.XDG_STATE_HOME ?? ''),
	}
}

describe('inbox: what is listed and in what order', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lots of every state in two stores of the list -> person, caller, ready, failed by index within a group, then the count line, exit 0', () => {
		const { scl } = createInboxWorkspaces()

		expect(withLines(inboxIn({ cwd: scl.repository }))).toEqual({
			exitCode: 0,
			lines: [
				...DEFAULT_WAITING_LINES.map((line) => expect.stringMatching(line)),
				countLineOf({ working: 2, simulated: 2 }),
			],
		})
	})

	it('the same lots, the order of the indexes -> 0169 0171, 0172 0179, 0166 0168, 0175: by group, then by index, each lot once', () => {
		const { scl } = createInboxWorkspaces()

		expect(listedIndexesOf(inboxIn({ cwd: scl.repository }).output)).toEqual(
			[
				CORE_LOTS.person,
				SCL_LOTS.person,
				CORE_LOTS.caller,
				SCL_LOTS.caller,
				SCL_LOTS.ready,
				CORE_LOTS.readyWithoutEntry,
				SCL_LOTS.failed,
			].map((name) => name.slice(0, 4)),
		)
	})

	it('--simulated -> a simulated lot that waits is listed in its group by index (0178 between 0172 and 0179), one that works is still only counted', () => {
		const { scl } = createInboxWorkspaces()

		expect(withLines(inboxIn({ cwd: scl.repository, words: ['--simulated'] }))).toEqual({
			exitCode: 0,
			lines: [
				...DEFAULT_WAITING_LINES.slice(0, 3).map((line) => expect.stringMatching(line)),
				expect.stringMatching(SIMULATED_QUESTION_LINE),
				...DEFAULT_WAITING_LINES.slice(3).map((line) => expect.stringMatching(line)),
				expect.stringMatching(/^working 2 · simulated 2/),
			],
		})
	})

	it('--repository scl -> the lots of the repository folder named scl, and the counts of those lots only', () => {
		const { scl } = createInboxWorkspaces()

		expect(
			withLines(inboxIn({ cwd: scl.repository, words: ['--repository', SCL_REPOSITORY] })),
		).toEqual({
			exitCode: 0,
			lines: [
				expect.stringMatching(DEFAULT_WAITING_LINES[1]),
				expect.stringMatching(DEFAULT_WAITING_LINES[3]),
				expect.stringMatching(DEFAULT_WAITING_LINES[4]),
				expect.stringMatching(DEFAULT_WAITING_LINES[6]),
				countLineOf({ working: 1, simulated: 1 }),
			],
		})
	})

	it('--repository core -> the lots of that repository only, from a folder that is in no repository', () => {
		createInboxWorkspaces()

		expect(
			withLines(
				inboxIn({
					cwd: temporaryFolder('dialecte-inbox-cwd-'),
					words: ['--repository', CORE_REPOSITORY],
				}),
			),
		).toEqual({
			exitCode: 0,
			lines: [
				expect.stringMatching(DEFAULT_WAITING_LINES[0]),
				expect.stringMatching(DEFAULT_WAITING_LINES[2]),
				expect.stringMatching(DEFAULT_WAITING_LINES[5]),
				countLineOf({ working: 1, simulated: 1 }),
			],
		})
	})

	it('--repository naming no repository -> only the count line at zero, exit 1', () => {
		const { scl } = createInboxWorkspaces()

		expect(inboxIn({ cwd: scl.repository, words: ['--repository', 'nowhere'] })).toEqual({
			exitCode: 1,
			output: countLineOf({ working: 0, simulated: 0 }),
		})
	})

	for (const [title, name] of [
		['the full path of the repository', (scl: BriefWorkspace) => scl.repository],
		['a substring of its name', () => 'sc'],
		['a folder above it, ws', () => 'ws'],
	] as const)
		it(`--repository with ${title} -> it matches the folder's basename only: nothing listed, exit 1`, () => {
			const { scl } = createInboxWorkspaces()

			expect(inboxIn({ cwd: scl.repository, words: ['--repository', name(scl)] })).toEqual({
				exitCode: 1,
				output: countLineOf({ working: 0, simulated: 0 }),
			})
		})

	it('a store of the list that no longer exists -> skipped, the others are listed', () => {
		const { scl, core } = createInboxWorkspaces()
		writeStoreListFile({
			stores: [
				join(temporaryFolder('dialecte-inbox-gone-'), 'gone', 'dialecte-lots'),
				storePathOf(scl),
			],
		})

		expect(listedIndexesOf(inboxIn({ cwd: core.repository }).output)).toEqual(
			[
				CORE_LOTS.person,
				SCL_LOTS.person,
				CORE_LOTS.caller,
				SCL_LOTS.caller,
				SCL_LOTS.ready,
				CORE_LOTS.readyWithoutEntry,
				SCL_LOTS.failed,
			].map((name) => name.slice(0, 4)),
		)
	})

	it('a store in the list and a current folder in no repository -> the listed store only', () => {
		const { scl } = createInboxWorkspaces()
		writeStoreListFile({ stores: [storePathOf(scl)] })

		expect(
			listedIndexesOf(inboxIn({ cwd: temporaryFolder('dialecte-inbox-cwd-') }).output),
		).toEqual(
			[SCL_LOTS.person, SCL_LOTS.caller, SCL_LOTS.ready, SCL_LOTS.failed].map((name) =>
				name.slice(0, 4),
			),
		)
	})

	it('a store of the current folder that the list does not hold -> its lots are listed with the listed store', () => {
		const { scl, core } = createInboxWorkspaces()
		writeStoreListFile({ stores: [storePathOf(scl)] })

		expect(listedIndexesOf(inboxIn({ cwd: core.repository }).output)).toEqual(
			[
				CORE_LOTS.person,
				SCL_LOTS.person,
				CORE_LOTS.caller,
				SCL_LOTS.caller,
				SCL_LOTS.ready,
				CORE_LOTS.readyWithoutEntry,
				SCL_LOTS.failed,
			].map((name) => name.slice(0, 4)),
		)
	})

	it('no store in the list, a current folder in no repository -> only the count line at zero, exit 1', () => {
		createInboxWorkspaces()
		writeStoreListFile({ stores: [] })

		expect(inboxIn({ cwd: temporaryFolder('dialecte-inbox-cwd-') })).toEqual({
			exitCode: 1,
			output: countLineOf({ working: 0, simulated: 0 }),
		})
	})

	it('the inbox writes nothing: the stores, the registries and the list are the same bytes after every form', () => {
		const workspaces = createInboxWorkspaces()
		const before = bytesOf(workspaces)

		expect(
			ALL_FORMS.map((words) => inboxIn({ cwd: workspaces.scl.repository, words }).exitCode),
		).toEqual([0, 0, 0, 0])
		expect(bytesOf(workspaces)).toEqual(before)
	})
})

describe('inbox --json', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('waiting holds the status of each waiting lot in the order of the text, working and simulated count, damaged is empty', () => {
		const { scl, folders } = createInboxWorkspaces()
		const names = [
			CORE_LOTS.person,
			SCL_LOTS.person,
			CORE_LOTS.caller,
			SCL_LOTS.caller,
			SCL_LOTS.ready,
			CORE_LOTS.readyWithoutEntry,
			SCL_LOTS.failed,
		]

		expect(withJson(inboxIn({ cwd: scl.repository, words: ['--json'] }))).toEqual({
			exitCode: 0,
			json: {
				waiting: names.map((name) => lotStatusOf({ lotFolder: folders[name] })),
				working: 2,
				simulated: 2,
				damaged: [],
			},
		})
	})

	it('--simulated adds the simulated lot that waits, in the status JSON, among the callers', () => {
		const { scl, folders } = createInboxWorkspaces()

		expect(
			withJson(inboxIn({ cwd: scl.repository, words: ['--json', '--simulated'] })),
		).toMatchObject({
			exitCode: 0,
			json: {
				waiting: [
					CORE_LOTS.person,
					SCL_LOTS.person,
					CORE_LOTS.caller,
					CORE_LOTS.simulatedQuestion,
					SCL_LOTS.caller,
					SCL_LOTS.ready,
					CORE_LOTS.readyWithoutEntry,
					SCL_LOTS.failed,
				].map((name) => lotStatusOf({ lotFolder: folders[name] })),
				working: 2,
				simulated: 2,
			},
		})
	})

	it('only working lots -> waiting empty, working counted, exit 1', () => {
		const workspace = createBriefWorkspace({ repositoryFolder: SCL_REPOSITORY })
		writeInboxLot({ workspace, name: SCL_LOTS.working, kind: 'working' })

		expect(withJson(inboxIn({ cwd: workspace.repository, words: ['--json'] }))).toEqual({
			exitCode: 1,
			json: { waiting: [], working: 1, simulated: 0, damaged: [] },
		})
	})
})

describe('inbox: a lot with two open questions', { timeout: STORE_CASE_TIMEOUT }, () => {
	const BOTH = '0170-scl-both'
	const OTHER = '0173-scl-asks'

	/** A workspace holding the lot that asks a person (q1) and a caller (q2) together, and a lot that asks a caller. */
	function workspaceWithBothQuestions(): BriefWorkspace {
		const workspace = createBriefWorkspace({ repositoryFolder: SCL_REPOSITORY })
		const base = { workspace, scope: ['src/'], repository: workspace.repository }
		writeStoreLot({
			...base,
			name: BOTH,
			branch: lotBranchOf(BOTH),
			later: [
				questionTransitionFor({ seq: 2, question: PERSON_QUESTION }),
				questionTransitionFor({ seq: 3, question: { ...CALLER_QUESTION, id: 'q2' } }),
			],
		})
		writeStoreLot({
			...base,
			name: OTHER,
			branch: lotBranchOf(OTHER),
			later: [questionTransitionFor({ seq: 2, question: CALLER_QUESTION })],
		})
		writeStoreListFile({ stores: [storePathOf(workspace)] })
		return workspace
	}

	it('a person question and a caller question open -> one line per question, the person line in the person group, the caller line in the caller group by index', () => {
		const workspace = workspaceWithBothQuestions()

		expect(withLines(inboxIn({ cwd: workspace.repository }))).toEqual({
			exitCode: 0,
			lines: [
				expect.stringMatching(
					waitingLine({
						name: BOTH,
						repository: SCL_REPOSITORY,
						what: ['question q1 (person)', PERSON_QUESTION.text],
						next: answerLine({ name: BOTH, audience: 'person' }),
					}),
				),
				expect.stringMatching(
					waitingLine({
						name: BOTH,
						repository: SCL_REPOSITORY,
						what: ['question q2 (caller)', CALLER_QUESTION.text],
						next: answerLine({ name: BOTH, audience: 'caller', question: 'q2' }),
					}),
				),
				expect.stringMatching(
					waitingLine({
						name: OTHER,
						repository: SCL_REPOSITORY,
						what: ['question q1 (caller)', CALLER_QUESTION.text],
						next: answerLine({ name: OTHER, audience: 'caller' }),
					}),
				),
				countLineOf({ working: 0, simulated: 0 }),
			],
		})
	})

	it('the same lots with --json -> waiting holds each lot once', () => {
		const workspace = workspaceWithBothQuestions()

		expect(withJson(inboxIn({ cwd: workspace.repository, words: ['--json'] })).json).toMatchObject({
			waiting: [
				{ lot: BOTH, questions: [{ id: 'q1' }, { id: 'q2' }] },
				{ lot: OTHER, questions: [{ id: 'q1' }] },
			],
		})
	})
})

describe('inbox: the exit code', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('only working lots, text -> the count line alone, exit 1', () => {
		const workspace = createBriefWorkspace({ repositoryFolder: SCL_REPOSITORY })
		writeInboxLot({ workspace, name: SCL_LOTS.working, kind: 'working' })

		expect(inboxIn({ cwd: workspace.repository })).toEqual({
			exitCode: 1,
			output: countLineOf({ working: 1, simulated: 0 }),
		})
	})

	it('only a simulated lot that waits -> exit 1 without --simulated (counted), exit 0 with it (listed)', () => {
		const workspace = createBriefWorkspace({ repositoryFolder: CORE_REPOSITORY })
		writeInboxLot({
			workspace,
			name: CORE_LOTS.simulatedQuestion,
			kind: 'simulatedQuestion',
		})

		expect([
			inboxIn({ cwd: workspace.repository }),
			inboxIn({ cwd: workspace.repository, words: ['--simulated'] }).exitCode,
		]).toEqual([{ exitCode: 1, output: countLineOf({ working: 0, simulated: 1 }) }, 0])
	})

	for (const [title, words] of [
		['an unknown option', ['--bogus']],
		['a stray word', ['scl']],
		['--repository with no value', ['--repository']],
	] as const)
		it(`${title} -> exit 2`, () => {
			const { scl } = createInboxWorkspaces()

			expect(inboxIn({ cwd: scl.repository, words: [...words] })).toEqual({
				exitCode: 2,
				output: expect.stringMatching(/\S/),
			})
		})
})
