/**
 * The archive rule of a hand-over folder's lot files (CK-cli design 3.2.2, 3.2.3): the layout, the per-file
 * decision and the archive a reader takes.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	createScratchRepository,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import {
	archiveDecision,
	archivedDeclarationPath,
	currentArchiveOf,
	isRemovableDeclaration,
	moveDeclarations,
} from './archived-declarations.ts'

import { describe, expect, it } from 'vitest'

import type {
	ArchiveDecision,
	ArchiveDecisionParams,
	MovedDeclaration,
} from './archived-declarations.types.ts'

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

describe('isRemovableDeclaration', () => {
	const ROWS: Array<{
		name: string
		packagePath: string
		bytes: string
		archives: Array<{ packagePath: string; bytes: string }>
		removable: boolean
	}> = [
		{
			name: "package p's lot file byte-equal to p's archive",
			packagePath: 'packages/p',
			bytes: DECLARATION,
			archives: [{ packagePath: 'packages/p', bytes: DECLARATION }],
			removable: true,
		},
		{
			name: "package p's lot file byte-equal to package q's archive only",
			packagePath: 'packages/p',
			bytes: DECLARATION,
			archives: [
				{ packagePath: 'packages/q', bytes: DECLARATION },
				{ packagePath: 'packages/p', bytes: OTHER },
			],
			removable: false,
		},
		{
			name: "the root's lot file byte-equal to a package's archive only",
			packagePath: '',
			bytes: DECLARATION,
			archives: [{ packagePath: 'packages/p', bytes: DECLARATION }],
			removable: false,
		},
		{
			name: "package p's lot file byte-equal to p's lot.json, p's lot.landed.json holding other bytes",
			packagePath: 'packages/p',
			bytes: DECLARATION,
			archives: [
				{ packagePath: 'packages/p', bytes: DECLARATION },
				{ packagePath: 'packages/p', bytes: OTHER },
			],
			removable: true,
		},
		{
			name: "package p's empty lot file, no archive",
			packagePath: 'packages/p',
			bytes: ' { }\n',
			archives: [],
			removable: true,
		},
	]

	for (const row of ROWS)
		it(`${row.name} -> ${row.removable ? 'removable' : 'kept'}`, () => {
			expect(
				isRemovableDeclaration({
					packagePath: row.packagePath,
					bytes: Buffer.from(row.bytes),
					archives: row.archives.map((archive) => ({
						packagePath: archive.packagePath,
						bytes: Buffer.from(archive.bytes),
					})),
				}),
			).toBe(row.removable)
		})
})

describe('moveDeclarations', () => {
	/** A repository with the tracked package `packages/ui` holding `lotFile`, and a folder holding `archives`. */
	function prepared(params: { lotFile: string; archives: Record<string, string> }): {
		root: string
		folder: string
	} {
		const root = createScratchRepository({ 'packages/ui/package.json': '{}\n' })
		writeFiles({ root, files: { 'packages/ui/.dialecte/lot.json': params.lotFile } })
		const folder = temporaryFolder('dialecte-archive-folder-')
		writeFiles({ root: folder, files: params.archives })
		return { root, folder }
	}

	/** The folder's pending record naming `packages/ui` with the bytes `text`, as a move writes it. */
	function pendingRecord(text: string): string {
		const sha256 = createHash('sha256').update(text).digest('hex')
		return `${JSON.stringify([{ packagePath: 'packages/ui', sha256 }], null, '\t')}\n`
	}

	function readIfExists(path: string): string | undefined {
		return existsSync(path) ? readFileSync(path, 'utf8') : undefined
	}

	it('owned, the package lot.json holding other bytes -> lot.landed.json written beside it, the file emptied', () => {
		const { root, folder } = prepared({
			lotFile: DECLARATION,
			archives: { 'lots/packages/ui/lot.json': OTHER },
		})

		const moved = moveDeclarations({ worktree: root, folder, owned: true })

		expect({
			kinds: moved.map((declaration) => declaration.decision),
			archive: readIfExists(join(folder, 'lots/packages/ui/lot.json')),
			landed: readIfExists(join(folder, 'lots/packages/ui/lot.landed.json')),
			file: readIfExists(join(root, 'packages/ui/.dialecte/lot.json')),
		}).toEqual({
			kinds: [{ kind: 'write', name: 'lot.landed.json' }],
			archive: OTHER,
			landed: DECLARATION,
			file: '{}\n',
		})
	})

	it('owned, both package archives holding other bytes -> kept: nothing written, the file left as it is', () => {
		const { root, folder } = prepared({
			lotFile: DECLARATION,
			archives: {
				'lots/packages/ui/lot.json': OTHER,
				'lots/packages/ui/lot.landed.json': `${OTHER}\n`,
			},
		})

		const moved = moveDeclarations({ worktree: root, folder, owned: true })

		expect({
			kinds: moved.map((declaration) => declaration.decision),
			archive: readIfExists(join(folder, 'lots/packages/ui/lot.json')),
			landed: readIfExists(join(folder, 'lots/packages/ui/lot.landed.json')),
			file: readIfExists(join(root, 'packages/ui/.dialecte/lot.json')),
		}).toEqual({
			kinds: [{ kind: 'keep' }],
			archive: OTHER,
			landed: `${OTHER}\n`,
			file: DECLARATION,
		})
	})

	it('owned, the package archive folder unwritable -> no throw, the failure named, the file left as it is, recorded as pending', () => {
		const { root, folder } = prepared({
			lotFile: DECLARATION,
			archives: { lots: 'a file, not a folder\n' },
		})
		let moved: MovedDeclaration[] = []

		expect(() => {
			moved = moveDeclarations({ worktree: root, folder, owned: true })
		}).not.toThrow()
		expect({
			failed: moved.map((declaration) => declaration.failure !== undefined),
			file: readIfExists(join(root, 'packages/ui/.dialecte/lot.json')),
			pending: readIfExists(join(folder, 'lot-archive.pending.json')),
		}).toEqual({ failed: [true], file: DECLARATION, pending: pendingRecord(DECLARATION) })
	})

	it('not owned, the folder recording these bytes as pending -> archived, the file emptied, the record removed', () => {
		const { root, folder } = prepared({
			lotFile: DECLARATION,
			archives: { 'lot-archive.pending.json': pendingRecord(DECLARATION) },
		})

		const moved = moveDeclarations({ worktree: root, folder, owned: false })

		expect({
			kinds: moved.map((declaration) => declaration.decision),
			archive: readIfExists(join(folder, 'lots/packages/ui/lot.json')),
			file: readIfExists(join(root, 'packages/ui/.dialecte/lot.json')),
			pending: existsSync(join(folder, 'lot-archive.pending.json')),
		}).toEqual({
			kinds: [{ kind: 'write', name: 'lot.json' }],
			archive: DECLARATION,
			file: '{}\n',
			pending: false,
		})
	})

	it('not owned, the pending record naming other bytes (the next step rewrote the file) -> untouched', () => {
		const { root, folder } = prepared({
			lotFile: OTHER,
			archives: { 'lot-archive.pending.json': pendingRecord(DECLARATION) },
		})

		const moved = moveDeclarations({ worktree: root, folder, owned: false })

		expect({
			kinds: moved.map((declaration) => declaration.decision),
			file: readIfExists(join(root, 'packages/ui/.dialecte/lot.json')),
		}).toEqual({ kinds: [{ kind: 'untouched' }], file: OTHER })
	})
})
