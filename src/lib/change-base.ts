/**
 * The base a change is measured from, one precedence for `rules` and `bench`: `--base` (its merge-base with HEAD),
 * else the base the caller was handed, else the one order with its line.
 */
import { NO_BASE_LINE } from './change-base.constants.ts'
import { resolveFlagBase } from './gate/gate-base.ts'
import { readBaseWithLine } from './rules/lot-base.ts'

import type { ChangeBaseAnswer } from './change-base.types.ts'

/**
 * 1. `ref` (`--base`): its merge-base with HEAD, else the commit it names (`resolveFlagBase`), source `flag`, no line;
 *    a ref naming nothing is refused;
 * 2. `handed` (an empty value is none): that value as given, source `handed`, no line;
 * 3. the order (`readBaseWithLine`, asked as `emptyTreeRequest` says): its commit and line without a caller's prefix,
 *    `unreadable` with the line naming why, or `noBase`.
 */
// dialecte-allow duplicate-read: the precedence over the readers it calls (resolveFlagBase, readBaseWithLine), not another reader
export function resolveChangeBase(params: {
	root: string
	ref?: string
	handed?: string
	emptyTreeRequest: boolean
}): ChangeBaseAnswer {
	const { root } = params
	if (params.ref !== undefined) {
		const flag = resolveFlagBase({ root, ref: params.ref, head: 'HEAD' })
		return 'refusal' in flag ? { refusal: flag.refusal } : { id: flag.commit, source: 'flag' }
	}
	if (params.handed) return { id: params.handed, source: 'handed' }
	const read = readBaseWithLine({ root, emptyTreeRequest: params.emptyTreeRequest })
	if (read === undefined) return { noBase: NO_BASE_LINE }
	if (!('base' in read) || read.base === undefined) return { unreadable: read.line }
	return { id: read.base, source: 'order', line: read.line }
}
