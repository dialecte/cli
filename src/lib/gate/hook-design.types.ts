/** The lot a commit belongs to, found by its branch: a store lot, or a review throwaway of one. */
export type HookLot = { kind: 'lot'; lotFolder: string } | { kind: 'throwaway' }
