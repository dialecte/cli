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

const HOOK = join(import.meta.dirname, '..', '.husky', 'post-merge')

/** A checkout whose build script writes `built.txt`; `dist/` made when asked. */
function checkoutWith(params: { dist: boolean }): string {
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({
			name: 'demo',
			scripts: { build: "node -e \"require('node:fs').writeFileSync('built.txt', 'built')\"" },
		})}\n`,
	})
	if (params.dist) mkdirSync(join(root, 'dist'))
	return root
}

/** Runs the hook in `cwd` as git runs it after a merge; its exit code. */
function runHook(cwd: string): number | null {
	return spawnSync('sh', [HOOK, '0'], { cwd, encoding: 'utf8' }).status
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
})
