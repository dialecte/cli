import { posix, win32 } from 'node:path'

import { PERSONAL_CONFIG_FILE_NAME } from './config.constants.ts'
import { personalConfigFolderOf } from './personal-config-folder-of.ts'

/** The personal `config.yml` of a machine: `config.yml` in `personalConfigFolderOf` (D8). */
export function personalConfigFileOf(params: {
	environment: Readonly<Record<string, string | undefined>>
	platform: NodeJS.Platform
	home: string
}): string {
	const join = params.platform === 'win32' ? win32.join : posix.join
	return join(personalConfigFolderOf(params), PERSONAL_CONFIG_FILE_NAME)
}
