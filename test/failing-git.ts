/**
 * A `git` first on PATH that fails the one read a case names and runs the real git for every other: how a case makes
 * a git read a removal decision rests on fail, then checks the item is kept with why.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { REFUSED_READ } from './failing-git.constants.ts'
import { temporaryFolder } from './scratch-repository.ts'

import { vi } from 'vitest'

/**
 * Puts a `git` first on PATH that exits 128 with `REFUSED_READ` on its standard error when its arguments hold
 * `pattern`, and runs the real git otherwise. The caller restores the environment (`vi.unstubAllEnvs`).
 */
export function failGitReadsOf(params: { pattern: string }): void {
	const real = spawnSync('command -v git', { shell: true, encoding: 'utf8' }).stdout.trim()
	const bin = temporaryFolder('dialecte-failing-git-')
	const script = join(bin, 'git')
	writeFileSync(
		script,
		[
			'#!/bin/sh',
			'case "$*" in',
			`  *'${params.pattern}'*) echo '${REFUSED_READ}' >&2; exit 128;;`,
			'esac',
			`exec '${real}' "$@"`,
			'',
		].join('\n'),
	)
	chmodSync(script, 0o755)
	vi.stubEnv('PATH', `${bin}:${process.env.PATH ?? ''}`)
}

/** The reason a failed read keeps an item with: what, then git's error as the cli's git read words it. */
export function unreadOf(params: { what: string; args: string }): string {
	return `could not read ${params.what}: git ${params.args}: ${REFUSED_READ}`
}
