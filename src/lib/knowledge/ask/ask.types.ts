import type { ApiJson } from '../../api/api-json.types.ts'
import type { LotEvent } from '../../events/event.types.ts'
import type { ModelTierName } from '../../models/model-tiers.types.ts'
import type { StepProgress } from '../../progress/step-progress.types.ts'
import type { Catalogues, ExplainedCode } from '../../run/explain-code.types.ts'
import type { ElementDescription, LoadedDialecte } from '../../schema/schema.types.ts'
import type {
	Fact,
	FactAnswer,
	FactCheck,
	FactEffort,
	FactSource,
	FactSubject,
	FactSubjectTag,
	HistoryLineContext,
} from '../facts/facts.types.ts'
import type {
	StandardInstalledVocabulary,
	StandardReadyIndex,
} from '../standard/standard-cache.types.ts'
import type { StandardFileIndex } from '../standard/standard-index.types.ts'
import type { StandardFolder } from '../standard/standard-input.types.ts'
import type {
	StandardGoldItem,
	StandardSearchIndex,
	StandardSlice,
} from '../standard/standard-search.types.ts'
import type { PERSON_ANSWER_VERDICTS } from './ask.constants.ts'
import type { ANGLE_FAMILIES, READER_LETTERS, RUNG_ONE_SENTENCES } from './ask.constants.ts'

/** What a question asks for. */
export type AskKind =
	| 'children'
	| 'parents'
	| 'required'
	| 'values'
	| 'default'
	| 'fixed'
	| 'type'
	| 'variants'
	| 'documentation'
	| 'code'
	| 'method'
	| 'semantic'

/** The names a question is parsed against: the selected dialectes' vocabulary, the catalogue codes, api paths. */
export type AskVocabulary = {
	tags: readonly string[]
	attributes: readonly string[]
	values: readonly string[]
	codes: readonly string[]
	methods: readonly string[]
}

/** What the parse found: tags (parent null until the context), attributes, enumeration values, codes, methods. */
export type AskSubject = {
	tags: FactSubjectTag[]
	attributes: string[]
	values: string[]
	codes: string[]
	methods: string[]
}

/** What `parseSubject` takes: the question, the vocabulary, and the `--about`, `--code`, `--method` values. */
export type ParseSubjectParams = {
	question: string
	vocabulary: AskVocabulary
	/** `[<Parent>/]<Tag>[@<attr>]`; an attribute-only `@name` is allowed. */
	about?: string | undefined
	code?: string | undefined
	method?: string | undefined
}

/** The subjects a kind's slots took (each undefined when the shape has no such slot). */
export type KindSlots = {
	tag?: string
	parent?: string
	attribute?: string
	code?: string
	rest?: string
}

/** The kind a question asks and its slots, or the refusal naming what is missing. */
export type KindAnswer = { kind: AskKind; slots: KindSlots } | { refused: string }

/** What `kindOf` takes. */
export type KindOfParams = { question: string; subject: AskSubject; kind?: AskKind | undefined }

/** One subject tag in its context: its parent, how many ways it is declared, whether one declaration applies. */
export type ContextTag = {
	tag: string
	parent: string | null
	declarations: number
	resolved: boolean
	packages: string[]
}

/** The question in its dialecte: the package, each subject tag, whether all are resolved, whether a decision is needed. */
export type AskContext = {
	package: string | null
	tags: ContextTag[]
	resolved: boolean
	decision: boolean
}

/** The context and the dialecte it was read from, or the refusal. */
export type ContextAnswer =
	| { context: AskContext; dialecte: LoadedDialecte | undefined }
	| { refused: string }

/** What `resolveContext` takes. */
export type ResolveContextParams = {
	subject: AskSubject
	slots: KindSlots
	dialectes: readonly LoadedDialecte[]
	/** The `--package` value. */
	packageName?: string | undefined
	/** The name of the folder's package when it is a dialecte. */
	ownPackage?: string | undefined
	/** The `--decision` flag. */
	decision?: boolean | undefined
}

/** A rung's answer and the sources it rests on. */
export type RungAnswer = { answer: FactAnswer; sources: FactSource[] }

/** A question as rung 1 reads it: its dialecte, kind, slots and context (what `attributeRefusalOf` takes). */
export type DefinitionQuestion = {
	dialecte: LoadedDialecte
	kind: AskKind
	slots: KindSlots
	context: AskContext
}

/** What `answerFromDefinition` takes. */
export type AnswerFromDefinitionParams = DefinitionQuestion & {
	/** The installed version of the dialecte's package (named in the schema source). */
	version: string
}

/** A placeholder of a kind shape: a tag, an attribute, a code, free words. */
export type SlotPlaceholder = '<T>' | '<A>' | '<C>' | '<rest>'

/** One shape of the kind table: the kind and its words, placeholders among them. */
export type KindShape = { kind: AskKind; shape: string }

/** What a kind forced with `--kind` needs from the subject. */
export type KindSlotNeed = 'tag' | 'attribute' | 'tagOrAttribute' | 'code' | 'rest' | 'nothing'

/** The name of a rung-1 sentence of `RUNG_ONE_SENTENCES`. */
export type RungOneSentence = keyof typeof RUNG_ONE_SENTENCES

/** One of the 14 families of an angle (D11). */
export type AngleFamily = (typeof ANGLE_FAMILIES)[number]

/** What the person asked: the question and the flags that shape the ladder. */
export type AskRequest = {
	question: string
	about?: string
	code?: string
	method?: string
	kind?: AskKind
	decision: boolean
	packageName?: string
	effort: FactEffort
	noFacts: boolean
	limit: number
	/** `--no-standard`: refused while documents exist for the dialecte (D14), the outside route otherwise. */
	noStandard: boolean
	/** `--person-only`: after rung 2 the ask goes to a person, never to readers. */
	personOnly: boolean
}

/**
 * The documents the ask may read: the selected standards' indexes and each folder's files key; or none (with the
 * standard's declared name and its key, null when the dialecte declares none).
 */
export type AskStandard =
	| { kind: 'documents'; indexes: StandardSearchIndex[]; folders: { id: string; files: string }[] }
	| { kind: 'none'; name: string | null; key: string | null }

/** What `selectStandard` takes: the environment and the `dialecte.standard` of the dialecte (undefined when none). */
export type SelectStandardParams = {
	environment: NodeJS.ProcessEnv
	standardName: string | undefined
}

/**
 * Which documents an ask reads: the folders found for the dialecte's standard, none (with the line to print when
 * documents exist under other names), or a refusal (exit 2).
 */
export type StandardSelection =
	| { kind: 'documents'; folderIds: string[]; name: string | null; key: string | null }
	| {
			kind: 'none'
			name: string | null
			key: string | null
			line: string | null
			known: string[]
	  }
	| { refused: string }

/** What `reaskUnchecked` takes (D15): the facts folder, the packages whose standard now has documents, the claim. */
export type ReaskUncheckedParams = {
	factsFolder: string
	packages: readonly string[]
	/** Makes a new ask for a question (the question only) and returns its id. */
	claim: (params: { question: string }) => string
	/** Keeps the re-ask made by `claim`: its id, the question and the id of the fact it re-asks (never its text). */
	keep?: (params: ReaskKept) => void
	/** The store lot the re-asking ask runs in, named in the `rechecked` lines; null (the default) outside one. */
	lot?: string | null
	now?: () => Date
}

/** What `noStandardRefusalOf` takes: the environment and the documents selected for the dialecte. */
export type NoStandardRefusalOfParams = {
	environment: NodeJS.ProcessEnv
	selection: Exclude<StandardSelection, { refused: string }>
}

/**
 * A re-ask made for a fact: the ask's id, the fact's question, the fact's id, and what the fact is about (its
 * subject and kind: the request the re-ask is recorded with, never the fact's answer).
 */
export type ReaskKept = {
	ask: string
	question: string
	fact: string
	subject: FactSubject
	kind: string
}

/** What the ladder reads, loaded once by the command (tests build it in memory). */
export type AskSetup = {
	dialectes: LoadedDialecte[]
	/** The installed version of each dialecte's package, by package name (named in the schema sources). */
	versions: Record<string, string>
	ownPackage?: string
	factsFolder: string
	catalogues: Catalogues
	catalogueHash: string
	apiIndexes: { index: ApiJson; hash: string }[]
	standard: AskStandard
	baseCheck: FactCheck
	now?: () => Date
}

/** One angle of search: a family and its terms. */
export type AskAngle = { id: string; family: AngleFamily; terms: string[] }

/** One slice of the documents the ask hands to the readers. */
export type AskSlice = {
	id: string
	file: string
	from: number
	to: number
	clause: string | null
	angles: string[]
	score: number
	linked: boolean
}

/** A fact of the key that did not answer, and why. */
export type AskCandidate = { fact: string; why: string }

/** What the ladder found: the subject, the rung it stopped at, the state, the answer and what it read. */
export type AskOutcome = {
	subject: FactSubject
	kind: AskKind
	decision: boolean
	context: AskContext
	rung: 0 | 1 | 2 | 3
	state: 'answered' | 'needs-readers' | 'needs-person'
	answer: FactAnswer | null
	fact: string | null
	candidates: AskCandidate[]
	methods: string[]
	angles: AskAngle[]
	slices: AskSlice[]
	/** What the readers would read: the documents (rung 3), the outside route, or null (an answer, or a person). */
	source: 'documents' | 'outside' | null
	/** The definition's answer read live on a resolved structural `--decision` ask (D29): the hard limit; else null. */
	boundary: AskBoundary | null
	/** The prose fact that answered naming what the boundary rejects (D29); else null. */
	conflict: AskConflict | null
}

/** The definition's answer to a `--decision` ask and the source it rests on: the limit of what is valid (D29). */
export type AskBoundary = { answer: FactAnswer; source: FactSource }

/** A prose fact naming what the definition rejects (D29): the fact, and the items (or answer) it names outside. */
export type AskConflict = { kind: 'standard-vs-xsd'; fact: string; outside: string[] }

/** A prose fact's answer held against the boundary: the answer within it, and the conflict when it named more. */
export type BoundedAnswer = { answer: FactAnswer; conflict: AskConflict | null }

/** What `boundaryOf` takes: the request's `--decision` flag, the question read, the setup naming the versions. */
export type BoundaryOfParams = {
	request: Pick<AskRequest, 'decision'>
	read: ReadQuestion
	setup: AskSetup
}

/**
 * What `boundedAnswerOf` takes: the prose fact that answered, the question read (its kind, and the element whose
 * children may be open to names outside the dialecte: D31), the boundary.
 */
export type BoundedAnswerOfParams = { fact: Fact; read: ReadQuestion; boundary: AskBoundary }

/** The one declaration the context resolved for a question's tag: its description, the tag, the parent deciding it. */
export type ResolvedElement = {
	element: ElementDescription
	tag: string
	parent: string | null | undefined
}

/** What `runLadder` takes: the request, what it reads, and the ask and lot names written into history lines. */
export type RunLadderParams = {
	request: AskRequest
	setup: AskSetup
	ask: string | null
	lot: string | null
	/** The rung timing seam (D24): called once per rung run, as it ends, with the time it took. */
	onRung?: (timing: RungTiming) => void
}

/** What `ladderCheckOf` takes. */
export type LadderCheckOfParams = { setup: AskSetup }

/** What `answerFromDialecte` takes (rung 2): of the request, the question and the package it names. */
export type AnswerFromDialecteParams = {
	kind: AskKind
	slots: KindSlots
	request: Pick<AskRequest, 'question' | 'packageName'>
	setup: AskSetup
}

/** What `anglesOf` takes: the subject in its context and what the rungs before found. */
export type AnglesOfParams = {
	subject: AskSubject
	context: AskContext
	kind: AskKind
	question: string
	dialecte: LoadedDialecte | undefined
	/** The paths rung 2 listed for a method question. */
	methods: string[]
	/** The catalogue entries of a code rung 2 explained. */
	explained: ExplainedCode[]
	/** The indexes of the selected standards (the definitions, headings, tables and tag links the families read). */
	standard: StandardSearchIndex[]
}

/** The terms one family gives for one subject, before the terms of earlier families are dropped. */
export type FamilyTerms = { family: AngleFamily; terms: string[] }

/** The slices find answered for one angle. */
export type AngleSlices = { angle: AskAngle; slices: StandardSlice[] }

/** What `mergeSlices` takes: find's own list for the whole question (D27), the per-angle lists, the limit. */
export type MergeSlicesParams = { whole: StandardSlice[]; perAngle: AngleSlices[]; limit: number }

/**
 * What `slicesOf` takes: one `findInStandard` for the question (its `about` the ask's `--about` tag only, the query
 * `standard find` runs), one per angle (their `about` the subject's tag), then the merge.
 */
export type SlicesOfParams = {
	question: string
	angles: AskAngle[]
	indexes: StandardSearchIndex[]
	about?: string | undefined
	questionAbout?: string | undefined
	limit: number
}

/** A question read in its dialecte: its kind and slots, the context, the dialecte (none when no tag decides one). */
export type ReadQuestion = {
	kind: AskKind
	slots: KindSlots
	context: AskContext
	dialecte: LoadedDialecte | undefined
}

/** What `readQuestion` takes: the question, its subject, the kind forced, the package and the flags. */
export type ReadQuestionParams = {
	question: string
	subject: AskSubject
	kind?: AskKind | undefined
	packageName?: string | undefined
	decision: boolean
	setup: AskSetup
}

/** What `answerRungOne` takes: the question read in its dialecte, and the setup naming each package's version. */
export type AnswerRungOneParams = { read: ReadQuestion; setup: AskSetup }

/** What rung 0 found: the fact that answers (none when no fact of the key answers), and the candidates. */
export type ReusedFact = { answer: Fact | undefined; candidates: AskCandidate[] }

/** What `answerFromFacts` takes: the facts folder, the key, the effort asked, the check, the history context. */
export type AnswerFromFactsParams = {
	folder: string
	key: string
	effort: FactEffort
	check: FactCheck
	context: HistoryLineContext
	/** A `--decision` ask (D29): a schema fact of the key never answers, it is a candidate naming the boundary. */
	decision: boolean
}

/** What `vocabularyOfSetup` takes. */
export type VocabularyOfSetupParams = { setup: AskSetup }

/** The names one dialecte gives: its tags, the attributes of their declarations, and the values those enumerate. */
export type DialecteNames = { tags: string[]; attributes: string[]; values: string[] }

/** One slice met by the merge, with the angles that found it. */
export type GatheredSlice = { slice: StandardSlice; angles: string[] }

/** What the ladder says of one source it checks itself: holding (with its source now), or stale and why. */
export type OwnSourceOutcome =
	| { state: 'valid'; source: FactSource }
	| { state: 'stale'; reason: string }

/** What a fact's rung answers again, or why it does not (D9). */
export type RerunAnswer = { answer: RungAnswer } | { unanswered: true }

/** What `rerunRung` takes: the fact's question, subject and kind, and the rung that answered it. */
export type RerunRungParams = {
	question: string
	subject: FactSubject
	kind: string
	rung: 1 | 2
	setup: AskSetup
}

/** What `loadStandardIndexes` takes: where it runs, its environment, the folders and the vocabulary to read. */
export type LoadStandardIndexesParams = {
	cwd: string
	environment: NodeJS.ProcessEnv
	/** The ids of the root's folders to load; every folder of the root when left out. */
	standardIds?: readonly string[]
	/** The one installed dialecte whose vocabulary scores the slices (`--package`); every installed one when left out. */
	packageName?: string
	rebuild?: boolean
	/** False: the installed dialectes are not read, the vocabulary is empty (a read that scores nothing). */
	readVocabulary?: boolean
	/** A refusal of the vocabulary read, checked before any build (`--about` naming a tag no dialecte declares). */
	checkVocabulary?: (params: { installed: StandardInstalledVocabulary }) => string | undefined
	/** The running line, on a terminal only. */
	progress?: StepProgress
	/** A test seam called right after the build reads each file's text. */
	afterFileRead?: (params: { path: string }) => void
}

/** The documents of the ask, and what `standard` prints of them: the ready indexes, the folders without a file. */
export type LoadedStandards = {
	kind: 'loaded'
	standard: Extract<AskStandard, { kind: 'documents' }>
	ready: StandardReadyIndex[]
	skipped: StandardFolder[]
	installed: StandardInstalledVocabulary
	/** Every file of the folders read, as its bytes are now: id, sha256 and original line count, in folder order. */
	manifest: ManifestFile[]
	/** Each file's original lines, from the same bytes as its sha256 (line n at index n - 1). */
	originalLines: Map<string, string[]>
}

/**
 * The standards loaded; a refusal (exit 2, `layout` the expected layout of the root when the refusal is about it);
 * a `packageName` no installed dialecte has (exit 2, the installed ones named); or an aborted build (exit 1).
 */
export type LoadedStandardIndexes =
	| LoadedStandards
	| { kind: 'refused'; message: string; layout?: string }
	| { kind: 'unknownPackage'; name: string; installed: string[] }
	| { kind: 'aborted'; message: string }

/** The folders of the root a load reads, or the refusal of the root, of a folder or of an id it does not hold. */
export type SelectedFolders =
	| { kind: 'selected'; folders: StandardFolder[] }
	| { kind: 'refused'; message: string; layout?: string }

/** What `selectedFoldersOf` takes: the environment and the ids to read (every folder of the root when undefined). */
export type SelectedFoldersOfParams = {
	environment: NodeJS.ProcessEnv
	standardIds: readonly string[] | undefined
}

/** What `askFolderOf` takes: where the command runs, the `--lot` value (`<id|folder>`), the environment it reads. */
export type AskFolderOfParams = {
	cwd: string
	lot: string | undefined
	environment: NodeJS.ProcessEnv
}

/**
 * Where an ask lives (D16, D17): `folder` is the `asks` folder holding `A-<n>/`; `lotName` the store lot's name
 * (null outside a store lot, a hand-over folder included); `lotFolder` the store lot's folder (null likewise);
 * `eventsFile` the lot's `events.jsonl`, else the state folder's `asks/events.jsonl`.
 */
export type AskFolder = {
	folder: string
	lotName: string | null
	lotFolder: string | null
	eventsFile: string
}

/** The folder of an ask, or the refusal (exit 2) naming what failed, where and the fix. */
export type AskFolderAnswer = AskFolder | { refused: string }

/** What `claimAskId` takes: the `asks` folder the `A-<n>` folder is made in (made when missing). */
export type ClaimAskIdParams = { asksFolder: string }

/** What `writeAskEvent` takes: the events file and the event, cut as `cutEvent` cuts it. */
export type WriteAskEventParams = { file: string; event: LotEvent }

/** One rung the ladder ran and how long it took. */
export type RungTiming = { rung: 0 | 1 | 2 | 3; durationMs: number }

/** What `askEventsOf` takes: the ask, its lot's name, the request and the outcome, the rungs run in order. */
export type AskEventsOfParams = {
	ask: string
	lot: string | null
	request: AskRequest
	outcome: AskOutcome
	rungs: RungTiming[]
	now?: () => Date
}

/** What `standardNoteOf` takes: the `asks` folder of a lot. */
export type StandardNoteOfParams = { asksFolder: string }

/** What the ladder reads apart from the documents, loaded once from the folder a command runs in. */
export type AskSetupBase = Omit<AskSetup, 'standard'>

/** What `loadAskSetup` takes: the folder, its environment, the `--package` value, whether facts are read. */
export type LoadAskSetupParams = {
	cwd: string
	environment: NodeJS.ProcessEnv
	packageName?: string | undefined
	/** False: no fact is read nor written (`--no-facts`, the gold run): the check of the facts is not built. */
	facts: boolean
}

/** What `ladderSlicesOf` takes: the setup with its documents, a gold question and its `about`, the limit. */
export type LadderSlicesOfParams = {
	setup: AskSetup
	question: string
	about?: string | undefined
	limit: number
}

/** The setup without its documents, or the refusal (exit 2) saying what failed, where and the fix. */
export type LoadedAskSetup = { setup: AskSetupBase } | { refused: string }

/** What a report says: `yes`, `no`, `depends` (condition in `value`), `value`, `not-in-text`. */
export type ReportVerdict = 'yes' | 'no' | 'depends' | 'value' | 'not-in-text'

/** A cite of a document reader: lines of one file and the words relied on. */
export type ReportCite = { file: string; from: number; to: number; quote: string }

/** One claim of a document report and the verdict it backs. */
export type ReportClaim = { text: string; supports: ReportVerdict; cites: ReportCite[] }

/** A document reader's report. */
export type DocumentReport = {
	ask: string
	round: number
	reader: string
	nonce: string
	verdict: ReportVerdict
	value: string | null
	answer: string
	claims: ReportClaim[]
	notFound: string[]
	familiesRead: string[]
	session: string | null
	/** The tier of the model the reader ran on (R1-19): one of the tier names, refused otherwise; schema stays 1. */
	tier?: ModelTierName
}

/** Where an outside reader's knowledge came from. */
export type OutsideSource = 'model' | 'web'

/** A web cite of an outside reader. */
export type OutsideCite = { url: string; quote: string; retrieved: string }

/** One claim of an outside report. */
export type OutsideClaim = { text: string; supports: ReportVerdict; cites: OutsideCite[] }

/** An outside reader's report: a `source`, `not-known` allowed, no file cites. */
export type OutsideReport = Omit<DocumentReport, 'verdict' | 'claims' | 'session'> & {
	source: OutsideSource
	verdict: ReportVerdict | 'not-known'
	claims: OutsideClaim[]
	session: string | null
}

/** A report read from JSON, or the schema faults found (every one named). */
export type ReadReport<Report> = { report: Report } | { refused: 'schema'; faults: string[] }

/** One logical line of a cited range, original line numbers kept. */
export type RangeLine = { from: number; to: number; kind: string; text: string }

/** What a cite's range holds: its logical lines and its count of non-noise lines. */
export type RangeText = { lines: RangeLine[]; counted: number }

/** A slice given to one reader this round. */
export type GivenSlice = {
	file: string
	from: number
	to: number
	clause: string | null
	title: string | null
	linked: boolean
	quality: 'good' | 'poor'
}

/** A file of the ask's manifest. */
export type ManifestFile = { id: string; sha256: string; lines: number }

/** What a cite is checked against. */
export type CiteContext = {
	manifest: ManifestFile[]
	current: ManifestFile[]
	given: GivenSlice[]
	rangeOf: (params: { file: string; from: number; to: number }) => RangeText
}

/** Why a cite is refused. */
export type CiteRefusal =
	| 'unknown-file'
	| 'file-changed'
	| 'out-of-range'
	| 'range-too-wide'
	| 'not-given'
	| 'quote-not-found'
	| 'quote-length'

/** A cite after its check: verified with the slice that holds it, or refused with the reason. */
export type CheckedCite =
	| { cite: ReportCite; verified: true; slice: GivenSlice }
	| { cite: ReportCite; verified: false; refused: CiteRefusal }

/** The ask's subject as words: its tags, and the terms (codes, methods, content words) naming it. */
export type AskSubjectTerms = { tags: string[]; attributes: string[]; terms: string[] }

/** The dialecte's names a claim can hold. */
export type KeyVocabulary = {
	tags: readonly string[]
	attributes: readonly string[]
	values: readonly string[]
}

/** Why a claim is refused. */
export type ClaimRefusal =
	| 'no-key-term'
	| `term-missing:${string}`
	| 'off-subject'
	| 'does-not-support'

/** A claim after its check. */
export type CheckedClaim = {
	claim: ReportClaim | OutsideClaim
	cites: CheckedCite[]
	verified: boolean
	refused: ClaimRefusal | null
	polarityConflict: boolean
}

/** What a report is accepted against: the ask, the round, the nonces issued and used, the bodies accepted. */
export type AcceptanceContext = {
	ask: string
	round: number
	issued: { reader: string; nonce: string }[]
	used: string[]
	/** The reports accepted before: each one's session and the sha256 of its body (R2-3, R3-3). */
	accepted: { session: string | null; bodyHash: string }[]
	web: boolean
}

/** Why a report is refused. */
export type ReportRefusal =
	| 'schema'
	| 'wrong-ask'
	| 'wrong-round'
	| 'nonce'
	| 'same-session'
	| 'session-missing'
	| 'duplicate'
	| 'no-verified-claim'
	| 'web-not-allowed'
	| 'url-in-model-report'
	| 'document-cite-outside'
	| 'quote-length'
	/** A reader declared with `ask verdict --missing <L>`: it wrote nothing (I-12). */
	| 'missing'

/** A report after acceptance: accepted with its checked claims, or refused with the reason and the faults. */
export type CheckedReport =
	| {
			accepted: true
			report: DocumentReport | OutsideReport
			claims: CheckedClaim[]
			notKnown: boolean
	  }
	| { accepted: false; refused: ReportRefusal; faults: string[] }

/** What the report readers take: the parsed JSON. */
export type ReadReportParams = { value: unknown }

/** What `checkCite` takes. */
export type CheckCiteParams = { cite: ReportCite; context: CiteContext }

/** What `keyTermsOf` takes. */
export type KeyTermsOfParams = {
	text: string
	vocabulary: KeyVocabulary
	subject: AskSubjectTerms
}

/** What `checkClaim` takes: the claim, its checked cites, the report's verdict, the question and its subject. */
export type CheckClaimParams = {
	claim: ReportClaim
	cites: CheckedCite[]
	verdict: ReportVerdict
	/** The report's value: the condition a `depends` report gives (R1-12). */
	value?: string | null
	question: string
	subject: AskSubjectTerms
	vocabulary: KeyVocabulary
}

/** What `checkReport` takes. */
export type CheckReportParams = {
	value: unknown
	outside: boolean
	question: string
	subject: AskSubjectTerms
	vocabulary: KeyVocabulary
	cites: CiteContext
	acceptance: AcceptanceContext
}

/** What `reportBodyOf` takes. */
export type ReportBodyOfParams = { report: DocumentReport | OutsideReport }

/** What the folded text of a quote or a range is made from. */
export type FoldedTextOfParams = { text: string }

/** What a polarity reading takes: a text, the words that anchor the window, and the cues to count. */
export type CueCountParams = {
	text: string
	anchors: string[]
	cues: readonly (readonly string[])[]
}

/** What the report field readers take: the value and where it stands. */
export type FieldReadParams = { value: unknown; path: string }

/** A field read, or the faults found reading it. */
export type FieldResult<Value> = { read: Value } | { faults: string[] }

/** What the list readers take: the field read params and how one item is read. */
export type ListReadParams<Item> = FieldReadParams & {
	readItem: (params: FieldReadParams) => FieldResult<Item>
}

/** What the claim readers take: the field read params and how one cite is read. */
export type ClaimsReadParams<Cite> = FieldReadParams & {
	readCite: (params: FieldReadParams) => FieldResult<Cite>
}

/** A claim of either kind of report: its text, the verdict it backs and its cites. */
export type ClaimOf<Cite> = { text: string; supports: ReportVerdict; cites: Cite[] }

/** A report refused by acceptance. */
export type RefusedReport = Extract<CheckedReport, { accepted: false }>

/** A cite that passed its check. */
export type VerifiedCite = Extract<CheckedCite, { verified: true }>

/** A key term and where it stands in the text. */
export type FoundTerm = { index: number; term: string }

/** What the allowed-word reader takes. */
export type WordReadParams<Word extends string> = FieldReadParams & { allowed: readonly Word[] }

/** One fault's wording: what failed and what to do. */
export type FaultWording = { problem: string; fix: string }

/** What `ask` recorded so `ask pack` can rebuild what the ask read (D2), beside ask.json. */
export type AskRequestRecord = {
	schema: 1
	question: string
	about: string | null
	code: string | null
	method: string | null
	package: string | null
	kind: AskKind
	decision: boolean
	limit: number
	effort: FactEffort
	documents: boolean
	standard: {
		name: string | null
		key: string | null
		folders: string[]
		files: ManifestFile[]
	} | null
}

/** One of the readers of a round. */
export type ReaderLetter = (typeof READER_LETTERS)[number]

/** A slice of the pack's pool: its family, its counted (non-noise) lines and its quality. */
export type PoolSlice = AskSlice & {
	family: AngleFamily
	counted: number
	quality: 'good' | 'poor'
}

/** The slices one reader is given and their counted lines. */
export type ReaderSlices = { letter: ReaderLetter; slices: PoolSlice[]; counted: number }

/** What a closed round gave and what its verified cites came from. */
export type PreviousRound = {
	round: number
	given: { letter: ReaderLetter; slices: string[] }[]
	verifiedAngles: string[]
}

/** The readers of a round, or why nothing is left to give. */
export type ReaderPack =
	| { round: number; readers: ReaderSlices[] }
	| { skipped: true; reason: string }

/** What `rounds/round-<r>/pack.json` holds. */
export type PackRecord = {
	schema: 1
	ask: string
	round: number
	outside: boolean
	web: boolean
	readers: PackReader[]
	at: string
}

/**
 * One reader of a pack: its letter, nonce and slice ids, and (I-6) the slices as the ranges it was given, so a verdict
 * or an answer checks "given" against what the brief held, never a pool rebuilt later (L-1: every pack holds them).
 */
export type PackReader = {
	letter: ReaderLetter
	nonce: string
	slices: string[]
	ranges: PackRange[]
}

/** A slice as a pack recorded it given (I-6): its id, its file and lines, the clause holding it, linked or not. */
export type PackRange = {
	id: string
	file: string
	from: number
	to: number
	clause: string | null
	linked: boolean
}

/** One round of an ask: its number, its folder, its pack and its verdict (null while absent). */
export type AskRound = {
	round: number
	folder: string
	pack: PackRecord | null
	verdict: VerdictRecord | null
	/** The round a pack skipped for nothing left (J-15): its `skipped.json`, null while absent. */
	skipped: SkippedRecord | null
}

/**
 * What `rounds/round-<r>/skipped.json` holds (J-15, schema 1): a round a pack skipped for nothing left to give, the
 * ask then at the person; written once, the ask's state read from it.
 */
export type SkippedRecord = {
	schema: 1
	ask: string
	round: number
	state: 'needs-person'
	reason: string
	at: string
}

/** What `askRoundsOf` takes: the ask's folder. */
export type AskRoundsOfParams = { askFolder: string }

/** The rounds of an ask, or the refusal of a round record that does not read. */
export type AskRoundsOf = { rounds: AskRound[] } | { refused: string }

/** What `readAskRequest` takes: the ask's folder. */
export type ReadAskRequestParams = { askFolder: string }

/** The request record of an ask, absent (an ask made before the readers), or the refusal of one that does not read. */
export type ReadAskRequest = { request: AskRequestRecord } | { absent: true } | { refused: string }

/** What a pack reads of an ask's record: question, state and (when the ladder ran) subject, angles and slices. */
export type AskRecordView = {
	question: string
	state: string
	subject: FactSubject | null
	angles: AskAngle[]
	slices: AskSlice[]
	/** A re-ask's record (D15): the id of the unchecked fact it re-asks; absent on any other ask. */
	reask?: string
}

/** What `readAskRecord` takes: the ask's folder. */
export type ReadAskRecordParams = { askFolder: string }

/** The view of an ask's record, absent (no ask of that id), or the refusal of a record that does not read. */
export type ReadAskRecord = { record: AskRecordView } | { absent: true } | { refused: string }

/** What `askPoolOf` takes: where the command runs, the ask's request and record. */
export type AskPoolOfParams = {
	cwd: string
	environment: NodeJS.ProcessEnv
	request: AskRequestRecord
	record: AskRecordView
	/** The setup already loaded by the caller (loaded here, without facts, when not given). */
	base?: AskSetupBase
}

/**
 * The pool rebuilt for a pack, each file's index by id, the documents as read now (their indexes, each folder's files
 * key, the files' manifest), the setup it was read with and the ask's record as the pool was built from (a re-ask's angles and slices rebuilt from its request, D33);
 * or the refusal (exit 2, or 1 for an aborted build).
 */
export type AskPool =
	| {
			pool: PoolSlice[]
			files: Map<string, StandardFileIndex>
			manifest: ManifestFile[]
			record: AskRecordView
			base: AskSetupBase
			standard: Extract<AskStandard, { kind: 'documents' }>
			/** Each file's original lines (1-based line n at index n - 1): a cite's range text reads them (R1-9). */
			originalLines: Map<string, string[]>
	  }
	| {
			refused: string
			exitCode: 1 | 2
			/** True when the refusal is a file of the ask's manifest moved, removed or added since (R1-18). */
			fileChanged?: true
	  }

/** What `subjectTermsOf` takes: the subject an ask recorded. */
export type SubjectTermsOfParams = { subject: FactSubject }

/** What `placedDialecteOf` takes: the ladder's request and the setup without its documents. */
export type PlacedDialecteOfParams = { request: AskRequest; base: AskSetupBase }

/** The dialecte whose standard an ask reads (none when nothing decides one), or the refusal of the question. */
export type PlacedDialecte = { dialecte: LoadedDialecte | undefined } | { refused: string }

/** What `rangeTextOf` takes: the file's index and the original lines. */
export type RangeTextOfParams = {
	file: StandardFileIndex
	from: number
	to: number
	/** The file's original lines (line n at index n - 1): a logical line cut by the range reads its lines in it. */
	original: readonly string[]
}

/** How readable the lines of a slice are: the worst verdict of the blocks they touch. */
export type SliceQuality = 'good' | 'poor' | 'unreadable'

/** What `sliceQualityOf` takes: the slice and the index of its file. */
export type SliceQualityOfParams = { slice: Pick<AskSlice, 'from' | 'to'>; file: StandardFileIndex }

/** What `packPoolOf` takes: the ask's list, the wider search's slices, the angles and the two readings of a slice. */
export type PackPoolOfParams = {
	listed: AskSlice[]
	wider: AskSlice[]
	angles: AskAngle[]
	countedOf: (params: { slice: AskSlice }) => number
	qualityOf: (params: { slice: AskSlice }) => 'good' | 'poor' | 'unreadable'
}

/** What `readerUnionOf` takes: the slice ids of reader A and of reader B, each in its reader order. */
export type ReaderUnionOfParams = { a: string[]; b: string[] }

/** What `readerSlicesOf` takes: the pool, the effort, the budget in counted lines and the closed rounds. */
export type ReaderSlicesOfParams = {
	pool: PoolSlice[]
	effort: FactEffort
	budget: number
	previous: PreviousRound[]
}

/** The outside route of a brief: the standard's public name and whether the host lets its readers search the web. */
export type OutsideBrief = { name: string | null; web: boolean }

/** What `readerBriefOf` takes. */
export type ReaderBriefOfParams = {
	ask: string
	question: string
	subject: AskSubjectTerms
	angles: AskAngle[]
	reader: ReaderSlices
	nonce: string
	round: number
	rangeText: (params: { slice: PoolSlice }) => RangeText
	/** The outside route (no slice is given), or null for a documents brief. */
	outside: OutsideBrief | null
}

/** A reader's brief as two files: the markdown the reader reads and the json beside it. */
export type ReaderBrief = { markdown: string; json: unknown }

/** One slice of a brief's json: where it is, its quality and its normalised lines. */
export type BriefSlice = {
	id: string
	file: string
	from: number
	to: number
	clause: string | null
	linked: boolean
	quality: 'good' | 'poor'
	lines: RangeLine[]
}

/** What a reader's `.json` brief holds (schema 1). */
export type ReaderBriefJson = {
	schema: 1
	ask: string
	round: number
	reader: ReaderLetter
	nonce: string
	question: string
	subject: AskSubjectTerms
	angles: AskAngle[]
	outside: OutsideBrief | null
	slices: BriefSlice[]
	report: Record<string, unknown>
}

/** The state of an ask once rungs 4-6 are known. */
export type AskState = 'answered' | 'needs-readers' | 'needs-adjudicator' | 'needs-person'

/** A report accepted by the checks, with the letter of the reader it was issued to. */
export type AcceptedReport = Extract<CheckedReport, { accepted: true }> & { letter: string }

/** What the agreeing readers said: the verdict, the value, the shortest agreeing answer, the verified cites. */
export type Agreed = {
	verdict: ReportVerdict
	value: string | null
	answer: string
	cites: ReportCite[]
	letters: string[]
}

/** What a closed round came to (D30). */
export type RoundOutcome =
	| { state: 'answered'; agreed: Agreed }
	| { state: 'next-round'; reason: 'disagreement' | 'dissent' | 'not-in-text' }
	| { state: 'needs-adjudicator'; reason: 'no-agreement' | 'polarity-conflict' }
	| { state: 'needs-person'; reason: string; agreed?: Agreed }

/** One report of a verdict record: accepted (what each claim came to) or refused (the reason and the faults). */
export type VerdictReport =
	| {
			letter: string
			accepted: true
			claims: VerdictClaim[]
			/**
			 * The session and the sha256 of the canonical body of the accepted report, kept in verdict.json for the later
			 * rounds' uniqueness checks (R1-7, R2-3: never the body; neither is printed by `--json`).
			 */
			session?: string | null
			bodyHash?: string
			/** What the reader said, read and did not find, and (outside) whether it did not know (I-5). */
			answer?: string
			familiesRead?: string[]
			notFound?: string[]
			notKnown?: boolean
	  }
	| {
			file: string
			accepted: false
			refused: string
			faults: string[]
			/** The reader a `--missing <L>` declared (I-12): it gave no file. */
			letter?: string
	  }

/** One claim of an accepted report as a verdict keeps it; `quality: 'poor'` when a verified cite reads a poor block (I-11). */
export type VerdictClaim = {
	verified: boolean
	refused: string | null
	polarityConflict: boolean
	quality?: 'poor'
}

/** What `rounds/round-<r>/verdict.json` holds (D30). */
export type VerdictRecord = {
	schema: 1
	ask: string
	round: number
	adjudicator: boolean
	reports: VerdictReport[]
	outcome: RoundOutcome
	verifiedAngles: string[]
	state: AskState
	next: string | null
	fact: string | null
	at: string
}

/** What `reportsAgree` takes: two accepted reports and the kind of the question (a `values` kind compares as sets). */
export type ReportsAgreeParams = { first: AcceptedReport; second: AcceptedReport; kind: AskKind }

/** What `roundOutcomeOf` takes: the effort, the round just closed, its accepted reports, what is left to give. */
export type RoundOutcomeOfParams = {
	effort: FactEffort
	round: number
	accepted: AcceptedReport[]
	/** Whether a further round has a slice or an angle left to give. */
	anythingLeft: boolean
	outside: false
	/** The kind of the question (a `values` kind compares values as sets); a semantic question unless said. */
	kind?: AskKind
}

/** What `outsideOutcomeOf` takes: the effort, the accepted outside reports, the live rung-1 answer (D10) or null. */
export type OutsideOutcomeOfParams = {
	effort: FactEffort
	accepted: AcceptedReport[]
	definitionAnswer: FactAnswer | null
	/** The kind of the question (a `values` kind compares values as sets); a semantic question unless said. */
	kind?: AskKind
}

/** What `adjudicatorOutcomeOf` takes: the adjudicator's report after the checks. */
export type AdjudicatorOutcomeOfParams = { checked: CheckedReport }

/** What the agreeing outside readers rested on: each reader's source with its urls, and the web cites. */
export type OutsideFactSources = {
	sources: { source: OutsideSource; urls: string[] }[]
	cites: OutsideCite[]
}

/** What a standard's fact rests on, by folder: the folder's id and the manifest's files key (D9 of K2b). */
export type StandardFolderKey = { id: string; files: string }

/** What `by` holds in a fact recorded from readers (D11). */
export type ReaderFactBy = {
	rung: 4 | 5
	readers: number
	rounds: number
	adjudicator: boolean
	person: null
	tiers: string[]
}

/** What `verifiedAnglesOf` takes: the accepted reports of a round and the slices the ask listed (with their angles). */
export type VerifiedAnglesOfParams = { accepted: AcceptedReport[]; slices: AskSlice[] }

/** What `adjudicatorBriefOf` takes: the ask, the round it opens, the question, the accepted reports and its nonce. */
export type AdjudicatorBriefOfParams = {
	ask: string
	question: string
	subject: AskSubjectTerms
	/** The round the adjudicator reports in (the one after the readers' closing round). */
	round: number
	/** The accepted reports of the closing round, each with its check results. */
	reports: AcceptedReport[]
	nonce: string
	/** The lines of a cited range of a file, as batch 2's `rangeTextOf` reads them (the brief gives them to the reader). */
	rangeText: (params: { file: string; from: number; to: number }) => RangeText
}

/** What `factDraftOf` takes: the ask, what it asked and about, what was agreed, how it got there. */
export type FactDraftOfParams = {
	ask: string
	request: AskRequestRecord
	subject: FactSubject
	agreed: Agreed
	/** The outside readers' sources and web cites; null for a documents ask. */
	outside: OutsideFactSources | null
	/** The standard's folders and their files keys now; none for an outside ask. */
	standards: StandardFolderKey[]
	rounds: number
	adjudicator: boolean
	tiers: string[]
}

/** One reader's report as the adjudicator's brief gives it: what it said, each claim with its check results. */
export type AdjudicatorBriefReport = {
	letter: string
	verdict: ReportVerdict | 'not-known'
	value: string | null
	answer: string
	claims: {
		text: string
		supports: ReportVerdict
		cites: (ReportCite | OutsideCite)[]
		verified: boolean
		refused: string | null
		polarityConflict: boolean
	}[]
}

/**
 * What `askStateEventOf` takes: the ask, its lot, its state after a verdict (rung 4 or 5) or a person's answer (rung
 * 6, I-9), the rung, the conflict flag.
 */
export type AskStateEventOfParams = {
	ask: string
	lot: string | null
	state: AskState
	rung: 4 | 5 | 6
	conflict: boolean
	now?: () => Date
}

/**
 * What `askVerdictEventOf` takes (I-9): the ask, its lot, the round, its state and reason, how many reports were
 * accepted, the refused ones counted by reason, how many claims hold a polarity conflict, whether it was the
 * adjudicator's round.
 */
export type AskVerdictEventOfParams = {
	ask: string
	lot: string | null
	round: number
	state: AskState
	reason: string | null
	accepted: number
	refused: Record<string, number>
	polarityConflicts: number
	adjudicator: boolean
	now?: () => Date
}

/** What `askFactEventOf` takes (I-9): the ask, its lot, the fact recorded, the rung (4 readers, 5 the adjudicator). */
export type AskFactEventOfParams = {
	ask: string
	lot: string | null
	fact: string
	rung: 4 | 5
	now?: () => Date
}

/** What a round closed for the adjudicator keeps of its accepted reports (`accepted.json`, schema 1, D38). */
export type AcceptedReportsRecord = {
	schema: 1
	ask: string
	round: number
	reports: AcceptedReport[]
}

/** A cited range of the adjudicator's brief: its file, its lines and their normalised text. */
export type AdjudicatorBriefRange = { file: string; from: number; to: number; lines: RangeLine[] }

/** What the adjudicator's `.json` brief holds (schema 1, D38). */
export type AdjudicatorBriefJson = {
	schema: 1
	ask: string
	round: number
	reader: 'adjudicator'
	nonce: string
	question: string
	subject: AskSubjectTerms
	reports: AdjudicatorBriefReport[]
	ranges: AdjudicatorBriefRange[]
	report: Record<string, unknown>
}

/** Whether a person's cite fell in a slice a reader was given, and the first round it was given in (null when not). */
export type ReaderMiss = { given: boolean; round: number | null }

/** What `answer.json` holds (schema 1, D6): the person's answer to an ask, its cite and what became of it. */
export type AnswerRecord = {
	schema: 1
	ask: string
	by: string
	text: string
	cite: ReportCite | null
	/** The refusal of the cite by `checkCite` (the answer is recorded all the same); null when none. */
	citeRefused: string | null
	miss: ReaderMiss | null
	fact: string
	at: string
}

/** What `readerMissOf` takes: the person's cite and the `pack.json` of every round of the ask (their ranges decide). */
export type ReaderMissOfParams = { cite: ReportCite; packs: PackRecord[] }

/** What `askStateOf` takes: the ask's folder. */
export type AskStateOfParams = { askFolder: string }

/**
 * An ask's state now (D6): the latest of its `ask.json`, its rounds' `verdict.json` and its `answer.json`, the fact
 * it holds, where its readers read (documents or outside; null before rung 3 and for an answer of rungs 0-2), and
 * whether a person answered an ask that went outside.
 */
export type AskStateRead = {
	state: AskState
	fact: string | null
	source: 'documents' | 'outside' | null
	confirmed: boolean
}

/** What the note writer's seam is called with: a test's hook between the writer's read and its write. */
export type NoteLockSeam = {
	/** Called once the writer read every ask, before it writes the note: another writer may act in that gap. */
	afterRead?: () => Promise<void> | void
	/** Called each time the start time of another process is read to judge its claim: counts the reads of a wait (L-4). */
	onStartRead?: (params: { pid: number }) => void
}

/** What `writeStandardNote` takes: the lot's folder, its `asks` folder, the clock and the seam. */
export type WriteStandardNoteParams = {
	lotHome: string
	asksFolder: string
	now: (() => Date) | undefined
	lock?: NoteLockSeam
}

/** What `questionTextOf` takes: the ask's question and its id. */
export type QuestionTextOfParams = { question: string; ask: string }

/** The text of the question a person gets (one line, at most 500 characters) and the full text when it was cut. */
export type QuestionText = { text: string; details: string | null }

/** What `claimFile` takes: the claim's path and how old a claim of a gone process must be to be taken over. */
export type ClaimFileParams = {
	path: string
	staleMs: number
	/** Called once a stale claim's holder is read and before the claim is moved aside: forces an interleaving (R1-5). */
	afterStaleRead?: () => void
	/** Called inside the takeover window, once the stale claim is moved aside and before the takeover ends (R2-4). */
	afterMovedAside?: () => void
	/** The start times read so far in the caller's wait (L-4); a loop of its own when absent. */
	starts?: StartTimes
	/**
	 * Replaces the `ps` call that tells another process's start time: given the pid and the environment the call
	 * would run with, answers what `ps -o lstart=` prints (J-7).
	 */
	psOutput?: (params: { pid: number; environment: NodeJS.ProcessEnv }) => string
}

/** Who holds a claim: the process id it names, whether that process runs, when the claim was written (ms). */
export type ClaimHolder = {
	pid: number
	alive: boolean
	writtenAt: number
	/** The start time (ms) of the holder's process the claim records (I-14); NaN when the claim holds none. */
	startedAt: number
}

/**
 * The start times of processes read for one wait or one claim loop (L-4): `startOf` reads another process's once per
 * pid (null when it cannot be read), this process's in process.
 */
export type StartTimes = { startOf: (pid: number) => number | null }

/** One ask of a lot and its state now, as the lot note names it. */
export type LotAskState = { ask: string; read: AskStateRead }

/** What `requestSubjectOf` takes: the ask's request and the subject its record holds (null when none). */
export type RequestSubjectOfParams = { request: AskRequestRecord; recorded: FactSubject | null }

/** What `by` holds in a person's fact (D11): rung 6 and who answered. */
export type PersonFactBy = { rung: 6; person: string }

/** What `personAnswerTargetOf` takes: the asks folder and the ask's id. */
export type PersonAnswerTargetOfParams = { asksFolder: string; ask: string }

/** An ask a person may answer: its folder, record, request and state now (not answered). */
export type PersonAnswerTarget = {
	ask: string
	askFolder: string
	record: AskRecordView
	request: AskRequestRecord
	state: AskStateRead
	/** The unchecked outside fact the person's answer confirms (U17); null for an ask not answered yet. */
	confirms: string | null
}

/** A verdict a person's answer may keep (U19). */
export type PersonAnswerVerdict = (typeof PERSON_ANSWER_VERDICTS)[number]

/** What `<ask>/confirm.json` holds (U17, schema 1): the ask, the person's fact, who confirmed, when. */
export type ConfirmRecord = { schema: 1; ask: string; fact: string; by: string; at: string }

/**
 * Why an ask takes no person's answer: no such ask, made before the readers, answered already (`answered`: a retry
 * of the answer hook does nothing), or a record that does not read.
 */
export type PersonAnswerRefusal = { refused: string; answered: boolean }

/** What `recordPersonAnswer` takes: the ask, the answer and who gave it, the cite and what it came to. */
export type RecordPersonAnswerParams = {
	target: PersonAnswerTarget
	text: string
	by: string
	/** The person's cite, its refusal by `checkCite` and the reader miss (null without a cite, or when refused). */
	cite: ReportCite | null
	citeRefused: string | null
	miss: ReaderMiss | null
	environment: NodeJS.ProcessEnv
	lot: string | null
	now: (() => Date) | undefined
	/** Called right after the person's fact is recorded, before `answer.json` is published: forces a crash (R1-6). */
	afterFact?: () => void
	/** The verdict `--verdict` gave the person's fact (U19); `person` when none. */
	verdict?: PersonAnswerVerdict | null
}

/** One file of a standard folder as read: its manifest entry and its original lines, from the same bytes. */
export type StandardFileRead = { manifest: ManifestFile; lines: string[] }

/** What `claimAsk` takes: the ask's id and its folder. */
export type ClaimAskParams = { ask: string; askFolder: string }

/** The ask's claim taken (its path, released by the caller), or the refusal naming the ask in progress. */
export type AskClaim = { claim: string } | { refused: string }

/** What `recordedFactOfKey` takes: the facts folder, the ask, its lot (null outside one) and the key a marker names. */
export type RecordedFactOfKeyParams = {
	folder: string
	ask: string
	lot: string | null
	key: string
}

/**
 * The `answering` marker of a round (R1-4, schema 1): the ask, the round, the nonces the run that wrote it claims (a
 * retry of the round counts them as its own, never as replayed) and the key of the fact draft (null until answered).
 */
export type AnsweringMarker = {
	schema: 1
	ask: string
	round: number
	nonces: string[]
	key: string | null
}

/** The `answering` marker of a person's answer (R2-7, schema 1): `<ask>/answering.json`, the ask and the key. */
export type PersonAnsweringMarker = { schema: 1; ask: string; key: string }

/** What `writeAnsweringMarker` takes: the round folder, the ask, the round, the nonces claimed, the key once known. */
export type WriteAnsweringMarkerParams = {
	roundFolder: string
	ask: string
	round: number
	nonces: string[]
	key?: string
}

/** A person's fact recorded, or found (recorded for the ask by an earlier run); or the refusal of the ledger. */
export type RecordedPersonFact = { fact: string } | PersonAnswerRefusal

/** What `publishPersonAnswer` takes: the answer's params and the fact it names. */
export type PublishPersonAnswerParams = RecordPersonAnswerParams & { fact: string }

/** What `askPackEventOf` takes: the ask, its lot, the round, how many readers it gave, whether it was skipped. */
export type AskPackEventOfParams = {
	ask: string
	lot: string | null
	round: number
	readers: number
	skipped: boolean
	now?: () => Date
}

/** What `askAnswerEventOf` takes: the ask, its lot, the reader miss and the cite's refusal (never the text). */
export type AskAnswerEventOfParams = {
	ask: string
	lot: string | null
	miss: ReaderMiss | null
	citeRefused: string | null
	now?: () => Date
}

/** What the synchronous note writer takes: the note's params and how long it waits for the note's claim. */
export type WriteStandardNoteNowParams = Omit<WriteStandardNoteParams, 'lock'> & {
	waitLimitMs?: number
}

/** The seams of the answer hook: how long it waits for the note's claim, and a crash forced after the fact. */
export type AnswerHookSeams = { waitLimitMs?: number; afterFact?: () => void }

/** What a re-ask's agreed answer is compared with: the fact it would replace, as it stands. */
export type ReaskComparisonOfParams = { current: FactAnswer; agreed: Agreed; kind: AskKind }

/** A re-ask's agreed answer against the unchecked fact: it agrees (supersedes), or is shown to the person (D43). */
export type ReaskComparison = 'agrees' | 'shown'

/** What `poolOfListAndSearch` takes: the ask's list, the wider search's slices, the angles and each file's index. */
export type PoolOfListAndSearchParams = {
	listed: AskSlice[]
	found: AskSlice[]
	angles: AskAngle[]
	files: Map<string, StandardFileIndex>
}

/** What `packSlicesOf` takes: the setup with its documents, a gold question and its `about`, the effort. */
export type PackSlicesOfParams = {
	setup: AskSetup
	question: string
	about?: string | undefined
	effort: FactEffort
}

/** The slices the round-1 readers are given for a question: reader A's in its order, and the A and B slices together. */
export type PackSlices = { readerA: StandardSlice[]; union: StandardSlice[] }

/** What `packRecallsOf` takes: the setup with its documents, the gold items, the effort and the files' indexes. */
export type PackRecallsOfParams = {
	setup: AskSetup
	items: StandardGoldItem[]
	effort: FactEffort
	files: StandardFileIndex[]
}

/** The recall of one list of slices over the gold set. */
export type PackRecall = { recallAt5: number; recallAt10: number }

/** The recall of reader A's slices in A's order, and of the A and B slices together. */
export type PackRecalls = { readerA: PackRecall; union: PackRecall }

/** What `reportsMeasureOf` takes: the gold items and the folder that holds the ask folders. */
export type ReportsMeasureOfParams = { items: StandardGoldItem[]; asksFolder: string }

/** How the answered asks of the gold items came out: agreed, agreed-wrong, unjudged, and wrong over judged. */
export type ReportsMeasure = {
	agreed: number
	wrong: number
	unjudged: number
	rate: number | null
}

/** What `askJudgementOf` takes: a gold item and what the readers agreed on. */
export type AskJudgementOfParams = { item: StandardGoldItem; agreed: Agreed }

/** One answered gold ask: right (`agreed`), `wrong`, or no rule decides it (`unjudged`). */
export type AskJudgement = 'agreed' | 'wrong' | 'unjudged'

/** What a person's answer recorded: the fact and the `answer.json`; or the refusal (answered meanwhile, no ledger). */
export type RecordedPersonAnswer = { fact: string; record: AnswerRecord } | PersonAnswerRefusal

/**
 * What `personRouteNextOf` takes: the store lot's folder and name, the ask and its question, the round's verdict.json
 * the question points to, the clock.
 */
export type PersonRouteParams = {
	lotFolder: string
	lotName: string
	ask: string
	question: string
	verdictPath: string
	now: (() => Date) | undefined
}

/** What `raiseAskQuestion` takes: the store lot's folder, the ask and its question, the clock. */
export type RaiseAskQuestionParams = {
	lotFolder: string
	ask: string
	question: string
	now: (() => Date) | undefined
	/** The lines after the question's full text in its details (J-3): where the round's verdict is, no reader text. */
	pointer?: string[]
}
