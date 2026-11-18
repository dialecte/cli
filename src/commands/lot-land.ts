/**
 * `dialecte lot land <id>`: the store lot's branch landed through its pull request (`landLot`): rebased onto origin's
 * base branch when behind, pushed, its pull request opened or reused as a draft and never queued (`lot approve`
 * queues it), the landing recorded in the lot's folder for `lot close`. `--draft`, from when lot land queued, is
 * refused naming the change.
 */
import { basename } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { hasFlag, positionalArguments } from '../lib/config.ts'
import { findBaseBranchRef } from '../lib/gate/gate-base.ts'
import { isAncestorCommit, mainCheckoutOf } from '../lib/git.ts'
import { landLot } from '../lib/handover/land-lot.ts'
import { createHost } from '../lib/host/select-host.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { textOf } from '../lib/print/print.ts'
import { readIdentity } from '../lib/store/identity.ts'
import { readCheckedLotState, registryOfLotFolder } from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { requiredLotOf } from '../lib/store/resolve-lot.ts'
import { readStack } from '../lib/store/stack.ts'
import { LOT_LAND_LINES } from './lot-land.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { HostAdapter } from '../lib/host/host.types.ts'

export function runLotLand(params: {
	cwd: string
	argv: string[]
	/** Where lots land; default: the repository's host. */
	host?: HostAdapter
	now?: Date
}): CommandResult {
	if (hasFlag(params.argv, 'draft'))
		return { exitCode: 2, output: textOf([LOT_LAND_LINES.draftGone]) }
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
	// a lot cut from another lot lands only as a stack (33CI CI4): started with --on, its stack.json says on what;
	// never rebased onto the base branch with its parent's commits. Cut from the base is a cut commit the base holds,
	// however the brief named it (a branch, a sha)
	if (
		readStack({ lotFolder: required.lot }) === undefined &&
		!isAncestorCommit({ root: main, ancestor: identity.base.commit, descendant: base.ref })
	)
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
		host: params.host ?? createHost(),
		now: params.now ?? new Date(),
	})
	return { exitCode: landed.exitCode, output: textOf(landed.lines) }
}
