/**
 * A worktree's `node_modules` read against its `package-lock.json`: every locked package installed at its
 * version, every link reaching what the lockfile resolves it to.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { shellQuote } from '../shell-quote.ts'
import { readLockedPackages } from './locked-packages.ts'
import { NODE_MODULES_PREFIX, PACKAGE_LOCK_FILE } from './worktree.constants.ts'

import type { LockedPackage, NodeModulesCheck, NodeModulesProblem } from './worktree.types.ts'

/** sha256 (hex) of the worktree's `package-lock.json`; undefined without one. */
export function lockHashOf(worktree: string): string | undefined {
	const lockfile = join(worktree, PACKAGE_LOCK_FILE)
	if (!existsSync(lockfile)) return undefined
	return createHash('sha256').update(readFileSync(lockfile)).digest('hex')
}

export function checkNodeModules(params: { worktree: string }): NodeModulesCheck {
	const { worktree } = params
	const read = readLockedPackages({ worktree })
	if ('notChecked' in read)
		return read.notChecked === 'no lockfile'
			? { lockfile: undefined, problems: [] }
			: { lockfile: PACKAGE_LOCK_FILE, notChecked: read.notChecked, problems: [] }
	const problems = read.packages.flatMap(function check(locked): NodeModulesProblem[] {
		const problem = problemOf({ worktree, locked })
		return problem === undefined ? [] : [{ package: packageName(locked.key), problem }]
	})
	return {
		lockfile: PACKAGE_LOCK_FILE,
		problems,
		...(problems.length > 0 && { command: `cd ${shellQuote(worktree)} && npm ci` }),
	}
}

/** What differs from the lockfile, or undefined when the package is installed as locked. */
function problemOf(params: { worktree: string; locked: LockedPackage }): string | undefined {
	const { key, entry } = params.locked
	const installed = join(params.worktree, key)
	if (entry.link) {
		const resolved = entry.resolved ?? ''
		const target = resolve(params.worktree, resolved)
		if (!existsSync(installed) || !existsSync(target)) return `link to ${resolved} missing`
		return realpathSync(installed) === realpathSync(target)
			? undefined
			: `link to ${resolved} points elsewhere`
	}
	const manifest = join(installed, 'package.json')
	if (!existsSync(manifest)) return 'missing'
	let version: string | undefined
	try {
		version = (JSON.parse(readFileSync(manifest, 'utf8')) as { version?: string }).version
	} catch {
		return 'package.json unreadable'
	}
	if (entry.version === undefined || version === entry.version) return undefined
	return `${version ?? '(no version)'} installed, lock ${entry.version}`
}

/** `node_modules/a/node_modules/b` → `b (under a)`; deeper parents joined by ` > `. */
function packageName(key: string): string {
	const names = key.slice(NODE_MODULES_PREFIX.length).split(`/${NODE_MODULES_PREFIX}`)
	const name = names.at(-1) ?? key
	return names.length > 1 ? `${name} (under ${names.slice(0, -1).join(' > ')})` : name
}
