import type { RuleName } from './check-code-rules.types.ts'

/** One opt-out comment as written: where, which rules it names, why, and what is wrong with it. */
export type AllowComment = {
	/** 1-based line of the comment. */
	line: number
	/** Whether code precedes the comment on its line (the opt-out then covers that line only). */
	afterCode: boolean
	/** The 1-based line of the first token after its comment and the comments that follow it. */
	nextCodeLine: number
	/** The names written, as written. */
	rules: string[]
	reason: string
	/** What makes it malformed; undefined when it is well formed. */
	problem: string | undefined
}

/** The findings the opt-outs silenced, per rule (only rules with a count above 0). */
export type AllowedCounts = Partial<Record<RuleName, number>>
