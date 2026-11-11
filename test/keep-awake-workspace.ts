/** Search paths for the tests of the keep-awake hold: folders holding a stand-in `caffeinate`, never a real one. */
import { chmodSync } from 'node:fs'
import { delimiter, join } from 'node:path'

import {
	CAFFEINATE_NAME,
	EXECUTABLE_MODE,
	NOOP_PROGRAM,
	NOT_EXECUTABLE_MODE,
} from './keep-awake-workspace.constants.ts'
import { temporaryFolder, writeFiles } from './scratch-repository.ts'

/** A folder holding a file named `caffeinate`, executable or not. */
export function folderHoldingCaffeinate(params: { executable: boolean }): string {
	const folder = temporaryFolder('dialecte-caffeinate-')
	writeFiles({ root: folder, files: { [CAFFEINATE_NAME]: NOOP_PROGRAM } })
	chmodSync(
		join(folder, CAFFEINATE_NAME),
		params.executable ? EXECUTABLE_MODE : NOT_EXECUTABLE_MODE,
	)
	return folder
}

/** A folder holding nothing. */
export function emptyFolder(): string {
	return temporaryFolder('dialecte-no-caffeinate-')
}

/** A search path of these folders, in order. */
export function searchPathOf(folders: readonly string[]): string {
	return folders.join(delimiter)
}
