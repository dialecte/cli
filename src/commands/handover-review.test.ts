/**
 * `handover review <name|index|folder>`: the lot's worktree opened in one new editor window, spawned detached; a
 * hand-over holding a merge lot first gets `review/lot.diff`, opened in the same window. The editor is a fake
 * executable on a scratch search path that records its arguments; a case that must not spawn passes a recording
 * spawner instead.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { outcomeOf } from '../../test/call-outcome.ts'
import { REVIEW_DIFF_SEGMENTS } from '../../test/editor-workspace.constants.ts'
import {
	createBlockingEditor,
	createFakeEditors,
	isRunning,
	pidOf,
	searchPathOf,
	waitForExit,
	waitForRecord,
} from '../../test/editor-workspace.ts'
import { ESCAPE, STORE_WRITER_CLI } from '../../test/handover-store-scenario.constants.ts'
import {
	createBranchRepository,
	createLinkedWorktree,
	removeFolder,
	runCli,
	statusOf,
	writeStoreHandover,
} from '../../test/handover-store-scenario.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import {
	ADDED_CONTENT,
	ADDED_FILE,
	COMMITTED_CONTENT,
	COMMITTED_FILE,
	CONFIGURED_EDITOR_FLAG,
	CONFIGURED_EDITOR_VALUE,
	CONFIGURED_EDITOR_WORD,
	EDITED_AFTER,
	EDITED_FILE,
	IGNORED_FILE,
	PLAIN_CHANGES,
} from '../../test/review-handover.constants.ts'
import {
	forceGitColour,
	readReviewHandover,
	writeMergeReviewHandover,
	writeNumberedReviewHandover,
	writePlainReviewHandover,
} from '../../test/review-handover.ts'
import { git, temporaryFolder } from '../../test/scratch-repository.ts'
import {
	EDITOR_CASE_TIMEOUT,
	EDITOR_CLI_KILL_BOUND_MS,
	EDITOR_EXIT_BOUND_MS,
	EDITOR_RECORD_BOUND_MS,
} from '../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../test/worktree-pool.ts'
import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { commandSurfaceOf } from '../lib/command-map/command-surface.ts'
import { DEFAULT_EDITOR, EDITOR_CONFIG_KEY } from '../lib/editor/editor.constants.ts'
import { runHandoverReview } from './handover-review.ts'
import { runHandover } from './handover.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CallOutcome } from '../../test/call-outcome.types.ts'
import type { ReviewHandover } from '../../test/review-handover.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { HandoverReviewParams } from './handover-review.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The review diff a hand-over folder holds (or would hold). */
function diffPathOf(handover: ReviewHandover): string {
	return join(handover.folder, ...REVIEW_DIFF_SEGMENTS)
}

/** A scratch search path holding the first candidate as a fake editor that records what it is started with. */
function fakeEditorSearchPath(): { searchPath: string; record: string; executable: string } {
	const editors = createFakeEditors({ words: [DEFAULT_EDITOR.word] })
	return {
		searchPath: searchPathOf([editors.folder]),
		record: editors.recordOf(DEFAULT_EDITOR.word),
		executable: join(editors.folder, DEFAULT_EDITOR.word),
	}
}

/** The review run so that a throw is the outcome an assertion compares, not a failure before any assertion. */
function reviewed(params: HandoverReviewParams): CallOutcome<CommandResult> {
	return outcomeOf(() => runHandoverReview(params))
}

/** What the recording spawner saw, one array per call: the executable then its arguments. */
function commandsOf(calls: ReturnType<typeof createRecordingSpawner>['calls']): string[][] {
	return calls.map((call) => [call.command, ...call.args])
}

/** The `--json` output of an outcome, parsed; the outcome itself when the call threw. */
function parsedOutput(outcome: CallOutcome<CommandResult>): unknown {
	return 'value' in outcome ? JSON.parse(outcome.value.output) : outcome
}

describe('handover review: the editor is started', { timeout: EDITOR_CASE_TIMEOUT }, () => {
	it('a hand-over of plain lots, a fake editor on the search path -> exit 0; the editor is started on the worktree with its new-window flag and no review diff is written', async () => {
		const handover = writePlainReviewHandover()
		const { searchPath, record } = fakeEditorSearchPath()

		const outcome = reviewed({ argv: [handover.name], cwd: handover.root, searchPath })

		expect(outcome).toMatchObject({ value: { exitCode: 0 } })
		await expect(waitForRecord({ record, boundMs: EDITOR_RECORD_BOUND_MS })).resolves.toEqual([
			...DEFAULT_EDITOR.flags,
			handover.worktree,
		])
		expect(existsSync(diffPathOf(handover))).toBe(false)
	})

	it('a hand-over holding a merge lot -> review/lot.diff is written and opened after the worktree, in the same start', async () => {
		const handover = writeMergeReviewHandover()
		const { searchPath, record } = fakeEditorSearchPath()

		const outcome = reviewed({ argv: [handover.name], cwd: handover.root, searchPath })

		expect(outcome).toMatchObject({ value: { exitCode: 0 } })
		await expect(waitForRecord({ record, boundMs: EDITOR_RECORD_BOUND_MS })).resolves.toEqual([
			...DEFAULT_EDITOR.flags,
			handover.worktree,
			diffPathOf(handover),
		])
		expect(existsSync(diffPathOf(handover))).toBe(true)
	})

	it('a hand-over holding a merge lot -> lot.diff is the lot change against head: the edit and the untracked file of the lot in, an ignored file out, no colour code even with git colouring always', async () => {
		const handover = writeMergeReviewHandover()
		forceGitColour({ root: handover.root })
		const { searchPath, record } = fakeEditorSearchPath()

		const outcome = reviewed({ argv: [handover.name], cwd: handover.root, searchPath })

		expect(outcome).toMatchObject({ value: { exitCode: 0 } })
		await waitForRecord({ record, boundMs: EDITOR_RECORD_BOUND_MS })
		const diff = readFileSync(diffPathOf(handover), 'utf8')
		expect({
			edit: diff.includes(`+${EDITED_AFTER.trimEnd()}`),
			file: diff.includes(EDITED_FILE),
			committed: diff.includes(COMMITTED_FILE) && diff.includes(`+${COMMITTED_CONTENT.trimEnd()}`),
			added: diff.includes(ADDED_FILE) && diff.includes(`+${ADDED_CONTENT.trimEnd()}`),
			ignored: diff.includes(IGNORED_FILE) || diff.includes('ignored.txt'),
			colour: diff.includes(ESCAPE),
		}).toEqual({
			edit: true,
			file: true,
			committed: true,
			added: true,
			ignored: false,
			colour: false,
		})
	})

	it('a hand-over holding a merge lot -> the repository is left as it was: the same porcelain status', async () => {
		const handover = writeMergeReviewHandover()
		const before = statusOf(handover.root)
		const { searchPath, record } = fakeEditorSearchPath()

		const outcome = reviewed({ argv: [handover.name], cwd: handover.root, searchPath })

		expect(outcome).toMatchObject({ value: { exitCode: 0 } })
		await waitForRecord({ record, boundMs: EDITOR_RECORD_BOUND_MS })
		expect(statusOf(handover.root)).toEqual(before)
	})

	it('the hand-over named by its folder -> the same start as by name', async () => {
		const handover = writePlainReviewHandover()
		const { searchPath, record } = fakeEditorSearchPath()

		const outcome = reviewed({ argv: [handover.folder], cwd: handover.root, searchPath })

		expect(outcome).toMatchObject({ value: { exitCode: 0 } })
		await expect(waitForRecord({ record, boundMs: EDITOR_RECORD_BOUND_MS })).resolves.toEqual([
			...DEFAULT_EDITOR.flags,
			handover.worktree,
		])
	})
})

describe('handover review: what it runs', { timeout: EDITOR_CASE_TIMEOUT }, () => {
	it('--json, a plain hand-over -> { editor, command, opened }: the editor word, the executable found with its flags and the worktree, the worktree opened; the editor is started once with that command', () => {
		const handover = writePlainReviewHandover()
		const { searchPath, executable } = fakeEditorSearchPath()
		const { spawner, calls } = createRecordingSpawner()

		const outcome = reviewed({
			argv: [handover.name, '--json'],
			cwd: handover.root,
			searchPath,
			spawner,
		})

		const command = [executable, ...DEFAULT_EDITOR.flags, handover.worktree]
		expect({
			exitCode: 'value' in outcome ? outcome.value.exitCode : outcome,
			json: parsedOutput(outcome),
			spawned: commandsOf(calls),
		}).toEqual({
			exitCode: 0,
			json: { editor: DEFAULT_EDITOR.word, command, opened: [handover.worktree] },
			spawned: [command],
		})
	})

	it('--json, a hand-over holding a merge lot -> opened holds the worktree then review/lot.diff', () => {
		const handover = writeMergeReviewHandover()
		const { searchPath } = fakeEditorSearchPath()
		const { spawner } = createRecordingSpawner()

		const outcome = reviewed({
			argv: [handover.name, '--json'],
			cwd: handover.root,
			searchPath,
			spawner,
		})

		expect(parsedOutput(outcome)).toMatchObject({
			opened: [handover.worktree, diffPathOf(handover)],
		})
	})

	it('--print -> one line, the command line it would run; exit 0 and nothing is started', () => {
		const handover = writePlainReviewHandover()
		const { searchPath, executable } = fakeEditorSearchPath()
		const { spawner, calls } = createRecordingSpawner()

		const outcome = reviewed({
			argv: [handover.name, '--print'],
			cwd: handover.root,
			searchPath,
			spawner,
		})

		// scratch paths hold only plain characters: no quote
		expect({ outcome, spawned: calls.length }).toEqual({
			outcome: {
				value: {
					exitCode: 0,
					output: [executable, ...DEFAULT_EDITOR.flags, handover.worktree].join(' '),
				},
			},
			spawned: 0,
		})
	})

	it('--print, a hand-over holding a merge lot -> the line ends with the worktree and review/lot.diff; nothing is started', () => {
		const handover = writeMergeReviewHandover()
		const { searchPath } = fakeEditorSearchPath()
		const { spawner, calls } = createRecordingSpawner()

		const outcome = reviewed({
			argv: [handover.name, '--print'],
			cwd: handover.root,
			searchPath,
			spawner,
		})

		expect({
			exitCode: 'value' in outcome ? outcome.value.exitCode : outcome,
			endsWithBoth:
				'value' in outcome &&
				outcome.value.output.endsWith(`${handover.worktree} ${diffPathOf(handover)}`),
			spawned: calls.length,
		}).toEqual({ exitCode: 0, endsWithBoth: true, spawned: 0 })
	})

	it('dialecte.editor set in the worktree -> its words, then the paths, no flag added', () => {
		const handover = writePlainReviewHandover()
		const { searchPath, executable } = fakeEditorSearchPath()
		git({
			root: handover.worktree,
			args: ['config', EDITOR_CONFIG_KEY, `${executable} ${CONFIGURED_EDITOR_FLAG}`],
		})
		const { spawner, calls } = createRecordingSpawner()

		const outcome = reviewed({
			argv: [handover.name, '--json'],
			cwd: handover.root,
			searchPath,
			spawner,
		})

		const command = [executable, CONFIGURED_EDITOR_FLAG, handover.worktree]
		expect({ json: parsedOutput(outcome), spawned: commandsOf(calls) }).toEqual({
			json: { editor: executable, command, opened: [handover.worktree] },
			spawned: [command],
		})
	})

	it('dialecte.editor a bare word that is an executable of the search path -> exit 0 and the editor is started', () => {
		const handover = writePlainReviewHandover()
		const editors = createFakeEditors({ words: [CONFIGURED_EDITOR_WORD] })
		git({ root: handover.worktree, args: ['config', EDITOR_CONFIG_KEY, CONFIGURED_EDITOR_VALUE] })
		const { spawner, calls } = createRecordingSpawner()

		const outcome = reviewed({
			argv: [handover.name],
			cwd: handover.root,
			searchPath: searchPathOf([editors.folder]),
			spawner,
		})

		expect({ outcome, spawned: calls.length }).toEqual({
			outcome: { value: { exitCode: 0, output: expect.any(String) } },
			spawned: 1,
		})
	})
})

describe('handover review: the editor stays running', { timeout: EDITOR_CASE_TIMEOUT }, () => {
	it('an editor that runs until released -> the command has returned (exit 0) while it still runs; released, it ends', async () => {
		const handover = writePlainReviewHandover()
		const editor = createBlockingEditor({ word: CONFIGURED_EDITOR_WORD })
		git({ root: handover.worktree, args: ['config', EDITOR_CONFIG_KEY, editor.executable] })

		const outcome = reviewed({
			argv: [handover.name],
			cwd: handover.root,
			searchPath: searchPathOf([editor.folder]),
		})

		expect(outcome).toMatchObject({ value: { exitCode: 0 } })
		await waitForRecord({
			record: editor.recordOf(CONFIGURED_EDITOR_WORD),
			boundMs: EDITOR_RECORD_BOUND_MS,
		})
		const pid = pidOf(editor)
		const runningAfterReturn = isRunning(pid)
		writeFileSync(editor.releaseFile, '')
		await waitForExit({ pid, boundMs: EDITOR_EXIT_BOUND_MS })
		expect({ runningAfterReturn, runningAfterRelease: isRunning(pid) }).toEqual({
			runningAfterReturn: true,
			runningAfterRelease: false,
		})
	})
})

describe('handover review: refusals', { timeout: EDITOR_CASE_TIMEOUT }, () => {
	it('a name that is no hand-over -> exit 2 naming it; nothing is started', () => {
		const handover = writePlainReviewHandover()
		const { searchPath } = fakeEditorSearchPath()
		const { spawner, calls } = createRecordingSpawner()

		const outcome = reviewed({
			argv: ['2026-01-01-no-such-handover'],
			cwd: handover.root,
			searchPath,
			spawner,
		})

		expect({ outcome, spawned: calls.length }).toEqual({
			outcome: {
				value: { exitCode: 2, output: expect.stringContaining('2026-01-01-no-such-handover') },
			},
			spawned: 0,
		})
	})

	it('the worktree of the hand-over is gone -> exit 2 naming it; nothing is started and no review diff is written', () => {
		const root = createBranchRepository()
		const worktree = createLinkedWorktree({ root, branch: 'feat/linked' })
		writeStoreHandover({ root: worktree, name: 'linked', changes: { ...PLAIN_CHANGES } })
		const handover = readReviewHandover({ root })
		removeFolder(worktree)
		const { searchPath } = fakeEditorSearchPath()
		const { spawner, calls } = createRecordingSpawner()

		const outcome = reviewed({ argv: [handover.name], cwd: root, searchPath, spawner })

		expect({ outcome, spawned: calls.length, diff: existsSync(diffPathOf(handover)) }).toEqual({
			outcome: { value: { exitCode: 2, output: expect.stringContaining(handover.worktree) } },
			spawned: 0,
			diff: false,
		})
	})
})

describe('handover review: the editor must be there', { timeout: EDITOR_CASE_TIMEOUT }, () => {
	it('dialecte.editor an absolute path that does not exist -> exit 2 `editor <path> not found: set git config dialecte.editor`; nothing is started', () => {
		const handover = writePlainReviewHandover()
		const missing = join(temporaryFolder('dialecte-no-editor-'), 'missing-editor')
		git({ root: handover.worktree, args: ['config', EDITOR_CONFIG_KEY, missing] })
		const { spawner, calls } = createRecordingSpawner()

		const outcome = reviewed({ argv: [handover.name], cwd: handover.root, searchPath: '', spawner })

		expect({ outcome, spawned: calls.length }).toEqual({
			outcome: {
				value: {
					exitCode: 2,
					output: `editor ${missing} not found: set git config dialecte.editor`,
				},
			},
			spawned: 0,
		})
	})

	it('dialecte.editor a bare word that is on no search path -> the same refusal naming the word; nothing is started', () => {
		const handover = writePlainReviewHandover()
		git({ root: handover.worktree, args: ['config', EDITOR_CONFIG_KEY, CONFIGURED_EDITOR_VALUE] })
		const { spawner, calls } = createRecordingSpawner()

		const outcome = reviewed({ argv: [handover.name], cwd: handover.root, searchPath: '', spawner })

		expect({ outcome, spawned: calls.length }).toEqual({
			outcome: {
				value: {
					exitCode: 2,
					output: `editor ${CONFIGURED_EDITOR_WORD} not found: set git config dialecte.editor`,
				},
			},
			spawned: 0,
		})
	})

	it('no argument -> usage, exit 2, nothing is started', () => {
		const handover = writePlainReviewHandover()
		const { spawner, calls } = createRecordingSpawner()

		const outcome = reviewed({ argv: [], cwd: handover.root, searchPath: '', spawner })

		expect({ outcome, spawned: calls.length }).toEqual({
			outcome: { value: { exitCode: 2, output: expect.stringContaining('handover review') } },
			spawned: 0,
		})
	})
})

describe('handover review: the index', { timeout: EDITOR_CASE_TIMEOUT }, () => {
	it('review 171 and review 0171, a numbered worktree -> the same command and the same worktree as by name', () => {
		const handover = writeNumberedReviewHandover({ index: '0171' })
		const { searchPath } = fakeEditorSearchPath()
		const { spawner } = createRecordingSpawner()

		function jsonFor(word: string): unknown {
			return parsedOutput(
				reviewed({ argv: [word, '--json'], cwd: handover.root, searchPath, spawner }),
			)
		}

		const byName = jsonFor(handover.name)
		expect({
			named: byName,
			opensWorktree: (byName as { opened?: string[] }).opened,
			padded: jsonFor('0171'),
			unpadded: jsonFor('171'),
		}).toEqual({
			named: byName,
			opensWorktree: [handover.worktree],
			padded: byName,
			unpadded: byName,
		})
	})
})

describe('handover review: the verb of the cli', { timeout: EDITOR_CASE_TIMEOUT }, () => {
	it('the cli, dialecte.editor set, --print -> exit 0 and the command line on the worktree', () => {
		const handover = writePlainReviewHandover()
		const { executable } = fakeEditorSearchPath()
		git({
			root: handover.worktree,
			args: ['config', EDITOR_CONFIG_KEY, `${executable} ${CONFIGURED_EDITOR_FLAG}`],
		})

		const run = runCli({
			cwd: handover.root,
			argv: ['handover', 'review', handover.name, '--print'],
			timeoutMs: EDITOR_CLI_KILL_BOUND_MS,
		})

		expect({ exitCode: run.exitCode, output: run.output.trim() }).toEqual({
			exitCode: 0,
			output: `${executable} ${CONFIGURED_EDITOR_FLAG} ${handover.worktree}`,
		})
	})

	it('handover alone -> the usage names every verb of the map, review among them', () => {
		const result = outcomeOf(() =>
			runHandover({ argv: [], cliPath: STORE_WRITER_CLI, probe: noRepositoryCli }),
		)

		const { verbs } = commandSurfaceOf({ name: 'handover', entry: COMMAND_MAP.handover })
		const output = 'value' in result ? result.value.output : ''
		expect({
			exitCode: 'value' in result ? result.value.exitCode : result,
			unnamed: verbs.filter((verb) => !new RegExp(`\\b${verb}\\b`).test(output)),
			review: verbs.includes('review'),
		}).toEqual({ exitCode: 2, unnamed: [], review: true })
	})
})
