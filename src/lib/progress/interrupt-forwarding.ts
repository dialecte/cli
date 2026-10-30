/**
 * The process groups of the children running now, and the one listener per forwarded signal that stops
 * them: registered when the first group starts, removed when the last ends. On SIGINT, SIGTERM or SIGHUP
 * every live group gets the signal (SIGKILL after its grace), and once they are gone this process ends by
 * the same signal - unless something else listens for it (a rehearsal cleaning its clone), which then
 * owns the exit and can await `stopLiveGroups` first. While an interrupt is handled, no run settles or
 * starts (`isInterrupted`): the process is about to end, and a caller must not go on as if it were not.
 */
import { stopProcessTree } from './process-tree.ts'
import { FORWARDED_SIGNALS } from './progress.constants.ts'

import type { InterruptInFlight } from './run-child.types.ts'

/** Each live group (its leader's pid) and the grace it gets between the signal and SIGKILL. */
const liveGroups = new Map<number, number>()
let interrupt: InterruptInFlight | undefined
/** What runs just before this process ends by a forwarded signal (a live region left on its own line). */
const signalExitHooks = new Set<() => void>()

/** Runs `hook` just before this process ends by a forwarded signal; the answer removes it. */
export function onSignalExit(hook: () => void): () => void {
	signalExitHooks.add(hook)
	return function remove() {
		signalExitHooks.delete(hook)
	}
}

/** Watches a child's process group until the returned release is called. */
export function watchProcessGroup(params: { group: number; grace: number }): () => void {
	if (liveGroups.size === 0 && !interrupt)
		for (const signal of FORWARDED_SIGNALS) process.on(signal, forward)
	liveGroups.set(params.group, params.grace)
	return function release() {
		liveGroups.delete(params.group)
		if (liveGroups.size === 0 && !interrupt)
			for (const signal of FORWARDED_SIGNALS) process.off(signal, forward)
	}
}

/** The interrupt being handled now, if any: no run settles or starts until it is handled. */
export function isInterrupted(): InterruptInFlight | undefined {
	return interrupt
}

/** Stops every live group with `signal` and resolves once they are gone; the same run for every caller. */
export function stopLiveGroups(signal: NodeJS.Signals): Promise<void> {
	interrupt ??= {
		signal,
		handled: Promise.all(
			[...liveGroups].map(([group, grace]) =>
				stopProcessTree({ pids: [group], group, signal, grace }),
			),
		).then(() => undefined),
	}
	return interrupt.handled
}

function forward(signal: NodeJS.Signals): void {
	// read now: the listeners of this signal as it arrived, ours included
	const alone = process.listenerCount(signal) === 1
	void stopLiveGroups(signal).then(function endLikeTheSignal() {
		if (alone) {
			for (const hook of signalExitHooks) hook()
			for (const forwarded of FORWARDED_SIGNALS) process.off(forwarded, forward)
			process.kill(process.pid, signal)
			return
		}
		// a host that owns the exit and keeps running: the next interrupt is forwarded too
		interrupt = undefined
		if (liveGroups.size === 0)
			for (const forwarded of FORWARDED_SIGNALS) process.off(forwarded, forward)
	})
}
