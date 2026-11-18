/** What the throwaway proof is asked about one review-round throwaway of a lot. */
export type ThrowawayProofParameters = {
	/** The repository's main checkout (absolute): where `removableIgnored` reads copies and declarations. */
	main: string
	/** The throwaway worktree (absolute). */
	throwaway: string
	/** The branch it was made on, `<lot branch>-round-<n>`: its HEAD must still be there. */
	branch: string
	/** The lot folder holding `round-<n>/` and `round-<n>.deleted`. */
	lotFolder: string
	/** The round the throwaway holds. */
	round: number
	/**
	 * The refs or commits whose files count as kept elsewhere, in order: the lot's branch (when it exists), its landed
	 * tip, the base. One that does not resolve is skipped.
	 */
	holders: string[]
	/** The tips the lot's `landed.json` records: holders of its commits for the loss check. */
	landedTips: string[]
}

/** The proof's answer: the throwaway may go, or it is kept with the first reason that holds. */
export type ThrowawayProof = { goes: true } | { goes: false; kept: string }

/** A path's content as git would store it: its mode and blob id, or `absent` (no file, no index entry). */
export type BlobVersion = { mode: string; sha: string } | 'absent'

/** One path of the throwaway's status: untracked, or with its index differing from HEAD (staged). */
export type StatusEntry = { path: string; untracked: boolean; staged: boolean }
