/**
 * What a rehearsal clone does around each lot it commits, so the commit and its hook see exactly that lot's tree;
 * `number` counts the lots from 1.
 */
export type CloneLotTree = {
	/** Before lot `number` is staged: the files of every later lot back as the clone's index holds them. */
	prepareLot: (params: { number: number }) => void
	/** After lot `number` is committed: the files of every later lot back as the repository's working tree has them then. */
	afterLot: (params: { number: number }) => void
	/**
	 * Once the commits stopped (all made, or a lot refused): every lot's files as the repository's working tree has
	 * them, so the card reads the files of the lots not committed.
	 */
	restoreLots: () => void
}
