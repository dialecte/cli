import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { PackageJson } from './package-json.types.ts'

/** The package.json at `root`, or an empty object when there is none. */
export function readPackageJson(root: string): PackageJson {
	const path = join(root, 'package.json')
	return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as PackageJson) : {}
}
