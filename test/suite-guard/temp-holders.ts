/**
 * The processes still holding a leftover of the suite's temporary folder when the guard looks: their working
 * folder or an open file lies in it. Read from /proc on Linux (CI), from `lsof` elsewhere; none when neither can
 * answer. Evidence for the guard's message, never a reason to pass.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { join, sep } from 'node:path'

import {
	LEFTOVER_HOLDERS_NAMED,
	LSOF_TIMEOUT_MILLISECONDS,
	PROCESS_FOLDER,
} from './temp-leftovers.constants.ts'

/** `<pid> <command line>` of the first processes holding `path`, by pid. */
export function holdersOf(params: { path: string }): string[] {
	const holders = existsSync(PROCESS_FOLDER)
		? holdersFromProcesses({ path: params.path })
		: holdersFromLsof({ path: params.path })
	return holders.slice(0, LEFTOVER_HOLDERS_NAMED)
}

/** `path` itself or a path inside it. */
function isWithin(params: { target: string; path: string }): boolean {
	return params.target === params.path || params.target.startsWith(`${params.path}${sep}`)
}

/** The target of `link`, or none when it is gone or not ours to read. */
function readLink(link: string): string[] {
	try {
		return [readlinkSync(link)]
	} catch {
		return []
	}
}

/** The links of one process: its working folder and its open files; none when it is gone or not ours to read. */
function linksOf(pid: string): string[] {
	const cwd = readLink(join(PROCESS_FOLDER, pid, 'cwd'))
	try {
		const descriptors = join(PROCESS_FOLDER, pid, 'fd')
		return [...cwd, ...readdirSync(descriptors).flatMap((fd) => readLink(join(descriptors, fd)))]
	} catch {
		return cwd
	}
}

/** The command line of a process, its words joined by spaces; `?` when it cannot be read. */
function commandOf(pid: string): string {
	try {
		return readFileSync(join(PROCESS_FOLDER, pid, 'cmdline'), 'utf8')
			.split('\0')
			.join(' ')
			.trim()
	} catch {
		return '?'
	}
}

function holdersFromProcesses(params: { path: string }): string[] {
	return readdirSync(PROCESS_FOLDER)
		.filter((name) => /^\d+$/.test(name) && name !== String(process.pid))
		.sort((left, right) => Number(left) - Number(right))
		.filter((pid) => linksOf(pid).some((target) => isWithin({ target, path: params.path })))
		.map((pid) => `${pid} ${commandOf(pid)}`)
}

/**
 * `lsof -F pc +D <path>`: one `p<pid>` line, then its `c<command>` line, per process; what it printed before a timeout
 * or a failure, none when it printed nothing.
 */
function holdersFromLsof(params: { path: string }): string[] {
	const run = spawnSync('lsof', ['-n', '-F', 'pc', '+D', params.path], {
		encoding: 'utf8',
		timeout: LSOF_TIMEOUT_MILLISECONDS,
	})
	const lines = (typeof run.stdout === 'string' ? run.stdout : '').split('\n')
	return lines.flatMap(function holderAt(line, index) {
		if (!line.startsWith('p') || line.slice(1) === String(process.pid)) return []
		const next = lines[index + 1] ?? ''
		return [`${line.slice(1)} ${next.startsWith('c') ? next.slice(1) : '?'}`]
	})
}
