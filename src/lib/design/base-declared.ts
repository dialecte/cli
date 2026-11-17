/**
 * The shared areas a lot's base declares, read through git (DESIGN-GATE section 1, review round 1): `lot start` records
 * them in the lot folder (`base-declared.json`; a landing refreshes them from DG2 on), so the views, which start no
 * process, read the base's areas from that snapshot; the paths that may refuse read the base through git, as the risk
 * class does.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { readCommitOrNone } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { readPackageJson } from '../package-json.ts'
import { readBaseDeclaredHigh } from '../risk/derive-lot-risk-class.ts'
import { readIdentity } from '../store/identity.ts'
import { recordText, replaceWhole } from '../store/publish.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { resolveTddBase } from '../tdd/tdd-base.ts'
import { viewDeclaredHighOf } from './declared-sources.ts'
import { BASE_DECLARED_SCHEMA, RECORDED_BASE_NOTE } from './design.constants.ts'

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
 * The areas a lot is held to where a refusal may follow: its views' areas and those `base` declares, read through git
 * in the worktree `root` - the base the run resolved (`resolveTddBase`, the lot base the risk class, tdd and the hook
 * read), so the need and the risk class never disagree.
 *
 * @intent read the shared areas a lot is held to, through git, for a verb that may refuse
 * @internal
 */
export function gitDeclaredHighOf(params: {
	lotFolder: string
	root: string
	base: string
}): string[] {
	return [
		...new Set([
			...viewDeclaredHighOf(params),
			...readBaseDeclaredHigh({ root: params.root, base: params.base }),
		]),
	]
}

/**
 * The areas `lot design`, `lot forecast` and the pull request hold a lot to: through git at its lot base when its
 * worktree is there; else at the base recorded at its start, with a note saying so (a pruned worktree is no reason
 * to stop reading the lot).
 *
 * @intent read the shared areas of a lot for a verb that runs outside its worktree
 * @internal
 */
export function lotGitDeclaredHighOf(params: { lotFolder: string }): {
	globs: string[]
	note?: string
} {
	const identity = readIdentity(params)
	if (identity === undefined) return { globs: viewDeclaredHighOf(params) }
	const { worktree } = identity
	if (worktree !== null && existsSync(worktree)) {
		const base = resolveTddBase({ root: worktree, packageJson: readPackageJson(worktree) })
		if (!('failure' in base))
			return { globs: gitDeclaredHighOf({ ...params, root: worktree, base: base.commit }) }
	}
	return {
		globs: gitDeclaredHighOf({
			...params,
			root: identity.repository,
			base: identity.base.commit,
		}),
		note: fillMessage({
			template: RECORDED_BASE_NOTE,
			values: { commit: identity.base.commit.slice(0, SHORT_SHA_LENGTH) },
		}),
	}
}
