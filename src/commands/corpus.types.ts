import type { ShippedCorpus } from '../lib/corpus/corpus.types.ts'

/** What `runCorpus` reads: the words, the machine, and the manifest with its override files (the shipped ones in the cli). */
export type RunCorpusParams = {
	/** The folder the command runs from: config.yml's repository entry is read for it. */
	cwd: string
	argv: string[]
	environment: Readonly<Record<string, string | undefined>>
	platform: NodeJS.Platform
	home: string
	shipped: ShippedCorpus
}

/** The verbs of `dialecte corpus`. */
export type CorpusVerb = 'fetch' | 'list' | 'check' | 'add'
