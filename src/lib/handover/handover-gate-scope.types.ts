import type { HandoverBase, UsedGateBase } from '../gate/gate-base.types.ts'

/** What a hand-over run knows of its package's gate before its guards, computed once for the whole run. */
export type HandoverGateScope = {
	/** The test steps `gate --hook` runs hold a scoped step: the hook records fold the base each hook printed. */
	scoped: boolean
	/**
	 * The hand-over base: the base branch's merge-base with the lots file's HEAD (else the empty tree), what the
	 * rehearsal plan and the card read records against; absent when no gate list holds a scoped step.
	 */
	base?: UsedGateBase
	/**
	 * The base handed to every hook with the real path of the hand-over folder: the merge-base of the lots file's
	 * HEAD and the base branch; absent without a scoped full step, or without a base branch (the hook then finds
	 * none either).
	 */
	handoverBase?: HandoverBase
}
