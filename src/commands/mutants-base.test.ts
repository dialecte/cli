import { EDITED_SCOPE_SOURCE, SCOPE_FILE } from '../../test/mutation-package.constants.ts'
import { fakeStryker, mutationPackage, reportOf, storedRuns } from '../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { judgeReport } from '../lib/mutation/judge.ts'
import { runMutants } from './mutants.ts'

import { describe, expect, it } from 'vitest'

import type { StrykerCall } from '../../test/mutation-package.types.ts'

const ALL_KILLED = reportOf({ mutants: [{ id: '1', status: 'Killed', replacement: 'false' }] })
const SURVIVING = reportOf({ mutants: [{ id: '1', status: 'Survived', replacement: 'false' }] })

/** The package on a branch `trunk` (no `main`), its scope edit committed there. */
function trunkPackageWithCommittedEdit(): { root: string; start: string } {
	const root = mutationPackage()
	git({ root, args: ['branch', '-m', 'main', 'trunk'] })
	const start = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	writeFiles({ root, files: { [SCOPE_FILE]: EDITED_SCOPE_SOURCE } })
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', 'feat: edit'] })
	return { root, start }
}

describe('mutants run: the base of a changed run', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('no main, but origin/HEAD names the default branch → the lines changed since where HEAD left it', async () => {
		const root = mutationPackage()
		git({ root, args: ['branch', '-m', 'main', 'trunk'] })
		const start = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
		git({ root, args: ['update-ref', 'refs/remotes/origin/trunk', start] })
		git({ root, args: ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk'] })
		git({ root, args: ['switch', '-q', '-c', 'feat/lot'] })
		writeFiles({ root, files: { [SCOPE_FILE]: EDITED_SCOPE_SOURCE } })
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', 'feat: edit'] })
		const calls: StrykerCall[] = []

		await expect(
			runMutants({
				cwd: root,
				argv: ['run', '--mode', 'changed'],
				dependencies: { runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }) },
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		expect(calls[0]?.options.mutate).toEqual([`${SCOPE_FILE}:2-2`])
		expect(storedRuns(root)).toEqual([expect.objectContaining({ base: start })])
	})

	it('no main and no origin/HEAD → refused with exit 2 naming dialecte.baseBranch and --base, no run started', async () => {
		const { root } = trunkPackageWithCommittedEdit()
		const calls: StrykerCall[] = []

		await expect(
			runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: { runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }) },
			}),
		).resolves.toMatchObject({
			exitCode: 2,
			output: expect.stringMatching(/dialecte\.baseBranch.*--base|--base.*dialecte\.baseBranch/s),
		})
		expect(calls).toEqual([])
		expect(storedRuns(root)).toEqual([])
	})
})

describe('mutants run: what the run entry keeps', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('the keys of the mutants the run detected, and of every mutant it tested', async () => {
		const root = mutationPackage()
		writeFiles({ root, files: { [SCOPE_FILE]: EDITED_SCOPE_SOURCE } })
		const [{ key }] = judgeReport({ report: SURVIVING, records: {} }).survivors
		const calls: StrykerCall[] = []

		await expect(
			runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: { runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }) },
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		expect(storedRuns(root)).toEqual([
			expect.objectContaining({ state: 'reported', detected: [key], tested: [key] }),
		])
	})
})
