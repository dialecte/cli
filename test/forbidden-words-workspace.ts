/**
 * A machine of the test's own for the forbidden words: a git config, a home folder and a config folder in
 * scratch folders, never the host's. The caller restores the environment (`vi.unstubAllEnvs`).
 */
import { chmodSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import {
	FIRST_WORD,
	HOME_CONFIG_FOLDER,
	HOME_VARIABLE,
	UNREADABLE_MODE,
	USER_FILE_PATH,
	XDG_VARIABLE,
} from './forbidden-words-workspace.constants.ts'
import { isolateGitConfig, temporaryFolder, writeFiles } from './scratch-repository.ts'

import { vi } from 'vitest'

import type { ConfigureMachineParams, ConfiguredWords } from './forbidden-words-workspace.types.ts'

/**
 * Points git at an empty config and the environment at scratch folders: `userFileLines` become the user file (none
 * when undefined); `configHome: 'unset'` leaves `XDG_CONFIG_HOME` unset, so the file is read under the home's
 * `.config`. The scratch git config is isolated; the caller sets `dialecte.forbiddenWords` in its repository.
 */
export function configureMachine(params: ConfigureMachineParams = {}): ConfiguredWords {
	isolateGitConfig()
	const home = temporaryFolder('dialecte-home-')
	vi.stubEnv(HOME_VARIABLE, home)
	const unset = params.configHome === 'unset'
	const configHome = unset ? undefined : temporaryFolder('dialecte-config-')
	vi.stubEnv(XDG_VARIABLE, configHome)
	const folder = configHome ?? join(home, HOME_CONFIG_FOLDER)
	const userFile = join(folder, USER_FILE_PATH)
	if (params.userFileLines !== undefined)
		writeFiles({
			root: folder,
			files: { [USER_FILE_PATH]: `${params.userFileLines.join('\n')}\n` },
		})
	// a list in the home's .config that XDG_CONFIG_HOME, when set, makes unread
	if (params.homeFileLines !== undefined)
		writeFiles({
			root: join(home, HOME_CONFIG_FOLDER),
			files: { [USER_FILE_PATH]: `${params.homeFileLines.join('\n')}\n` },
		})
	if (params.userFileBroken === 'directory') mkdirSync(userFile, { recursive: true })
	if (params.userFileBroken === 'unreadable') {
		writeFiles({ root: folder, files: { [USER_FILE_PATH]: `${FIRST_WORD}\n` } })
		chmodSync(userFile, UNREADABLE_MODE)
	}
	return { home, ...(configHome && { configHome }), userFile }
}

/** A source file's text holding `word` on its second line. */
export function textHolding(word: string): string {
	return `export {}\n// ${word} shipped here\n`
}
