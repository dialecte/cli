/**
 * The packages a worktree's `package-lock.json` installs in its `node_modules` (`packages` map,
 * lockfileVersion 2 or 3): every `node_modules/` key, nested ones included, but those shipped inside their
 * parent (`inBundle`) and, when absent, those npm may leave out here (`optional`, or an `os` / `cpu` list
 * this machine does not match). A `devOptional` one is installed by a development install: checked.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { isPresent } from '../file-system.ts'
import { NODE_MODULES_PREFIX, PACKAGE_LOCK_FILE } from './worktree.constants.ts'

import type { LockfileEntry, LockfileRead } from './worktree.types.ts'

export function readLockedPackages(params: { worktree: string }): LockfileRead {
	const path = join(params.worktree, PACKAGE_LOCK_FILE)
	if (!existsSync(path)) return { notChecked: 'no lockfile' }
	let lockfile: { packages?: Record<string, LockfileEntry> }
	try {
		lockfile = JSON.parse(readFileSync(path, 'utf8')) as typeof lockfile
	} catch {
		return { notChecked: 'unreadable' }
	}
	if (typeof lockfile?.packages !== 'object' || lockfile.packages === null)
		return { notChecked: 'has no packages map' }
	return {
		packages: Object.entries(lockfile.packages)
			.filter(([key, entry]) => key.startsWith(NODE_MODULES_PREFIX) && !entry.inBundle)
			.filter(([key, entry]) => !mayBeLeftOut(entry) || isPresent(join(params.worktree, key)))
			.map(([key, entry]) => ({ key, entry })),
	}
}

/** npm may leave the package out of this machine's install. */
function mayBeLeftOut(entry: LockfileEntry): boolean {
	return (
		Boolean(entry.optional) ||
		!matchesHere({ list: entry.os, value: process.platform }) ||
		!matchesHere({ list: entry.cpu, value: process.arch })
	)
}

/** An npm `os` / `cpu` list: allowed values, `!value` excluded ones; no list or an empty one allows all. */
function matchesHere(params: { list: string[] | undefined; value: string }): boolean {
	const list = params.list ?? []
	const excluded = list.filter((item) => item.startsWith('!')).map((item) => item.slice(1))
	const allowed = list.filter((item) => !item.startsWith('!'))
	if (excluded.includes(params.value)) return false
	return allowed.length === 0 || allowed.includes(params.value)
}
