import type { StartWorkspace } from './lot-start-workspace.types.ts'

/** A case of the overlap check's one re-read: the lot it meets, what the pause does, what the start answers. */
export type PauseRow = {
	title: string
	/** Writes the lot the brief's scope meets, returning its folder. */
	lot: (start: StartWorkspace) => string
	/** Whether the pause seam removes the marker (the run took it back). */
	removeMarker: boolean
	/** The start checked: a dry run, or a simulated one (its findings go to `wouldRefuse`). */
	run?: 'dry-run' | 'simulate'
	exitCode: number
	pauses: number[]
	/** The rules in `wouldRefuse` of a simulated start. */
	findings?: string[]
}
