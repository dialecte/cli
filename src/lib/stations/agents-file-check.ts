/**
 * The vendor-neutral session-start check: a section of the project's root `AGENTS.md`, owned through its two
 * markers (no manifest field). Only the marked block is ours: everything outside the markers stays byte for byte,
 * line ends included. The section is written with a blank line inside each marker, the form a markdown formatter
 * keeps, and compared tolerantly (whitespace does not matter: line ends, blank lines, a wrapped sentence). A sync never
 * removes the section nor the file; it creates a missing file only when asked to.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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
	/** Grants making a missing `AGENTS.md`. */
	create: boolean
}): AgentsFileCheckState {
	const { cwd, enabled } = params
	const path = join(cwd, AGENTS_FILE)
	const exists = existsSync(path)
	const text = exists ? readFileSync(path, 'utf8') : ''
	const found = findSection(text)
	if (found === 'unclosed') return 'unclosed'
	if (!enabled) return found === undefined ? 'absent' : 'kept'
	if (!exists && !params.create) return 'missing'
	const state = addOrUpdate({ path, text, span: found })
	return !exists && state === 'added' ? 'created' : state
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
	const section = `${AGENTS_CHECK_START}${eol}${eol}${AGENTS_CHECK_LINE}${eol}${eol}${AGENTS_CHECK_END}`
	if (span === undefined) {
		writeFileSync(path, `${text}${separatorBefore({ text, eol })}${section}${eol}`)
		return 'added'
	}
	if (holdsCurrentSentence(text.slice(span.start, span.end))) return 'unchanged'
	writeFileSync(path, `${text.slice(0, span.start)}${section}${text.slice(span.end)}`)
	return 'updated'
}

/**
 * Whether the body between the markers is the current sentence, whitespace aside: line ends, blank lines around
 * it, a sentence a formatter wrapped over several lines, doubled spaces.
 */
function holdsCurrentSentence(section: string): boolean {
	const body = section.slice(AGENTS_CHECK_START.length, section.length - AGENTS_CHECK_END.length)
	return wordsOf(body) === wordsOf(AGENTS_CHECK_LINE)
}

/** The words of a text joined by one space: every run of whitespace counts as one. */
function wordsOf(text: string): string {
	return text.split(/\s+/).filter(Boolean).join(' ')
}

/** One blank line between the user's text and the section; a file not ending with a line end is completed first. */
function separatorBefore(params: { text: string; eol: string }): string {
	const { text, eol } = params
	if (text === '') return ''
	return text.endsWith('\n') ? eol : `${eol}${eol}`
}
