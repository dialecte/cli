/**
 * Every field a verb prints (R5): for each lot state, each field of each record the lot is read from (identity,
 * transitions, answers, registry entry, markers, scenario) is forged in turn with a value holding a line feed, a
 * carriage return, an escape sequence and a `next: FORGED` tail; the text form of the verbs that print the lot
 * (status, wait, result, inbox, recap, answer, stop) keeps no raw control character, no line beyond the unforged
 * output's, and keeps its shape (exit code, first word of each line) whenever it shows the forged field. A field a
 * validator makes the lot read damaged on passes too: a damaged lot prints no forged field.
 */
import { readFileSync, writeFileSync } from 'node:fs'

import { PRINTED_KINDS } from '../../test/lot-printed-fields.constants.ts'
import {
	buildPrintedLot,
	forgeField,
	leavesOf,
	pathOfPrintedFile,
	printedBy,
	printedFilesOf,
	unsafeVerbsOf,
} from '../../test/lot-printed-fields.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PrintedKind, PrintedVerb } from '../../test/lot-printed-fields.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The fields of the kind's records whose forged text escapes: each `<file>#<path>` with the verbs that printed it unsafely. */
async function unsafeFieldsOf(kind: PrintedKind): Promise<Record<string, PrintedVerb[]>> {
	const baseline = await printedBy({ lot: buildPrintedLot(kind), verbs: kind.verbs })
	const unsafe: Record<string, PrintedVerb[]> = {}
	// a real lot is slow to build: its records are put back after each read-only verb instead of built again
	const shared = kind.real ? buildPrintedLot(kind) : undefined
	for (const file of printedFilesOf(kind))
		for (const { path, time } of leavesOf({ value: file.template })) {
			const lot = shared ?? buildPrintedLot(kind)
			const target = pathOfPrintedFile({ lot, file })
			let original: string
			try {
				original = readFileSync(target, 'utf8')
			} catch {
				continue
			}
			if (!forgeField({ file: target, path, time })) continue
			const forged = await printedBy({ lot, verbs: kind.verbs })
			if (shared) writeFileSync(target, original)
			const verbs = unsafeVerbsOf({ baseline, forged })
			if (verbs.length > 0) unsafe[`${file.name}#${path.join('.')}`] = verbs
		}
	return unsafe
}

describe('every field a verb prints', { timeout: STORE_CASE_TIMEOUT * 4 }, () => {
	for (const kind of PRINTED_KINDS)
		it(`${kind.title} -> a forged field never prints a raw control character, a forged line or a changed shape`, async () => {
			await expect(unsafeFieldsOf(kind)).resolves.toEqual({})
		})
})
