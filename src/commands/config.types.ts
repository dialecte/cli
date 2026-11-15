import type { ConfigFinding, ResolvedConfig } from '../lib/config/config.types.ts'
import type { RoundArguments } from '../lib/review-rounds/review-rounds.types.ts'

/** What `runConfig` is given: the folder it runs in, its words, and the machine it reads (never `process.*`). */
export type RunConfigParams = {
	/** The package root holding `.dialecterc`. */
	cwd: string
	argv: string[]
	environment: Readonly<Record<string, string | undefined>>
	platform: NodeJS.Platform
	home: string
}

/** A verb of `config`. */
export type ConfigVerb = 'list' | 'get' | 'set' | 'check'

/** The file `config set` writes: `.dialecterc`, the personal top level, or this repository's `repos:` entry. */
export type ConfigTarget = 'project' | 'personal' | 'repo'

/** One verb's call: the machine, the words read, and the words after the verb. */
export type ConfigCall = { params: RunConfigParams; read: RoundArguments; words: string[] }

/** A finding of a `--json` answer: whether every reader refuses it (D6) or only `check` reports it. */
export type ConfigJsonFinding = ConfigFinding & { refused: boolean }

/** What `list` and `check` report: the resolved config, every finding (old homes included) and the notes. */
export type ConfigReport = {
	resolved: ResolvedConfig
	findings: ConfigJsonFinding[]
	notes: string[]
}

/** A value found at a key path, or none. */
export type ConfigPathValue = { found: true; value: unknown } | { found: false }

/** What `set` is about to write, every check passed. */
export type ConfigWrite = {
	file: string
	keyPath: string
	value: unknown
	target: ConfigTarget
	repo: string
}
