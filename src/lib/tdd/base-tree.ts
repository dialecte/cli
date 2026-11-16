/**
 * The package's tree at the base, written into a scratch folder outside the worktree for a run there (a
 * collect of the base's cases, a revised case run on the base's production): nothing of the worktree is
 * touched.
 */
import { spawn } from 'node:child_process'
import { existsSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { ChildProcess } from 'node:child_process'

/**
 * Writes the package's tree at the base into `folder` (`git archive`), and links the `node_modules` the
 * package resolves from, so the base files import what they imported; why it could not, or undefined.
 */
export async function copyBaseTree(params: {
	root: string
	base: string
	folder: string
}): Promise<string | undefined> {
	// streamed from git into tar: nothing buffered, the event loop (and the running line) stays live
	const archive = spawn('git', ['archive', '--format=tar', `${params.base}:./`], {
		cwd: params.root,
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	const extract = spawn('tar', ['-x', '-C', params.folder], { stdio: ['pipe', 'ignore', 'pipe'] })
	// a broken pipe (tar gone early, git failing to start) answers through the exit codes, never as a crash
	let pipeError = ''
	function notePipeError(error: Error): void {
		pipeError ||= error.message
	}
	archive.stdout.on('error', notePipeError)
	extract.stdin.on('error', notePipeError)
	archive.stdout.pipe(extract.stdin)
	const [archived, extracted] = await Promise.all([
		endOf({ child: archive }),
		endOf({ child: extract }),
	])
	if (archived.code !== 0) return `git archive failed: ${archived.errors.trim()}`
	if (extracted.code !== 0 || pipeError)
		return `tar failed: ${[extracted.errors.trim(), pipeError].filter(Boolean).join('; ')}`
	const modules = nearestNodeModules(params.root)
	if (modules) symlinkSync(modules, join(params.folder, 'node_modules'))
	return undefined
}

/** How a child ended: its exit code (undefined when it could not start) and what it printed on stderr. */
function endOf(params: {
	child: ChildProcess
}): Promise<{ code: number | null | undefined; errors: string }> {
	return new Promise(function settle(resolve) {
		let errors = ''
		params.child.stderr?.on('data', (chunk: Buffer) => {
			errors += chunk.toString()
		})
		params.child.on('error', (error) => resolve({ code: undefined, errors: error.message }))
		params.child.on('close', (code) => resolve({ code, errors }))
	})
}

/** The `node_modules` folder the package resolves its packages from: its own, else the nearest above it. */
function nearestNodeModules(root: string): string | undefined {
	for (let folder = root; ; folder = dirname(folder)) {
		const candidate = join(folder, 'node_modules')
		if (existsSync(candidate)) return candidate
		if (dirname(folder) === folder) return undefined
	}
}
