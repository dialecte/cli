import { declaredSpecOf } from './package-json.ts'
import { CLI_PACKAGE } from './skills/cli-invocations.constants.ts'

import { describe, expect, it } from 'vitest'

import type { DeclaredSpec, PackageJson } from './package-json.types.ts'

const NAME = CLI_PACKAGE

describe('declaredSpecOf', () => {
	const ROWS: Array<{ name: string; manifest: PackageJson; declared: DeclaredSpec | undefined }> = [
		{
			name: 'dependencies win over every other field',
			manifest: {
				dependencies: { [NAME]: '^1.0.0' },
				devDependencies: { [NAME]: '^2.0.0' },
				optionalDependencies: { [NAME]: '^3.0.0' },
				peerDependencies: { [NAME]: '^4.0.0' },
			},
			declared: { field: 'dependencies', spec: '^1.0.0' },
		},
		{
			name: 'devDependencies come before optionalDependencies and peerDependencies',
			manifest: {
				devDependencies: { [NAME]: '^2.0.0' },
				optionalDependencies: { [NAME]: '^3.0.0' },
				peerDependencies: { [NAME]: '^4.0.0' },
			},
			declared: { field: 'devDependencies', spec: '^2.0.0' },
		},
		{
			name: 'optionalDependencies come before peerDependencies',
			manifest: {
				optionalDependencies: { [NAME]: '^3.0.0' },
				peerDependencies: { [NAME]: '^4.0.0' },
			},
			declared: { field: 'optionalDependencies', spec: '^3.0.0' },
		},
		{
			name: 'peerDependencies alone',
			manifest: { peerDependencies: { [NAME]: '^4.0.0' } },
			declared: { field: 'peerDependencies', spec: '^4.0.0' },
		},
		{
			name: 'dependencies without the cli, devDependencies holding it → the field that holds it',
			manifest: {
				dependencies: { other: '^1.0.0' },
				devDependencies: { [NAME]: '^2.0.0' },
			},
			declared: { field: 'devDependencies', spec: '^2.0.0' },
		},
		{
			name: 'a spec that is not a string is no declaration',
			manifest: { devDependencies: { [NAME]: 1 } } as unknown as PackageJson,
			declared: undefined,
		},
		{
			name: 'a null entry falls through to the next field',
			manifest: {
				dependencies: { [NAME]: null },
				devDependencies: { [NAME]: '^1.0.0' },
			} as unknown as PackageJson,
			declared: { field: 'devDependencies', spec: '^1.0.0' },
		},
		{
			name: 'a non-string entry falls through to the next field',
			manifest: {
				dependencies: { [NAME]: 1 },
				peerDependencies: { [NAME]: '^1.0.0' },
			} as unknown as PackageJson,
			declared: { field: 'peerDependencies', spec: '^1.0.0' },
		},
		{
			name: 'another package is no declaration',
			manifest: { dependencies: { other: '^1.0.0' } },
			declared: undefined,
		},
		{ name: 'a manifest with no dependency fields', manifest: {}, declared: undefined },
	]
	for (const row of ROWS)
		it(row.name, () => {
			expect(declaredSpecOf({ manifest: row.manifest, name: NAME })).toEqual(row.declared)
		})
})
