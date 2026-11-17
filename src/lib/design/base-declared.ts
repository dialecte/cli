/**
 * The shared areas a lot's base declares, read through git (DESIGN-GATE section 1, review round 1): `lot start` records
 * them in the lot folder (`base-declared.json`; a landing refreshes them from DG2 on), so the views, which start no
 * process, read the base's areas from that snapshot; the paths that may refuse read the base through git, as the risk
 * class does.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { readCommitOrNone } from '../git.ts'
import { readBaseDeclaredHigh } from '../risk/derive-lot-risk-class.ts'
import { readIdentity } from '../store/identity.ts'
import { recordText, replaceWhole } from '../store/publish.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { viewDeclaredHighOf } from './declared-sources.ts'
import { BASE_DECLARED_SCHEMA } from './design.constants.ts'

/**
 * Records the areas `ref`'s `package.json` declares (in the repository at `root`) as the lot's base snapshot, written
 * whole; nothing when `ref` names no commit there.
 *
 * @intent keep the base's shared areas where a view can read them without git
 * @internal
 */
export function recordBaseDeclared(params: { lotFolder: string; root: string; ref: string }): void {
	const commit = readCommitOrNone({ root: params.root, ref: params.ref })
	if (commit === undefined) return
	replaceWhole({
		path: join(params.lotFolder, STORE_FILES.baseDeclared),
		text: recordText({
			schema: BASE_DECLARED_SCHEMA,
			ref: params.ref,
			commit,
			globs: readBaseDeclaredHigh({ root: params.root, base: commit }),
		}),
	})
}

/**
 * The areas a lot is held to where a refusal may follow (`lot design`, and the gates): its views' areas and its base's
 * as git reads them, the source of its risk class, so the need and the risk class never disagree.
 *
 * @intent read the shared areas a lot is held to, through git, for a verb that may refuse
 * @internal
 */
export function gitDeclaredHighOf(params: { lotFolder: string }): string[] {
	const identity = readIdentity(params)
	const view = viewDeclaredHighOf(params)
	if (identity === undefined) return view
	const { worktree } = identity
	const root = worktree !== null && existsSync(worktree) ? worktree : identity.repository
	return [...new Set([...view, ...readBaseDeclaredHigh({ root, base: identity.base.commit })])]
}
