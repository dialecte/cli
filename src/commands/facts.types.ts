import type { DialectesLoader, FactCheck, FactView } from '../lib/knowledge/facts/facts.types.ts'
import type { RoundArguments } from '../lib/review-rounds/review-rounds.types.ts'
import type { FACTS_VERB_OPTIONS, LIST_STATES } from './facts.constants.ts'

/**
 * What `runFacts` takes: the command line after `facts`, the folder it runs in, the environment it reads
 * (`XDG_DATA_HOME`, `HOME`, `DIALECTE_STANDARD`; the process environment when left out), and the check applied
 * to valid facts (the command's own, `factCheckOf`, when left out; it loads the installed dialectes only when a
 * fact read has a schema source).
 */
export type RunFactsParams = {
	argv: string[]
	cwd: string
	environment?: NodeJS.ProcessEnv
	check?: FactCheck
	/** The loader of the installed dialectes, for the tests that observe when it is called (`loadDialectes` when left out). */
	loadDialectes?: DialectesLoader
}

/** The verbs of `facts`. */
export type FactsVerb = keyof typeof FACTS_VERB_OPTIONS

/** What `facts list --state` takes. */
export type ListState = (typeof LIST_STATES)[number]

/** One verb's run: the command's params with the environment settled, the verb's words read, the ledger's folder. */
export type FactsVerbParams = RunFactsParams & {
	environment: NodeJS.ProcessEnv
	read: RoundArguments
	folder: string
}

/** What `facts show --json` answers (`reason` when the check found the fact stale or unverifiable and said why). */
export type FactShowJson = Pick<FactView, 'fact' | 'state' | 'current' | 'reason'> & {
	history: unknown[]
}
