import type {
	AdjudicatorBriefJson,
	Agreed,
	AskAngle,
	AskFolder,
	AskBoundary,
	AskCandidate,
	AskConflict,
	AskKind,
	AskOutcome,
	AskPool,
	AskRecordView,
	AskRequestRecord,
	AskRound,
	AskSetup,
	AskSlice,
	AskStandard,
	AskState,
	CheckedReport,
	ManifestFile,
	PackRecord,
	PersonAnswerVerdict,
	PoolSlice,
	ReaderLetter,
	ReaderMiss,
	ReadQuestion,
	ReportCite,
	RoundOutcome,
	StandardSelection,
	VerdictReport,
} from '../lib/knowledge/ask/ask.types.ts'
import type { FactAnswer, FactEffort, FactSubject } from '../lib/knowledge/facts/facts.types.ts'
import type {
	ASK_JSON_SCHEMA,
	PACK_JSON_SCHEMA,
	PACK_STATES,
	VERDICT_JSON_SCHEMA,
} from './ask.constants.ts'

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

/** What `runAskPack` takes: `runAsk`'s parameters, and the seams of the nonces and the clock (D7). */
export type RunAskPackParams = RunAskParams & {
	nonce?: () => string
	now?: () => Date
}

/**
 * The rounds of an ask a pack may follow, and where the adjudicator stands: null for readers; else the latest round
 * (the readers' round closed for it, or `open`: the adjudicator's round, its brief written, its report awaited).
 */
export type OpenedRounds = {
	rounds: AskRound[]
	adjudicator: { latest: AskRound; open: boolean } | null
}

/** What the adjudicator's pack takes: the pack's parameters and what it read of the ask (D38). */
export type PackAdjudicatorParams = RunAskPackParams & {
	environment: NodeJS.ProcessEnv
	ask: string
	askFolder: string
	/** The ask's latest round: the readers' round closed for the adjudicator, or (open) the adjudicator's own. */
	latest: AskRound
	/** True when the adjudicator's brief is written and its report awaited: printed again, nothing rewritten. */
	open: boolean
	request: AskRequestRecord
	record: AskRecordView
	json: boolean
	out: string | undefined
}

/**
 * What `runAskVerdict` takes: `runAsk`'s parameters, the seam of the clock, the seam that forces an order of two
 * runs (called once the run holds the round's claim and the ask's claim, before it records anything; awaited) and
 * the seam that forces a crash or an interleaving (called right after the fact is recorded, before the round is
 * closed; awaited, so a case may run another command there or throw).
 */
export type RunAskVerdictParams = RunAskParams & {
	now?: () => Date
	afterClaim?: () => Promise<void> | void
	/** Called once the accepted nonces are claimed, before the outcome is computed: forces a crash (R1-4). */
	afterNonces?: () => Promise<void> | void
	/** Called right after the person's question is raised: forces a crash between the raise and the rest (J-2). */
	afterRaise?: () => Promise<void> | void
	/** Replaces the rebuilt pool with one a search of another order gives (same slices, other ids): a seam (I-6). */
	reindexPool?: (pool: PoolSlice[]) => PoolSlice[]
	afterFact?: () => Promise<void> | void
}

/**
 * What `runAskAnswer` takes: `runAsk`'s parameters (the command line after `answer`), the seam of the clock and the
 * seam that forces a crash or an interleaving (called right after the person's fact is recorded, before
 * `answer.json` is published; awaited).
 */
export type RunAskAnswerParams = RunAskParams & {
	now?: () => Date
	afterFact?: () => Promise<void> | void
}

/** The command line of `ask answer` read: the ask id, the text, who answers, the cite and the options given. */
export type AnswerOptions = {
	ask: string
	text: string
	by: string
	cite: ReportCite | null
	/** The verdict `--verdict` gives the person's fact (U19); null when not given. */
	verdict: PersonAnswerVerdict | null
	lot: string | undefined
	json: boolean
}

/**
 * What the person's cite came to: its refusal by the cite check, else the reader miss (both null without a cite);
 * or the refusal of documents that cannot be read as the ask read them.
 */
export type AnswerCiteCheck =
	| { citeRefused: string | null; miss: ReaderMiss | null }
	| { refused: string; exitCode: 1 | 2 }

/** What `ask answer --json` prints (schema 1, U5). */
export type AskAnswerJson = {
	schema: 1
	ask: string
	fact: string
	miss: ReaderMiss | null
	citeRefused: string | null
}

/** The command line of `ask verdict` read: the ask id, the report files and the options given. */
export type VerdictOptions = {
	ask: string
	files: string[]
	lot: string | undefined
	adjudicator: boolean
	json: boolean
	/** The readers declared with `--missing <L>`: they wrote nothing (I-12). */
	missing: string[]
}

/** The round a verdict checks: the ask read, the round open and what was issued in it (D14). */
export type VerdictRound = {
	ask: string
	askFolder: string
	record: AskRecordView
	request: AskRequestRecord
	rounds: AskRound[]
	round: AskRound
	/** The readers' pack of the round, or null for the adjudicator's round. */
	pack: PackRecord | null
	/** The adjudicator's brief of the round, or null for a readers' round. */
	adjudicator: AdjudicatorBriefJson | null
}

/** What a verdict reads with: the setup and documents, the question as read, the definition's live answer (D10). */
export type VerdictSetup = {
	setup: AskSetup
	pool: Extract<AskPool, { pool: unknown }> | null
	read: ReadQuestion | null
	definition: AskBoundary | null
}

/** One report file after its checks, with the letter it names. */
export type CheckedReportFile = { file: string; letter: string; checked: CheckedReport }

/** What `recordedAnswerOf` takes: the open round, the setup, what was agreed, the reports, the ask's place, the clock. */
export type RecordedAnswerOfParams = {
	opened: VerdictRound
	setup: VerdictSetup
	agreed: Agreed
	checked: CheckedReportFile[]
	place: AskFolder
	now: (() => Date) | undefined
}

/** What `reaskOutcomeOf` takes: the open round, the setup (its ledger) and what the round came to. */
export type ReaskOutcomeOfParams = {
	opened: VerdictRound
	setup: VerdictSetup
	outcome: RoundOutcome
}

/** What a verdict recorded on an answered round: the fact and the conflict a `--decision` ask flagged. */
export type RecordedAnswer = {
	fact: string | null
	conflict: AskConflict | null
	/** True when this run recorded the fact; false when it found one an earlier run recorded for the ask (R1-4). */
	recordedNow: boolean
}

/** What `ask verdict --json` prints (schema 1, U5). */
export type AskVerdictJson = {
	schema: typeof VERDICT_JSON_SCHEMA
	ask: string
	round: number
	state: AskState
	/** Why the round came to its state (I-15): the outcome's reason; null once answered. */
	reason: string | null
	reports: VerdictReport[]
	fact: string | null
	conflict: AskConflict | null
	next: string | null
}

/** The command line of `ask pack` read: the ask id and the options given. */
export type PackOptions = {
	ask: string
	lot: string | undefined
	out: string | undefined
	outside: boolean
	web: boolean
	json: boolean
}

/** What `ask pack --json` prints (schema 1, U5). */
export type AskPackJson = {
	schema: typeof PACK_JSON_SCHEMA
	ask: string
	round: number
	state: (typeof PACK_STATES)[keyof typeof PACK_STATES]
	readers: { letter: ReaderLetter; brief: string; slices: string[] }[]
	next: string | null
}

/** The documents an ask read, as its request records them: the standard, the selection and the files' manifest. */
export type RequestStandard = {
	standard: AskStandard
	selection: Exclude<StandardSelection, { refused: string }>
	manifest: ManifestFile[]
}

/** What the request record of an ask is made from (D2). */
export type RequestRecordOfParams = Omit<
	AskRequestRecord,
	'schema' | 'package' | 'documents' | 'standard'
> & { packageName: string | null; documentsRead: RequestStandard }

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
