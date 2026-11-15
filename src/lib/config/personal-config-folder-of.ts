import { posix, win32 } from 'node:path'

import { PERSONAL_CONFIG_FOLDER_NAME } from './config.constants.ts'

/**
 * The personal Dialecte folder of a machine (D8): `$XDG_CONFIG_HOME/dialecte` when set and not empty, else
 * `%APPDATA%\dialecte` on win32 (`<home>\AppData\Roaming` without APPDATA), else `<home>/.config/dialecte`.
 * Joined with the platform's own separators, whatever machine runs it.
 */
export function personalConfigFolderOf(params: {
	environment: Readonly<Record<string, string | undefined>>
	platform: NodeJS.Platform
	home: string
}): string {
	const xdg = params.environment.XDG_CONFIG_HOME
	if (params.platform === 'win32') {
		const appData = params.environment.APPDATA
		const base = xdg || appData || win32.join(params.home, 'AppData', 'Roaming')
		return win32.join(base, PERSONAL_CONFIG_FOLDER_NAME)
	}
	return posix.join(xdg || posix.join(params.home, '.config'), PERSONAL_CONFIG_FOLDER_NAME)
}
