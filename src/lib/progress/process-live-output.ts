/**
 * The live output of this process's standard output: its open live region is closed (left on its own
 * line) when the process exits, also when it ends by an interrupt it forwarded to a child.
 */
import { onSignalExit } from './interrupt-forwarding.ts'
import { createStreamLiveOutput } from './stream-live-output.ts'

import type { LiveOutput } from './step-progress.types.ts'

export function openProcessLiveOutput(): LiveOutput {
	const live = createStreamLiveOutput(process.stdout)
	function close(): void {
		live.close?.()
	}
	process.once('exit', close)
	onSignalExit(close)
	return live
}
