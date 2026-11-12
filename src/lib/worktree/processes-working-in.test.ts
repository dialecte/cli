/**
 * `processesWorkingIn`: every process whose working folder is the folder or inside it, the folder compared by its
 * real path and by whole folder names, on real scratch folders.
 */
import { mkdirSync, realpathSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { processesWorkingIn } from './process-folders.ts'

import { describe, expect, it } from 'vitest'

import type { WorkingInRow } from '../../../test/rule-gaps-processes.types.ts'

/** A folder made inside the real path of `base`, and that real path. */
function realFolder(params: { base: string; name: string }): string {
	const folder = join(realpathSync(params.base), params.name)
	mkdirSync(folder, { recursive: true })
	return folder
}

const ROWS: WorkingInRow[] = [
	{
		title:
			'P6 a sibling folder whose name only starts with the folder name (0016-cli-x beside 0016-cli) → not matched, the folder itself is',
		expected: [1],
		arrange(base) {
			const folder = realFolder({ base, name: 'worktrees/0016-cli' })
			const sibling = realFolder({ base, name: 'worktrees/0016-cli-x' })
			return {
				processes: [
					{ pid: 1, folder },
					{ pid: 2, folder: sibling },
				],
				folder,
			}
		},
	},
	{
		title:
			'P7 the folder named through a symbolic link, the process folder as its real path → matched',
		expected: [1, 2],
		arrange(base) {
			const real = realFolder({ base, name: 'real/worktree' })
			const inside = realFolder({ base, name: 'real/worktree/packages/x' })
			const link = join(realpathSync(base), 'link')
			symlinkSync(real, link)
			return {
				processes: [
					{ pid: 1, folder: real },
					{ pid: 2, folder: inside },
				],
				folder: link,
			}
		},
	},
	{
		title:
			'P7 the folder named by the temporary path (/var on macOS, a link to /private/var), the process folder as its real path → matched',
		expected: [1],
		arrange(base) {
			const folder = realFolder({ base, name: 'worktree' })
			return { processes: [{ pid: 1, folder }], folder: join(base, 'worktree') }
		},
	},
	{
		title: 'P12 a process in a sub-folder of the folder (packages/x) → matched',
		expected: [1],
		arrange(base) {
			const folder = realFolder({ base, name: 'worktree' })
			const inside = realFolder({ base, name: 'worktree/packages/x' })
			return { processes: [{ pid: 1, folder: inside }], folder }
		},
	},
	{
		title:
			'every match is returned, in the order given (two in the folder, one in a sub-folder, one beside it, one in its parent)',
		expected: [4, 2, 5],
		arrange(base) {
			const folder = realFolder({ base, name: 'worktrees/0016-cli' })
			const inside = realFolder({ base, name: 'worktrees/0016-cli/src' })
			const beside = realFolder({ base, name: 'worktrees/0017-cli' })
			const parent = realFolder({ base, name: 'worktrees' })
			return {
				processes: [
					{ pid: 1, folder: beside },
					{ pid: 4, folder },
					{ pid: 3, folder: parent },
					{ pid: 2, folder: folder },
					{ pid: 5, folder: inside },
				],
				folder,
			}
		},
	},
	{
		title: 'no process in the folder → none',
		expected: [],
		arrange(base) {
			const folder = realFolder({ base, name: 'worktrees/0016-cli' })
			const other = realFolder({ base, name: 'elsewhere' })
			return { processes: [{ pid: 1, folder: other }], folder }
		},
	},
]

describe(
	'processesWorkingIn: every process in a folder',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		for (const testCase of ROWS) {
			it(testCase.title, () => {
				const arranged = testCase.arrange(temporaryFolder('dialecte-working-in-'))

				expect(processesWorkingIn(arranged).map((entry) => entry.pid)).toEqual(testCase.expected)
			})
		}
	},
)
