/**
 * A commit hook runs with git's own variables set (GIT_DIR, GIT_INDEX_FILE...): a test or a cli run inside it
 * must act on the repository it names by its folder, never on the one being committed to.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createScratchRepository, git, temporaryFolder, writeFiles } from './scratch-repository.ts'

import { describe, expect, it } from 'vitest'

const PACKAGE_ROOT = join(import.meta.dirname, '..')

/** The cli's entry in the sources: Node runs it with its type stripping. */
const CLI_SOURCE = join(PACKAGE_ROOT, 'src', 'cli.ts')

/** What a repository holds that a stray git command would change: its config, its index, its HEAD. */
function snapshotOf(root: string): { config: string; index: string; head: string } {
	return {
		config: readFileSync(join(root, '.git', 'config'), 'utf8'),
		index: readFileSync(join(root, '.git', 'index')).toString('base64'),
		head: git({ root, args: ['rev-parse', 'HEAD'] }).trim(),
	}
}

/** The variables git sets for a hook run from a commit in `root`. */
function hookEnvironmentOf(root: string): NodeJS.ProcessEnv {
	return {
		...process.env,
		GIT_DIR: join(root, '.git'),
		GIT_INDEX_FILE: join(root, '.git', 'index'),
	}
}

describe('git variables a commit hook inherits', () => {
	it('a scratch repository made under the suite setup leaves the committed repository untouched', () => {
		const committed = createScratchRepository({ 'kept.txt': 'kept\n' })
		const before = snapshotOf(committed)
		const scratch = join(temporaryFolder('dialecte-hooked-'), 'scratch')
		// the suite's setup files (test/git-environment.setup.ts), then the scratch helper, as a worker runs them
		const script = [
			`const { default: config } = await import(${JSON.stringify(join(PACKAGE_ROOT, 'vitest.config.ts'))})`,
			'for (const file of config.test?.setupFiles ?? [])',
			`\tawait import(new URL(file, ${JSON.stringify(`file://${PACKAGE_ROOT}/`)}).href)`,
			`const { initializeRepository } = await import(${JSON.stringify(join(PACKAGE_ROOT, 'test', 'scratch-repository.ts'))})`,
			`initializeRepository({ root: ${JSON.stringify(scratch)} })`,
		].join('\n')

		const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
			cwd: PACKAGE_ROOT,
			encoding: 'utf8',
			env: hookEnvironmentOf(committed),
		})

		expect({ exitCode: child.status, after: snapshotOf(committed) }).toEqual({
			exitCode: 0,
			after: before,
		})
	})

	it('the cli run with another repository in GIT_DIR and GIT_INDEX_FILE acts on the one it runs in', () => {
		const committed = createScratchRepository({ 'kept.txt': 'kept\n' })
		const before = snapshotOf(committed)
		const root = createScratchRepository()
		writeFiles({ root, files: { 'src/one.ts': 'export const one = 1\n' } })

		const run = spawnSync(process.execPath, [CLI_SOURCE, 'rules'], {
			cwd: root,
			encoding: 'utf8',
			env: hookEnvironmentOf(committed),
		})

		expect({
			output: run.stdout.trim(),
			warning: run.stderr.trim(),
			recordedHere: existsSync(join(root, '.git', 'dialecte-rules.json')),
			recordedThere: existsSync(join(committed, '.git', 'dialecte-rules.json')),
			after: snapshotOf(committed),
		}).toEqual({
			output: 'rules: 1 file(s), 0 error(s), 0 warning(s)',
			warning: 'dialecte: GIT_DIR, GIT_INDEX_FILE ignored: the cli acts on the folder it runs in',
			recordedHere: true,
			recordedThere: false,
			after: before,
		})
	})

	it('the cli run from a hook of its own linked worktree says nothing about the variables git set', () => {
		const repository = createScratchRepository({ 'kept.txt': 'kept\n' })
		const root = join(temporaryFolder('dialecte-linked-'), 'linked')
		git({ root: repository, args: ['worktree', 'add', '--quiet', root] })
		writeFiles({ root, files: { 'src/one.ts': 'export const one = 1\n' } })
		const ownGitFolder = git({ root, args: ['rev-parse', '--absolute-git-dir'] }).trim()

		// what git exports to a pre-commit hook in a linked worktree
		const run = spawnSync(process.execPath, [CLI_SOURCE, 'rules'], {
			cwd: root,
			encoding: 'utf8',
			env: {
				...process.env,
				GIT_PREFIX: '',
				GIT_INDEX_FILE: join(ownGitFolder, 'index'),
				GIT_DIR: ownGitFolder,
			},
		})

		expect({ output: run.stdout.trim(), warning: run.stderr.trim() }).toEqual({
			output: 'rules: 1 file(s), 0 error(s), 0 warning(s)',
			warning: '',
		})
	})

	it('the cli run with GIT_DIR and GIT_WORK_TREE naming its own repository says nothing', () => {
		const root = createScratchRepository()
		writeFiles({ root, files: { 'src/one.ts': 'export const one = 1\n' } })

		const run = spawnSync(process.execPath, [CLI_SOURCE, 'rules'], {
			cwd: root,
			encoding: 'utf8',
			env: { ...process.env, GIT_DIR: '.git', GIT_WORK_TREE: root, GIT_PREFIX: 'src/' },
		})

		expect({ output: run.stdout.trim(), warning: run.stderr.trim() }).toEqual({
			output: 'rules: 1 file(s), 0 error(s), 0 warning(s)',
			warning: '',
		})
	})

	it('the cli run with git config in the environment keeps it for the git commands it runs', () => {
		const root = createScratchRepository()
		const excludes = join(temporaryFolder('dialecte-excludes-'), 'excludes')
		writeFiles({
			root,
			files: { 'src/one.ts': 'export const one = 1\n', 'src/two.ts': 'export const two = 2\n' },
		})
		writeFileSync(excludes, 'src/two.ts\n')

		const run = spawnSync(process.execPath, [CLI_SOURCE, 'rules'], {
			cwd: root,
			encoding: 'utf8',
			env: {
				...process.env,
				GIT_CONFIG_COUNT: '1',
				GIT_CONFIG_KEY_0: 'core.excludesFile',
				GIT_CONFIG_VALUE_0: excludes,
			},
		})

		expect({ output: run.stdout.trim(), warning: run.stderr.trim() }).toEqual({
			output: 'rules: 1 file(s), 0 error(s), 0 warning(s)',
			warning: '',
		})
	})
})
