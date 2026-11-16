/**
 * The repository's husky `post-merge` hook: a merge in the main checkout (`git pull`, `lot close`'s fast-forward)
 * rebuilds `dist/` when the checkout has one, so `node dist/cli.js` never reads the store with old code.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { SCRATCH_REPOSITORY_TIMEOUT } from './scratch-checks.constants.ts'
import { createScratchRepository, git, temporaryFolder } from './scratch-repository.ts'

import { describe, expect, it } from 'vitest'

const HOOKS = join(import.meta.dirname, '..', '.husky')

/** A checkout whose build script writes `built.txt` (or fails, when asked); `dist/` made when asked. */
function checkoutWith(params: { dist: boolean; failingBuild?: boolean }): string {
	const build = params.failingBuild
		? 'node -e "process.exit(3)"'
		: "node -e \"require('node:fs').writeFileSync('built.txt', 'built')\""
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({ name: 'demo', scripts: { build } })}\n`,
	})
	if (params.dist) mkdirSync(join(root, 'dist'))
	return root
}

/** Runs the hook `hook` (`post-merge` by default) in `cwd` as git runs it, with `argument`; its exit code and stderr. */
function runHookOf(params: { cwd: string; hook?: string; argument?: string }): {
	exitCode: number | null
	stderr: string
} {
	const run = spawnSync('sh', [join(HOOKS, params.hook ?? 'post-merge'), params.argument ?? '0'], {
		cwd: params.cwd,
		encoding: 'utf8',
	})
	return { exitCode: run.status, stderr: run.stderr }
}

/** Runs the post-merge hook in `cwd`; its exit code. */
function runHook(cwd: string): number | null {
	return runHookOf({ cwd }).exitCode
}

describe('the post-merge hook', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a merge in the main checkout holding dist/ → npm run build runs', () => {
		const root = checkoutWith({ dist: true })

		const exitCode = runHook(root)

		expect({ exitCode, built: existsSync(join(root, 'built.txt')) }).toEqual({
			exitCode: 0,
			built: true,
		})
	})

	it('a merge in a linked worktree holding dist/ → nothing built', () => {
		const root = checkoutWith({ dist: false })
		const linked = join(temporaryFolder('dialecte-linked-'), 'linked')
		git({ root, args: ['worktree', 'add', '-q', '-b', 'feat/linked', linked] })
		mkdirSync(join(linked, 'dist'))

		const exitCode = runHook(linked)

		expect({ exitCode, built: existsSync(join(linked, 'built.txt')) }).toEqual({
			exitCode: 0,
			built: false,
		})
	})

	it('a merge in a main checkout without dist/ → nothing built', () => {
		const root = checkoutWith({ dist: false })

		const exitCode = runHook(root)

		expect({ exitCode, built: existsSync(join(root, 'built.txt')) }).toEqual({
			exitCode: 0,
			built: false,
		})
	})

	it('a merge in the main checkout whose build fails → the merge not failed, one line saying dist/ was not rebuilt', () => {
		const root = checkoutWith({ dist: true, failingBuild: true })

		const { exitCode, stderr } = runHookOf({ cwd: root })

		expect({ exitCode, said: stderr.includes('dist/ not rebuilt') }).toEqual({
			exitCode: 0,
			said: true,
		})
	})

	it('a rebase rewriting the main checkout (git pull --rebase) holding dist/ → npm run build runs', () => {
		const root = checkoutWith({ dist: true })

		const { exitCode } = runHookOf({ cwd: root, hook: 'post-rewrite', argument: 'rebase' })

		expect({ exitCode, built: existsSync(join(root, 'built.txt')) }).toEqual({
			exitCode: 0,
			built: true,
		})
	})

	it('an amend in the main checkout holding dist/ → nothing built', () => {
		const root = checkoutWith({ dist: true })

		const { exitCode } = runHookOf({ cwd: root, hook: 'post-rewrite', argument: 'amend' })

		expect({ exitCode, built: existsSync(join(root, 'built.txt')) }).toEqual({
			exitCode: 0,
			built: false,
		})
	})
})
