/**
 * The tree of the fix-3 `ask` tests: a project that depends on core only (no dialecte package), with the state,
 * data and cache folders of the test and, when given, a root of documents.
 */
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { CORE_ONLY_PACKAGE } from './ask-fix-3.constants.ts'
import { coreEntries } from './real-core.ts'
import { createStandardWorkspace } from './standard-workspace.ts'

import { vi } from 'vitest'

import type { AskCommandWorkspace } from './ask-command-workspace.types.ts'

/** A workspace whose project holds core and nothing else; its environment gives every `XDG_*` explicitly. */
export function createCoreOnlyWorkspace(): AskCommandWorkspace {
	const workspace = createStandardWorkspace()
	const state = join(workspace.base, 'state')
	const data = join(workspace.base, 'data')
	vi.stubEnv('XDG_STATE_HOME', join(workspace.base, 'decoy-state'))
	vi.stubEnv('XDG_DATA_HOME', join(workspace.base, 'decoy-data'))
	writeFileSync(
		join(workspace.cwd, 'package.json'),
		JSON.stringify({ name: 'app', dependencies: { [CORE_ONLY_PACKAGE]: '1' } }),
	)
	mkdirSync(join(workspace.cwd, 'node_modules/@dialecte'), { recursive: true })
	symlinkSync(coreEntries().folder, join(workspace.cwd, 'node_modules/@dialecte/core'), 'dir')
	return {
		...workspace,
		state,
		data,
		environment: { ...workspace.environment, XDG_STATE_HOME: state, XDG_DATA_HOME: data },
	}
}
