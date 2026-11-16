import type {
	GivenSlice,
	OutsideCite,
	OutsideSource,
	ReportVerdict,
} from '../src/lib/knowledge/ask/ask.types.ts'

/** What `documentAcceptedOf` takes: the reader's letter and whatever else of its accepted report the case pins. */
export type DocumentAcceptedOfParams = {
	letter: string
	verdict?: ReportVerdict
	value?: string | null
	answer?: string
	/** The lines of its one verified cite (12 to 13 unless said). */
	lines?: { from: number; to: number }
	/** The clause of the slice the cite came from ('1' unless said). */
	clause?: string | null
	/** The slice its cite was checked against (the baseline direct slice unless said). */
	given?: GivenSlice
	/** The file of its cite (the baseline file unless said). */
	file?: string
	/** A second cite of the claim that was refused, on these lines (none unless said). */
	refusedCiteLines?: { from: number; to: number }
	polarityConflict?: boolean
}

/** What `outsideAcceptedOf` takes: the reader's letter and whatever else of its accepted outside report the case pins. */
export type OutsideAcceptedOfParams = {
	letter: string
	verdict?: ReportVerdict
	value?: string | null
	answer?: string
	source?: OutsideSource
	cites?: OutsideCite[]
	notKnown?: boolean
	/** Whether its one claim was found to contradict the question's wording (false unless said). */
	polarityConflict?: boolean
}
