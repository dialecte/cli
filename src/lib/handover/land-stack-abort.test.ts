/**
 * A stack rebase that conflicts and whose `git rebase --abort` fails as well (33CI CI4): the landing never claims the
 * worktree is as it was. It exits 2, the line naming the conflict, the abort's error and the worktree left mid-rebase,
 * nothing pushed. A `git` on the PATH runs the real one and fails only the abort.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

import { parentPullRequest, recordingHost, stackedRepository } from '../../../test/land-lot.ts'
import { git, temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { landLot } from './land-lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const ABORT_ERROR = 'fatal: could not move back to the original head'

/**
 * Puts a `git` first on the PATH that fails `git rebase --abort` (exit 128, `stderr` on its error stream) and runs the
 * real git, found on the PATH now, for every other command. `vi.unstubAllEnvs` puts the PATH back.
 */
function failRebaseAbort(params: { stderr: string }): void {
	const real = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim()
	if (real === '') throw new Error('no git on the PATH to stand in front of')
	const folder = temporaryFolder('dialecte-fake-git-')
	const script = join(folder, 'git')
	writeFileSync(
		script,
		[
			'#!/bin/sh',
			'if [ "$1" = rebase ] && [ "$2" = --abort ]; then',
			`\tprintf '%s\\n' '${params.stderr}' >&2`,
			'\texit 128',
			'fi',
			`exec '${real}' "$@"`,
			'',
		].join('\n'),
	)
	chmodSync(script, 0o755)
	vi.stubEnv('PATH', `${folder}${delimiter}${process.env.PATH ?? ''}`)
}

describe('a stack rebase whose abort fails', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('the rebase onto the parent conflicts and git rebase --abort fails → exit 2, the line says the abort failed and the worktree is mid-rebase, nothing pushed', () => {
		const stack = stackedRepository({ childFiles: { 'src/x.ts': 'export const x = 2\n' } })
		writeFiles({ root: stack.parent.worktree, files: { 'src/x.ts': 'export const x = 3\n' } })
		git({ root: stack.parent.worktree, args: ['commit', '-qam', 'feat(x): x answers three'] })
		const host = recordingHost({ parent: parentPullRequest() })
		failRebaseAbort({ stderr: ABORT_ERROR })

		const landed = landLot({
			lot: '0002-repo-y',
			worktree: stack.child.worktree,
			branch: 'feat/y',
			base: 'main',
			lotFolder: stack.child.lotFolder,
			host: host.host,
			now: new Date('2026-11-17T23:30:00Z'),
		})

		expect({ exitCode: landed.exitCode, lines: landed.lines }).toEqual({
			exitCode: 2,
			lines: [
				`lot land: rebasing 0002-repo-y onto feat/x conflicts in src/x.ts and git rebase --abort failed (${ABORT_ERROR}): the worktree is mid-rebase, run git rebase --abort there by hand; nothing pushed`,
			],
		})
	})
})
