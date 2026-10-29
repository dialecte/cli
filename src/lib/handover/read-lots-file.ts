/** A lots file as an agent writes it, checked for its shape. */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

import { HEAD_PATTERN } from './handover.constants.ts'

import type { LotsFile } from './handover.types.ts'

/** The lots file, with a relative repository resolved from its folder; or what is wrong with it. */
export function readLotsFile(path: string): LotsFile | string {
	if (!existsSync(path)) return `${path} does not exist`
	let parsed: Partial<LotsFile>
	try {
		parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<LotsFile>
	} catch (error) {
		return `${path} is not JSON (${error instanceof Error ? error.message : String(error)})`
	}
	const { repository, branch, head, lots } = parsed
	if (typeof repository !== 'string' || typeof branch !== 'string' || typeof head !== 'string')
		return `${path} needs "repository", "branch" and "head"`
	if (!HEAD_PATTERN.test(head))
		return `${path}: "head" must be a commit sha or a prefix of one (7 to 40 hexadecimal digits)`
	if ([repository, branch].some((value) => !value || /[\r\n]/.test(value)))
		return `${path}: "repository" and "branch" are one non-empty line each`
	if (
		!Array.isArray(lots) ||
		lots.length === 0 ||
		!lots.every((lot) => Array.isArray(lot?.paths) && typeof lot?.message === 'string')
	)
		return `${path} needs "lots": [{ "paths": [...], "message": "..." }]`
	return {
		...parsed,
		repository: isAbsolute(repository) ? repository : resolve(dirname(path), repository),
		branch,
		head,
		lots,
	}
}

/** A lot path names a file, or a folder (with or without its trailing `/`) holding it. */
export function lotPathCovers(params: { path: string; file: string }): boolean {
	const folder = params.path.endsWith('/') ? params.path : `${params.path}/`
	return params.file === params.path || params.file.startsWith(folder)
}
