/**
 * The hook logs a `handover run` leaves on purpose (`dialecte-hook-<random>/lot-<n>.log`, under the system's
 * temporary folder, named by a `full log: <path>` line): the test that triggers the run removes them.
 */
import { rmSync } from 'node:fs'
import { basename, dirname } from 'node:path'

import { HOOK_LOG_FOLDER_PREFIX } from '../src/lib/handover/handover.constants.ts'

import { onTestFinished } from 'vitest'

/**
 * When the current test ends (passed or failed), removes each hook log folder a `full log: <path>` line of
 * `lines` names; `lines` is read then, so it may still grow while the test runs.
 */
export function removeHookLogs(params: { lines: readonly string[] }): void {
	onTestFinished(function removeHookLogFolders() {
		for (const folder of hookLogFoldersIn({ text: params.lines.join('\n') }))
			rmSync(folder, { recursive: true, force: true })
	})
}

/** The hook log folders the `full log: <path>` lines of `text` name. */
function hookLogFoldersIn(params: { text: string }): string[] {
	return [...params.text.matchAll(/full log: (\/\S+)/g)]
		.map((match) => dirname(match[1]))
		.filter((folder) => basename(folder).startsWith(HOOK_LOG_FOLDER_PREFIX))
}
