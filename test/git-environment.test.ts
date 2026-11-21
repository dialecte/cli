/**
 * A commit hook runs with git's own variables set (GIT_DIR, GIT_INDEX_FILE...): a test or a cli run inside it
 * must act on the repository it names by its folder, never on the one being committed to.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { CLI_PACKAGE } from '../src/lib/skills/cli-invocations.constants.ts'
import { SUITE_NPM_PREFIX_FOLDER } from './git-environment.constants.ts'
import {
	createScratchRepository,
	git,
	isolateGitConfig,
	temporaryFolder,
	writeFiles,
} from './scratch-repository.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

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

/** The git commands a GIT_TRACE2_EVENT `trace` file says were started as `git maintenance`. */
function maintenanceStartsIn(trace: string): string[] {
	if (!existsSync(trace)) return []
	return readFileSync(trace, 'utf8')
		.split('\n')
		.filter((line) => line.startsWith('{'))
		.map((line) => JSON.parse(line) as { event: string; argv?: string[] })
		.filter((event) => event.event === 'child_start' && event.argv?.includes('maintenance'))
		.map((event) => (event.argv ?? []).join(' '))
}

const MAINTENANCE_CASES: Record<string, (root: string) => void> = {
	'a commit': function commit(root) {
		git({ root, args: ['commit', '-q', '--allow-empty', '-m', 'more'] })
	},
	"a commit with the test's own global config": function commitWithOwnConfig(root) {
		isolateGitConfig()
		git({ root, args: ['commit', '-q', '--allow-empty', '-m', 'more'] })
	},
	'a push into a bare repository': function push(root) {
		const bare = join(temporaryFolder('dialecte-bare-'), 'bare.git')
		git({ root, args: ['init', '-q', '--bare', bare] })
		git({ root, args: ['push', '-q', bare, 'main'] })
	},
}

describe('git started under the suite setup', () => {
	afterEach(function restoreEnvironment() {
		vi.unstubAllEnvs()
	})

	for (const [name, act] of Object.entries(MAINTENANCE_CASES))
		it(`${name} → no background git maintenance started (it would outlive the test's folder)`, () => {
			const root = createScratchRepository()
			const trace = join(temporaryFolder('dialecte-trace-'), 'trace.json')
			vi.stubEnv('GIT_TRACE2_EVENT', trace)

			act(root)

			expect(maintenanceStartsIn(trace)).toEqual([])
		})
})

/** The marker the fake global cli prints. */
const FAKE_CLI_OUTPUT = 'fake global cli ran'

/** A global npm prefix holding a `@dialecte/cli` the way a global install leaves it: the package and its bin link. */
function fakeGlobalPrefix(): string {
	const prefix = temporaryFolder('dialecte-global-prefix-')
	const packageFolder = join(prefix, 'lib', 'node_modules', '@dialecte', 'cli')
	mkdirSync(packageFolder, { recursive: true })
	writeFileSync(
		join(packageFolder, 'package.json'),
		`${JSON.stringify({ name: CLI_PACKAGE, version: '0.8.2', bin: { dialecte: 'bin.js' } })}\n`,
	)
	writeFileSync(
		join(packageFolder, 'bin.js'),
		`#!/usr/bin/env node\nconsole.log('${FAKE_CLI_OUTPUT}')\n`,
	)
	chmodSync(join(packageFolder, 'bin.js'), 0o755)
	mkdirSync(join(prefix, 'bin'))
	symlinkSync(
		join('..', 'lib', 'node_modules', '@dialecte', 'cli', 'bin.js'),
		join(prefix, 'bin', 'dialecte'),
	)
	return prefix
}

/** A package that does not hold the cli. */
function packageWithoutCli(): string {
	const folder = temporaryFolder('dialecte-no-cli-')
	writeFileSync(join(folder, 'package.json'), `${JSON.stringify({ name: 'no-cli' })}\n`)
	return folder
}

/** A node child that runs the suite's setup files under `environment`, then `body`; what it printed. */
function afterSetup(params: { environment: NodeJS.ProcessEnv; body: string; cwd: string }): string {
	const script = [
		`const { default: config } = await import(${JSON.stringify(join(PACKAGE_ROOT, 'vitest.config.ts'))})`,
		'for (const file of config.test?.setupFiles ?? [])',
		`\tawait import(new URL(file, ${JSON.stringify(`file://${PACKAGE_ROOT}/`)}).href)`,
		params.body,
	].join('\n')
	const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
		cwd: params.cwd,
		encoding: 'utf8',
		env: params.environment,
	})
	return child.stdout
}

describe('npm’s global prefix under the suite setup', () => {
	it('12. a machine-global cli is found by npx with its prefix (the vector is real), and not under the suite’s setup', () => {
		const prefix = fakeGlobalPrefix()
		const cwd = packageWithoutCli()
		const environment = { ...process.env, npm_config_prefix: prefix }
		const npx = `spawnSync('npx', ['--no-install', ${JSON.stringify(CLI_PACKAGE)}], { encoding: 'utf8' })`

		const withPrefix = spawnSync('npx', ['--no-install', CLI_PACKAGE], {
			cwd,
			encoding: 'utf8',
			env: environment,
		})
		const underSetup = afterSetup({
			environment,
			cwd,
			body: `import { spawnSync } from 'node:child_process'\nconst run = ${npx}\nconsole.log(JSON.stringify({ failed: run.status !== 0, found: run.stdout.includes(${JSON.stringify(FAKE_CLI_OUTPUT)}) }))`,
		})

		expect({
			withPrefix: { status: withPrefix.status, found: withPrefix.stdout.includes(FAKE_CLI_OUTPUT) },
			underSetup: JSON.parse(underSetup || 'null') as unknown,
		}).toEqual({
			withPrefix: { status: 0, found: true },
			underSetup: { failed: true, found: false },
		})
	})

	it('13. NPM_CONFIG_PREFIX set by the parent is gone after the setup', () => {
		const printed = afterSetup({
			environment: { ...process.env, NPM_CONFIG_PREFIX: '/somewhere/else' },
			cwd: PACKAGE_ROOT,
			body: 'console.log(JSON.stringify({ upper: process.env.NPM_CONFIG_PREFIX ?? null }))',
		})

		expect(JSON.parse(printed || 'null') as unknown).toEqual({ upper: null })
	})

	it('13. npm prefix -g under the suite’s environment is the absent folder of the guarded suite folder, which is not created', () => {
		const expected = join(tmpdir(), SUITE_NPM_PREFIX_FOLDER)

		const run = spawnSync('npm', ['prefix', '-g'], { cwd: PACKAGE_ROOT, encoding: 'utf8' })

		expect({ prefix: run.stdout.trim(), exists: existsSync(expected) }).toEqual({
			prefix: expected,
			exists: false,
		})
	})
})
