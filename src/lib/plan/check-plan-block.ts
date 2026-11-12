/**
 * The repositories of a lot block checked from files, no git process: each a git main checkout read by its own
 * `.git` folder, and no two names for one common folder.
 */
import { join } from 'node:path'

import { isFolder, isPresent } from '../file-system.ts'
import { locateStore } from '../store/store-folder.ts'
import { COMMON_FOLDER_FILE, COMMON_FOLDER_FOLDERS, GIT_ENTRY } from '../store/store.constants.ts'

import type { PlanBlock, PlanFault } from './plan-block.types.ts'

/**
 * The faults of the block's repositories, read from files: each a git main checkout, no two names one common
 * folder, a nested checkout read by its own `.git`.
 */
export function checkPlanRepositories(params: {
	block: Pick<PlanBlock, 'repositories'>
}): PlanFault[] {
	const firstNameOfCommon = new Map<string, string>()
	const faults: PlanFault[] = []
	for (const [name, path] of Object.entries(params.block.repositories)) {
		const at = `repositories.${name}`
		const common = commonFolderOf({ path })
		const first = 'common' in common ? firstNameOfCommon.get(common.common) : undefined
		if ('fault' in common) faults.push({ at, detail: common.fault })
		else if (first !== undefined)
			faults.push({
				at,
				detail: `${path} is the repository ${first} already (one common folder ${common.common}): name it once`,
			})
		else firstNameOfCommon.set(common.common, name)
	}
	return faults
}

/** The common folder of a main checkout, or why `path` is none. */
function commonFolderOf(params: { path: string }): { common: string } | { fault: string } {
	const fault = mainCheckoutFaultOf(params)
	if (fault !== undefined) return { fault }
	const common = locateStore({ from: params.path })?.common
	return common === undefined ? { fault: `${params.path} is not a git main checkout` } : { common }
}

/**
 * Why `path` is no git main checkout, from its own `.git` (a folder holding `HEAD`, `objects/`, `refs/`; a `.git`
 * file is a linked worktree's); undefined when it is one. A folder above it holding a `.git` does not count.
 */
export function mainCheckoutFaultOf(params: { path: string }): string | undefined {
	const { path } = params
	if (!isPresent(path)) return `${path} is missing: not a git main checkout`
	if (!isFolder(path)) return `${path} is not a folder: not a git main checkout`
	const git = join(path, GIT_ENTRY)
	if (!isPresent(git)) return `${path} holds no ${GIT_ENTRY} of its own: not a git main checkout`
	if (!isFolder(git))
		return `${path} holds a ${GIT_ENTRY} file (a linked worktree): not a git main checkout, name the main checkout`
	const missing = [
		...(isPresent(join(git, COMMON_FOLDER_FILE)) && !isFolder(join(git, COMMON_FOLDER_FILE))
			? []
			: [COMMON_FOLDER_FILE]),
		...COMMON_FOLDER_FOLDERS.filter((folder) => !isFolder(join(git, folder))).map(
			(folder) => `${folder}/`,
		),
	]
	if (missing.length > 0) return `${git} lacks ${missing.join(', ')}: not a git main checkout`
	return undefined
}
