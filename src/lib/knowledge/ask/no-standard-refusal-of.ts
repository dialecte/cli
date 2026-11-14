import { fillMessage } from '../standard/fill-message.ts'
import { NAME_SEPARATOR, NO_STANDARD_WITH_DOCUMENTS } from './ask.constants.ts'
import { isReadableFolder, selectedFoldersOf } from './selected-folders-of.ts'

import type { NoStandardRefusalOfParams } from './ask.types.ts'

/**
 * The refusal of `--no-standard` (D14, rev 10) read from the selection and the folders' files, before any index is
 * built: the folders the index load would read are readable for the dialecte, so outside readers may not run;
 * undefined when it would read none (the outside route, as with no documents). A folder the root cannot read is
 * refused as the index load would refuse it.
 */
export function noStandardRefusalOf(params: NoStandardRefusalOfParams): string | undefined {
	const { environment, selection } = params
	if (selection.kind === 'none') return undefined
	const selected = selectedFoldersOf({ environment, standardIds: selection.folderIds })
	if (selected.kind === 'refused') return selected.message
	const readable = selected.folders.filter((folder) => isReadableFolder({ folder }))
	if (readable.length === 0) return undefined
	return fillMessage({
		template: NO_STANDARD_WITH_DOCUMENTS,
		values: { folders: readable.map((folder) => folder.id).join(NAME_SEPARATOR) },
	})
}
