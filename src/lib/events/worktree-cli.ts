import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { readPackageJson } from '../package-json.ts'
import { CLI_PACKAGE } from '../skills/cli-invocations.constants.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { WorktreeCli } from './event.types.ts'

/**
 * The cli of a worktree: the installed `@dialecte/cli`, else the worktree's own package.json when it is the cli;
 * null when it holds none, undefined when the worktree folder is gone.
 */
export function worktreeCli(params: { worktree: string }): WorktreeCli | null | undefined {
	if (!existsSync(params.worktree)) return undefined
	const installed = readPackageJson(join(params.worktree, 'node_modules', CLI_PACKAGE))
	if (installed.name === CLI_PACKAGE) return capabilityOf({ manifest: installed })
	const own = readPackageJson(params.worktree)
	return own.name === CLI_PACKAGE ? capabilityOf({ manifest: own }) : null
}

/** The cli of a lot's worktree; undefined (omitted from the event) when it has none, it is gone or it does not read. */
export function worktreeCliOf(params: { worktree: string | null }): WorktreeCli | null | undefined {
	if (params.worktree === null) return undefined
	try {
		return worktreeCli({ worktree: params.worktree })
	} catch {
		return undefined
	}
}

/** A cli's version, and `stepEvents` true when its `dialecte` block declares the capability 1 or higher. */
function capabilityOf(params: { manifest: PackageJson }): WorktreeCli {
	const { version, dialecte } = params.manifest
	const stepEvents = dialecte?.stepEvents
	return {
		version: typeof version === 'string' ? version : 'unknown',
		stepEvents: typeof stepEvents === 'number' && stepEvents >= 1,
	}
}
