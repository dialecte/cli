/**
 * The changelog-edit rule: a package that keeps changelog fragments (a `changes/` folder) edits `CHANGELOG.md` only in
 * a release - a change that also bumps the package version. Any other change writes its entry in `changes/<lot>.md`,
 * so two lots never edit the same file.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CHANGELOG_FILE, FRAGMENTS_FOLDER } from '../changelog/changelog.constants.ts'
import { readFilesAtRevision } from '../git.ts'
import { PACKAGE_MANIFEST_FILE } from '../package-json.constants.ts'
import { CHANGELOG_EDIT_MESSAGE } from './check-rules.constants.ts'

import type { RuleFinding } from './check-code-rules.types.ts'

/**
 * One error on `CHANGELOG.md` when it is among `files`, the package keeps a `changes/` folder, and the version of the
 * checked state - the tree the gate checks (`tree`), else the working package.json - is the one `base` (default HEAD)
 * holds; none otherwise.
 *
 * @intent keep CHANGELOG.md out of every lot but the release
 * @internal
 */
export function checkChangelogEdit(params: {
	root: string
	files: readonly string[]
	base?: string
	/** The tree the gate checks (`DIALECTE_GATE_TREE`, the index a commit records): its package.json is read. */
	tree?: string
}): RuleFinding[] {
	const { root } = params
	if (!params.files.includes(CHANGELOG_FILE) || !existsSync(join(root, FRAGMENTS_FOLDER))) return []
	const before = manifestAt({ root, revision: params.base ?? 'HEAD' })
	const manifest = join(root, PACKAGE_MANIFEST_FILE)
	const now =
		params.tree !== undefined
			? manifestAt({ root, revision: params.tree })
			: existsSync(manifest)
				? readFileSync(manifest, 'utf8')
				: undefined
	if (versionOf({ text: now }) !== versionOf({ text: before })) return []
	return [
		{
			file: CHANGELOG_FILE,
			line: 1,
			column: 1,
			rule: 'changelog-edit',
			severity: 'error',
			message: CHANGELOG_EDIT_MESSAGE,
		},
	]
}

/** The package.json text a revision (a commit or a tree) holds; undefined without one. */
function manifestAt(params: { root: string; revision: string }): string | undefined {
	return readFilesAtRevision({ ...params, files: [PACKAGE_MANIFEST_FILE] }).get(
		PACKAGE_MANIFEST_FILE,
	)
}

/** The `version` of a package.json's text; undefined when there is none or it cannot be read. */
function versionOf(params: { text: string | undefined }): string | undefined {
	const { text } = params
	if (text === undefined) return undefined
	try {
		const parsed: unknown = JSON.parse(text)
		return typeof parsed === 'object' &&
			parsed !== null &&
			'version' in parsed &&
			typeof parsed.version === 'string'
			? parsed.version
			: undefined
	} catch {
		return undefined
	}
}
