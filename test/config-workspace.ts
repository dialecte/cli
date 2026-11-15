/** A scratch repository with an optional origin, `.dialecterc`, personal `config.yml` (under a temporary XDG folder), old homes (package.json, dialecte.json, git keys, forbidden-words). */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { WORKSPACE_ORIGIN_SSH } from './config-workspace.constants.ts'
import {
	createScratchRepository,
	git,
	initializeRepository,
	temporaryFolder,
} from './scratch-repository.ts'

import type { ConfigWorkspace } from './config-workspace.types.ts'

/** `origin` defaults to the ssh form of the scratch origin, `null` for no remote; a text left out writes no file. */
export function createConfigWorkspace(
	params: {
		origin?: string | null
		project?: string
		personal?: string
		/** The repository's folder name inside its temporary folder (a mixed-case one makes case folding visible). */
		rootName?: string
		/** The text of `<root>/package.json`. */
		packageJson?: string
		/** The text of `<root>/dialecte.json`. */
		dialecteJson?: string
		/** Local git config keys of the repository (`dialecte.editor` -> `zed`), set with `git config`. */
		gitConfig?: Record<string, string>
		/** The text of `forbidden-words` in the personal folder, beside `config.yml`. */
		forbiddenWords?: string
	} = {},
): ConfigWorkspace {
	const root =
		params.rootName === undefined
			? createScratchRepository()
			: initializeRepository({ root: join(temporaryFolder('dialecte-scratch-'), params.rootName) })
	const origin = params.origin === undefined ? WORKSPACE_ORIGIN_SSH : params.origin
	if (origin !== null) git({ root, args: ['remote', 'add', 'origin', origin] })
	const configHome = temporaryFolder('dialecte-config-home-')
	const projectFile = join(root, '.dialecterc')
	const personalFile = join(configHome, 'dialecte', 'config.yml')
	if (params.project !== undefined) writeFileSync(projectFile, params.project)
	if (params.personal !== undefined) {
		mkdirSync(join(configHome, 'dialecte'), { recursive: true })
		writeFileSync(personalFile, params.personal)
	}
	const packageJsonFile = join(root, 'package.json')
	const dialecteJsonFile = join(root, 'dialecte.json')
	const forbiddenWordsFile = join(configHome, 'dialecte', 'forbidden-words')
	if (params.packageJson !== undefined) writeFileSync(packageJsonFile, params.packageJson)
	if (params.dialecteJson !== undefined) writeFileSync(dialecteJsonFile, params.dialecteJson)
	for (const [key, value] of Object.entries(params.gitConfig ?? {}))
		git({ root, args: ['config', '--local', key, value] })
	if (params.forbiddenWords !== undefined) {
		mkdirSync(join(configHome, 'dialecte'), { recursive: true })
		writeFileSync(forbiddenWordsFile, params.forbiddenWords)
	}
	return {
		root,
		home: temporaryFolder('dialecte-home-'),
		environment: { XDG_CONFIG_HOME: configHome },
		projectFile,
		personalFile,
		packageJsonFile,
		dialecteJsonFile,
		forbiddenWordsFile,
	}
}
