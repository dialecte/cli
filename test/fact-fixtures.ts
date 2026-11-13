/** Whole facts and the files of a facts folder, as the facts ledger's tests build and read them. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Fact, FactDraft, HistoryLine } from '../src/lib/knowledge/facts/facts.types.ts'

/** A whole draft (a standard fact, medium effort); `changes` replace members whole. */
export function factDraft(changes: Partial<FactDraft> = {}): FactDraft {
	return {
		question: 'Is D required in A?',
		subject: {
			package: 'core-test',
			tags: [{ tag: 'D', parent: 'A' }],
			attributes: [],
			codes: [],
			methods: [],
		},
		kind: 'cardinality',
		answer: { verdict: 'yes', value: null, text: 'D is required in A.' },
		source: 'standard',
		effort: 'medium',
		evidence: [],
		by: { agent: 'researcher' },
		sources: [{ kind: 'standard', standard: 'example-0000', files: 'sha256:aa' }],
		...changes,
	}
}

/** The text of a file of the facts folder. */
export function factFolderText(params: { folder: string; name: string }): string {
	return readFileSync(join(params.folder, params.name), 'utf8')
}

/** A fact file, parsed whole. */
export function readFactFile(params: { folder: string; id: string }): Fact {
	return JSON.parse(factFolderText({ folder: params.folder, name: `${params.id}.json` })) as Fact
}

/** The id a key's pointer file holds (its text, newline included); undefined when there is no pointer. */
export function readPointerText(params: { folder: string; key: string }): string | undefined {
	const path = join(params.folder, 'by-key', params.key)
	return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

/** The lines of a fact's history file, each parsed whole (a line that does not parse fails the test). */
export function readHistoryFile(params: { folder: string; id: string }): HistoryLine[] {
	const path = join(params.folder, `${params.id}.history.jsonl`)
	if (!existsSync(path)) return []
	return readFileSync(path, 'utf8')
		.split('\n')
		.filter((line) => line !== '')
		.map((line) => JSON.parse(line) as HistoryLine)
}

/** Replaces a fact file whole with `fact` (a test that sets up a state the ledger reached another way). */
export function writeFactFile(params: { folder: string; fact: Fact }): void {
	writeFileSync(
		join(params.folder, `${params.fact.id}.json`),
		`${JSON.stringify(params.fact, null, 2)}\n`,
	)
}
