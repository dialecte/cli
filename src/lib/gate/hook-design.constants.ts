/** The texts of the hook's design step (`hook-design.ts`). */

/** The hook's design step, as its line names it. */
export const DESIGN_STEP = { name: 'design', run: '' } as const

export const HOOK_DESIGN_TEXTS = {
	firstCommit: 'a first commit: no lot base to read a design against',
	merge: "a merge commit: its lots' designs were held on their branches",
	noProduction: 'no production path in the commit',
} as const
