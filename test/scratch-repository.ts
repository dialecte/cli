/** A throwaway git repository for the tests of the commands that read or guard one. */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { onTestFinished } from 'vitest'

/** A new empty folder under the system's temporary folder, removed when the current test ends. */
export function temporaryFolder(prefix: string): string {
	const folder = mkdtempSync(join(tmpdir(), prefix))
	onTestFinished(function removeFolder() {
		rmSync(folder, { recursive: true, force: true })
	})
	return folder
}

/** A repository on `main` with one commit holding `files`, removed when the current test ends. */
export function createScratchRepository(files: Record<string, string> = {}): string {
	const root = temporaryFolder('dialecte-scratch-')
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
