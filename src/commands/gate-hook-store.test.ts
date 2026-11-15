/**
 * What `gate --hook` stores, and where: the store a rehearsal hands it never reaches its steps, a given store that is
 * no absolute path to a folder is ignored, and a hook run records the committed tree only when its steps ran on it.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { REPOSITORY_CLI_PATH } from '../../test/gate-hook.constants.ts'
import {
	commonGitDirOf,
	createHookPackage,
	hookRecordsOf,
	indexTreeOf,
	packageFilesOf,
	runHookIn,
} from '../../test/gate-hook.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { countRuns, countingStep, createCounter } from '../../test/scratch-checks.ts'
import {
	createScratchRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { CHECK_STORE_VARIABLE } from '../lib/gate-records/gate-records.constants.ts'
import { shellQuote } from '../lib/shell-quote.ts'

import { describe, expect, it } from 'vitest'

/** `gate --hook` as a commit hook starts it: the cli in its own process, given `DIALECTE_CHECK_STORE`. */
function spawnHookWithStore(params: { cwd: string; store: string }): {
	status: number | null
	stdout: string
} {
	const result = spawnSync('node', [REPOSITORY_CLI_PATH, 'gate', '--hook'], {
		cwd: params.cwd,
		encoding: 'utf8',
		env: { ...process.env, [CHECK_STORE_VARIABLE]: params.store },
	})
	return { status: result.status, stdout: result.stdout }
}

describe(
	'gate --hook: the store a rehearsal hands it',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('the hook given DIALECTE_CHECK_STORE → its step does not see the variable', () => {
			const seen = join(temporaryFolder('dialecte-seen-'), 'seen.txt')
			const root = createScratchRepository(
				packageFilesOf({
					steps: [
						{
							name: 'check',
							run: `printf '%s' "\${DIALECTE_CHECK_STORE-unset}" > ${shellQuote(seen)}`,
						},
					],
				}),
			)

			const result = spawnHookWithStore({ cwd: root, store: commonGitDirOf(root) })

			expect(result.status).toBe(0)
			expect(readFileSync(seen, 'utf8')).toBe('unset')
		})

		it.each([
			{
				name: 'a relative path',
				store: () => 'relative-store',
				why: 'not an absolute path: relative-store',
			},
			{
				name: 'an absolute path to no folder',
				store: () => join(temporaryFolder('dialecte-store-'), 'missing'),
				why: 'no folder at {store}',
			},
		])(
			"the hook given DIALECTE_CHECK_STORE as $name → the ignored line first, the record in the repository's own store, nothing at the given path",
			({ store, why }) => {
				const { root } = createHookPackage()
				const tree = indexTreeOf({ root })
				const given = store()

				const result = spawnHookWithStore({ cwd: root, store: given })

				expect(result.status).toBe(0)
				expect(result.stdout.split('\n')[0]).toBe(
					`gate --hook: DIALECTE_CHECK_STORE ignored: ${why.replace('{store}', given)}`,
				)
				expect(hookRecordsOf({ root, tree }).map((record) => record.origin)).toEqual([undefined])
				expect(existsSync(join(root, given))).toBe(false)
				expect(existsSync(given)).toBe(false)
			},
		)
	},
)

describe(
	'gate --hook: the record of the committed tree holds only steps run on that tree',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a change left unstaged, the hook green → no hook-gate record of the index tree; the next hook of that index runs its steps again', async () => {
			const hookPackage = createHookPackage()
			const { root } = hookPackage
			const tree = indexTreeOf({ root })
			writeFiles({ root, files: { 'src/a.ts': 'export const unstaged = 1\n' } })

			const first = await runHookIn({ cwd: root })
			const records = hookRecordsOf({ root, tree })
			const second = await runHookIn({ cwd: root })

			expect([first.exitCode, second.exitCode]).toEqual([0, 0])
			expect(records).toEqual([])
			expect([countRuns(hookPackage.checkCounter), countRuns(hookPackage.testCounter)]).toEqual([
				2, 2,
			])
		})

		it('a step that edits a file of the worktree while it runs, the hook green → no hook-gate record of the index tree; the next hook runs the step again', async () => {
			const counter = createCounter()
			const root = createScratchRepository(
				packageFilesOf({ steps: [countingStep({ counter, name: 'tests', edits: 'src/a.ts' })] }),
			)
			const tree = indexTreeOf({ root })

			const first = await runHookIn({ cwd: root })
			const records = hookRecordsOf({ root, tree })
			const second = await runHookIn({ cwd: root })

			expect([first.exitCode, second.exitCode]).toEqual([0, 0])
			expect(records).toEqual([])
			expect(countRuns(counter)).toBe(2)
		})
	},
)
