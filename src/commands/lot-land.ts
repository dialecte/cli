/**
 * `dialecte lot land <id> [--draft]`: the store lot's branch landed through its pull request (`landLot`): rebased onto
 * origin's base branch when behind, pushed, its pull request opened or reused, queued (a draft never), the landing
 * recorded in the lot's folder for `lot close`.
 */
import { basename } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { hasFlag, positionalArguments } from '../lib/config.ts'
import { findBaseBranchRef } from '../lib/gate/gate-base.ts'
import { isAncestorCommit, mainCheckoutOf } from '../lib/git.ts'
import { landLot } from '../lib/handover/land-lot.ts'
import { createGithubHost } from '../lib/host/github-host.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { textOf } from '../lib/print/print.ts'
import { readIdentity } from '../lib/store/identity.ts'
import { readCheckedLotState, registryOfLotFolder } from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { requiredLotOf } from '../lib/store/resolve-lot.ts'
import { LOT_LAND_LINES } from './lot-land.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { HostAdapter } from '../lib/host/host.types.ts'

export function runLotLand(params: {
	cwd: string
	argv: string[]
	/** Where lots land; default: GitHub through `gh`. */
	host?: HostAdapter
	now?: Date
}): CommandResult {
	const ids = positionalArguments({ argv: params.argv, valueOptions: [] })
	if (ids.length !== 1) return { exitCode: 2, output: renderLotUsage() }
	const required = requiredLotOf({ argument: ids[0], cwd: params.cwd, mode: 'write' })
	if (!('lot' in required)) return { exitCode: 2, output: textOf(required.lines) }
	const lot = basename(required.lot)
	// only a lot still at work lands: committed, canceled or failed is refused before any git step
	const checked = readCheckedLotState({
		lotFolder: required.lot,
		registry: registryOfLotFolder(required.lot),
	})
	if (checked === undefined || !('input' in checked))
		return { exitCode: 1, output: textOf([LOT_LAND_LINES.damaged.replaceAll('{lot}', () => lot)]) }
	const { state } = lotState(checked.input)
	if (state !== 'working' && state !== 'ready')
		return {
			exitCode: 1,
			output: textOf([
				LOT_LAND_LINES.notLandable.replace('{lot}', () => lot).replace('{state}', state),
			]),
		}
	const identity = readIdentity({ lotFolder: required.lot })
	if (identity === undefined || identity.worktree === null)
		return {
			exitCode: 2,
			output: textOf([LOT_LAND_LINES.noWorktree.replace('{lot}', () => ids[0])]),
		}
	const main = mainCheckoutOf(identity.worktree)
	const base = findBaseBranchRef({ root: main, packageJson: readPackageJson(main) })
	if ('refusal' in base) return { exitCode: 1, output: textOf([`lot land: ${base.refusal}`]) }
	// a lot cut from another lot lands as a stack (33CI CI4): never rebased onto the base branch with its parent's
	// commits. Cut from the base is a cut commit the base holds, however the brief named it (a branch, a sha): a child
	// whose parent merged without a squash lands alone; after a squash merge it still carries the parent's commits
	if (!isAncestorCommit({ root: main, ancestor: identity.base.commit, descendant: base.ref }))
		return {
			exitCode: 1,
			output: textOf([
				LOT_LAND_LINES.stacked
					.replace('{lot}', () => ids[0])
					.replace('{from}', () => identity.base.ref)
					.replace('{commit}', () => identity.base.commit.slice(0, 12))
					.replace('{base}', () => base.branch),
			]),
		}
	const landed = landLot({
		lot,
		worktree: identity.worktree,
		branch: identity.branch,
		base: base.branch,
		lotFolder: required.lot,
		host: params.host ?? createGithubHost(),
		draft: hasFlag(params.argv, 'draft'),
		now: params.now ?? new Date(),
	})
	return { exitCode: landed.exitCode, output: textOf(landed.lines) }
}
