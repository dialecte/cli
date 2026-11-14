import type {
	AskAngle,
	AskCandidate,
	AskKind,
	AskOutcome,
	AskSlice,
} from '../lib/knowledge/ask/ask.types.ts'
import type { FactAnswer, FactEffort, FactSubject } from '../lib/knowledge/facts/facts.types.ts'
import type { ASK_JSON_SCHEMA } from './ask.constants.ts'

/**
 * What `runAsk` takes: the command line after `ask`, the folder it runs in, and the environment it reads
 * (`XDG_STATE_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `DIALECTE_STANDARD`, `HOME`; the process environment when
 * left out).
 */
export type RunAskParams = {
	argv: string[]
	cwd: string
	environment?: NodeJS.ProcessEnv
}

/** What `ask --json` says of the documents: configured, readable, the declared name and key, the folders read. */
export type AskStandardJson = {
	configured: boolean
	documents: boolean
	name: string | null
	key: string | null
	folders: string[]
	/** Each folder's files key, by folder id. */
	files: Record<string, string>
}

/** What `ask --json` prints and `A-<n>/ask.json` holds (section 3, D20). */
export type AskJson = {
	/** The version of this object's shape (D30). */
	schema: typeof ASK_JSON_SCHEMA
	ask: string
	question: string
	subject: FactSubject
	kind: AskKind
	decision: boolean
	rung: AskOutcome['rung']
	state: AskOutcome['state']
	answer: FactAnswer | null
	fact: string | null
	source: AskOutcome['source']
	/** The definition's answer on a resolved structural `--decision` ask: the limit of what is valid (D29). */
	boundary: AskOutcome['boundary']
	/** The prose that answered naming what the definition rejects (D29); null when none. */
	conflict: AskOutcome['conflict']
	candidates: AskCandidate[]
	methods: string[]
	angles: AskAngle[]
	slices: AskSlice[]
	effort: { level: FactEffort }
	next: string | null
	standard: AskStandardJson
}
