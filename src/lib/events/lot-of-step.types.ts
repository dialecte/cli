/**
 * The lot a step's folder belongs to: its own lot (with `throwaway` true for a review throwaway of that lot), or
 * `foreign` when the folder claims a lot whose identity holds another worktree. `worktree` is the real path of the
 * worktree holding the folder.
 */
export type LotOfStep =
	| { lot: string; worktree: string; throwaway: boolean }
	| { foreign: string; worktree: string }
