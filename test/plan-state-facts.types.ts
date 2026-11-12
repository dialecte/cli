import type { RegistryFact, StoreLotFact, WorktreeFact } from '../src/lib/plan/plan.types.ts'

/** What a readable repository of the tests holds; every part defaults to empty. */
export type ReadableParams = {
	caseInsensitive?: boolean
	storeLots?: StoreLotFact[]
	registry?: RegistryFact[]
	worktrees?: WorktreeFact[]
}

/** A repository of the tests: its facts (`ReadableParams`) or the reason it cannot be read. */
export type RepositorySpec = ReadableParams | string
