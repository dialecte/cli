import type { ApiJson } from '../../api/api-json.types.ts'
import type { LotEvent } from '../../events/event.types.ts'
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
import type { StandardFolder } from '../standard/standard-input.types.ts'
import type { StandardSearchIndex, StandardSlice } from '../standard/standard-search.types.ts'
import type { ANGLE_FAMILIES, RUNG_ONE_SENTENCES } from './ask.constants.ts'

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

/** A re-ask made for a fact: the ask's id, the fact's question, the fact's id. */
export type ReaskKept = { ask: string; question: string; fact: string }

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
