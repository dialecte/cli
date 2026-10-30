/**
 * The machine's view of a child's process tree, for the stall watchdog: one `ps` call lists every process,
 * the tree is the root, its process group and their descendants (a grandchild re-parented once its parent
 * exited stays in the group). A stopped tree is signalled through its group and each pid, children first,
 * then waited for: SIGKILL to what is left after the grace, and a last wait for them to be gone.
 */
import { spawnSync } from 'node:child_process'

import { isProcessAlive } from '../process-alive.ts'
import { formatDuration } from './format-duration.ts'
import {
	KILL_GRACE_MILLISECONDS,
	KILL_POLL_MILLISECONDS,
	PROCESS_LINE_PATTERN,
	PROCESS_LIST_ARGUMENTS,
	PROCESS_LIST_TIMEOUT_MILLISECONDS,
} from './progress.constants.ts'

import type { ProcessSample } from './run-child.types.ts'

/**
 * The root, every process of its group (the child runs as a group leader) and every descendant, parents
 * before their children; undefined when the listing fails or times out (no verdict on this sample).
 */
export function sampleProcessTree(params: {
	rootPid: number
	lister?: {
		/** Default: `ps`. */
		command?: string
		/** Default: every process with pid, parent, group, state, CPU time and command. */
		args?: readonly string[]
		/** The listing is given up (undefined, no verdict) after this long. Default: a constant. */
		timeoutMilliseconds?: number
	}
}): ProcessSample[] | undefined {
	const { rootPid, lister } = params
	const listing = spawnSync(
		lister?.command ?? 'ps',
		[...(lister?.args ?? PROCESS_LIST_ARGUMENTS)],
		{
			encoding: 'utf8',
			maxBuffer: 1e8,
			timeout: lister?.timeoutMilliseconds ?? PROCESS_LIST_TIMEOUT_MILLISECONDS,
			killSignal: 'SIGKILL',
		},
	)
	if (listing.error || listing.status !== 0) return undefined
	const processes = new Map<number, ProcessSample>()
	const childrenOf = new Map<number, number[]>()
	const group: number[] = []
	for (const line of listing.stdout.split('\n')) {
		const match = PROCESS_LINE_PATTERN.exec(line)
		if (!match) continue
		const [, pid, parentPid, groupId, state, cpuTime, command] = match
		processes.set(Number(pid), {
			pid: Number(pid),
			state: state.charAt(0),
			cpuMilliseconds: parseCpuTime(cpuTime),
			command,
		})
		childrenOf.set(Number(parentPid), [...(childrenOf.get(Number(parentPid)) ?? []), Number(pid)])
		if (Number(groupId) === rootPid) group.push(Number(pid))
	}
	const tree: ProcessSample[] = []
	const seen = new Set<number>()
	const queue = [rootPid, ...group]
	for (let pid = queue.shift(); pid !== undefined; pid = queue.shift()) {
		const sample = processes.get(pid)
		if (!sample || seen.has(pid)) continue
		seen.add(pid)
		tree.push(sample)
		queue.push(...(childrenOf.get(pid) ?? []))
	}
	return tree
}

/**
 * Stops the process group `group` and every pid (the order given reversed: children first) with `signal`,
 * waits up to `grace` for them to be gone, SIGKILLs what is left, and waits again: it resolves once they
 * are gone or the second wait ran out.
 */
export async function stopProcessTree(params: {
	pids: readonly number[]
	group: number
	signal?: NodeJS.Signals
	grace?: number
}): Promise<void> {
	const grace = params.grace ?? KILL_GRACE_MILLISECONDS
	const childrenFirst = [...params.pids].reverse()
	signalAll({ pids: childrenFirst, group: params.group, name: params.signal ?? 'SIGTERM' })
	// a stopped process only acts on the signal once it runs again
	signalAll({ pids: childrenFirst, group: params.group, name: 'SIGCONT' })
	if (await waitUntilGone({ pids: childrenFirst, group: params.group, within: grace })) return
	signalAll({ pids: childrenFirst, group: params.group, name: 'SIGKILL' })
	await waitUntilGone({ pids: childrenFirst, group: params.group, within: grace })
}

/** One line per process: pid, state, CPU time, command. */
export function formatProcessTree(processes: readonly ProcessSample[]): string {
	return processes
		.map(
			(sample) =>
				`  ${sample.pid} ${sample.state} ${formatDuration(sample.cpuMilliseconds)} ${sample.command}`,
		)
		.join('\n')
}

/** `ps` CPU time: macOS `12:34.56` (minutes, seconds), Linux `[dd-]hh:mm:ss`. */
function parseCpuTime(text: string): number {
	const [days, clock] = text.includes('-') ? text.split('-') : ['0', text]
	const parts = clock.split(':').map(Number).reverse()
	const [seconds = 0, minutes = 0, hours = 0] = parts
	return Math.round(((Number(days) * 24 + hours) * 3600 + minutes * 60 + seconds) * 1000)
}

/** Whether every pid and the group are gone by `within` milliseconds from now. */
async function waitUntilGone(params: {
	pids: readonly number[]
	group: number
	within: number
}): Promise<boolean> {
	const giveUpAt = Date.now() + params.within
	for (;;) {
		if (!isGroupAlive(params.group) && !params.pids.some(isProcessAlive)) return true
		if (Date.now() >= giveUpAt) return false
		await new Promise((resolve) => setTimeout(resolve, KILL_POLL_MILLISECONDS))
	}
}

function isGroupAlive(group: number): boolean {
	try {
		process.kill(-group, 0)
		return true
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM'
	}
}

function signalAll(params: { pids: readonly number[]; group: number; name: NodeJS.Signals }): void {
	for (const target of [-params.group, ...params.pids]) {
		try {
			process.kill(target, params.name)
		} catch {
			// already gone
		}
	}
}
