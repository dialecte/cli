import {
	EDITED_SCOPE_SOURCE,
	RECORDS_FILE,
	SCOPE_FILE,
} from '../../test/mutation-package.constants.ts'
import { fakeStryker, mutationPackage, reportOf } from '../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { writeFiles } from '../../test/scratch-repository.ts'
import { judgeReport } from '../lib/mutation/judge.ts'
import { runMutants } from './mutants.ts'

import { describe, expect, it } from 'vitest'

import type { StrykerCall } from '../../test/mutation-package.types.ts'

const SURVIVING = reportOf({ mutants: [{ id: '1', status: 'Survived', replacement: 'false' }] })
const MOVED_HEADING = 'moved by this run'

function surviving(root: string) {
	const calls: StrykerCall[] = []
	return { runStryker: fakeStryker({ root, reports: { fast: SURVIVING }, calls }) }
}

describe(
	'mutants run: an item recorded by an earlier run',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('reported again → the run names no moved item', async () => {
			const root = mutationPackage()
			writeFiles({ root, files: { [SCOPE_FILE]: EDITED_SCOPE_SOURCE } })
			const [{ key, mutation }] = judgeReport({ report: SURVIVING, records: {} }).survivors
			await expect(
				runMutants({ cwd: root, argv: ['run'], dependencies: surviving(root) }),
			).resolves.toMatchObject({ exitCode: 0 })
			writeFiles({
				root,
				files: {
					[RECORDS_FILE]: JSON.stringify({
						[SCOPE_FILE]: {
							[key]: {
								line: 2,
								mutation,
								family: 'wording',
								reason: 'no output reads it',
								lineHash: 'h',
							},
						},
					}),
				},
			})
			await expect(
				runMutants({ cwd: root, argv: ['run'], dependencies: surviving(root) }),
			).resolves.toMatchObject({ exitCode: 0, output: expect.stringContaining(MOVED_HEADING) })

			await expect(
				runMutants({ cwd: root, argv: ['run'], dependencies: surviving(root) }),
			).resolves.toMatchObject({ exitCode: 0, output: expect.not.stringContaining(MOVED_HEADING) })
		})
	},
)
