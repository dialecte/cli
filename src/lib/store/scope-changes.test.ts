/**
 * A started lot's scope changes (FIX-lot-scope D1, D2): the effective scope is the brief's scope with each line of
 * `scope-changes.jsonl` applied in file order; a line that does not read makes the scope unreadable, so the overlap
 * guard reads every path; every scope reader (the guard, `readLotScope`) reads the effective scope.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	briefWith,
	checkArgumentsOf,
	createBriefWorkspace,
	refusalKeysOf,
	writeStoreLot,
} from '../../../test/brief-workspace.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { checkBrief } from './brief.ts'
import { readLotScope } from './lot-records.ts'
import { SCOPE_CHANGE_KEYS } from './scope-changes.constants.ts'
import {
	appendScopeChanges,
	effectiveScopeOf,
	readScopeChanges,
	scopeChangesText,
} from './scope-changes.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ScopeChange } from './scope-changes.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The file of a lot folder that holds its scope changes. */
const SCOPE_CHANGES_FILE = 'scope-changes.jsonl'

const AT = '2026-11-14T10:00:00.000Z'

/** A drop of `paths`. */
function dropOf(paths: string[]): ScopeChange {
	return { schema: 1, at: AT, op: 'drop', paths }
}

/** A drop of `paths` with who and why, as the verb writes it since every drop requires them. */
function dropWithWhoOf(paths: string[]): ScopeChange {
	return { schema: 1, at: AT, op: 'drop', paths, by: 'person-a', reason: 'hand back' }
}

/** An add of `paths`, by a person, with a reason. */
function addOf(paths: string[]): ScopeChange {
	return { schema: 1, at: AT, op: 'add', paths, by: 'person-a', reason: 'approved widening' }
}

/** An undo of an add of `paths` (a lot met the add once it was appended). */
function undoOf(paths: string[]): ScopeChange {
	return { schema: 1, at: AT, op: 'undo', paths }
}

/** The lines of a `scope-changes.jsonl`, one JSON object per line. */
function jsonLines(...lines: unknown[]): string {
	return lines.map((line) => `${JSON.stringify(line)}\n`).join('')
}

describe('effectiveScopeOf', () => {
	const ROWS: { title: string; brief: string[]; changes: ScopeChange[]; effective: string[] }[] = [
		{
			title: 'no change',
			brief: ['src/a', 'README.md'],
			changes: [],
			effective: ['src/a', 'README.md'],
		},
		{
			title: 'a drop of an entry',
			brief: ['src/a', 'README.md'],
			changes: [dropOf(['README.md'])],
			effective: ['src/a'],
		},
		{
			title: 'a drop of a folder removes the entries inside it',
			brief: ['src/a/x.ts', 'src/a/y.ts', 'src/b'],
			changes: [dropOf(['src/a'])],
			effective: ['src/b'],
		},
		{
			title: 'a drop on path segments: src/a leaves src/ab',
			brief: ['src/ab', 'src/a/x.ts'],
			changes: [dropOf(['src/a'])],
			effective: ['src/ab'],
		},
		{
			title: 'a drop of a glob path removes only the entry it equals',
			brief: ['src/a', 'src/b/x.ts', 'src/**/*.md'],
			changes: [dropOf(['src/**'])],
			effective: ['src/a', 'src/b/x.ts', 'src/**/*.md'],
		},
		{
			title: 'a drop of a glob entry leaves the folder entry its literal part names',
			brief: ['src/dataflow', 'src/dataflow/**/*.test.ts'],
			changes: [dropOf(['src/dataflow/**/*.test.ts'])],
			effective: ['src/dataflow'],
		},
		{
			title: 'an undo removes exactly what its add appended, never the entries inside it',
			brief: ['src/a/b.ts', 'docs/x.md'],
			changes: [addOf(['src/a']), undoOf(['src/a'])],
			effective: ['src/a/b.ts', 'docs/x.md'],
		},
		{
			title: 'an add appends after the brief',
			brief: ['src/a'],
			changes: [addOf(['src/b', 'docs/c.md'])],
			effective: ['src/a', 'src/b', 'docs/c.md'],
		},
		{
			title: 'an add of an entry already there adds nothing',
			brief: ['src/a'],
			changes: [addOf(['src/a'])],
			effective: ['src/a'],
		},
		{
			title: 'in file order: add then drop of the same path',
			brief: ['src/a'],
			changes: [addOf(['src/b']), dropOf(['src/b'])],
			effective: ['src/a'],
		},
		{
			title: 'in file order: drop then add of the same path',
			brief: ['src/a', 'src/b'],
			changes: [dropOf(['src/b']), addOf(['src/b'])],
			effective: ['src/a', 'src/b'],
		},
	]

	for (const { title, brief, changes, effective } of ROWS)
		it(`${title} -> ${JSON.stringify(effective)}`, () => {
			expect(effectiveScopeOf({ brief, changes })).toEqual(effective)
		})
})

describe('readScopeChanges', () => {
	it('no file -> no change, nothing unreadable', () => {
		expect(readScopeChanges({ lotFolder: temporaryFolder('dialecte-scope-changes-') })).toEqual({
			changes: [],
			unreadable: 0,
		})
	})

	const ROWS: { title: string; text: string; expected: ReturnType<typeof readScopeChanges> }[] = [
		{
			title: 'a drop and an add',
			text: jsonLines(dropOf(['README.md']), addOf(['src/b'])),
			expected: { changes: [dropOf(['README.md']), addOf(['src/b'])], unreadable: 0 },
		},
		{
			title: 'a drop with who and why',
			text: jsonLines(dropWithWhoOf(['src/a'])),
			expected: { changes: [dropWithWhoOf(['src/a'])], unreadable: 0 },
		},
		{
			title: 'a drop with who and no why',
			text: jsonLines({ ...dropOf(['src/a']), by: 'person-a' }),
			expected: { changes: [], unreadable: 1 },
		},
		{
			title: 'an add and its undo',
			text: jsonLines(addOf(['src/b']), undoOf(['src/b'])),
			expected: { changes: [addOf(['src/b']), undoOf(['src/b'])], unreadable: 0 },
		},
		{
			title: 'an undo with by (only an add names who)',
			text: jsonLines({ ...undoOf(['src/b']), by: 'person-a' }),
			expected: { changes: [], unreadable: 1 },
		},
		{
			title: 'a torn last line (no line feed)',
			text: `${jsonLines(dropOf(['README.md']))}${JSON.stringify(addOf(['src/b']))}`,
			expected: { changes: [dropOf(['README.md'])], unreadable: 1 },
		},
		{
			title: 'a line of another schema',
			text: jsonLines({ ...dropOf(['README.md']), schema: 2 }),
			expected: { changes: [], unreadable: 1 },
		},
		{
			title: 'an unknown op',
			text: jsonLines({ ...dropOf(['README.md']), op: 'move' }),
			expected: { changes: [], unreadable: 1 },
		},
		{
			title: 'paths that are no list of texts',
			text: jsonLines({ ...dropOf([]), paths: 'README.md' }),
			expected: { changes: [], unreadable: 1 },
		},
		{
			title: 'an add without by',
			text: jsonLines({ schema: 1, at: AT, op: 'add', paths: ['src/b'], reason: 'r' }),
			expected: { changes: [], unreadable: 1 },
		},
		{
			title: 'paths an empty list',
			text: jsonLines(dropOf([])),
			expected: { changes: [], unreadable: 1 },
		},
		{
			title: 'a key the schema does not name',
			text: jsonLines({ ...dropOf(['README.md']), extra: true }),
			expected: { changes: [], unreadable: 1 },
		},
		{
			title: 'a line that is no JSON',
			text: 'not json\n',
			expected: { changes: [], unreadable: 1 },
		},
	]

	for (const { title, text, expected } of ROWS)
		it(`${title} -> ${expected.changes.length} change(s), ${expected.unreadable} unreadable`, () => {
			const lotFolder = temporaryFolder('dialecte-scope-changes-')
			writeFileSync(join(lotFolder, SCOPE_CHANGES_FILE), text)

			expect(readScopeChanges({ lotFolder })).toEqual(expected)
		})

	/** Appends a drop then an add to a fresh lot folder: the file's text and what a reader reads back. */
	function appendedTwice() {
		const lotFolder = temporaryFolder('dialecte-scope-changes-')
		appendScopeChanges({ lotFolder, changes: [dropOf(['README.md'])] })
		appendScopeChanges({ lotFolder, changes: [addOf(['src/b'])] })
		return {
			text: readFileSync(join(lotFolder, SCOPE_CHANGES_FILE), 'utf8'),
			read: readScopeChanges({ lotFolder }),
		}
	}

	it('appendScopeChanges writes whole lines a reader reads back', () => {
		let appended: ReturnType<typeof appendedTwice> | undefined

		expect(() => {
			appended = appendedTwice()
		}).not.toThrow()
		expect(appended).toEqual({
			text: jsonLines(dropOf(['README.md']), addOf(['src/b'])),
			read: { changes: [dropOf(['README.md']), addOf(['src/b'])], unreadable: 0 },
		})
	})
})

describe('scope-change.schema.json', () => {
	/** A JSON schema of one object per op: `oneOf` refs to defs whose `op` is a const. */
	type LineDefinition = {
		required: string[]
		properties: Record<string, { const?: unknown }>
		additionalProperties: boolean
		dependentRequired?: Record<string, string[]>
	}

	/** The schema's definition of the line's op. */
	function definitionOf(params: { schema: { $defs: Record<string, LineDefinition> }; op: string }) {
		return Object.values(params.schema.$defs).find(
			(definition) => definition.properties.op?.const === params.op,
		)
	}

	/** What the line breaks of its op's definition: a required key missing, a key the schema does not name. */
	function violationsOf(params: { line: Record<string, unknown> }): string[] {
		const schema = JSON.parse(
			readFileSync(join(import.meta.dirname, 'scope-change.schema.json'), 'utf8'),
		) as { $defs: Record<string, LineDefinition> }
		const definition = definitionOf({ schema, op: String(params.line.op) })
		if (definition === undefined) return [`no definition of op ${String(params.line.op)}`]
		const keys = Object.keys(params.line)
		return [
			...definition.required.filter((key) => !keys.includes(key)).map((key) => `missing ${key}`),
			...keys.filter((key) => !(key in definition.properties)).map((key) => `unnamed ${key}`),
			...(definition.additionalProperties === false ? [] : ['additional properties allowed']),
			...Object.entries(definition.dependentRequired ?? {}).flatMap(([key, needed]) =>
				keys.includes(key)
					? needed
							.filter((other) => !keys.includes(other))
							.map((other) => `${key} without ${other}`)
					: [],
			),
		]
	}

	const LINES: { title: string; change: ScopeChange }[] = [
		{ title: 'a drop', change: dropOf(['README.md']) },
		{ title: 'a drop with who and why', change: dropWithWhoOf(['README.md']) },
		{ title: 'an add', change: addOf(['src/b']) },
		{ title: 'an undo', change: undoOf(['src/b']) },
	]

	const REFUSED_SHAPES: { title: string; line: Record<string, unknown>; violation: string }[] = [
		{
			title: 'a drop with who and no why',
			line: { ...dropOf(['src/a']), by: 'person-a' },
			violation: 'by without reason',
		},
		{
			title: 'a drop with why and no who',
			line: { ...dropOf(['src/a']), reason: 'r' },
			violation: 'reason without by',
		},
	]

	for (const { title, line, violation } of REFUSED_SHAPES)
		it(`${title} -> the schema refuses it and the reader counts it unreadable`, () => {
			const lotFolder = temporaryFolder('dialecte-scope-changes-')
			writeFileSync(join(lotFolder, SCOPE_CHANGES_FILE), jsonLines(line))

			expect({
				schema: violationsOf({ line }),
				read: readScopeChanges({ lotFolder }).unreadable,
			}).toEqual({
				schema: [violation],
				read: 1,
			})
		})

	it('a drop and an add appended in one write -> two lines, each the schema accepts', () => {
		const lotFolder = temporaryFolder('dialecte-scope-changes-')
		let lines: Record<string, unknown>[] = []

		expect(() => {
			appendScopeChanges({ lotFolder, changes: [dropWithWhoOf(['src/a']), addOf(['src/a/x.ts'])] })
			lines = readFileSync(join(lotFolder, SCOPE_CHANGES_FILE), 'utf8')
				.split('\n')
				.filter((text) => text !== '')
				.map((text) => JSON.parse(text) as Record<string, unknown>)
		}).not.toThrow()
		expect({
			ops: lines.map((line) => line.op),
			violations: lines.flatMap((line) => violationsOf({ line })),
		}).toEqual({
			ops: ['drop', 'add'],
			violations: [],
		})
	})

	for (const { title, change } of LINES)
		it(`${title} appended -> its line holds every key the schema requires and none it does not name`, () => {
			const lotFolder = temporaryFolder('dialecte-scope-changes-')
			let line: Record<string, unknown> | undefined

			expect(() => {
				appendScopeChanges({ lotFolder, changes: [change] })
				line = JSON.parse(readFileSync(join(lotFolder, SCOPE_CHANGES_FILE), 'utf8')) as Record<
					string,
					unknown
				>
			}).not.toThrow()
			expect(violationsOf({ line: line ?? {} })).toEqual([])
		})
})

describe('the keys a reader takes and the schema', () => {
	it('SCOPE_CHANGE_KEYS are the properties the schema names, no more, no fewer', () => {
		const schema = JSON.parse(
			readFileSync(join(import.meta.dirname, 'scope-change.schema.json'), 'utf8'),
		) as { $defs: Record<string, { properties: Record<string, unknown> }> }
		const named = new Set(
			Object.values(schema.$defs).flatMap((definition) => Object.keys(definition.properties)),
		)

		expect([...named].sort()).toEqual([...SCOPE_CHANGE_KEYS].sort())
	})
})

describe('scopeChangesText', () => {
	const ROWS: { title: string; changes: ScopeChange[]; withReason: boolean; text: string }[] = [
		{
			title: 'an add then its undo, with reasons',
			changes: [addOf(['src/b']), undoOf(['src/b'])],
			withReason: true,
			text: 'added src/b (by person-a: approved widening); undid the add of src/b',
		},
		{
			title: 'a drop with who and why, with reasons',
			changes: [dropWithWhoOf(['src/a'])],
			withReason: true,
			text: 'dropped src/a (by person-a: hand back)',
		},
		{
			title: 'a drop with who and why, without reasons',
			changes: [dropWithWhoOf(['src/a'])],
			withReason: false,
			text: 'dropped src/a (by person-a)',
		},
		{
			title: 'a drop and an add, without reasons',
			changes: [dropOf(['README.md']), addOf(['src/b'])],
			withReason: false,
			text: 'dropped README.md; added src/b (by person-a)',
		},
	]

	for (const { title, changes, withReason, text } of ROWS)
		it(`${title} -> ${text}`, () => {
			expect(scopeChangesText({ scope: { brief: [], effective: [], changes }, withReason })).toBe(
				text,
			)
		})
})

describe('the scope readers read the effective scope', { timeout: STORE_CASE_TIMEOUT }, () => {
	const LOT_NAME = '0007-repo-open'

	/** An open lot of scope `src/a` and `README.md` whose folder holds `changes` as its scope changes. */
	function openLotWith(changes: string) {
		const workspace = createBriefWorkspace()
		const lotFolder = writeStoreLot({ workspace, name: LOT_NAME, scope: ['src/a', 'README.md'] })
		if (changes !== '') writeFileSync(join(lotFolder, SCOPE_CHANGES_FILE), changes)
		return { workspace, lotFolder }
	}

	const GUARD_ROWS: { title: string; changes: string; scope: string; refused: unknown }[] = [
		{
			title: 'a second brief on README.md after the lot dropped it',
			changes: jsonLines(dropOf(['README.md'])),
			scope: 'README.md',
			refused: { keys: [], details: '' },
		},
		{
			title: 'a second brief on README.md with no change',
			changes: '',
			scope: 'README.md',
			refused: { keys: ['overlap:scope'], details: expect.stringContaining(LOT_NAME) },
		},
		{
			title: 'a second brief on src/b after the lot added it',
			changes: jsonLines(addOf(['src/b'])),
			scope: 'src/b',
			refused: {
				keys: ['overlap:scope'],
				details: expect.stringContaining('src/b meets src/b'),
			},
		},
		{
			title: 'a second brief on docs/ while the lot holds an unreadable change line',
			changes: 'not json\n',
			scope: 'docs/',
			refused: {
				keys: ['overlap:scope'],
				details: expect.stringContaining('its scope cannot be read'),
			},
		},
	]

	for (const { title, changes, scope, refused } of GUARD_ROWS)
		it(`the overlap guard: ${title}`, () => {
			const { workspace } = openLotWith(changes)

			const result = checkBrief(
				checkArgumentsOf({
					workspace,
					brief: briefWith({ scope: [scope], lots: [{ paths: [scope], message: 'feat: x' }] }),
					caseInsensitive: false,
				}),
			)

			expect({
				keys: refusalKeysOf(result.refused),
				details: result.refused.map((refusal) => refusal.detail).join('\n'),
			}).toEqual(refused)
		})

	it("readLotScope: the readable changes applied when a line does not read (the lot's own scope; the guard fails closed)", () => {
		const { lotFolder } = openLotWith(`${jsonLines(addOf(['src/b']))}not json\n`)

		expect(readLotScope({ lotFolder })).toEqual(['src/a', 'README.md', 'src/b'])
	})

	it('readLotScope: the brief scope with the changes applied', () => {
		const { lotFolder } = openLotWith(jsonLines(dropOf(['README.md']), addOf(['src/b'])))

		expect(readLotScope({ lotFolder })).toEqual(['src/a', 'src/b'])
	})
})
