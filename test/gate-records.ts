/** Reads what `dialecte gate` and `dialecte rules` record in a scratch repository's git folder. */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { git } from './scratch-repository.ts'

/** Where git keeps `name` for the worktree at `root` (its own git folder in a linked worktree). */
export function gitPathOf(params: { root: string; name: string }): string {
	return resolve(
		params.root,
		git({ root: params.root, args: ['rev-parse', '--git-path', params.name] }).trim(),
	)
}

/** The record `name` as the last run left it, parsed; undefined when there is none. */
export function readRecordFile<Parsed>(params: { root: string; name: string }): Parsed | undefined {
	const path = gitPathOf(params)
	return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Parsed) : undefined
}

/**
 * Every record of the repository's store keyed on another lock (`lockHash`), as a cli that keyed the installed lock
 * left them: a record no run on today's trees answers from.
 */
export function rekeyStoredLocks(params: { root: string; lockHash: string }): void {
	const common = git({
		root: params.root,
		args: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
	}).trim()
	const store = join(common, 'dialecte-checks')
	for (const file of readdirSync(store)) {
		const path = join(store, file)
		const records = JSON.parse(readFileSync(path, 'utf8')) as { key?: { lockHash: string } }[]
		for (const record of records) if (record.key) record.key.lockHash = params.lockHash
		writeFileSync(path, `${JSON.stringify(records, null, 2)}\n`)
	}
}
