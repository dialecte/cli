/** How a scenario's head count stands against its base count. */
export type GrowthVerdict = 'over' | 'within' | 'shrunk' | 'new' | 'gone'

/** One row of the verdict: a version's scenario, its two counts (one missing for `new` and `gone`) and the verdict. */
export type GrowthRow = {
	version: string
	scenario: string
	/** The base's instantiations; none for a `new` row. */
	base?: number
	/** The head's instantiations; none for a `gone` row. */
	head?: number
	verdict: GrowthVerdict
}
