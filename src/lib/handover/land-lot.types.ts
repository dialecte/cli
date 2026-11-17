/** What `lot land` answers: its exit code and the lines it prints, in order. */
export type LandingResult = { exitCode: number; lines: string[] }

/** The landing record (`landing.json` in the lot's store folder). */
export type LandingRecord = {
	schema: number
	number: number
	url: string
	branch: string
	/** The tip pushed for the pull request. */
	head: string
	/** The heads the rebases of the lot's landings replaced, oldest first: their commits landed as rebased ones. */
	replaced: string[]
	at: string
}
