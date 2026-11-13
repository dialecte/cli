/**
 * What the store of a repository says of its worktrees: the ones open lots keep (by real path, with the reason), and
 * the ones landed lots name (by real path, with the line that says why the lot reads committed).
 */
export type LotKeeps = {
	kept: ReadonlyMap<string, string>
	landed: ReadonlyMap<string, string>
}
