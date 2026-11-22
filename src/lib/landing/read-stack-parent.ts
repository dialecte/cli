/** The lot a stacked lot was started on, as the lot base reads it: its branch and landing state. */
import { dirname, join } from 'node:path'

import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { readStack } from '../store/stack.ts'
import { STACK_PARENT_UNREADABLE, STACK_RECORD_DAMAGED } from './lot-landing.constants.ts'
import { readLotLanding } from './lot-landing.ts'

import type { StackParent } from './lot-base.types.ts'

/**
 * The stack parent of the lot in `lotFolder` (`stack.json`), its branch and its landing state through the one lot
 * reader (`root` the lot's worktree; its landed fact first, else git; never the host): merged only when proven;
 * undefined for a lot not stacked; refused when its stack record is damaged or its parent's records cannot be read,
 * never read as a lot not stacked (which would take in its parent's commits).
 *
 * @intent read where a stacked lot's base comes from
 * @internal
 */
export function readStackParent(params: {
	lotFolder: string
	root: string
}): StackParent | { refusal: string } | undefined {
	const stack = readStack({ lotFolder: params.lotFolder })
	if (stack === undefined) return undefined
	if ('damage' in stack)
		return {
			refusal: fillMessage({ template: STACK_RECORD_DAMAGED, values: { reason: stack.damage } }),
		}
	const parent = readLotLanding({
		lotFolder: join(dirname(params.lotFolder), stack.parent),
		root: params.root,
	})
	if ('refusal' in parent)
		return {
			refusal: fillMessage({
				template: STACK_PARENT_UNREADABLE,
				values: { parent: stack.parent, reason: parent.refusal },
			}),
		}
	return { branch: parent.identity.branch, landing: parent.state }
}
