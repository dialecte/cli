/** A throwaway git repository for the tests of the commands that read or guard one. */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterAll, onTestFinished, vi } from 'vitest'

/** A new empty folder under the system's temporary folder, removed when the current test ends. */
export function temporaryFolder(prefix: string): string {
	const folder = mkdtempSync(join(tmpdir(), prefix))
	onTestFinished(function removeFolder() {
		rmSync(folder, { recursive: true, force: true })
	})
	return folder
}

/**
 * Git reads only a config of the test's own, holding `userName` when given, for the rest of the test: never the
 * machine's global nor system config. The caller restores the environment (`vi.unstubAllEnvs`).
 */
export function isolateGitConfig(params: { userName?: string } = {}): void {
	const file = join(temporaryFolder('dialecte-git-config-'), 'gitconfig')
	writeFileSync(file, params.userName ? `[user]\n\tname = ${params.userName}\n` : '')
	vi.stubEnv('GIT_CONFIG_GLOBAL', file)
	vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
}

/** A repository on `main` with one commit holding `files`, removed when the current test ends. */
export function createScratchRepository(files: Record<string, string> = {}): string {
	return initializeRepository({ root: temporaryFolder('dialecte-scratch-'), files })
}

/**
 * One repository on `main` with one commit holding `files`, shared by the cases of the file that never change it
 * (they only read it, or are refused before anything is written): made when the first case asks, removed when the
 * file's cases are done. Call it where the cases are declared; each call to the returned function gives the same
 * repository.
 */
export function createSharedScratchRepository(files: Record<string, string> = {}): () => string {
	let root: string | undefined
	afterAll(function removeSharedRepository() {
		if (root) rmSync(root, { recursive: true, force: true })
	})
	return function sharedRepository(): string {
		root ??= initializeRepository({ root: mkdtempSync(join(tmpdir(), 'dialecte-shared-')), files })
		return root
	}
}

/** A repository on `main` with one commit holding `files`, made in `root` (a folder of the test's own). */
export function initializeRepository(params: {
	root: string
	files?: Record<string, string>
}): string {
	const { root } = params
	const files = params.files ?? {}
	mkdirSync(root, { recursive: true })
	git({ root, args: ['init', '-q', '-b', 'main'] })
	git({ root, args: ['config', 'user.email', 'scratch@example.com'] })
	git({ root, args: ['config', 'user.name', 'Scratch'] })
	git({ root, args: ['config', 'commit.gpgsign', 'false'] })
	writeFiles({ root, files: { 'README.md': 'scratch\n', ...files } })
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', 'chore: start'] })
	return root
}

export function writeFiles(params: { root: string; files: Record<string, string> }): void {
	for (const [path, content] of Object.entries(params.files)) {
		mkdirSync(dirname(join(params.root, path)), { recursive: true })
		writeFileSync(join(params.root, path), content)
	}
}

/** Runs git in the repository; throws with its output when it fails. */
export function git(params: { root: string; args: string[] }): string {
	const result = spawnSync('git', params.args, { cwd: params.root, encoding: 'utf8' })
	if (result.status !== 0)
		throw new Error(`git ${params.args.join(' ')} failed: ${result.stderr}${result.stdout}`)
	return result.stdout
}
