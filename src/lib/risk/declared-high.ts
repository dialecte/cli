/**
 * The shared areas a repository declares (`dialecte.risk.high` globs of its `package.json`): a change there makes a lot
 * high risk and needs an approved design. Read from files only, no process: `lot status` reads it.
 */
import { readPackageJson } from '../package-json.ts'

import type { PackageJson } from '../package-json.types.ts'

/**
 * The globs `root`'s `package.json` declares high (`dialecte.risk.high`); none when it declares none.
 *
 * @intent read the shared areas a repository declares
 * @internal
 */
export function readDeclaredHigh(params: { root: string }): string[] {
	return declaredHighOf({ manifest: readPackageJson(params.root) })
}

/**
 * The globs a manifest declares high (`dialecte.risk.high`), its strings only.
 *
 * @intent read the shared areas a manifest declares
 * @internal
 */
export function declaredHighOf(params: { manifest: PackageJson }): string[] {
	const declaredHigh = params.manifest.dialecte?.risk?.high ?? []
	return Array.isArray(declaredHigh) ? declaredHigh.filter(isText) : []
}

/** Whether a declared entry is a string (a manifest edited by hand may hold anything). */
function isText(value: unknown): value is string {
	return typeof value === 'string'
}
