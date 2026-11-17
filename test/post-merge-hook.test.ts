/**
 * The repository's husky `post-merge` hook (and `post-rewrite` after a rebase): a merge in the main checkout (`git pull`,
 * `lot close`'s fast-forward) rebuilds `dist/` when the checkout has one, so `node dist/cli.js` never reads the store
 * with old code. The build goes to a folder of its own, swapped in only when it succeeds: a failed build never empties
 * `dist/`, and the build it replaces is moved aside, never deleted under a cli running from it.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { SCRATCH_REPOSITORY_TIMEOUT } from './scratch-checks.constants.ts'
import { createScratchRepository, git, temporaryFolder } from './scratch-repository.ts'

import { describe, expect, it } from 'vitest'

const HOOKS = join(import.meta.dirname, '..', '.husky')

/** A build that empties its output folder first (as tsup does), then writes `built.txt` there, or fails when asked. */
function buildScript(failing: boolean): string {
	const steps = [
		"const fs = require('node:fs')",
		"const at = process.argv.indexOf('--out-dir')",
		"const out = at === -1 ? 'dist' : process.argv[at + 1]",
		'fs.rmSync(out, { recursive: true, force: true })',
		'fs.mkdirSync(out, { recursive: true })',
		failing ? 'process.exit(3)' : "fs.writeFileSync(out + '/built.txt', 'built')",
	]
	// `--` ends node's options: the `--out-dir <folder>` npm appends reaches the script
	return `node -e "${steps.join('; ')}" --`
}

/** A checkout whose build script is `buildScript`; `dist/` holding `old.txt` made when asked. */
function checkoutWith(params: { dist: boolean; failingBuild?: boolean }): string {
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({ name: 'demo', scripts: { build: buildScript(params.failingBuild === true) } })}\n`,
	})
	if (params.dist) {
		mkdirSync(join(root, 'dist'))
		writeFileSync(join(root, 'dist', 'old.txt'), 'old')
	}
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

/** What `dist/` of `root` holds: the new build's file, the old one's. */
function distOf(root: string): { built: boolean; old: boolean } {
	return {
		built: existsSync(join(root, 'dist', 'built.txt')),
		old: existsSync(join(root, 'dist', 'old.txt')),
	}
}

describe('the post-merge hook', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a merge in the main checkout holding dist/ → dist/ replaced by the new build', () => {
		const root = checkoutWith({ dist: true })

		const { exitCode } = runHookOf({ cwd: root })

		expect({ exitCode, dist: distOf(root) }).toEqual({
			exitCode: 0,
			dist: { built: true, old: false },
		})
	})

	it('the build it replaces → moved aside whole, never deleted under a cli running from it', () => {
		const root = checkoutWith({ dist: true })

		runHookOf({ cwd: root })

		expect(existsSync(join(root, 'node_modules', '.cache', 'dialecte-dist.old', 'old.txt'))).toBe(
			true,
		)
	})

	it('a merge in the main checkout whose build fails → dist/ kept as it was, the merge not failed, one line saying so', () => {
		const root = checkoutWith({ dist: true, failingBuild: true })

		const { exitCode, stderr } = runHookOf({ cwd: root })

		expect({
			exitCode,
			dist: distOf(root),
			said: stderr.includes('dist/ not rebuilt (npm run build failed), kept as it was'),
		}).toEqual({ exitCode: 0, dist: { built: false, old: true }, said: true })
	})

	it('a merge in a linked worktree holding dist/ → nothing built', () => {
		const root = checkoutWith({ dist: false })
		const linked = join(temporaryFolder('dialecte-linked-'), 'linked')
		git({ root, args: ['worktree', 'add', '-q', '-b', 'feat/linked', linked] })
		mkdirSync(join(linked, 'dist'))

		const { exitCode } = runHookOf({ cwd: linked })

		expect({ exitCode, dist: distOf(linked) }).toEqual({
			exitCode: 0,
			dist: { built: false, old: false },
		})
	})

	it('a merge in a main checkout without dist/ → nothing built', () => {
		const root = checkoutWith({ dist: false })

		const { exitCode } = runHookOf({ cwd: root })

		expect({ exitCode, dist: existsSync(join(root, 'dist')) }).toEqual({ exitCode: 0, dist: false })
	})

	it('a real fast-forward merge in the main checkout, git running the hook → dist/ rebuilt', () => {
		const root = checkoutWith({ dist: true })
		const hooks = temporaryFolder('dialecte-hooks-')
		writeFileSync(
			join(hooks, 'post-merge'),
			`#!/bin/sh\nexec sh '${join(HOOKS, 'post-merge')}' "$@"\n`,
			{
				mode: 0o755,
			},
		)
		git({ root, args: ['config', 'core.hooksPath', hooks] })
		git({ root, args: ['switch', '-q', '-c', 'feat/next'] })
		git({ root, args: ['commit', '-q', '--allow-empty', '-m', 'chore: next'] })
		git({ root, args: ['switch', '-q', 'main'] })

		git({ root, args: ['merge', '-q', '--ff-only', 'feat/next'] })

		expect(distOf(root)).toEqual({ built: true, old: false })
	})

	it('a rebase rewriting the main checkout (git pull --rebase) holding dist/ → dist/ rebuilt', () => {
		const root = checkoutWith({ dist: true })

		const { exitCode } = runHookOf({ cwd: root, hook: 'post-rewrite', argument: 'rebase' })

		expect({ exitCode, dist: distOf(root) }).toEqual({
			exitCode: 0,
			dist: { built: true, old: false },
		})
	})

	it('an amend in the main checkout holding dist/ → nothing built', () => {
		const root = checkoutWith({ dist: true })

		const { exitCode } = runHookOf({ cwd: root, hook: 'post-rewrite', argument: 'amend' })

		expect({ exitCode, dist: distOf(root) }).toEqual({
			exitCode: 0,
			dist: { built: false, old: true },
		})
	})
})
