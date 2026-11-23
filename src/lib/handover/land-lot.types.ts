/** What `lot land` answers: its exit code and the lines it prints, in order. */
export type LandingResult = { exitCode: number; lines: string[] }

/** The landing record (`landing.json` in the lot's store folder). */
export type LandingRecord = {
	schema: number
	number: number
	url: string
	branch: string
	/** The tip pushed for the change request. */
	head: string
	at: string
}
