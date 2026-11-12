/**
 * The temporary tree a `dialecte facts` test runs in: a data folder, a home folder and a working folder under one
 * scratch folder removed when the test ends, and the environment that points the command at them (never the real
 * data folder), with the facts the test records into it.
 */
import { join } from 'node:path'

import { factsFolder } from '../src/lib/knowledge/facts/data-folder.ts'
import { recordFact } from '../src/lib/knowledge/facts/record-fact.ts'
import { FACTS_NOW } from './facts-workspace.constants.ts'
import { temporaryFolder } from './scratch-repository.ts'

import type { FactDraft } from '../src/lib/knowledge/facts/facts.types.ts'
import type { PrintedText } from '../src/lib/print/print.types.ts'
import type { FactsWorkspace } from './facts-workspace.types.ts'

/** A workspace with its own `XDG_DATA_HOME`; the facts folder is not made yet. */
export function createFactsWorkspace(): FactsWorkspace {
	const base = temporaryFolder('dialecte-facts-')
	const dataHome = join(base, 'data')
	const home = join(base, 'home')
	const environment: NodeJS.ProcessEnv = { XDG_DATA_HOME: dataHome, HOME: home }
	return {
		base,
		dataHome,
		folder: factsFolder({ environment }),
		cwd: join(base, 'project'),
		environment,
	}
}

/** Records a draft in the workspace's ledger at the fixed clock and answers the id it got. */
export function recordInto(params: {
	workspace: FactsWorkspace
	draft: FactDraft
	lot?: string
	ask?: string
}): string {
	return recordFact({
		folder: params.workspace.folder,
		draft: params.draft,
		lot: params.lot ?? null,
		ask: params.ask ?? null,
		now: () => FACTS_NOW,
	}).id
}

/** The lines of a command's output, trimmed, the empty ones left out. */
export function outputLinesOf(output: PrintedText | string): string[] {
	return output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '')
}

/** The id each fact line starts with; a line that does not start with an id (a hint, a header) gives none. */
export function leadingIdsOf(lines: readonly string[]): string[] {
	return lines.flatMap((line) => /^F-\d+/.exec(line)?.slice(0, 1) ?? [])
}
