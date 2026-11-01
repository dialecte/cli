import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createFakeClock } from '../../../test/fake-clock.ts'
import { readRecordFile } from '../../../test/gate-records.ts'
import { createScratchRepository, git, writeFiles } from '../../../test/scratch-repository.ts'
import { runChild } from '../progress/run-child.ts'
import { commitLots } from './commit-lots.ts'

import { describe, expect, it, vi } from 'vitest'

vi.mock('../progress/run-child.ts', () => ({ runChild: vi.fn() }))

/** The record a commit's hook leaves in the repository's git folder. */
const HOOK_RECORD = 'dialecte-gate-hook.json'

/** A repository with a pre-commit hook and a changed file to commit. */
function repositoryWithHook(): string {
	const root = createScratchRepository()
	mkdirSync(join(root, '.githooks'), { recursive: true })
	writeFileSync(join(root, '.githooks/pre-commit'), '#!/bin/sh\ntrue\n')
	chmodSync(join(root, '.githooks/pre-commit'), 0o755)
	git({ root, args: ['config', 'core.hooksPath', '.githooks'] })
	writeFiles({ root, files: { 'a.txt': 'a\n' } })
	return root
}

describe('commitLots stall', () => {
	it('the commit stalls (runChild answers stalled, no watchdog override) → not committed, nothing staged, the lines say stalled with the tree, not "git commit exited"', async () => {
		const clock = createFakeClock()
		vi.mocked(runChild).mockResolvedValue({
			exitCode: undefined,
			output: '',
			stalled: {
				processes: [
					{ pid: 424242, state: 'R', cpuMilliseconds: 120_000, command: 'node server.js' },
				],
				report: '  424242 R 2 m 0 s node server.js',
			},
		})
		const root = createScratchRepository()
		writeFiles({ root, files: { 'a.txt': 'a\n' } })
		const head = git({ root, args: ['rev-parse', 'HEAD'] })
		const lines: string[] = []

		await expect(
			commitLots({
				root,
				lots: [{ message: 'feat: a', files: ['a.txt'], deletedFiles: [] }],
				commits: [],
				write: (line) => lines.push(line),
				clock,
			}),
		).resolves.toBeUndefined()

		expect(lines.join('\n')).toMatch(/stalled/)
		expect(lines.join('\n')).toContain('node server.js')
		expect(lines.join('\n')).not.toMatch(/git commit exited/)
		expect(git({ root, args: ['rev-parse', 'HEAD'] })).toBe(head)
		expect(git({ root, args: ['diff', '--cached', '--name-only'] }).trim()).toBe('')
		expect(runChild).toHaveBeenCalledTimes(1)
		expect(vi.mocked(runChild).mock.calls[0]?.[0].watchdog).toBeUndefined()
		expect(vi.mocked(runChild).mock.calls[0]?.[0].clock).toBe(clock)
	})

	it('a commit with a hook stopped as stalled → no hook record; the same commit whose hook answers → a record of its steps', async () => {
		const stalledRoot = repositoryWithHook()
		const answeredRoot = repositoryWithHook()
		vi.mocked(runChild).mockReset()
		vi.mocked(runChild).mockResolvedValueOnce({
			exitCode: undefined,
			output: '> demo@1.0.0 build\n> tsup\n',
			stalled: {
				processes: [{ pid: 424243, state: 'S', cpuMilliseconds: 0, command: 'tsup' }],
				report: '  424243 S 0 s tsup',
			},
		})
		vi.mocked(runChild).mockResolvedValueOnce({
			exitCode: 0,
			output: '> demo@1.0.0 build\n> tsup\n',
		})
		const lots = [{ message: 'feat: a', files: ['a.txt'], deletedFiles: [] }]

		await expect(
			commitLots({
				root: stalledRoot,
				lots,
				commits: [],
				write: () => undefined,
				clock: createFakeClock(),
			}),
		).resolves.toBeUndefined()
		await expect(
			commitLots({
				root: answeredRoot,
				lots,
				commits: [],
				write: () => undefined,
				clock: createFakeClock(),
			}),
		).resolves.toHaveLength(1)

		expect(readRecordFile({ root: stalledRoot, name: HOOK_RECORD })).toBeUndefined()
		expect(readRecordFile({ root: answeredRoot, name: HOOK_RECORD })).toMatchObject({
			mode: 'hook',
			steps: [{ name: 'build', status: 'passed' }],
		})
	})
})
