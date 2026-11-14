import { readStandardRoot } from '../../standard/read-standard-root.ts'
import { fillMessage } from '../standard/fill-message.ts'
import { readStandardInput } from '../standard/read-standard-input.ts'
import { INPUT_MESSAGES } from '../standard/standard-input.constants.ts'
import { NAME_SEPARATOR, STANDARD_SELECTION_MESSAGES } from './ask.constants.ts'
import { standardKeyOf } from './standard-key-of.ts'

import type { SelectStandardParams, StandardSelection } from './ask.types.ts'

/**
 * The documents an ask reads (D13): the one folder whose id has the key of the dialecte's standard name (every
 * folder when the dialecte declares none), none with the line to print when `DIALECTE_STANDARD` holds no folder of
 * that key or is not set, or a refusal naming two folders of one key or a damaged root.
 *
 * @intent select the standard folders an ask reads for a dialecte, refuse two folders with one key
 */
export function selectStandard(params: SelectStandardParams): StandardSelection {
	const { environment, standardName } = params
	const name = standardName ?? null
	const key = standardName === undefined ? null : standardKeyOf(standardName)
	const root = readStandardRoot({ environment })
	if (root === undefined) return { kind: 'none', name, key, line: null, known: [] }
	const input = readStandardInput({ environment })
	if (input.kind === 'refused') {
		const empty = fillMessage({ template: INPUT_MESSAGES.noStandard, values: { path: root } })
		if (input.message === empty) return { kind: 'none', name, key, line: empty, known: [] }
		return { refused: input.message }
	}
	const { known } = input.input
	if (key === null || name === null) return { kind: 'documents', folderIds: known, name, key }
	const matching = known.filter((id) => standardKeyOf(id) === key)
	const [only, ...others] = matching
	if (only === undefined)
		return {
			kind: 'none',
			name,
			key,
			line: fillMessage({
				template: STANDARD_SELECTION_MESSAGES.noFolder,
				values: { name, key, ids: known.join(NAME_SEPARATOR) },
			}),
			known,
		}
	if (others.length > 0)
		return {
			refused: fillMessage({
				template: STANDARD_SELECTION_MESSAGES.sameKey,
				values: { root, key, name, ids: matching.join(NAME_SEPARATOR) },
			}),
		}
	return { kind: 'documents', folderIds: [only], name, key }
}
