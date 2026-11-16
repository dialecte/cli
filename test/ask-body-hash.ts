/** The hash of a report's canonical body, as an accepted entry of a verdict and an acceptance context keep it. */
import { createHash } from 'node:crypto'

import { reportBodyOf } from '../src/lib/knowledge/ask/report-body-of.ts'

import type { ReportBodyOfParams } from '../src/lib/knowledge/ask/ask.types.ts'

/** The sha256 (hex) of a report's canonical body. */
export function bodyHashOf(params: ReportBodyOfParams): string {
	return createHash('sha256').update(reportBodyOf(params)).digest('hex')
}
