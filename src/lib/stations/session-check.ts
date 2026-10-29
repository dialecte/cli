/**
 * The Claude Code `SessionStart` hook that runs `dialecte doctor --brief`, inserted into the project's
 * `.claude/settings.json` by minimal text edits (`jsonc-parser`): everything outside the hook stays byte for
 * byte, comments, line ends and indentation included. The manifest records that sync added it, so only a hook
 * sync added is ever removed.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { AGENT_SKILL_FOLDERS } from '../skills/sync-skills.constants.ts'
import { readSyncManifest } from '../skills/sync-skills.ts'
import {
	CLAUDE_SETTINGS_FILE,
	NEW_SETTINGS_FILE,
	MAX_CUTS,
	SESSION_CHECK_COMMAND_PATTERN,
	SESSION_CHECK_GROUP,
} from './session-check.constants.ts'
import { updateStationManifest } from './station-manifest.ts'

import { findNodeAtLocation, getNodeValue, parse, parseTree } from 'jsonc-parser'

import type { HookGroup, HookHandler, SessionCheckState, Settings } from './session-check.types.ts'
import type { JSONPath, Node, ParseError } from 'jsonc-parser'

export function syncSessionCheck(params: { cwd: string; enabled: boolean }): SessionCheckState {
	const { cwd, enabled } = params
	const manifestFolder = join(cwd, AGENT_SKILL_FOLDERS.claude)
	const recorded = readSyncManifest(manifestFolder).sessionCheck === true
	const path = join(cwd, CLAUDE_SETTINGS_FILE)
	if (!enabled && !recorded) return 'unchanged'
	const exists = existsSync(path)
	if (!exists && !enabled) {
		updateStationManifest({
			folder: manifestFolder,
			patch: { sessionCheck: false, settingsCreated: false, sessionCheckInserted: undefined },
		})
		return 'unchanged'
	}

	const text = exists ? readFileSync(path, 'utf8') : NEW_SETTINGS_FILE
	const settings = parseSettings(text)
	if (settings === undefined) return 'invalid'
	if (!hasValidHooks(settings)) return 'invalid-hooks'
	const present = holdsCheck(settings)

	if (!enabled) {
		const manifest = readSyncManifest(manifestFolder)
		if (present) {
			const without = withoutCheck({ text, inserted: manifest.sessionCheckInserted })
			if (without === undefined) return 'not-removed'
			writeOrDelete({ path, text: without, created: manifest.settingsCreated === true })
		}
		updateStationManifest({
			folder: manifestFolder,
			patch: { sessionCheck: false, settingsCreated: false, sessionCheckInserted: undefined },
		})
		return present ? 'removed' : 'unchanged'
	}
	if (present) return recorded ? 'unchanged' : 'kept'
	mkdirSync(dirname(path), { recursive: true })
	const added = withCheck(text)
	writeFileSync(path, added.text)
	updateStationManifest({
		folder: manifestFolder,
		patch: {
			sessionCheck: true,
			settingsCreated: !exists,
			sessionCheckInserted: added.inserted,
		},
	})
	return 'added'
}

/** The edited text; a file sync created that holds nothing else any more is deleted instead. */
function writeOrDelete(params: { path: string; text: string; created: boolean }): void {
	const left = parseSettings(params.text)
	if (params.created && left !== undefined && Object.keys(left).length === 0)
		unlinkSync(params.path)
	else writeFileSync(params.path, params.text)
}

/** JSON with comments and trailing commas as Claude Code reads it; undefined for anything but an object. */
function parseSettings(text: string): Settings | undefined {
	const errors: ParseError[] = []
	const parsed: unknown = parse(text, errors, { allowTrailingComma: true })
	if (errors.length > 0) return undefined
	return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
		? (parsed as Settings)
		: undefined
}

/** `hooks` absent or an object, and its `SessionStart` absent or a list: the only shapes the edit understands. */
function hasValidHooks(settings: Settings): boolean {
	const { hooks } = settings
	if (hooks === undefined) return true
	if (typeof hooks !== 'object' || hooks === null || Array.isArray(hooks)) return false
	return hooks.SessionStart === undefined || Array.isArray(hooks.SessionStart)
}

/** The indentation unit and the line end the file already uses; two spaces and LF for a new one. */
function layoutOf(text: string): { unit: string; eol: string } {
	return {
		unit: /^[ \t]*\{\r?\n(\t| +)\S/.exec(text)?.[1] ?? '  ',
		eol: text.includes('\r\n') ? '\r\n' : '\n',
	}
}

/** The whitespace opening the line that holds `offset`. */
function lineIndentAt(params: { text: string; offset: number }): string {
	const lineStart = params.text.lastIndexOf('\n', params.offset - 1) + 1
	return /^[ \t]*/.exec(params.text.slice(lineStart))?.[0] ?? ''
}

/**
 * Inserts `entry` (a property `"key": value`, or an array element) as the last member of the object or array at
 * `path`, laid out like the file around it. One contiguous splice, returned with the text it added: nothing
 * else in the file changes, and deleting `inserted` gives the original bytes back.
 */
function appendMember(params: { text: string; path: JSONPath; entry: string }): {
	text: string
	inserted: string
} {
	const { text, path } = params
	const container = findNodeAtLocation(parseTree(text) as Node, path) as Node
	const { unit, eol } = layoutOf(text)
	const parentIndent = lineIndentAt({ text, offset: container.offset })
	const members = container.children ?? []
	const last = members[members.length - 1]
	const lastIndent = last ? lineIndentAt({ text, offset: last.offset }) : ''
	const memberIndent = lastIndent === '' ? parentIndent + unit : lastIndent
	const entry = params.entry.split('\n').join(`${eol}${memberIndent}`)
	if (last) {
		const inserted = `,${eol}${memberIndent}${entry}`
		const end = last.offset + last.length
		return { text: `${text.slice(0, end)}${inserted}${text.slice(end)}`, inserted }
	}
	// an empty container: the new member goes right after the opening bracket, what was inside stays
	const inner = container.offset + 1
	const closing = container.offset + container.length - 1
	const holdsLineBreak = text.slice(inner, closing).includes('\n')
	const inserted = `${eol}${memberIndent}${entry}${holdsLineBreak ? '' : `${eol}${parentIndent}`}`
	return { text: `${text.slice(0, inner)}${inserted}${text.slice(inner)}`, inserted }
}

function render(params: { value: unknown; text: string }): string {
	return JSON.stringify(params.value, null, layoutOf(params.text).unit)
}

function sessionStartGroups(settings: Settings): HookGroup[] {
	const groups = settings.hooks?.SessionStart
	return Array.isArray(groups) ? (groups as HookGroup[]) : []
}

function isCheck(handler: HookHandler): boolean {
	return typeof handler.command === 'string' && SESSION_CHECK_COMMAND_PATTERN.test(handler.command)
}

function handlersOf(group: HookGroup): HookHandler[] {
	return Array.isArray(group.hooks) ? (group.hooks as HookHandler[]) : []
}

function holdsCheck(settings: Settings): boolean {
	return sessionStartGroups(settings).some((group) => handlersOf(group).some(isCheck))
}

function withCheck(text: string): { text: string; inserted: string } {
	const settings = parseSettings(text) ?? {}
	if (Array.isArray(settings.hooks?.SessionStart))
		return appendMember({
			text,
			path: ['hooks', 'SessionStart'],
			entry: render({ value: SESSION_CHECK_GROUP, text }),
		})
	if (settings.hooks !== undefined)
		return appendMember({
			text,
			path: ['hooks'],
			entry: `"SessionStart": ${render({ value: [SESSION_CHECK_GROUP], text })}`,
		})
	return appendMember({
		text,
		path: [],
		entry: `"hooks": ${render({ value: { SessionStart: [SESSION_CHECK_GROUP] }, text })}`,
	})
}

/**
 * The text without the check: the exact bytes the add inserted are deleted (the file as it was before the add).
 * When they are no longer there as they were (the user edited the file), only our handler is dropped, and its
 * group when it holds nothing else.
 */
function withoutCheck(params: { text: string; inserted: string | undefined }): string | undefined {
	const { text, inserted } = params
	if (inserted !== undefined && text.indexOf(inserted) === text.lastIndexOf(inserted)) {
		const at = text.indexOf(inserted)
		if (at >= 0) {
			const restored = `${text.slice(0, at)}${text.slice(at + inserted.length)}`
			const settings = parseSettings(restored)
			if (settings !== undefined && !holdsCheck(settings)) return restored
		}
	}
	return withoutHandler(text)
}

/**
 * Drops our handlers (and a group left with nothing else) by cutting their own text, one at a time, re-reading
 * the file after each cut. The result must parse, and equal the original settings minus our handlers and the
 * groups they leave empty: otherwise nothing is written (undefined).
 */
function withoutHandler(text: string): string | undefined {
	const expected = JSON.stringify(settingsWithoutCheck(parseSettings(text) ?? {}))
	let current = text
	for (let cut = 0; cut < MAX_CUTS; cut++) {
		const next = withoutFirstHandler(current)
		if (next === undefined) break
		current = next
	}
	const result = parseSettings(current)
	return result !== undefined && JSON.stringify(result) === expected ? current : undefined
}

/** One cut: the first check handler in document order, or its group when it is the group's only handler. */
function withoutFirstHandler(text: string): string | undefined {
	const tree = parseTree(text, [], { allowTrailingComma: true })
	const groupsNode = tree && findNodeAtLocation(tree, ['hooks', 'SessionStart'])
	if (groupsNode?.type !== 'array') return undefined
	const groups = groupsNode.children ?? []
	for (const [groupIndex, group] of groups.entries()) {
		const handlersNode = findNodeAtLocation(group, ['hooks'])
		const handlers = handlersNode?.type === 'array' ? (handlersNode.children ?? []) : []
		const checks = handlers.flatMap((handler, index) =>
			isCheck((getNodeValue(handler) ?? {}) as HookHandler) ? [index] : [],
		)
		if (checks.length === 0) continue
		return checks.length === handlers.length
			? cutChild({ text, container: groupsNode, index: groupIndex })
			: cutChild({ text, container: handlersNode as Node, index: checks[0] })
	}
	return undefined
}

/**
 * Cuts one element out of an array: from the end of the one before it (so its comma goes with it), or, for the
 * first, up to the start of the next one; a lone element empties the brackets.
 */
function cutChild(params: { text: string; container: Node; index: number }): string {
	const { text, container, index } = params
	const children = container.children ?? []
	const node = children[index]
	const nodeEnd = node.offset + node.length
	let start = node.offset
	let end = nodeEnd
	if (children.length === 1) {
		const inner = container.offset + 1
		const closing = container.offset + container.length - 1
		if (/^[\s,]*$/.test(text.slice(inner, node.offset) + text.slice(nodeEnd, closing))) {
			start = inner
			end = closing
		}
	} else if (index > 0) {
		start = children[index - 1].offset + children[index - 1].length
	} else {
		end = children[1].offset
	}
	return `${text.slice(0, start)}${text.slice(end)}`
}

/** The parsed settings without our handlers, and without the groups that held nothing else. */
function settingsWithoutCheck(settings: Settings): Settings {
	const groups = settings.hooks?.SessionStart
	if (!Array.isArray(groups) || !settings.hooks) return settings
	const kept = (groups as HookGroup[]).flatMap(function withoutCheck(group): HookGroup[] {
		const handlers = handlersOf(group)
		if (!handlers.some(isCheck)) return [group]
		const rest = handlers.filter((handler) => !isCheck(handler))
		return rest.length ? [{ ...group, hooks: rest }] : []
	})
	return { ...settings, hooks: { ...settings.hooks, SessionStart: kept } }
}

/** True when the settings file holds nothing but the session-start check: no key of the user's own. */
export function holdsOnlyTheCheck(text: string): boolean {
	const settings = parseSettings(text)
	if (settings === undefined) return false
	const { hooks, ...others } = settings
	if (Object.keys(others).length > 0 || hooks === undefined) return false
	if (typeof hooks !== 'object' || hooks === null || Array.isArray(hooks)) return false
	if (Object.keys(hooks).some((event) => event !== 'SessionStart')) return false
	const groups = sessionStartGroups(settings)
	return groups.length > 0 && groups.every((group) => handlersOf(group).every(isCheck))
}
