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
import type { MutationReport } from '../lib/mutation/mutation.types.ts'

const SURVIVING = reportOf({ mutants: [{ id: '1', status: 'Survived', replacement: 'false' }] })
const ALL_KILLED = reportOf({ mutants: [{ id: '1', status: 'Killed', replacement: 'false' }] })

/** A package whose first run left one survivor new in the ledger; answers its root and the survivor. */
async function survivorLeftNew(): Promise<{ root: string; key: string; mutation: string }> {
	const root = mutationPackage()
	writeFiles({ root, files: { [SCOPE_FILE]: EDITED_SCOPE_SOURCE } })
	await expect(
		runMutants({
			cwd: root,
			argv: ['run'],
			dependencies: dependenciesOf({ root, report: SURVIVING }),
		}),
	).resolves.toMatchObject({ exitCode: 0 })
	const [{ key, mutation }] = judgeReport({ report: SURVIVING, records: {} }).survivors
	return { root, key, mutation }
}

function dependenciesOf(params: { root: string; report: MutationReport }) {
	const calls: StrykerCall[] = []
	return { runStryker: fakeStryker({ root: params.root, reports: { fast: params.report }, calls }) }
}

describe(
	'mutants run: what its ledger update moved',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a survivor the run killed → a line naming its key, file:line and killed', async () => {
			const { root, key } = await survivorLeftNew()

			const output = runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: dependenciesOf({ root, report: ALL_KILLED }),
			}).then((result) => result.output)

			await expect(output).resolves.toMatch(new RegExp(`${key}.*${SCOPE_FILE}:2.*killed`))
		})

		it('a survivor the records now list → a line naming its key, file:line and recorded', async () => {
			const { root, key, mutation } = await survivorLeftNew()
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

			const output = runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: dependenciesOf({ root, report: SURVIVING }),
			}).then((result) => result.output)

			await expect(output).resolves.toMatch(new RegExp(`${key}.*${SCOPE_FILE}:2.*recorded`))
		})
	},
)
