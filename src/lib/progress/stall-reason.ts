/** Why a runner stopped a stalled child: `stalled: no output, no CPU for 10 m 0 s`. */
import { formatDuration } from './format-duration.ts'
import { STALL_AFTER_MILLISECONDS } from './progress.constants.ts'

import type { Watchdog } from './run-child.types.ts'

export function stallReason(params: { watchdog: Watchdog | undefined }): string {
	return `stalled: no output, no CPU for ${formatDuration(params.watchdog?.stallAfter ?? STALL_AFTER_MILLISECONDS)}`
}
