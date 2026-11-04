/** A card line as `handover --json` prints it. */
export type JsonCardLine = {
	name: string
	status: string
	detail: string
	stale?: boolean
}

/** What `handover <lots.json> --json` prints, the part the profile tests read. */
export type JsonCard = {
	folder: string
	verdict: string
	failedGates: string[]
	otherTreeGates: string[]
	profile?: string
	gates: JsonCardLine[]
	contrib?: JsonCardLine[]
}
