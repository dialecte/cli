import type { Effort, RiskClass, RiskEffortLine, RiskReason } from '../lib/risk/risk.types.ts'

/** What a read of `lot risk` answers; the JSON form prints it as is. */
export type LotRiskReading = {
	/** The class derived now, else the last derived line's; null when neither is there (unknown). */
	class: RiskClass | null
	reasons: RiskReason[]
	effort: Effort | null
	/** The effort's class is below the highest of the class and the last effort line's class. */
	below: boolean
	/** The rounds the next snapshot allows. */
	cap: number
}

/** The options of a `lot risk --effort` write, checked. */
export type LotRiskEffortOptions = {
	effort: Effort
	class?: RiskClass
	by: string
	reason?: string
}

/**
 * A read, the class its effort is compared to (the line `! effort <e> below risk class <c>` names it) and the
 * `! risk class not derived: <reason>` line of a derivation that could not run.
 */
export type LotRiskAnswer = {
	reading: LotRiskReading
	comparedClass: RiskClass | undefined
	/** The last effort line: its reason is the go-ahead the below line names. */
	effortLine: RiskEffortLine | undefined
	warning: string | undefined
}
