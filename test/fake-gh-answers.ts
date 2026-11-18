/** A fake `gh` first on the PATH that answers the describe reads from a folder of saved answers; the suite never runs the real one. */
import { chmodSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { temporaryFolder } from './scratch-repository.ts'

import { vi } from 'vitest'

/**
 * Puts a `gh` first on the PATH (undone by `vi.unstubAllEnvs`) that answers from `answers`, and refuses the commands
 * whose first word is in `absent` as gh refuses an extension that is not installed.
 */
export function fakeGhAnswering(params: { answers: string; absent?: readonly string[] }): void {
	const router = fileURLToPath(new URL('./fake-gh-router.ts', import.meta.url))
	const folder = temporaryFolder('dialecte-fake-gh-answers-')
	const script = join(folder, 'gh')
	const absent = (params.absent ?? []).join(',')
	writeFileSync(
		script,
		`#!/bin/sh\nexec '${process.execPath}' '${router}' '${params.answers}' '${absent}' "$@"\n`,
	)
	chmodSync(script, 0o755)
	vi.stubEnv('PATH', `${folder}${delimiter}${process.env.PATH ?? ''}`)
}
