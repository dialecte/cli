import { SCOPE_GUARD_NAME } from '../store/scope-guard.constants.ts'

/** The hook's scope step (`hook-scope.ts`), as its line names it. */
export const SCOPE_STEP = { name: SCOPE_GUARD_NAME, run: '' } as const

/** The texts of the hook's scope step: `{count}` a number of paths, `{state}` a lot's state. */
export const HOOK_SCOPE_TEXTS = {
	passed: '{count} path(s) inside the scope',
	/** Added to the passed line when no base branch is found and none is configured: only the staged delta is held. */
	heldAgainstHead: ', held against HEAD: no base branch',
	throwaway: "a review throwaway: its round's fixes are held when they reach the lot's branch",
	terminal: 'a {state} lot: terminal, nothing lands from it',
	simulated: 'a simulated lot: it holds no scope',
	firstCommit: 'a first commit: no lot base to hold the work against',
	merge: "a merge commit: the base's own paths are not the lot's; the next commit is held",
} as const
