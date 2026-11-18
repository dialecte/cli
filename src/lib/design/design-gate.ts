/**
 * The design gate (DESIGN-GATE section 3, DG2): one refusal for every verb that holds a lot to its design - `tdd red`,
 * the commit hook, `lot land`, `handover write`, `lot approve`. It takes the lot base its run resolved (one base per
 * run) and reads the base's shared areas through git, as the risk class does; the paths are the caller's (the scope,
 * the staged or landed paths) and every path the change touches since the base.
 */
import { existsSync } from 'node:fs'
import { basename } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { readIdentity } from '../store/identity.ts'
import { lotOfWorktree } from '../store/resolve-lot.ts'
import { workTreeHolding } from '../store/store-folder.ts'
import { changedTestCodeOf } from '../tdd/test-code-presence.ts'
import { gitDeclaredHighOf } from './base-declared.ts'
import { designNextOf, designStateWithReasons } from './design-line.ts'
import { lotDesignStandingOf } from './design-standing.ts'
import {
	DESIGN_GATE_NO_WORKTREE,
	DESIGN_GATE_REFUSAL,
	DESIGN_GATE_VERBS,
	DESIGN_GATE_WORKTREE_NONE,
	DESIGN_PASSING_STATES,
} from './design.constants.ts'

import type { DesignGate, DesignGateVerb, DesignStanding } from './design.types.ts'

/**
 * The real path of the folder of the lot whose own worktree holds `cwd`; undefined outside one, a review throwaway
 * included.
 *
 * @intent find the lot a refusing verb runs in
 * @internal
 */
export function ownLotFolderOf(params: { cwd: string }): string | undefined {
	const lotFolder = lotOfWorktree(params)
	if (lotFolder === undefined) return undefined
	const worktree = readIdentity({ lotFolder })?.worktree
	const own = workTreeHolding({ from: params.cwd })
	if (worktree === null || worktree === undefined || own === undefined) return undefined
	return realPathOf(worktree) === realPathOf(own) ? realPathOf(lotFolder) : undefined
}

/**
 * The lot's design standing at `base` and the refusal of `verb` when it does not let the lot go on: held to the shared
 * areas of the views and of `base` read through git, over the scope, `paths` and every path changed since `base` in
 * the worktree `root`. A worktree that is gone is refused: every refusing path reads its base there.
 *
 * @intent refuse a verb of a lot whose required design is missing, unapproved or stale
 * @internal
 */
export function designGateOf(params: {
	lotFolder: string
	/** The lot's worktree; null for a lot that has none (a refusal). */
	root: string | null
	base: string
	paths?: readonly string[]
	/** The paths changed since `base`, when the run read them already (tdd's presence map); read here otherwise. */
	touched?: readonly string[]
	verb: DesignGateVerb
}): DesignGate {
	const { lotFolder, root, base, verb } = params
	const lot = basename(lotFolder)
	const { name, nothing } = DESIGN_GATE_VERBS[verb]
	if (root === null || !existsSync(root)) {
		const standing = lotDesignStandingOf({ lotFolder, declaredHigh: [] })
		return {
			standing,
			refusal: fillMessage({
				template: root === null ? DESIGN_GATE_WORKTREE_NONE : DESIGN_GATE_NO_WORKTREE,
				values: { verb: name, lot, root: root ?? '', nothing },
			}),
		}
	}
	const touched = params.touched ?? [...changedTestCodeOf({ root, base }).paths.keys()]
	const standing = lotDesignStandingOf({
		lotFolder,
		declaredHigh: gitDeclaredHighOf({ lotFolder, root, base }),
		paths: [...touched, ...(params.paths ?? [])],
	})
	if (DESIGN_PASSING_STATES.includes(standing.state)) return { standing }
	return { standing, refusal: refusalOf({ standing, lot, name, nothing }) }
}

/** The refusal line of a standing that does not let the lot go on. */
function refusalOf(params: {
	standing: DesignStanding
	lot: string
	name: string
	nothing: string
}): string {
	const { standing, lot } = params
	return fillMessage({
		template: DESIGN_GATE_REFUSAL,
		values: {
			verb: params.name,
			lot,
			state: designStateWithReasons(standing),
			next: designNextOf({ standing, lot }) ?? '',
			nothing: params.nothing,
		},
	})
}
