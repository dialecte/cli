import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createFakeClock } from '../../../test/fake-clock.ts'
import {
	createScratchRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { runChild } from '../progress/run-child.ts'
import { commitLots } from './commit-lots.ts'

import { describe, expect, it, vi } from 'vitest'

vi.mock('../progress/run-child.ts', () => ({ runChild: vi.fn() }))

/** A worktree of a scratch repository holding a.txt; the stalled commit leaves `index.lock` behind. */
function stalledCommitInAWorktree(): { root: string; lock: string } {
	const main = createScratchRepository()
	const root = join(temporaryFolder('dialecte-lock-'), 'worktree')
	git({ root: main, args: ['worktree', 'add', '-q', '-b', 'lock-test', root] })
	writeFiles({ root, files: { 'a.txt': 'a\n' } })
	const lock = git({
		root,
		args: ['rev-parse', '--path-format=absolute', '--git-path', 'index.lock'],
	}).trim()
	vi.mocked(runChild).mockImplementation(async function stalledWithLock() {
		writeFileSync(lock, '')
		return {
			exitCode: undefined,
			output: '',
			stalled: {
				processes: [{ pid: 424242, state: 'R', cpuMilliseconds: 1, command: 'node server.js' }],
				report: '  424242 R 1 s node server.js',
			},
		}
	})
	return { root, lock }
}

function commitA(params: {
	root: string
	lines: string[]
	clock: ReturnType<typeof createFakeClock>
}) {
	return commitLots({
		root: params.root,
		lots: [{ message: 'feat: a', files: ['a.txt'], deletedFiles: [] }],
		commits: [],
		write: (line) => params.lines.push(line),
		clock: params.clock,
	})
}

describe('commitLots after a stalled commit that left index.lock', { timeout: 30_000 }, () => {
	it('the lock goes away within ~300 ms → nothing staged and the "unstaged again" line is printed', async () => {
		const { root, lock } = stalledCommitInAWorktree()
		const clock = createFakeClock()
		function removeLock(): void {
			rmSync(lock, { force: true })
		}
		clock.onSleep = (now) => {
			if (now >= 200) removeLock()
		}
		const timer = setTimeout(removeLock, 200)
		const lines: string[] = []

		await expect(commitA({ root, lines, clock })).resolves.toBeUndefined()
		clearTimeout(timer)

		expect(git({ root, args: ['diff', '--cached', '--name-only'] }).trim()).toBe('')
		expect(lines.join('\n')).toMatch(/unstaged again/)
	})

	it('the lock stays → no "unstaged" claim; the message says the files are still staged and names the lock to remove', async () => {
		const { root, lock } = stalledCommitInAWorktree()
		const lines: string[] = []

		await expect(commitA({ root, lines, clock: createFakeClock() })).resolves.toBeUndefined()

		const output = lines.join('\n')
		expect(output).not.toMatch(/unstaged again/)
		expect(output).toMatch(/still staged/)
		expect(output).toContain(lock)
		expect(git({ root, args: ['diff', '--cached', '--name-only'] }).trim()).toBe('a.txt')
	})
})
