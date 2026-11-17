/** The open lot `lot start --on <lot>` names as the parent of a stack (33CI CI4), read through git. */
import { basename } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { tryReadGit } from '../git.ts'
import { readCheckedLotState, registryOfLotFolder } from './lot-records.ts'
import { lotState } from './lot-state.ts'
import { requiredLotOf } from './resolve-lot.ts'
import { STACK_PARENT_REFUSALS, STACKABLE_STATES } from './stack.constants.ts'

import type { StackParent } from './stack.types.ts'

/**
 * The open lot `argument` names as the parent of a lot of `repository`: its folder, name, branch and branch tip; the
 * refusal line when it names no lot, a damaged one, one no longer at work, one of another repository, or one whose
 * branch the repository does not hold.
 *
 * @intent start a lot on another open lot's branch
 * @internal
 */
export function resolveStackParent(params: {
	argument: string
	repository: string
}): StackParent | { refusal: string } {
	const { argument, repository } = params
	function fill(template: string): string {
		return template.replaceAll('{lot}', () => argument)
	}
	const required = requiredLotOf({ argument, cwd: repository, mode: 'read' })
	if (!('lot' in required)) return { refusal: fill(STACK_PARENT_REFUSALS.unknown) }
	const lotFolder = required.lot
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	if (checked === undefined || !('input' in checked))
		return { refusal: fill(STACK_PARENT_REFUSALS.damaged) }
	const { state } = lotState(checked.input)
	if (!STACKABLE_STATES.includes(state))
		return { refusal: fill(STACK_PARENT_REFUSALS.state).replace('{state}', state) }
	const { identity } = checked.input
	const own = realPathOf(repository)
	if (realPathOf(identity.repository) !== own)
		return {
			refusal: fill(STACK_PARENT_REFUSALS.repository)
				.replace('{parent}', () => identity.repository)
				.replace('{repository}', () => own),
		}
	const head = tryReadGit({
		root: repository,
		args: ['rev-parse', '--verify', '--quiet', `refs/heads/${identity.branch}^{commit}`],
	})?.trim()
	if (head === undefined || head === '')
		return {
			refusal: fill(STACK_PARENT_REFUSALS.noBranch)
				.replace('{branch}', () => identity.branch)
				.replace('{repository}', () => own),
		}
	return { lotFolder, name: basename(lotFolder), branch: identity.branch, head }
}
