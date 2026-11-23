import type { DesignStatusJson, VerdictStandingState } from '../lib/design/design.types.ts'
import type { LotStateName } from '../lib/store/store.types.ts'

/** What `lot design` was asked: record a file or the plan's spec, approve, waive, or print the standing. */
export type DesignRequest =
	| { kind: 'record'; file: string | undefined }
	| { kind: 'approve'; by: string; reason?: string; verdicts: string[] }
	| { kind: 'waive'; by: string; reason: string }
	| { kind: 'show' }

/** The lot `lot design` acts on: its full name, folder, state and repository. */
export type DesignLotPlace = {
	lot: string
	lotFolder: string
	state: LotStateName
	repository: string
}

/** The reviews of a design not approved as `lot design --json` gives them: their state and the files that decide it. */
export type DesignVerdictJson = { state: VerdictStandingState; files: string[] }

/** `lot design --json`: the standing, and the reviews while the design is not approved (null otherwise). */
export type DesignShowJson = DesignStatusJson & { verdict: DesignVerdictJson | null }

/** Where `lot design` reads files from: its folder, and the shared temporary folders a file is refused (or skipped) in. */
export type DesignFileRoots = { cwd: string; sharedTemporaryRoots: readonly string[] }
