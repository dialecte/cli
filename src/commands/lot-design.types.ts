import type { LotStateName } from '../lib/store/store.types.ts'

/** What `lot design` was asked: record a file or the plan's spec, approve, waive, or print the standing. */
export type DesignRequest =
	| { kind: 'record'; file: string | undefined }
	| { kind: 'approve'; by: string; reason?: string }
	| { kind: 'waive'; by: string; reason: string }
	| { kind: 'show' }

/** The lot `lot design` acts on: its full name, folder, state and repository. */
export type DesignLotPlace = {
	lot: string
	lotFolder: string
	state: LotStateName
	repository: string
}
