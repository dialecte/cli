/** Scratch packages, texts and readers of the duplicate case id scenarios (RG1). */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	ADD_FILE,
	ADD_IMPORT_LINE,
	ADD_STUB,
	VITEST_IMPORT_LINE,
} from './rule-gaps-duplicate-ids.constants.ts'
import { writeFiles } from './scratch-repository.ts'
import { createVitestPackage } from './scratch-vitest-package.ts'

import type { TddLedger, TddReceipt } from '../src/lib/tdd/tdd.types.ts'

/** A vitest package whose base holds the `add` stub, with `tests` written on top, uncommitted: the lot's new test files. */
export function duplicatePackage(params: {
	tests: Record<string, string>
	dialecte?: Record<string, unknown>
}): string {
	const root = createVitestPackage({ files: { [ADD_FILE]: ADD_STUB }, dialecte: params.dialecte })
	writeFiles({ root, files: params.tests })
	return root
}

/** The ledger of the package's worktree; empty before any run wrote it. */
export function readDuplicateLedger(root: string): TddLedger {
	const path = join(root, '.git', 'dialecte-tdd.json')
	return existsSync(path)
		? (JSON.parse(readFileSync(path, 'utf8')) as TddLedger)
		: { version: 3, entries: [] }
}

/** The receipts of the ledger (its freezes left out), as `<kind> <name>`. */
export function receiptLinesOf(root: string): string[] {
	return readDuplicateLedger(root)
		.entries.filter((entry): entry is TddReceipt => entry.kind !== 'freeze')
		.map((receipt) => `${receipt.kind} ${receipt.name}`)
}

/** The files the ledger's freezes hold, in ledger order. */
export function frozenFilesOf(root: string): string[] {
	return readDuplicateLedger(root).entries.flatMap((entry) =>
		entry.kind === 'freeze' ? Object.keys(entry.files) : [],
	)
}

/** The lines of an output that report a case: its judgement or a duplicate left unjudged. */
export function caseLinesOf(output: string): string[] {
	return output
		.split('\n')
		.filter((line) => /^(red|refused|green|unchanged|kept|accepted|revised|duplicate) /.test(line))
}

/** The label and the case id of a case line (`refused  <file>::<name>  <reason>`), the padding left out; an id never holds two spaces. */
export function labelAndIdOf(line: string): [string, string] {
	const [, label, id] = /^(\S+) +(.+?)(?: {2}|$)/.exec(line) ?? []
	return [label ?? '', id ?? '']
}

/** `text` with every character a regular expression reads as syntax escaped. */
export function escapedForRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The `moved` lines of an output. */
export function movedLinesOf(output: string): string[] {
	return output.split('\n').filter((line) => /^moved {2}/.test(line))
}

/** A test file of the `add` stub: the cases `a` (1 + 2) and a second one titled `secondTitle` (2 + 2). */
export function addPairText(params: { secondTitle: string }): string {
	return [
		VITEST_IMPORT_LINE,
		ADD_IMPORT_LINE,
		"it('a', () => { expect(add(1, 2)).toBe(3) })",
		`it('${params.secondTitle}', () => { expect(add(2, 2)).toBe(4) })`,
		'',
	].join('\n')
}
