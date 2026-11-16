import type {
	AskSubjectTerms,
	GivenSlice,
	ReportVerdict,
} from '../src/lib/knowledge/ask/ask.types.ts'

/** One claim case: the claim's text, the verdict it backs, the cited quote and what the claim is checked against. */
export type ClaimCaseParams = {
	text: string
	quote: string
	supports?: ReportVerdict
	verdict?: ReportVerdict
	/** The report's value: the condition of a `depends` verdict (none unless said). */
	value?: string | null
	question?: string
	subject?: AskSubjectTerms
	slice?: GivenSlice
}

/** A table row of claim cases: the case and the part of the checked claim it pins. */
export type ClaimRow = { case: ClaimCaseParams; expected: Record<string, unknown> }
