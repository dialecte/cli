/**
 * R1-C3: `handover review --print` prints a line a shell runs as copied (a worktree path holding a space stays one
 * argument); with `--json` it prints the JSON answer, spawning nothing either way.
 */
import { spawnSync } from 'node:child_process'
import { delimiter, join } from 'node:path'

import { createFakeEditors, searchPathOf, waitForRecord } from '../../test/editor-workspace.ts'
import { writeStoreHandover } from '../../test/handover-store-scenario.ts'
import { PLAIN_CHANGES, REVIEW_HANDOVER_NOW } from '../../test/review-handover.constants.ts'
import { readReviewHandover } from '../../test/review-handover.ts'
import {
	git,
	initializeRepository,
	isolateGitConfig,
	temporaryFolder,
} from '../../test/scratch-repository.ts'
import {
	EDITOR_CASE_TIMEOUT,
	EDITOR_CLI_KILL_BOUND_MS,
	EDITOR_RECORD_BOUND_MS,
} from '../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../test/worktree-pool.ts'
import { DEFAULT_EDITOR } from '../lib/editor/editor.constants.ts'
import {
	SPACED_FOLDER,
	SPACED_HANDOVER_NAME,
	SPACED_REPOSITORY_FILES,
	SPACED_REPOSITORY_BRANCH,
} from './handover-review-print.constants.ts'
import { runHandoverReview } from './handover-review.ts'

import { describe, expect, it } from 'vitest'

/** A hand-over written in a repository whose folder name holds a space, and its name. */
function writeSpacedHandover(): { root: string; name: string } {
	isolateGitConfig()
	const root = initializeRepository({
		root: join(temporaryFolder('dialecte-spaced-'), SPACED_FOLDER),
		files: SPACED_REPOSITORY_FILES,
	})
	git({ root, args: ['checkout', '-q', '-b', SPACED_REPOSITORY_BRANCH] })
	writeStoreHandover({
		root,
		name: SPACED_HANDOVER_NAME,
		changes: { ...PLAIN_CHANGES },
		now: REVIEW_HANDOVER_NOW,
	})
	return { root, name: readReviewHandover({ root }).name }
}

describe('handover review --print', { timeout: EDITOR_CASE_TIMEOUT }, () => {
	it('a worktree path holding a space -> the printed line, run by a shell as copied, starts the editor on that one path', async () => {
		const handover = writeSpacedHandover()
		const editors = createFakeEditors({ words: [DEFAULT_EDITOR.word] })
		const searchPath = searchPathOf([editors.folder])
		const { spawner, calls } = createRecordingSpawner()

		const printed = runHandoverReview({
			argv: [handover.name, '--print'],
			cwd: handover.root,
			searchPath,
			spawner,
		})
		const ran = spawnSync('sh', ['-c', printed.output], {
			encoding: 'utf8',
			timeout: EDITOR_CLI_KILL_BOUND_MS,
			env: { ...process.env, PATH: `${editors.folder}${delimiter}${process.env.PATH ?? ''}` },
		})

		expect({
			exitCode: printed.exitCode,
			lines: printed.output.split('\n').length,
			spawned: calls.length,
		}).toEqual({
			exitCode: 0,
			lines: 1,
			spawned: 0,
		})
		expect(ran.status).toBe(0)
		await expect(
			waitForRecord({
				record: editors.recordOf(DEFAULT_EDITOR.word),
				boundMs: EDITOR_RECORD_BOUND_MS,
			}),
		).resolves.toEqual([...DEFAULT_EDITOR.flags, handover.root])
	})

	it('--json --print -> the JSON answer (editor, command, opened) and nothing is started', () => {
		const handover = writeSpacedHandover()
		const editors = createFakeEditors({ words: [DEFAULT_EDITOR.word] })
		const { spawner, calls } = createRecordingSpawner()

		const printed = runHandoverReview({
			argv: [handover.name, '--json', '--print'],
			cwd: handover.root,
			searchPath: searchPathOf([editors.folder]),
			spawner,
		})

		expect(printed).toMatchObject({ exitCode: 0 })
		expect(printed.output.trimStart().startsWith('{')).toBe(true)
		expect(JSON.parse(printed.output)).toMatchObject({
			editor: DEFAULT_EDITOR.word,
			command: [join(editors.folder, DEFAULT_EDITOR.word), ...DEFAULT_EDITOR.flags, handover.root],
			opened: [handover.root],
		})
		expect(calls).toHaveLength(0)
	})
})
