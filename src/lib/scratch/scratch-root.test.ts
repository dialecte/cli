import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { scratchRoot } from './scratch-root.ts'

import { describe, expect, it } from 'vitest'

type TestCase = {
	/** The layout under a folder of the test: the cwd and the expected root, relative to it or absolute. */
	layout: (folder: string) => { cwd: string; env: NodeJS.ProcessEnv; expected: string }
	only?: boolean
}

describe('scratchRoot', () => {
	const testCases: Record<string, TestCase> = {
		'DIALECTE_SCRATCH set, inside a workspace → that folder': {
			layout(folder) {
				mkdirSync(join(folder, '.worktrees'))
				return {
					cwd: folder,
					env: { DIALECTE_SCRATCH: join(folder, 'chosen') },
					expected: join(folder, 'chosen'),
				}
			},
		},
		'no DIALECTE_SCRATCH, a repository inside a workspace → the workspace .worktrees/_scratch': {
			layout(folder) {
				mkdirSync(join(folder, '_commit-plan'))
				mkdirSync(join(folder, 'cli', 'src'), { recursive: true })
				return {
					cwd: join(folder, 'cli', 'src'),
					env: {},
					expected: join(folder, '.worktrees', '_scratch'),
				}
			},
		},
		'an empty DIALECTE_SCRATCH, inside a workspace → the workspace .worktrees/_scratch': {
			layout(folder) {
				mkdirSync(join(folder, '.worktrees'))
				return {
					cwd: folder,
					env: { DIALECTE_SCRATCH: '' },
					expected: join(folder, '.worktrees', '_scratch'),
				}
			},
		},
		'no DIALECTE_SCRATCH, outside every workspace → dialecte-scratch in the system temporary folder':
			{
				layout(folder) {
					return { cwd: folder, env: {}, expected: join(tmpdir(), 'dialecte-scratch') }
				},
			},
	}

	it.each(Object.entries(testCases))('%s', (_name, testCase) => {
		const { cwd, env, expected } = testCase.layout(temporaryFolder('dialecte-scratch-root-'))
		expect(scratchRoot({ cwd, env })).toBe(expected)
	})
})
