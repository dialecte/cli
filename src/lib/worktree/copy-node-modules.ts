/**
 * A copy of a checkout's `node_modules` for another checkout of the same repository: copy-on-write where
 * the file system offers it (`cp -c` on macOS, `--reflink=auto` elsewhere), else a plain copy; never a
 * symlink to the original. Links stay links: one that pointed outside `node_modules` by a relative path
 * (a local build of a sibling package) points to the same place again from the new folder.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { realPathOf } from '../file-system.ts'

import type { CopyRun, NodeModulesCopy } from './worktree.types.ts'

export function copyNodeModules(params: {
	from: string
	to: string
	/** Runs `cp` with these arguments (the tests stand in for it). */
	runCopy?: (args: string[]) => CopyRun
}): NodeModulesCopy {
	const { from, to } = params
	const runCopy = params.runCopy ?? runCp
	const attempts: { method: NodeModulesCopy['method']; args: string[] }[] = [
		process.platform === 'darwin'
			? { method: 'copy-on-write', args: ['-cR', from, to] }
			: { method: 'copy-on-write', args: ['-R', '--reflink=auto', from, to] },
		{ method: 'copy', args: ['-R', from, to] },
	]
	for (const attempt of attempts) {
		const result = runCopy(attempt.args)
		if (result.signal) {
			// interrupted (Ctrl-C): stop there, a plain copy would only start again
			rmSync(to, { recursive: true, force: true })
			throw new Error(`copying ${from} was interrupted (${result.signal})`)
		}
		if (result.status === 0) {
			const relinked = relinkEscapingLinks({ from, to })
			return { method: attempt.method, relinked }
		}
		rmSync(to, { recursive: true, force: true })
	}
	throw new Error(`cannot copy ${from} to ${to}`)
}

function runCp(args: string[]): CopyRun {
	const result = spawnSync('cp', args, { encoding: 'utf8' })
	return { status: result.status, signal: result.signal }
}

/**
 * Packages (`name` and `@scope/name`) of `to` (a copy of `from`, or `from` renamed) linked by a relative path
 * that leaves the checkout holding `from` (a sibling repository): re-pointed absolute to where the link reached
 * from `from`. A link into the checkout itself (an npm workspace package) stays relative.
 */
export function relinkEscapingLinks(params: {
	from: string
	to: string
	/**
	 * Re-point to the real path the link reaches, through any link on the way (a rehearsal's sibling links,
	 * unlinked before its `node_modules` is parked); default: the path as resolved.
	 */
	real?: boolean
}): string[] {
	const relinked: string[] = []
	for (const entry of packageEntries(params.to)) {
		const copy = join(params.to, entry)
		if (!lstatSync(copy).isSymbolicLink()) continue
		const target = readlinkSync(copy)
		if (isAbsolute(target)) continue
		const resolved = resolve(dirname(join(params.from, entry)), target)
		// inside node_modules, or inside its own checkout (an npm workspace package): it reaches the same
		// package from wherever node_modules lands in a checkout of the repository
		if (!relative(dirname(params.from), resolved).startsWith('..')) continue
		rmSync(copy, { force: true })
		symlinkSync(params.real ? realPathOf(resolved) : resolved, copy)
		relinked.push(entry)
	}
	return relinked
}

function packageEntries(folder: string): string[] {
	if (!existsSync(folder)) return []
	return readdirSync(folder).flatMap(function entriesOf(name) {
		if (!name.startsWith('@')) return [name]
		const scope = join(folder, name)
		if (lstatSync(scope).isSymbolicLink()) return [name]
		return readdirSync(scope).map((inner) => `${name}/${inner}`)
	})
}
