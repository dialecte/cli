/** The texts of the hook's design step (`hook-design.ts`). */

/** The hook's design step, as its line names it. */
export const DESIGN_STEP = { name: 'design', run: '' } as const

export const HOOK_DESIGN_TEXTS = {
	firstCommit: 'a first commit: no lot base to read a design against',
	merge: "a merge commit: its lots' designs were held on their branches",
	noProduction: 'no production path in the commit',
	throwaway: "a review throwaway: its round's fixes are held when they reach the lot's branch",
} as const

/** Between a lot's branch and a review round's number, in a throwaway's branch (`<lot branch>-round-<n>`). */
export const THROWAWAY_BRANCH_INFIX = '-round-'

/** A review round's number, as a throwaway's branch ends with it. */
export const ROUND_NUMBER_PATTERN = /^\d+$/
