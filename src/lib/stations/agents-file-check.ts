/**
 * The vendor-neutral session-start check: a section of the project's root `AGENTS.md`, owned through its two
 * markers (no manifest field). Everything outside the markers stays byte for byte, line ends included.
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	AGENTS_CHECK_END,
	AGENTS_CHECK_LINE,
	AGENTS_CHECK_START,
	AGENTS_FILE,
} from './agents-file-check.constants.ts'

import type { AgentsFileCheckState, SectionSpan } from './agents-file-check.types.ts'

export function syncAgentsFileCheck(params: {
	cwd: string
	enabled: boolean
}): AgentsFileCheckState {
	const { cwd, enabled } = params
	const path = join(cwd, AGENTS_FILE)
	const exists = existsSync(path)
	const text = exists ? readFileSync(path, 'utf8') : ''
	const found = findSection(text)
	if (found === 'unclosed') return 'unclosed'
	if (enabled) return addOrUpdate({ path, text, span: found })
	if (found === undefined) return 'unchanged'
	const without = withoutSection({ text, span: found })
	if (without.trim() === '') unlinkSync(path)
	else writeFileSync(path, without)
	return 'removed'
}

/** True when the content outside the session-check section is whitespace only. */
export function holdsOnlyTheAgentsCheck(text: string): boolean {
	const span = findSection(text)
	if (span === undefined || span === 'unclosed') return false
	return `${text.slice(0, span.start)}${text.slice(span.end)}`.trim() === ''
}

/** The one section, none, or `unclosed` for a marker without its pair or a doubled marker. */
function findSection(text: string): SectionSpan | undefined | 'unclosed' {
	const starts = occurrencesOf({ text, marker: AGENTS_CHECK_START })
	const ends = occurrencesOf({ text, marker: AGENTS_CHECK_END })
	if (starts.length === 0 && ends.length === 0) return undefined
	if (starts.length !== 1 || ends.length !== 1 || starts[0] > ends[0]) return 'unclosed'
	return { start: starts[0], end: ends[0] + AGENTS_CHECK_END.length }
}

function occurrencesOf(params: { text: string; marker: string }): number[] {
	const offsets: number[] = []
	let from = params.text.indexOf(params.marker)
	while (from >= 0) {
		offsets.push(from)
		from = params.text.indexOf(params.marker, from + params.marker.length)
	}
	return offsets
}

function eolOf(text: string): string {
	return text.includes('\r\n') ? '\r\n' : '\n'
}

function addOrUpdate(params: {
	path: string
	text: string
	span: SectionSpan | undefined
}): AgentsFileCheckState {
	const { path, text, span } = params
	const eol = eolOf(text)
	const section = `${AGENTS_CHECK_START}${eol}${AGENTS_CHECK_LINE}${eol}${AGENTS_CHECK_END}`
	if (span === undefined) {
		writeFileSync(path, `${text}${separatorBefore({ text, eol })}${section}${eol}`)
		return 'added'
	}
	if (text.slice(span.start, span.end) === section) return 'unchanged'
	writeFileSync(path, `${text.slice(0, span.start)}${section}${text.slice(span.end)}`)
	return 'updated'
}

/** One blank line between the user's text and the section; a file not ending with a line end is completed first. */
function separatorBefore(params: { text: string; eol: string }): string {
	const { text, eol } = params
	if (text === '') return ''
	return text.endsWith('\n') ? eol : `${eol}${eol}`
}

/**
 * The text without the section and its own line end; then one blank line next to it, only if there is one: the
 * one before it (the add put it there), or, when the section opens the file, the one after it.
 */
function withoutSection(params: { text: string; span: SectionSpan }): string {
	const { text, span } = params
	const eol = eolOf(text)
	let before = text.slice(0, span.start)
	let after = text.slice(span.end)
	// the line end after the section is the section's own only when the section starts its line
	const startsLine = before === '' || before.endsWith('\n')
	if (startsLine && after.startsWith(eol)) after = after.slice(eol.length)
	if (before.endsWith(`${eol}${eol}`)) before = before.slice(0, -eol.length)
	else if (before === '' && after.startsWith(eol)) after = after.slice(eol.length)
	return `${before}${after}`
}
