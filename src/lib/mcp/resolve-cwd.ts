import { statSync } from 'node:fs'
import { resolve } from 'node:path'

import type { McpResolvedCwd } from './mcp.types.ts'

/** The folder a call reads: its `cwd` (relative to the server's), else the server's; it must be a folder. */
export function resolveCwd(params: { cwd: unknown; serverCwd: string }): McpResolvedCwd {
	const cwd =
		params.cwd === undefined ? params.serverCwd : resolve(params.serverCwd, String(params.cwd))
	let isFolder = false
	try {
		isFolder = statSync(cwd).isDirectory()
	} catch {
		isFolder = false
	}
	return isFolder
		? { kind: 'folder', cwd }
		: {
				kind: 'error',
				message: `cwd ${cwd} is not an existing folder: give the folder of your package`,
			}
}
