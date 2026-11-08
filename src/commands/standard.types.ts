import type { CommandOutput } from '../lib/command-output.types.ts'
import type {
	StandardIndexState,
	StandardInstalledVocabulary,
	StandardReadyIndex,
} from '../lib/knowledge/standard/standard-cache.types.ts'
import type {
	StandardFileVerdict,
	StandardRepeatedLine,
} from '../lib/knowledge/standard/standard-index.types.ts'
import type { StandardFolder } from '../lib/knowledge/standard/standard-input.types.ts'
import type { RoundArguments } from '../lib/review-rounds/review-rounds.types.ts'
import type { STANDARD_VERB_OPTIONS } from './standard.constants.ts'

/**
 * What `runStandard` takes: the command line after `standard`, the folder it runs in, the environment it reads
 * (`DIALECTE_STANDARD`, `XDG_CACHE_HOME`, `HOME`; the process environment when left out), and a test seam
 * called right after the build reads each file's text.
 */
export type RunStandardParams = {
	argv: string[]
	cwd: string
	environment?: NodeJS.ProcessEnv
	afterFileRead?: (params: { path: string }) => void
}

/** The verbs of `standard`. */
export type StandardVerb = keyof typeof STANDARD_VERB_OPTIONS

/** One verb's run: the command's params with the environment settled, and the verb's words read. */
export type StandardVerbParams = RunStandardParams & {
	environment: NodeJS.ProcessEnv
	read: RoundArguments
}

/** The indexes a verb answers from, ready, with the standards skipped for holding no `.md` file. */
export type OpenedStandards = {
	indexes: StandardReadyIndex[]
	skipped: StandardFolder[]
	installed: StandardInstalledVocabulary
}

/** The standards opened, or the answer that says why not (a refusal, an aborted build). */
export type OpenedStandardsAnswer =
	| { kind: 'opened'; opened: OpenedStandards }
	| { kind: 'output'; output: CommandOutput }

/** What `index` says of one file, in `--json` and in its text line. */
export type StandardFileSummary = {
	id: string
	lines: number
	verdict: StandardFileVerdict
	noiseRatio: number
	headings: { kept: number; candidates: number }
	tables: number
	definitions: number
	repeatedLines: StandardRepeatedLine[]
}

/** One standard of `index --json`: a folder with no `.md` file is skipped, with no manifest and no file. */
export type StandardIndexJsonEntry = {
	id: string
	manifest: string | null
	state: StandardIndexState | 'skipped'
	skipped: boolean
	files: StandardFileSummary[]
}

export type OpenStandardsParams = {
	verb: StandardVerb
	params: StandardVerbParams
	standardId?: string
	/** The verb scores slices, so it reads the installed dialectes' vocabulary (`show` does not). */
	scores: boolean
	rebuild?: boolean
	/** Checked once the vocabulary is read, before any build: the `--about` tag of `find`. */
	about?: string
}
