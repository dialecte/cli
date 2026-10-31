/** Reads what `dialecte gate` and `dialecte rules` record in a scratch repository's git folder. */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
