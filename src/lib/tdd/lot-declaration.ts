/**
 * `.dialecte/lot.json`: what the orchestrator declares about the lot in the package root. Never committed
 * (the hand-over and the hygiene leave it out). It holds whether the lot is exempt from the test receipts
 * (`{ "tdd": "exempt: <reason>" }` for a wording, rename or doc-only lot) and the cases it accepts without a
 * red (`"accept": [{ "case": "<file>::<name>", "reason": "..." }]`: a new test of behaviour that already
 * exists, an honest cut of an assertion) and the cases revised at review after their proof
 * (`"revised": [{ "case", "reason" }]`: a red run then records them as revised and freezes them again; the
 * case may also be a file or a glob over files, for every case of them) and the test files whose untitled
 * test calls of the base are gone (`"gone": [{ "file": "<file or glob>", "reason": "..." }]`). Whether an
 * entry names a case or a file is decided here, for `tdd red`, the gate, `tdd status` and the card.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { LOT_FILE } from '../worktree/worktree.constants.ts'
import { matchesGlob } from './match-glob.ts'
import { caseLabel } from './select-cases.ts'
import {
	CASE_ARGUMENT_SEPARATOR,
	CASE_ENTRY_KEYS,
	CASE_LIST_SHAPE,
	GONE_ENTRY_KEYS,
	GONE_LIST_SHAPE,
	LOT_KEYS,
	TDD_EXEMPT_PATTERN,
} from './tdd.constants.ts'

import type {
	LotCaseEntry,
	LotCaseList,
	LotDeclaration,
	LotGoneEntry,
	TddExemption,
	TestCaseId,
} from './tdd.types.ts'

/** The exemption the lot declares, none, or why the declaration cannot be read. */
export function readTddExemption(root: string): TddExemption {
	const declaration = readLotDeclaration(root)
	if ('failure' in declaration) return { kind: 'invalid', reason: declaration.failure }
	if (declaration.tdd === undefined) return { kind: 'none' }
	const exempt = TDD_EXEMPT_PATTERN.exec(String(declaration.tdd))
	return exempt && exempt[1].trim()
		? { kind: 'exempt', reason: exempt[1].trim() }
		: {
				kind: 'invalid',
				reason: `${LOT_FILE}: "tdd" must be "exempt: <reason>", not ${JSON.stringify(declaration.tdd)}`,
			}
}

/** The cases the lot accepts without a red, or why the declaration cannot be read. */
export function readAcceptances(root: string): LotCaseEntry[] | { failure: string } {
	return readCaseList({ root, list: 'accept' })
}

/** The cases the lot declares revised at review, or why the declaration cannot be read. */
export function readRevisions(root: string): LotCaseEntry[] | { failure: string } {
	return readCaseList({ root, list: 'revised' })
}

/** The test files (or globs) whose untitled test calls of the base the lot declares gone, or why the declaration cannot be read. */
export function readGoneEntries(root: string): LotGoneEntry[] | { failure: string } {
	const declaration = readLotDeclaration(root)
	if ('failure' in declaration) return declaration
	const entries = declaration.gone
	const shape = { failure: `${LOT_FILE}: ${GONE_LIST_SHAPE}` }
	if (entries === undefined) return []
	if (!Array.isArray(entries)) return shape
	for (const entry of entries) {
		const unknown = unknownKeyOf({ entry, known: GONE_ENTRY_KEYS })
		if (unknown)
			return {
				failure: `${LOT_FILE}: unknown key "${unknown}" in a "gone" entry (known: ${GONE_ENTRY_KEYS.join(', ')})`,
			}
		if (!isGoneEntry(entry)) return shape
	}
	return entries as LotGoneEntry[]
}

/**
 * The entry of the list that names the case: an exact `<file>::<name>` first; for `revised`, then the
 * first file or glob matching the case's file (`accept` is exact only: no acceptance without a red by
 * glob).
 */
export function findCaseEntry(params: {
	entries: readonly LotCaseEntry[]
	testCase: TestCaseId
	list: LotCaseList
}): LotCaseEntry | undefined {
	const label = caseLabel(params.testCase)
	return (
		params.entries.find((entry) => entry.case === label) ??
		params.entries.find((entry) => entryNamesCase({ ...params, entry: entry.case }))
	)
}

/** The entry of the list names the case: exactly, or (`revised` only) by a file or glob matching its file. */
export function entryNamesCase(params: {
	entry: string
	testCase: TestCaseId
	list: LotCaseList
}): boolean {
	if (params.entry === caseLabel(params.testCase)) return true
	return (
		params.list === 'revised' && entryNamesFile({ entry: params.entry, file: params.testCase.file })
	)
}

/** An entry with no `::` names files: a path or a glob, relative to the package root, matching the file. */
export function entryNamesFile(params: { entry: string; file: string }): boolean {
	return !namesOneCase(params.entry) && matchesGlob({ path: params.file, glob: params.entry })
}

/** The entry names one case (`<file>::<name>`), not files. */
export function namesOneCase(entry: string): boolean {
	return entry.includes(CASE_ARGUMENT_SEPARATOR)
}

function readCaseList(params: {
	root: string
	list: LotCaseList
}): LotCaseEntry[] | { failure: string } {
	const declaration = readLotDeclaration(params.root)
	if ('failure' in declaration) return declaration
	const entries = declaration[params.list]
	const shape = `${LOT_FILE}: ${CASE_LIST_SHAPE.replace('{list}', params.list)}`
	if (entries === undefined) return []
	if (!Array.isArray(entries)) return { failure: shape }
	for (const entry of entries) {
		const unknown = unknownKeyOf({ entry, known: CASE_ENTRY_KEYS })
		if (unknown)
			return {
				failure: `${LOT_FILE}: unknown key "${unknown}" in an "${params.list}" entry (known: ${CASE_ENTRY_KEYS.join(', ')})`,
			}
		if (!isCaseEntry(entry)) return { failure: shape }
	}
	return entries as LotCaseEntry[]
}

function readLotDeclaration(root: string): LotDeclaration | { failure: string } {
	const path = join(root, LOT_FILE)
	if (!existsSync(path)) return {}
	let declaration: LotDeclaration
	try {
		declaration = JSON.parse(readFileSync(path, 'utf8')) as LotDeclaration
	} catch (error) {
		return { failure: `${LOT_FILE}: not JSON (${(error as Error).message})` }
	}
	if (typeof declaration !== 'object' || declaration === null || Array.isArray(declaration))
		return { failure: `${LOT_FILE}: an object is expected` }
	const unknown = Object.keys(declaration).find((key) => !LOT_KEYS.includes(key))
	if (unknown)
		return { failure: `${LOT_FILE}: unknown key "${unknown}" (known: ${LOT_KEYS.join(', ')})` }
	return declaration
}

function isCaseEntry(entry: unknown): entry is LotCaseEntry {
	if (typeof entry !== 'object' || entry === null) return false
	const { case: name, reason } = entry as Record<string, unknown>
	return typeof name === 'string' && typeof reason === 'string' && reason.trim() !== ''
}

function isGoneEntry(entry: unknown): entry is LotGoneEntry {
	if (typeof entry !== 'object' || entry === null) return false
	const { file, reason } = entry as Record<string, unknown>
	return (
		typeof file === 'string' && file !== '' && typeof reason === 'string' && reason.trim() !== ''
	)
}

/** The first key of an entry that its list does not know. */
function unknownKeyOf(params: { entry: unknown; known: readonly string[] }): string | undefined {
	const { entry } = params
	return typeof entry === 'object' && entry !== null
		? Object.keys(entry).find((key) => !params.known.includes(key))
		: undefined
}
