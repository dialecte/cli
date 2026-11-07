/**
 * The working folder of each process the system shows: a folder a process works in is not moved away under it.
 * Linux reads `/proc/<pid>/cwd`; elsewhere `lsof -d cwd`.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readlinkSync } from 'node:fs'
import { sep } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { PROCESS_LIST_TIMEOUT_MS } from './worktree.constants.ts'

import type { ProcessFolder } from './worktree.types.ts'

/**
 * Every process with its working folder, as far as the system tells (another user's may be left out); why not
 * when the system cannot be asked.
 */
export function listProcessFolders(): ProcessFolder[] | string {
	return process.platform === 'linux' && existsSync('/proc') ? readProc() : readLsof()
}

/** The first process whose working folder is `folder` or inside it; undefined when none. */
export function processWorkingIn(params: {
	processes: readonly ProcessFolder[]
	folder: string
}): ProcessFolder | undefined {
	const folder = realPathOf(params.folder)
	return params.processes.find(
		(entry) => entry.folder === folder || entry.folder.startsWith(`${folder}${sep}`),
	)
}

function readProc(): ProcessFolder[] {
	return readdirSync('/proc')
		.filter((name) => /^\d+$/.test(name))
		.flatMap(function folderOf(name): ProcessFolder[] {
			try {
				return [{ pid: Number(name), folder: readlinkSync(`/proc/${name}/cwd`) }]
			} catch {
				// gone meanwhile, or not ours to read
				return []
			}
		})
}

/** `lsof -d cwd -Fpn`: a `p<pid>` line, then the `n<path>` of its working folder. */
function readLsof(): ProcessFolder[] | string {
	// a stale mount can hang lsof: past the timeout nothing is known, so nothing is moved
	const answer = spawnSync('lsof', ['-d', 'cwd', '-Fpn'], {
		encoding: 'utf8',
		maxBuffer: 1e8,
		timeout: PROCESS_LIST_TIMEOUT_MS,
	})
	if (answer.error) return `lsof cannot run (${answer.error.message}): the processes are not known`
	if (answer.signal)
		return `lsof stopped by ${answer.signal} after ${PROCESS_LIST_TIMEOUT_MS} ms: the processes are not known`
	const processes: ProcessFolder[] = []
	let pid: number | undefined
	for (const line of (answer.stdout ?? '').split('\n')) {
		if (line.startsWith('p')) pid = Number(line.slice(1))
		else if (line.startsWith('n') && pid !== undefined)
			processes.push({ pid, folder: line.slice(1) })
	}
	return processes
}
