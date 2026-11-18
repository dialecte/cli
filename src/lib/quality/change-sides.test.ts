/** `functionSidesOf`: which functions a change adds, and which already existed (moved or kept). */
import { changeFactsOf } from '../../../test/quality-workspace.ts'
import { functionSidesOf } from './change-sides.ts'

import { describe, expect, it } from 'vitest'

import type { FunctionSides } from './quality.types.ts'

const SIZE_FILE = [
	'/** How many items a list holds, empty ones left out. */',
	'export function sizeOf(items: readonly string[]): number {',
	"\treturn items.filter((item) => item.trim() !== '').length",
	'}',
	'',
].join('\n')

const KIND_FILE = [
	"export function readKind(record: TrackedRecord<'Widget'>): string {",
	"\treturn readAttribute({ record, name: 'kind' })",
	'}',
	'',
].join('\n')

const KIND_AND_SIZE_FILE = [
	"export function readKind(record: TrackedRecord<'Widget'>): string {",
	"\treturn `${readAttribute({ record, name: 'kind' })}${readAttribute({ record, name: 'size' })}`",
	'}',
	'',
].join('\n')

/** The names on each side, sorted, `file#name`. */
function namesOf(sides: FunctionSides): { added: string[]; existing: string[] } {
	return {
		added: sides.added.map((side) => `${side.file}#${side.facts.name}`).sort(),
		existing: sides.existing.map((side) => `${side.file}#${side.facts.name}`).sort(),
	}
}

describe('functionSidesOf', () => {
	const testCases: Record<
		string,
		{
			base: Record<string, string>
			tree: Record<string, string>
			expected: { added: string[]; existing: string[] }
		}
	> = {
		'a file added beside an unchanged one → its function added, the unchanged one existing': {
			base: { 'src/a/size.ts': SIZE_FILE },
			tree: { 'src/a/size.ts': SIZE_FILE, 'src/b/kind.ts': KIND_FILE },
			expected: { added: ['src/b/kind.ts#readKind'], existing: ['src/a/size.ts#sizeOf'] },
		},
		'a function moved to another file unchanged → existing at its new place, never added': {
			base: { 'src/a/size.ts': SIZE_FILE },
			tree: { 'src/b/size.ts': SIZE_FILE },
			expected: { added: [], existing: ['src/b/size.ts#sizeOf'] },
		},
		'two distinct trivial bodies, one deleted and one added → the added one is added, never the deleted one moved':
			{
				base: { 'src/a/none.ts': 'export const noneOfA = () => undefined\n' },
				tree: { 'src/b/none.ts': 'export const noneOfB = () => undefined\n' },
				expected: { added: ['src/b/none.ts#noneOfB'], existing: [] },
			},
		'a function whose read keys changed in place → on both sides': {
			base: { 'src/b/kind.ts': KIND_FILE },
			tree: { 'src/b/kind.ts': KIND_AND_SIZE_FILE },
			expected: { added: ['src/b/kind.ts#readKind'], existing: ['src/b/kind.ts#readKind'] },
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const change = changeFactsOf(testCase)

			expect(namesOf(functionSidesOf(change))).toEqual(testCase.expected)
		})
})
