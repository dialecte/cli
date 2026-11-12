import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { EDITED_SCOPE_SOURCE, SCOPE_FILE } from '../../test/mutation-package.constants.ts'
import { fakeStryker, mutationPackage, reportOf, storedRuns } from '../../test/mutation-package.ts'
import { addOriginBranch, commitOf, pointOriginHeadAt } from '../../test/rule-gaps-base-branch.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { NO_BASE_BRANCH_FOUND, NO_CONFIGURED_BASE_BRANCH } from '../lib/gate/gate-base.constants.ts'
import { runMutants } from './mutants.ts'

import { describe, expect, it } from 'vitest'

import type { StrykerCall } from '../../test/mutation-package.types.ts'

const ALL_KILLED = reportOf({ mutants: [{ id: '1', status: 'Killed', replacement: 'false' }] })

/** The scope file's edit committed on the current branch. */
function commitScopeEdit(root: string): void {
	writeFiles({ root, files: { [SCOPE_FILE]: EDITED_SCOPE_SOURCE } })
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', 'feat: edit'] })
}

describe(
	'mutants run: the base branch is the shared resolver’s',
	{ timeout: HANDOVER_CASE_TIMEOUT },
	() => {
		it('origin/HEAD names trunk at the start, main has the scope edit committed → the lines changed since trunk, not since main', async () => {
			const root = mutationPackage()
			const start = commitOf({ root, rev: 'HEAD' })
			addOriginBranch({ root, branch: 'trunk' })
			pointOriginHeadAt({ root, branch: 'trunk' })
			commitScopeEdit(root)
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

		it('no main, no master, no origin/HEAD → exit 2 with the resolver’s ask, no run started', async () => {
			const root = mutationPackage()
			git({ root, args: ['branch', '-m', 'main', 'trunk'] })
			commitScopeEdit(root)
			const calls: StrykerCall[] = []

			await expect(
				runMutants({
					cwd: root,
					argv: ['run'],
					dependencies: { runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }) },
				}),
			).resolves.toMatchObject({
				exitCode: 2,
				output: expect.stringContaining(NO_BASE_BRANCH_FOUND),
			})
			expect(calls).toEqual([])
			expect(storedRuns(root)).toEqual([])
		})

		it('dialecte.baseBranch is release, no such branch, main exists → exit 2 with the resolver’s refusal naming release, no run started', async () => {
			const root = mutationPackage()
			const declared = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
				dialecte: Record<string, unknown>
			}
			declared.dialecte.baseBranch = 'release'
			writeFiles({ root, files: { 'package.json': `${JSON.stringify(declared, null, '\t')}\n` } })
			commitScopeEdit(root)
			const calls: StrykerCall[] = []

			await expect(
				runMutants({
					cwd: root,
					argv: ['run'],
					dependencies: { runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }) },
				}),
			).resolves.toMatchObject({
				exitCode: 2,
				output: expect.stringContaining(NO_CONFIGURED_BASE_BRANCH.replace('{branch}', 'release')),
			})
			expect(calls).toEqual([])
			expect(storedRuns(root)).toEqual([])
		})
	},
)
