/**
 * The late fixes of a lot (33L1 6b, D19): read from the hand-over folder's `round-<n>.state` files, its
 * `verify.jsonl` and the current state hash of the worktree.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { STORE_FILES } from '../store/store.constants.ts'
import { computeDelta } from './review-delta.ts'
import { VERIFY_LINE_SCHEMA } from './review-rounds.constants.ts'
import { roundNames, snapshotRounds } from './round-names.ts'
import { readWorktreeState } from './worktree-state.ts'

import type { LateFixes, VerifyLine } from './review-rounds.types.ts'

/**
 * The late-fix state of the lot folder `folder`: the last snapshot's `.state` against `stateHash` (the worktree
 * `root`'s current state hash), else the last `verify.jsonl` line (file order, a torn or unreadable line skipped)
 * whose state is `stateHash`, else the number of files of `root` that differ from `round-<n>/`.
 */
export function readLateFixes(params: {
	folder: string
	root: string
	stateHash: string
}): LateFixes {
	const { folder, root, stateHash } = params
	const round = snapshotRounds(folder).at(-1)
	if (round === undefined) return { kind: 'none' }
	const snapshotState = readRoundStateHash({ folder, round })
	if (snapshotState === undefined) return { kind: 'not-checked', round }
	if (snapshotState === stateHash) return { kind: 'none' }
	const verified = readVerifyLines({ folder })
		.filter((line) => line.state === stateHash)
		.at(-1)
	if (verified) return { kind: 'verified', by: verified.by, note: verified.note }
	const files = computeDelta({ root, folder, previous: round, state: readWorktreeState(root) })
	return { kind: 'unverified', round, files: files.length }
}

/** The state hash `round-<round>.state` holds; undefined when the file is missing or does not read. */
function readRoundStateHash(params: { folder: string; round: number }): string | undefined {
	let parsed: unknown
	try {
		parsed = JSON.parse(readFileSync(join(params.folder, roundNames(params.round).state), 'utf8'))
	} catch {
		return undefined
	}
	const stateHash = isRecord(parsed) ? parsed.stateHash : undefined
	return typeof stateHash === 'string' ? stateHash : undefined
}

/**
 * The lines of the folder's `verify.jsonl`, in file order: the text after the last `\n` (a torn line), an empty line
 * and a line that is no verify line are skipped, as the events reader skips them; none when there is no file.
 */
function readVerifyLines(params: { folder: string }): VerifyLine[] {
	let content: string
	try {
		content = readFileSync(join(params.folder, STORE_FILES.verify), 'utf8')
	} catch {
		return []
	}
	const lines = content.split('\n')
	// the text after the last `\n` is a line without its `\n`: never trusted, even when it parses
	lines.pop()
	return lines.flatMap(function verifyLineOf(line) {
		const parsed = parseVerifyLine(line)
		return parsed ? [parsed] : []
	})
}

/** The verify line a text holds: an object with string `by`, `note` and `state`; undefined for anything else. */
function parseVerifyLine(line: string): VerifyLine | undefined {
	if (line === '') return undefined
	let value: unknown
	try {
		value = JSON.parse(line)
	} catch {
		return undefined
	}
	if (!isRecord(value)) return undefined
	const { by, note, state, at } = value
	if (typeof by !== 'string' || typeof note !== 'string' || typeof state !== 'string')
		return undefined
	return { schema: VERIFY_LINE_SCHEMA, at: typeof at === 'string' ? at : '', by, note, state }
}

/** Whether a parsed value is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
