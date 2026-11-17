/**
 * The shared areas a lot is held to as its views read them, from files only, no process (DESIGN-GATE section 1, review
 * round 1): the base snapshot `lot start` records, the repository's main checkout's `package.json` and
 * the lot's worktree's, each glob once. Neither a worktree edit nor a main checkout behind the base narrows them.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { readDeclaredHigh } from '../risk/declared-high.ts'
import { readIdentity } from '../store/identity.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { BASE_DECLARED_SCHEMA } from './design.constants.ts'

/**
 * The areas a view holds a lot to: its base snapshot, its main checkout's and its worktree's.
 *
 * @intent read the shared areas a lot is held to without starting a process
 * @internal
 */
export function viewDeclaredHighOf(params: { lotFolder: string }): string[] {
	const identity = readIdentity(params)
	const snapshot = readBaseSnapshot(params)
	if (identity === undefined) return snapshot
	const { worktree } = identity
	const roots = [
		identity.repository,
		...(worktree !== null && existsSync(worktree) ? [worktree] : []),
	]
	return [
		...new Set([
			...snapshot,
			...roots.flatMap(function declaredOf(root) {
				return readDeclaredHigh({ root })
			}),
		]),
	]
}

/** The globs of the lot folder's base snapshot; none without it or when it does not read. */
function readBaseSnapshot(params: { lotFolder: string }): string[] {
	const file = join(params.lotFolder, STORE_FILES.baseDeclared)
	if (!existsSync(file)) return []
	try {
		const value = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
		if (value.schema !== BASE_DECLARED_SCHEMA || !Array.isArray(value.globs)) return []
		return value.globs.filter(isText)
	} catch {
		return []
	}
}

/** Whether a glob of the snapshot is a string (a file edited by hand may hold anything). */
function isText(value: unknown): value is string {
	return typeof value === 'string'
}
