import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { readSyncManifest } from '../skills/sync-skills.ts'
import { SESSION_CHECK_COMMAND } from './session-check.constants.ts'
import { syncSessionCheck } from './session-check.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SETTINGS = '.claude/settings.json'

let root: string

function write(path: string, content: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true })
	writeFileSync(join(root, path), content)
}

function settings(): Record<string, unknown> {
	return JSON.parse(readFileSync(join(root, SETTINGS), 'utf8'))
}

function commandsOf(): string[] {
	const hooks = settings().hooks as
		| { SessionStart?: { hooks: { command: string }[] }[] }
		| undefined
	return (hooks?.SessionStart ?? []).flatMap((group) => group.hooks.map((hook) => hook.command))
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-session-check-'))
	write('.claude/skills/.dialecte-skills.json', JSON.stringify({ installed: [] }))
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('syncSessionCheck', () => {
	it('no settings.json -> created with the SessionStart hook, recorded in the manifest', () => {
		expect(syncSessionCheck({ cwd: root, enabled: true })).toBe('added')

		expect(commandsOf()).toEqual([SESSION_CHECK_COMMAND])
		expect(readSyncManifest(join(root, '.claude/skills')).sessionCheck).toBe(true)
	})

	it('an existing settings.json -> the hook merged, every other key and hook untouched', () => {
		write(
			SETTINGS,
			JSON.stringify({
				permissions: { allow: ['Bash(ls)'] },
				hooks: {
					PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }],
					SessionStart: [{ hooks: [{ type: 'command', command: 'echo mine' }] }],
				},
			}),
		)

		syncSessionCheck({ cwd: root, enabled: true })

		const merged = settings()
		expect(merged.permissions).toEqual({ allow: ['Bash(ls)'] })
		expect((merged.hooks as Record<string, unknown>).PreToolUse).toEqual([
			{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] },
		])
		expect(commandsOf()).toEqual(['echo mine', SESSION_CHECK_COMMAND])
	})

	it('a second sync -> the hook is not duplicated', () => {
		syncSessionCheck({ cwd: root, enabled: true })

		expect(syncSessionCheck({ cwd: root, enabled: true })).toBe('unchanged')

		expect(commandsOf()).toEqual([SESSION_CHECK_COMMAND])
	})

	it('disabled after it was added -> the hook removed, the rest of settings.json kept', () => {
		write(SETTINGS, JSON.stringify({ permissions: { allow: ['Bash(ls)'] } }))
		syncSessionCheck({ cwd: root, enabled: true })

		expect(syncSessionCheck({ cwd: root, enabled: false })).toBe('removed')

		expect(commandsOf()).toEqual([])
		expect(settings()).toEqual({ permissions: { allow: ['Bash(ls)'] } })
		expect(readSyncManifest(join(root, '.claude/skills')).sessionCheck).toBeUndefined()
	})

	it('a hook the user wrote with the same command -> kept, not recorded, so never removed', () => {
		write(
			SETTINGS,
			JSON.stringify({
				hooks: { SessionStart: [{ hooks: [{ type: 'command', command: SESSION_CHECK_COMMAND }] }] },
			}),
		)

		expect(syncSessionCheck({ cwd: root, enabled: true })).toBe('kept')
		expect(syncSessionCheck({ cwd: root, enabled: false })).toBe('unchanged')

		expect(commandsOf()).toEqual([SESSION_CHECK_COMMAND])
	})

	it('a settings.json that is not JSON -> left untouched', () => {
		write(SETTINGS, '{ not json')

		expect(syncSessionCheck({ cwd: root, enabled: true })).toBe('invalid')

		expect(readFileSync(join(root, SETTINGS), 'utf8')).toBe('{ not json')
	})

	it('disabled and nothing was ever added -> no settings.json created', () => {
		expect(syncSessionCheck({ cwd: root, enabled: false })).toBe('unchanged')

		expect(existsSync(join(root, SETTINGS))).toBe(false)
	})

	it('the hook command never reaches the network at a session start', () => {
		expect(SESSION_CHECK_COMMAND).toBe('npx --no-install @dialecte/cli doctor --brief')
	})

	it('one-line keys and a one-line user hook -> byte for byte the same after add and after remove', () => {
		const permissions = '"permissions": {"allow": ["Bash(ls)", "Read"]}'
		const userHook =
			'"PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "echo pre"}]}]'
		const original = `{\n  ${permissions},\n  "hooks": {\n    ${userHook}\n  }\n}\n`
		write(SETTINGS, original)

		syncSessionCheck({ cwd: root, enabled: true })
		const added = readFileSync(join(root, SETTINGS), 'utf8')
		expect(added).toContain(`  ${permissions},\n`)
		expect(added).toContain(`    ${userHook},\n`)

		syncSessionCheck({ cwd: root, enabled: false })
		expect(readFileSync(join(root, SETTINGS), 'utf8')).toBe(original)
	})

	it('a tab-indented file with CRLF line ends -> the hook is inserted with tabs and CRLF', () => {
		write(SETTINGS, '{\r\n\t"permissions": {"allow": []}\r\n}\r\n')

		syncSessionCheck({ cwd: root, enabled: true })

		const text = readFileSync(join(root, SETTINGS), 'utf8')
		expect(text).toContain('\t"permissions": {"allow": []},\r\n')
		expect(text).not.toMatch(/[^\r]\n/)
		expect(text).toContain('\t\t"SessionStart"')
	})

	it.each([
		['hooks is an array', '{"hooks": []}'],
		['hooks is a string', '{"hooks": "none"}'],
		['hooks.SessionStart is an object', '{"hooks": {"SessionStart": {}}}'],
	])('%s -> invalid-hooks, the file untouched, nothing recorded', (_title, text) => {
		write(SETTINGS, text)

		expect(syncSessionCheck({ cwd: root, enabled: true })).toBe('invalid-hooks')

		expect(readFileSync(join(root, SETTINGS), 'utf8')).toBe(text)
		expect(readSyncManifest(join(root, '.claude/skills')).sessionCheck).toBeUndefined()
	})

	it('a settings.json sync created -> deleted when removing the hook leaves nothing', () => {
		syncSessionCheck({ cwd: root, enabled: true })

		expect(syncSessionCheck({ cwd: root, enabled: false })).toBe('removed')

		expect(existsSync(join(root, SETTINGS))).toBe(false)
		expect(readSyncManifest(join(root, '.claude/skills')).settingsCreated).toBeUndefined()
	})

	it("a settings.json of the user's that ends up empty -> kept as it is", () => {
		write(SETTINGS, '{}\n')
		syncSessionCheck({ cwd: root, enabled: true })

		syncSessionCheck({ cwd: root, enabled: false })

		expect(JSON.parse(readFileSync(join(root, SETTINGS), 'utf8'))).toEqual({})
	})

	describe('add then remove gives back the original bytes', () => {
		const PRE =
			'"PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "echo pre"}]}]'
		const MINE = '{"matcher": "x", "hooks": [{"type": "command", "command": "echo mine"}]}'
		const shapes: [string, string][] = [
			[
				'another SessionStart group, tab-indented',
				`{\n\t"hooks": {\n\t\t"SessionStart": [\n\t\t\t${MINE}\n\t\t]\n\t}\n}\n`,
			],
			['empty object with a newline', '{}\n'],
			['empty object without a newline', '{}'],
			['an empty object spread on two lines', '{\n}\n'],
			['hooks without SessionStart', `{\n  "hooks": {\n    ${PRE}\n  }\n}\n`],
			[
				'comments and trailing commas',
				'{\n  // mine\n  "a": [1, 2,], // keep\n  "hooks": {\n    "SessionStart": [\n      // none yet\n    ],\n  },\n}\n',
			],
			['CRLF without a final newline', '{\r\n  "a": 1\r\n}'],
			['one line with an empty hooks of the user', '{"a":1,"hooks":{}}'],
			['an empty SessionStart of the user', '{"hooks":{"SessionStart":[]}}\n'],
			['a block comment as the last member', '{\n  "a": 1 /* last */\n}\n'],
		]

		it.each(shapes)('%s', (_title, original) => {
			write(SETTINGS, original)

			syncSessionCheck({ cwd: root, enabled: true })
			expect(readFileSync(join(root, SETTINGS), 'utf8')).toContain(SESSION_CHECK_COMMAND)
			syncSessionCheck({ cwd: root, enabled: false })

			expect(readFileSync(join(root, SETTINGS), 'utf8')).toBe(original)
		})
	})

	it('the hook added into an existing file clears a stale settingsCreated: removing it keeps the file', () => {
		syncSessionCheck({ cwd: root, enabled: true })
		// the user removes our hook and writes their own content
		write(SETTINGS, '{"permissions": {"allow": []}}\n')
		syncSessionCheck({ cwd: root, enabled: true })
		expect(readSyncManifest(join(root, '.claude/skills')).settingsCreated).toBeUndefined()
		write(SETTINGS, '{}\n')
		syncSessionCheck({ cwd: root, enabled: true })

		syncSessionCheck({ cwd: root, enabled: false })

		expect(existsSync(join(root, SETTINGS))).toBe(true)
	})

	describe('the file edited by hand after the add: only our handler or group goes, the rest stays valid', () => {
		const MINE = '{"matcher":"x","hooks":[{"type":"command","command":"echo mine"}]}'
		const OURS = `{"matcher":"startup|resume","hooks":[{"type":"command","command":"${SESSION_CHECK_COMMAND}","timeout":30}]}`
		function wrap(groups: string): string {
			return `{"hooks":{"SessionStart":[${groups}]}}`
		}

		function removeFrom(edited: string): string {
			syncSessionCheck({ cwd: root, enabled: true })
			write(SETTINGS, edited)
			syncSessionCheck({ cwd: root, enabled: false })
			return readFileSync(join(root, SETTINGS), 'utf8')
		}

		const cases: [string, string, string][] = [
			['compact, our group last', wrap(`${MINE},${OURS}`), wrap(MINE)],
			['compact, our group first', wrap(`${OURS},${MINE}`), wrap(MINE)],
			['compact, our group alone', wrap(OURS), '{"hooks":{"SessionStart":[]}}'],
			[
				'multi-line, the user group after ours',
				`{\n  "hooks": {\n    "SessionStart": [\n      ${OURS},\n      ${MINE}\n    ]\n  }\n}\n`,
				`{\n  "hooks": {\n    "SessionStart": [\n      ${MINE}\n    ]\n  }\n}\n`,
			],
			[
				'multi-line, the user group before ours',
				`{\n\t"hooks": {\n\t\t"SessionStart": [\n\t\t\t${MINE},\n\t\t\t${OURS}\n\t\t]\n\t}\n}\n`,
				`{\n\t"hooks": {\n\t\t"SessionStart": [\n\t\t\t${MINE}\n\t\t]\n\t}\n}\n`,
			],
			[
				'our handler inside a group the user extended, last',
				wrap(
					'{"matcher":"x","hooks":[{"type":"command","command":"echo mine"},{"type":"command","command":"' +
						SESSION_CHECK_COMMAND +
						'"}]}',
				),
				wrap(MINE),
			],
			[
				'our handler inside a group the user extended, first',
				wrap(
					'{"matcher":"x","hooks":[{"type":"command","command":"' +
						SESSION_CHECK_COMMAND +
						'"},{"type":"command","command":"echo mine"}]}',
				),
				wrap(MINE),
			],
		]

		it.each(cases)('%s', (_title, edited, expected) => {
			const result = removeFrom(edited)

			expect(result).toBe(expected)
			expect(() => JSON.parse(result)).not.toThrow()
		})

		it('a file the splice cannot read the same way twice -> nothing written, not-removed, still recorded', () => {
			// duplicate "hooks" keys: the parser keeps the last, a tree walk meets the first
			const edited = `{"hooks":{"SessionStart":[${MINE}]},"hooks":{"SessionStart":[${OURS}]}}`
			syncSessionCheck({ cwd: root, enabled: true })
			write(SETTINGS, edited)

			expect(syncSessionCheck({ cwd: root, enabled: false })).toBe('not-removed')

			expect(readFileSync(join(root, SETTINGS), 'utf8')).toBe(edited)
			expect(readSyncManifest(join(root, '.claude/skills')).sessionCheck).toBe(true)
		})
	})

	describe('an older hook command is ours too', () => {
		const OLD = 'npx @dialecte/cli doctor --brief'

		it('a sync adds no second hook beside it', () => {
			write(
				SETTINGS,
				JSON.stringify({
					hooks: { SessionStart: [{ hooks: [{ type: 'command', command: OLD }] }] },
				}),
			)

			expect(syncSessionCheck({ cwd: root, enabled: true })).toBe('kept')

			expect(commandsOf()).toEqual([OLD])
		})

		it('removing it when the manifest recorded the check without the inserted text', () => {
			syncSessionCheck({ cwd: root, enabled: true })
			// a manifest written before the exact text was recorded
			const folder = join(root, '.claude/skills')
			const manifest = readSyncManifest(folder)
			write(
				'.claude/skills/.dialecte-skills.json',
				JSON.stringify({ ...manifest, sessionCheckInserted: undefined }),
			)
			write(
				SETTINGS,
				JSON.stringify(
					{ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: OLD }] }] } },
					null,
					2,
				),
			)

			expect(syncSessionCheck({ cwd: root, enabled: false })).toBe('removed')

			expect(commandsOf()).toEqual([])
		})
	})
})
