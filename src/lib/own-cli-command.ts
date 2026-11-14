/** The command line that runs the cli that is running now, whatever a package has installed. */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SOURCE_CLI_ENTRY, SOURCE_MODULE_PATTERN } from './own-cli-command.constants.ts'
import { readPackageJson } from './package-json.ts'
import { findPackageFolder } from './read-cli-version.ts'
import { CLI_BIN, CLI_PACKAGE } from './skills/cli-invocations.constants.ts'

/**
 * The words that run this cli: `process.execPath` and the cli's own entry file. From the sources (`node src/cli.ts`)
 * the entry is `src/cli.ts`; from the installed package it is the package's own `bin.dialecte` (`dist/cli.js`),
 * resolved from the cli's package folder (the one `readCliVersion` reads), never a package's `node_modules/.bin`.
 * `modulePath` (default: this module's file) is where to resolve from; a package with no `dialecte` bin throws.
 */
export function ownCliCommand(params: { modulePath?: string } = {}): string[] {
	const modulePath = params.modulePath ?? fileURLToPath(import.meta.url)
	if (SOURCE_MODULE_PATTERN.test(modulePath))
		return [process.execPath, join(dirname(modulePath), SOURCE_CLI_ENTRY)]
	const folder = findPackageFolder({ startFolder: dirname(modulePath) })
	const bin = binOf(readPackageJson(folder))
	if (bin === undefined)
		throw new Error(`the cli's package.json in ${folder} has no ${CLI_BIN} bin`)
	return [process.execPath, join(folder, bin)]
}

/**
 * The path of the `dialecte` bin of a package.json, or undefined when it names none: a `bin` map's `dialecte` entry,
 * or a string `bin` of the cli's own package (a string bin takes the package's name).
 */
export function binOf(params: { name?: unknown; bin?: unknown }): string | undefined {
	const { name, bin } = params
	if (typeof bin === 'string') return name === CLI_PACKAGE ? bin : undefined
	if (typeof bin !== 'object' || bin === null) return undefined
	const path: unknown = Object.entries(bin).find(([name]) => name === CLI_BIN)?.[1]
	return typeof path === 'string' ? path : undefined
}
