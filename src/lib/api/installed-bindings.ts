/**
 * The dialectes an app has installed, bound the way the lookups read their types: the namespace their types
 * hydrate under and the entry exporting it (`Scl` from `@dialecte/scl/v2019C1`). In a dialecte repository the
 * binding comes from its own `src/<version>/definition`; in an app it comes from here.
 */
import { namespaceOf } from '../namespace-of.ts'
import { isBuiltOnCore, readManifest } from '../schema/load-dialectes.ts'
import { dependencyNames, findInstalledPackage } from '../skills/sync-skills.ts'
import {
	NO_DIALECTE_INSTALLED,
	TEST_ENTRY,
	VERSION_SUBPATH_PATTERN,
} from './installed-bindings.constants.ts'

import type { PackageManifest } from '../schema/schema.types.ts'
import type { InstalledBinding, InstalledBindingChoice } from './installed-bindings.types.ts'

export function findInstalledBindings(params: { cwd: string }): InstalledBinding[] {
	return dependencyNames(params.cwd).flatMap(function bindingsOf(name: string): InstalledBinding[] {
		const folder = findInstalledPackage({ cwd: params.cwd, name })
		const manifest = folder ? readManifest(folder) : undefined
		if (!manifest?.name || !isBuiltOnCore(manifest)) return []
		const packageName = manifest.name
		return versionsOf(manifest).map((version) => ({
			packageName,
			version,
			binding: {
				kind: 'namespace',
				name: namespaceOf(packageName),
				import: `${packageName}/${version}`,
			},
		}))
	})
}

/**
 * The export subpaths that are versions: `./v2019C1` exported with its `./v2019C1/test` entry, the shape every
 * dialecte package has (the generator's template included). A library that only depends on core has none.
 */
function versionsOf(manifest: PackageManifest): string[] {
	const subpaths = typeof manifest.exports === 'object' ? Object.keys(manifest.exports) : []
	return subpaths
		.filter((subpath) => VERSION_SUBPATH_PATTERN.test(subpath))
		.filter((subpath) => subpaths.includes(`${subpath}/${TEST_ENTRY}`))
		.map((subpath) => subpath.slice(2))
}

/** One binding: the only one installed, or the one `--package` (and `--version`) names; else what to print. */
export function chooseInstalledBinding(params: {
	bindings: readonly InstalledBinding[]
	packageName: string | undefined
	version: string | undefined
}): InstalledBindingChoice {
	if (params.bindings.length === 0) return { kind: 'output', message: NO_DIALECTE_INSTALLED }
	const matching = params.bindings.filter(
		(binding) =>
			(params.packageName === undefined || binding.packageName === params.packageName) &&
			(params.version === undefined || binding.version === params.version),
	)
	if (matching.length === 1) return { kind: 'binding', binding: matching[0] }
	if (matching.length === 0) {
		const named = [
			...(params.packageName === undefined ? [] : [`--package ${params.packageName}`]),
			...(params.version === undefined ? [] : [`--version ${params.version}`]),
		].join(' ')
		return {
			kind: 'output',
			message: `no installed dialecte matches ${named}; installed:\n${listLines(params.bindings)}`,
		}
	}
	return {
		kind: 'output',
		message: `several dialectes are installed: pass --package <name> [--version <v>]\n${listLines(matching)}`,
	}
}

function listLines(bindings: readonly InstalledBinding[]): string {
	return bindings
		.map((binding) => `  ${binding.packageName} --version ${binding.version}\n`)
		.join('')
}
