import type { AcceptanceContext, CiteContext } from '../src/lib/knowledge/ask/ask.types.ts'

/** One report case: the value read, whether it is an outside report, the context it is checked against. */
export type ReportCaseParams = {
	value: unknown
	outside?: boolean
	question?: string
	cites?: CiteContext
	acceptance?: AcceptanceContext
}

/** A table row of report cases: the case and the part of the checked report it pins. */
export type ReportRow = { case: ReportCaseParams; expected: Record<string, unknown> }
