import type { LotIdentity } from '../store/store.types.ts'

/**
 * The route a lot's change request takes, read offline from its stack record: alone, stacked on its parent (whose
 * identity names the branch it merges into), or why it cannot be decided.
 */
export type StackRoute =
	| { route: 'single' }
	| { route: 'stacked'; parent: string; identity: LotIdentity }
	| { refusal: string }
