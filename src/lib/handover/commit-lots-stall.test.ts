import { createFakeClock } from '../../../test/fake-clock.ts'
import { createScratchRepository, git, writeFiles } from '../../../test/scratch-repository.ts'
import { runChild } from '../progress/run-child.ts'
import { commitLots } from './commit-lots.ts'

import { describe, expect, it, vi } from 'vitest'

vi.mock('../progress/run-child.ts', () => ({ runChild: vi.fn() }))

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
})
