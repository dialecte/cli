/**
 * The publish check: a package whose package.json names a dependency by a local folder (`file:../core`,
 * `link:`, `git+file:`, a bare `../core`) is refused, so a release never ships a spec that only resolves on
 * the publisher's machine.
 */
import { readPackageJson } from '../package-json.ts'
import { DEPENDENCY_FIELDS, LOCAL_SPEC_PREFIXES } from './release.constants.ts'

import type { LocalDependency } from './release.types.ts'

/** Every dependency of the package.json named by a local folder, in field order then name order. */
export function findLocalDependencies(params: {
	packageJson: Record<string, unknown>
}): LocalDependency[] {
	return DEPENDENCY_FIELDS.flatMap(function localOf(field): LocalDependency[] {
		const entries = params.packageJson[field]
		if (typeof entries !== 'object' || entries === null) return []
		return Object.entries(entries as Record<string, unknown>)
			.filter(function isLocal(entry): entry is [string, string] {
				const spec = entry[1]
				return (
					typeof spec === 'string' && LOCAL_SPEC_PREFIXES.some((prefix) => spec.startsWith(prefix))
				)
			})
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([name, spec]) => ({ field, name, spec }))
	})
}

/** The publish check of the package at `root`: the refusal lines and exit code 1, or nothing and 0. */
export function checkPublishable(params: { root: string }): { exitCode: number; lines: string[] } {
	const local = findLocalDependencies({ packageJson: readPackageJson(params.root) })
	if (local.length === 0) return { exitCode: 0, lines: [] }
	return {
		exitCode: 1,
		lines: [
			'refused: package.json names a dependency by a local folder, which only resolves on this machine',
			...local.map((dependency) => `  ${dependency.field}  ${dependency.name}  ${dependency.spec}`),
			'pin a published version of each (npm install --save-exact <name>@<version>) before publishing',
		],
	}
}
