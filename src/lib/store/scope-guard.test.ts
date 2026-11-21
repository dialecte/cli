/**
 * The scope guard (SAFE 3.2, 5.1, 5.2): `pathsOutsideScope` names the paths no entry covers (on path segments, a glob
 * its own paths), the store's `.dialecte/` records left out, sorted once; `scopeGuardOf` reads the lot's effective
 * scope fail-closed: an unreadable change line or a damaged lot refuses with its repair line and no add, an outside
 * path refuses naming every path and one `--add` each.
 */
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../../test/brief-workspace.ts'
import { replaceRecord } from '../../../test/damaged-lot-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { SCOPE_GUARD_TEXTS } from './scope-guard.constants.ts'
import { pathsOutsideScope, scopeGuardOf } from './scope-guard.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ScopeGuard } from './scope-guard.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The lot of the guard's cases. */
const LOT = '0001-repo-scoped'

const AT = '2026-11-21T10:00:00.000Z'

describe('pathsOutsideScope', () => {
	const ROWS: { title: string; paths: string[]; scope: string[]; outside: string[] }[] = [
		{ title: 'an equal entry', paths: ['src/a.ts'], scope: ['src/a.ts'], outside: [] },
		{
			title: 'a folder entry holding the path',
			paths: ['src/lib/store/x.ts'],
			scope: ['src/lib/store'],
			outside: [],
		},
		{
			title: 'a folder entry that is only a prefix of the path (segments, not a prefix)',
			paths: ['src/lib/storefront.ts'],
			scope: ['src/lib/store'],
			outside: ['src/lib/storefront.ts'],
		},
		{
			title: 'a glob entry matching the path',
			paths: ['src/lib/x.test.ts'],
			scope: ['src/lib/*.test.ts'],
			outside: [],
		},
		{
			title: 'a glob entry under whose folder the path lies, not matching it',
			paths: ['src/lib/deep/x.test.ts'],
			scope: ['src/lib/*.test.ts'],
			outside: ['src/lib/deep/x.test.ts'],
		},
		{
			title: 'a deleted fragment under a glob entry',
			paths: ['changes/a.md'],
			scope: ['changes/*.md'],
			outside: [],
		},
		{
			title: 'the store records at the top',
			paths: ['.dialecte/mutation-records.json'],
			scope: ['src'],
			outside: [],
		},
		{
			title: 'the store records at any depth',
			paths: ['pkg/.dialecte/lot.json'],
			scope: ['src'],
			outside: [],
		},
		{
			title: 'two outside paths given unsorted, one twice',
			paths: ['b.ts', 'a.ts', 'b.ts'],
			scope: ['c.ts'],
			outside: ['a.ts', 'b.ts'],
		},
		{ title: 'a non-ASCII path, exact', paths: ['src/é.ts'], scope: ['src/é.ts'], outside: [] },
	]

	for (const { title, paths, scope, outside } of ROWS)
		it(`${title} -> ${outside.length === 0 ? 'none outside' : outside.join(', ')}`, () => {
			expect(pathsOutsideScope({ paths, scope })).toEqual(outside)
		})
})

describe('scopeGuardOf - a lot folder', { timeout: STORE_CASE_TIMEOUT }, () => {
	/** A store lot whose brief's scope is `scope`, its `scope-changes.jsonl` written whole with `changes` when given. */
	function lotFolderOf(params: { scope: string[]; changes?: string }): string {
		const workspace = createBriefWorkspace()
		const lotFolder = writeStoreLot({ workspace, name: LOT, scope: params.scope })
		if (params.changes !== undefined)
			writeFileSync(join(lotFolder, 'scope-changes.jsonl'), params.changes)
		return lotFolder
	}

	/** One line of `scope-changes.jsonl`. */
	function changeLine(change: Record<string, unknown>): string {
		return `${JSON.stringify({ schema: 1, at: AT, ...change })}\n`
	}

	const ADD_OUT = changeLine({
		op: 'add',
		paths: ['src/out.ts'],
		by: 'person-a',
		reason: 'approved widening',
	})

	const ROWS: {
		title: string
		scope: string[]
		changes?: string
		paths: string[]
		guard: ScopeGuard
	}[] = [
		{
			title: 'an add line widens the scope -> the added path passes',
			scope: ['src/in.ts'],
			changes: ADD_OUT,
			paths: ['src/in.ts', 'src/out.ts'],
			guard: undefined,
		},
		{
			title: 'a drop line narrows the scope -> a path of the dropped folder is refused',
			scope: ['src/in.ts', 'src/in/'],
			changes: changeLine({
				op: 'drop',
				paths: ['src/in/'],
				by: 'person-a',
				reason: 'hand back',
			}),
			paths: ['src/in/a.ts'],
			guard: {
				reason: `1 path(s) outside lot ${LOT}'s scope: src/in/a.ts`,
				next: `dialecte lot scope ${LOT} --add 'src/in/a.ts' --by lot-session --reason "<why>"`,
			},
		},
		{
			title: 'an undo takes the add back -> the path is refused again',
			scope: ['src/in.ts'],
			changes: `${ADD_OUT}${changeLine({ op: 'undo', paths: ['src/out.ts'] })}`,
			paths: ['src/out.ts'],
			guard: {
				reason: `1 path(s) outside lot ${LOT}'s scope: src/out.ts`,
				next: `dialecte lot scope ${LOT} --add 'src/out.ts' --by lot-session --reason "<why>"`,
			},
		},
		{
			title:
				'an unreadable change line, the path inside the brief scope -> refused naming the file and the count, no add',
			scope: ['src/in.ts'],
			changes: `${ADD_OUT}not json\n`,
			paths: ['src/in.ts'],
			guard: {
				reason: `${LOT}: scope-changes.jsonl has 1 unreadable line(s): repair it before committing`,
			},
		},
		{
			title: 'two outside paths -> one --add each, sorted, signed lot-session',
			scope: ['src/in.ts'],
			paths: ['src/in.ts', 'src/b.ts', 'src/a.ts'],
			guard: {
				reason: `2 path(s) outside lot ${LOT}'s scope: src/a.ts, src/b.ts`,
				next: `dialecte lot scope ${LOT} --add 'src/a.ts' --add 'src/b.ts' --by lot-session --reason "<why>"`,
			},
		},
		{
			title: 'the store records beside an inside path -> passes',
			scope: ['src/in.ts'],
			paths: ['.dialecte/mutation-records.json', 'src/in.ts'],
			guard: undefined,
		},
	]

	for (const { title, scope, changes, paths, guard } of ROWS)
		it(title, () => {
			const lotFolder = lotFolderOf({ scope, changes })

			expect(scopeGuardOf({ lotFolder, paths })).toEqual(guard)
		})

	it('a path holding a glob character beside a plain one -> both named, an --add for the plain one only, the glob guidance for the other', () => {
		const lotFolder = lotFolderOf({ scope: ['src/in.ts'] })

		expect(scopeGuardOf({ lotFolder, paths: ['src/[id].ts', 'src/out.ts'] })).toEqual({
			reason: `2 path(s) outside lot ${LOT}'s scope: src/[id].ts, src/out.ts`,
			next: `dialecte lot scope ${LOT} --add 'src/out.ts' --by lot-session --reason "<why>"`,
			globPaths: [
				fillMessage({ template: SCOPE_GUARD_TEXTS.globPath, values: { path: 'src/[id].ts' } }),
			],
		})
	})

	const DAMAGES: { title: string; damage: (lotFolder: string) => void }[] = [
		{
			title: 'a missing brief',
			damage: function removeBrief(lotFolder) {
				rmSync(join(lotFolder, 'brief.json'), { force: true })
			},
		},
		{
			title: 'a brief that does not parse',
			damage: function breakBrief(lotFolder) {
				replaceRecord({ folder: lotFolder, name: 'brief.json', text: '{ "scope": [\n' })
			},
		},
	]

	for (const { title, damage } of DAMAGES)
		it(`a damaged lot (${title}) -> refused with the repair line, no add`, () => {
			const lotFolder = lotFolderOf({ scope: ['src/in.ts'] })
			damage(lotFolder)

			expect(scopeGuardOf({ lotFolder, paths: ['src/out.ts'] })).toEqual({
				reason: expect.stringMatching(
					new RegExp(`^${LOT} is damaged \\(.+\\): repair its records by hand; nothing to add$`),
				),
			})
		})
})
