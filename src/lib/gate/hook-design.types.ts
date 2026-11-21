import type { CheckedLotState } from '../store/store.types.ts'

/**
 * The lot a commit belongs to, found by its branch: a store lot with its records read once (`readCheckedLotState`:
 * its state, or why it is damaged; undefined when nothing is at its folder), or a review throwaway of one.
 */
export type HookLot =
	| { kind: 'lot'; lotFolder: string; checked: CheckedLotState | undefined }
	| { kind: 'throwaway' }
