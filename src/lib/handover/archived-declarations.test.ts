/**
 * The archive rule of a hand-over folder's lot files (CK-cli design 3.2.2, 3.2.3): the layout, the per-file
 * decision and the archive a reader takes.
 */
import { join } from 'node:path'

import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import {
	archiveDecision,
	archivedDeclarationPath,
	currentArchiveOf,
} from './archived-declarations.ts'

import { describe, expect, it } from 'vitest'

import type { ArchiveDecision, ArchiveDecisionParams } from './archived-declarations.types.ts'

const FOLDER = '/hand-over'

const DECLARATION = '{\n\t"accept": [{ "case": "a.test.ts::a", "reason": "pins it" }]\n}\n'

const OTHER = '{\n\t"tdd": "exempt: the next step"\n}\n'

describe('archivedDeclarationPath', () => {
	const ROWS: Array<{
		name: string
		packagePath: string
		archive: 'lot.json' | 'lot.landed.json'
		path: string
	}> = [
		{ name: 'the root', packagePath: '', archive: 'lot.json', path: `${FOLDER}/lot.json` },
		{
			name: 'a package',
			packagePath: 'packages/ui',
			archive: 'lot.json',
			path: `${FOLDER}/lots/packages/ui/lot.json`,
		},
		{
			name: 'the root, landed',
			packagePath: '',
			archive: 'lot.landed.json',
			path: `${FOLDER}/lot.landed.json`,
		},
		{
			name: 'a package, landed',
			packagePath: 'packages/ui',
			archive: 'lot.landed.json',
			path: `${FOLDER}/lots/packages/ui/lot.landed.json`,
		},
	]

	for (const row of ROWS)
		it(`${row.name} -> ${row.path}`, () => {
			expect(
				archivedDeclarationPath({
					folder: FOLDER,
					packagePath: row.packagePath,
					name: row.archive,
				}),
			).toBe(row.path)
		})

	it('a dashed and a nested package path -> two distinct archive paths', () => {
		expect([
			archivedDeclarationPath({ folder: FOLDER, packagePath: 'packages/ui-kit', name: 'lot.json' }),
			archivedDeclarationPath({ folder: FOLDER, packagePath: 'packages/ui/kit', name: 'lot.json' }),
		]).toEqual([
			`${FOLDER}/lots/packages/ui-kit/lot.json`,
			`${FOLDER}/lots/packages/ui/kit/lot.json`,
		])
	})
})

describe('archiveDecision', () => {
	const ROWS: Array<{ name: string; params: ArchiveDecisionParams; decision: ArchiveDecision }> = [
		{
			name: 'not owned, no archive',
			params: { bytes: DECLARATION, archived: undefined, landed: undefined, owned: false },
			decision: { kind: 'untouched' },
		},
		{
			name: 'not owned, an archive with other bytes',
			params: { bytes: OTHER, archived: DECLARATION, landed: undefined, owned: false },
			decision: { kind: 'untouched' },
		},
		{
			name: 'not owned, an archive with the same bytes',
			params: { bytes: DECLARATION, archived: DECLARATION, landed: undefined, owned: false },
			decision: { kind: 'untouched' },
		},
		{
			name: 'not owned, an empty declaration',
			params: { bytes: '{}\n', archived: undefined, landed: undefined, owned: false },
			decision: { kind: 'untouched' },
		},
		{
			name: 'owned, an empty declaration',
			params: { bytes: ' { }\n', archived: undefined, landed: undefined, owned: true },
			decision: { kind: 'nothing' },
		},
		{
			name: 'owned, no archive',
			params: { bytes: DECLARATION, archived: undefined, landed: undefined, owned: true },
			decision: { kind: 'write', name: 'lot.json' },
		},
		{
			name: 'owned, lot.json with the same bytes',
			params: { bytes: DECLARATION, archived: DECLARATION, landed: undefined, owned: true },
			decision: { kind: 'already', name: 'lot.json' },
		},
		{
			name: 'owned, lot.json with other bytes',
			params: { bytes: DECLARATION, archived: OTHER, landed: undefined, owned: true },
			decision: { kind: 'write', name: 'lot.landed.json' },
		},
		{
			name: 'owned, lot.json with other bytes, lot.landed.json with the same bytes',
			params: { bytes: DECLARATION, archived: OTHER, landed: DECLARATION, owned: true },
			decision: { kind: 'already', name: 'lot.landed.json' },
		},
		{
			name: 'owned, lot.json and lot.landed.json both with other bytes',
			params: { bytes: DECLARATION, archived: OTHER, landed: `${OTHER}\n`, owned: true },
			decision: { kind: 'keep' },
		},
	]

	for (const row of ROWS)
		it(`${row.name} -> ${row.decision.kind}`, () => {
			expect(archiveDecision(row.params)).toEqual(row.decision)
		})
})

describe('currentArchiveOf', () => {
	it('lot.json alone -> lot.json', () => {
		const folder = temporaryFolder('dialecte-archive-')
		writeFiles({ root: folder, files: { 'lots/packages/ui/lot.json': DECLARATION } })

		expect(currentArchiveOf({ folder, packagePath: 'packages/ui' })).toEqual({
			packagePath: 'packages/ui',
			name: 'lot.json',
			path: join(folder, 'lots/packages/ui/lot.json'),
			bytes: DECLARATION,
		})
	})

	it('lot.json and lot.landed.json -> lot.landed.json', () => {
		const folder = temporaryFolder('dialecte-archive-')
		writeFiles({ root: folder, files: { 'lot.json': OTHER, 'lot.landed.json': DECLARATION } })

		expect(currentArchiveOf({ folder, packagePath: '' })).toEqual({
			packagePath: '',
			name: 'lot.landed.json',
			path: join(folder, 'lot.landed.json'),
			bytes: DECLARATION,
		})
	})
})
