import type { RiskReason } from '../src/lib/risk/risk.types.ts'

/** The time of every hand-written risk line. */
export const RISK_TEST_AT = '2026-11-13T08:00:00.000Z'

/** A destructive call on the second line of a source file. */
export const RMSYNC_REASON: RiskReason = {
	kind: 'destructive',
	file: 'src/cleanup.ts',
	line: 2,
	detail: 'rmSync',
}

/** A source file adding that call (the scratch repository of the snapshot cases holds only its manifest). */
export const CLEANUP_FILE: Record<string, string> = {
	'src/cleanup.ts': 'export function clean(target: string) {\n\trmSync(target)\n}\n',
}
