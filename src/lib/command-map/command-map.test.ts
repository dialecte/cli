import {
	DECLARED_FAMILIES,
	RENAMED_ONLY_COMMANDS,
} from '../../../test/command-families.constants.ts'
import { COMMANDS } from '../../cli.constants.ts'
import { COMMAND_MAP } from './command-map.constants.ts'
import { commandSurfaceOf } from './command-surface.ts'
import { renderCommandSection } from './render-help.ts'

import { describe, expect, it } from 'vitest'

import type {
	CommandEntry,
	CommandMap,
	ListedCommandName,
	RenamedCommandName,
	RenamedEntry,
} from './command-map.types.ts'

/** Whether two types are mutually assignable. */
type Equal<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false

/** The listed entries of the map, by name, in declaration order. */
function listedEntries(): Array<[string, CommandEntry]> {
	return Object.entries(COMMAND_MAP).filter(
		(pair): pair is [string, CommandEntry] => 'family' in pair[1],
	)
}

describe('the command map', () => {
	it('every listed command in exactly one family, the families in the declared order', () => {
		const familiesInMapOrder = listedEntries()
			.map(([, entry]) => entry.family)
			.filter((family, index, all) => all.indexOf(family) === index)

		const commandsByFamily = DECLARED_FAMILIES.map(([family]) => [
			family,
			listedEntries()
				.filter(([, entry]) => entry.family === family)
				.map(([name]) => name),
		])

		expect(commandsByFamily).toEqual(DECLARED_FAMILIES)
		expect(familiesInMapOrder).toEqual(DECLARED_FAMILIES.map(([family]) => family))
	})

	it('one entry per command of COMMANDS, none for a name the cli does not register', () => {
		expect(Object.keys(COMMAND_MAP).sort()).toEqual(Object.keys(COMMANDS).sort())
	})

	it('record, review and recap carry the form that replaced them and no family', () => {
		const renamed = Object.fromEntries(
			RENAMED_ONLY_COMMANDS.map((name) => [
				name,
				{
					renamedTo: (COMMAND_MAP as Record<string, Partial<RenamedEntry>>)[name]?.renamedTo,
					listed: name in COMMAND_MAP && 'family' in (COMMAND_MAP as Record<string, object>)[name],
				},
			]),
		)

		expect(renamed).toEqual({
			record: { renamedTo: expect.stringContaining('lot '), listed: false },
			review: { renamedTo: expect.stringContaining('lot delta'), listed: false },
			recap: { renamedTo: expect.stringContaining('lot recap'), listed: false },
		})
	})

	it('every listed entry has a summary, usage lines naming its command, and an example', () => {
		const incomplete = listedEntries()
			.filter(
				([name, entry]) =>
					entry.summary.trim() === '' ||
					entry.usage.length === 0 ||
					!entry.usage.every((line) => line.includes(name)) ||
					entry.example.trim() === '',
			)
			.map(([name]) => name)

		expect(listedEntries()).not.toEqual([])
		expect(incomplete).toEqual([])
	})

	it('no example holds a < placeholder: every example is a command that runs as written', () => {
		expect(listedEntries().length).toBeGreaterThan(0)
		expect(
			listedEntries()
				.filter(([, entry]) => entry.example.includes('<'))
				.map(([name]) => name),
		).toEqual([])
	})

	it('the lot section lists lot close with its arguments and notes it', () => {
		const lot = COMMAND_MAP.lot
		const notes = lot.notes ?? []

		expect(lot.usage).toContain('dialecte lot close <hand-over name|index>... [--json]')
		expect(notes.some((note) => note.startsWith('close - '))).toBe(true)
	})

	const LOT_NEW_LINES = [
		'dialecte lot start <brief.json> [--effort low|medium|high] [--dry-run] [--simulate <scenario>] [--json]',
		'dialecte lot status <id> [--json]',
	]
	for (const line of LOT_NEW_LINES)
		it(`the lot section lists ${line}, in the map and in lot --help`, () => {
			expect(COMMAND_MAP.lot.usage).toContain(line)
			expect(renderCommandSection({ name: 'lot', entry: COMMAND_MAP.lot })).toContain(line)
		})

	for (const verb of ['start', 'status'])
		it(`the lot section notes ${verb} with a ${verb} - line`, () => {
			expect((COMMAND_MAP.lot.notes ?? []).some((note) => note.startsWith(`${verb} - `))).toBe(true)
		})

	const REVIEW_ROUND_LINES = [
		'dialecte lot finding <id|folder> --round <n> --severity <blocking|should-fix|nit> --at <file:line> <finding>',
		'dialecte lot decide <id|folder> <finding> <open | fix-to-verify | fixed <round> [note] | accepted <reason> | logged <where>>',
		'dialecte lot snapshot <id|folder> --round <n> [--beyond-cap --by <who> --reason <text>]',
		'dialecte lot choice <id|folder> --by <who> <decision>',
		'dialecte lot standard <id|folder> consulted <note> | not-consulted <reason>',
		'dialecte lot delta <id|folder> --round <n> [--worktree] [--json]',
		'dialecte lot recap <id|folder>',
		'dialecte lot verify <id|folder> --by <who> --note <text>',
	]
	for (const line of REVIEW_ROUND_LINES)
		it(`the review-round line says <id|folder>: ${line}`, () => {
			expect(COMMAND_MAP.lot.usage).toContain(line)
		})

	it('the lot section notes verify with a verify - line naming verify.jsonl, the state hash and the snapshot', () => {
		const note = (COMMAND_MAP.lot.notes ?? []).find((candidate) =>
			candidate.startsWith('verify - '),
		)

		expect({
			namesFile: note?.includes('verify.jsonl'),
			namesState: note?.includes('state'),
			namesSnapshot: note?.includes('snapshot'),
		}).toEqual({ namesFile: true, namesState: true, namesSnapshot: true })
	})

	it('gate lists --release in a usage line, in the map and in gate --help, and the surface derived from it has the flag', () => {
		const releaseLines = COMMAND_MAP.gate.usage.filter((line) => line.includes('--release'))

		expect(releaseLines).not.toEqual([])
		expect(releaseLines.every((line) => line.startsWith('dialecte gate'))).toBe(true)
		expect(renderCommandSection({ name: 'gate', entry: COMMAND_MAP.gate })).toContain(
			releaseLines[0],
		)
		expect(commandSurfaceOf({ name: 'gate', entry: COMMAND_MAP.gate }).flags).toContain('--release')
	})

	it('handover write lists --release in its usage line, and the handover surface has the flag', () => {
		const writeLines = COMMAND_MAP.handover.usage.filter((line) =>
			line.startsWith('dialecte handover write '),
		)

		const releaseLine = writeLines.find((line) => line.includes('--release'))

		expect(releaseLine).toBeDefined()
		expect(renderCommandSection({ name: 'handover', entry: COMMAND_MAP.handover })).toContain(
			releaseLine ?? '--release',
		)
		expect(commandSurfaceOf({ name: 'handover', entry: COMMAND_MAP.handover }).flags).toContain(
			'--release',
		)
	})

	it('the worktree section names the node_modules pool and the trash, and no longer says add copies node_modules on write only', () => {
		const worktree = COMMAND_MAP.worktree
		const notes = worktree.notes ?? []
		const add = notes.find((note) => note.startsWith('add - ')) ?? ''
		const prune = notes.find((note) => note.startsWith('prune - ')) ?? ''

		expect(add).toContain('pool')
		expect(add).toContain('copy-on-write')
		expect(prune).toContain('_pool-')
		expect(prune).toContain('_trash')
	})

	it('the type refuses a map missing a command and a map holding a name no command has (checked by npm run check)', () => {
		// @ts-expect-error a map without every command
		const missing: CommandMap = {}
		// @ts-expect-error a map with a name that is no command
		const extra: CommandMap = { ...COMMAND_MAP, nope: { renamedTo: 'nothing' } }

		// @ts-expect-error a name that is not a registered command
		const notACommand: keyof typeof COMMANDS = 'nope'
		const sameNames: Equal<keyof typeof COMMANDS, ListedCommandName | RenamedCommandName> = true

		expect(sameNames).toBe(true)
		expect(notACommand).toBe('nope')
		expect(Object.keys(missing)).toHaveLength(0)
		expect(Object.keys(extra)).toHaveLength(Object.keys(COMMANDS).length + 1)
	})
})
