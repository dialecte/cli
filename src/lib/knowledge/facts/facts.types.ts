import type { LoadedDialectes } from '../../schema/schema.types.ts'
import type { StateFolderLocation } from '../../store/store.types.ts'

/** How much work a fact stands for. */
export type FactEffort = 'low' | 'medium' | 'high'

/** Where a fact's answer comes from. */
export type FactSourceKind = 'schema' | 'dialecte' | 'standard' | 'person' | 'outside'

/** The states a fact file stores. */
export type FactStoredState = 'valid' | 'unchecked' | 'stale' | 'forgotten'

/** A tag a fact is about, under its parent (null when none). */
export type FactSubjectTag = { tag: string; parent: string | null }

/** What a fact is about. */
export type FactSubject = {
	package: string | null
	tags: FactSubjectTag[]
	attributes: string[]
	codes: string[]
	methods: string[]
}

/** The answer a fact holds. */
export type FactAnswer = { verdict: string; value: string | null; text: string }

/** One document a fact rests on, by kind (e.g. `{ kind: 'standard', standard, files }`). */
export type FactSource = { kind: string; [field: string]: unknown }

/** A fact as its file holds it. */
export type Fact = {
	id: string
	key: string
	question: string
	subject: FactSubject
	kind: string
	answer: FactAnswer
	source: FactSourceKind
	effort: FactEffort
	evidence: unknown[]
	by: Record<string, unknown>
	sources: FactSource[]
	at: string
	state: FactStoredState
	unchecked?: true
	supersedes: string | null
	supersededBy: string | null
}

/** What a caller gives to record: a fact before the ledger numbers, keys and dates it. */
export type FactDraft = Omit<Fact, 'id' | 'key' | 'at' | 'state' | 'supersedes' | 'supersededBy'>

/** What a history line says happened. */
export type HistoryEvent = 'created' | 'reused' | 'stale' | 'superseded' | 'forgotten' | 'rechecked'

/** One line of a fact's history. */
export type HistoryLine = {
	at: string
	event: HistoryEvent
	fact: string
	lot: string | null
	ask: string | null
	[field: string]: unknown
}

/** When a history line is written and for which lot and ask (null when none). */
export type HistoryLineContext = Pick<HistoryLine, 'at' | 'lot' | 'ask'>

/** What a fact file may change after its publish: its state, `supersededBy` and (a holding re-check) `sources`. */
export type FactChanges = Partial<Pick<Fact, 'state' | 'supersededBy' | 'sources'>>

/** What a record did:made a fact, replaced the key's current one, or reused it. */
export type RecordOutcome = {
	outcome: 'created' | 'replaced' | 'reused'
	id: string
	previous: string | null
}

/** Hooks called between the steps of a record, for the tests that force an order or a crash. */
export type RecordSeams = {
	afterDecide?: () => void
	afterPublish?: () => void
	afterPointer?: () => void
	afterCreated?: () => void
	beforeIdClaim?: (id: string) => void
}

/** What a check says of a valid fact; a `stale` or `unverifiable` outcome may say why and the fix (`reason`). */
export type CheckOutcome = {
	state: 'valid' | 'stale' | 'unverifiable'
	sources?: FactSource[]
	reason?: string
}

/**
 * The installed dialectes as the command's check reads them: their definition hashes by package and the packages
 * skipped with why; or, when none could be read, the reason's template (filled with `package` and `cwd`) and its
 * message.
 */
export type InstalledSchemas =
	| { kind: 'loaded'; hashes: ReadonlyMap<string, string>; skipped: ReadonlyMap<string, string> }
	| { kind: 'none'; template: string; message: string }

/**
 * A standard's files key now, or why it cannot be read: the refusal's message, and the expected layout of the root
 * when the root itself is refused (no root, a file, a root holding `.md` files directly or no standard folder).
 */
export type StandardFilesKeyNow =
	| { kind: 'key'; key: string }
	| { kind: 'none'; message: string; layout?: string }

/** Re-checks a fact's sources. */
export type FactCheck = (params: { fact: Fact }) => CheckOutcome

/** Loads the dialectes installed in a folder. */
export type DialectesLoader = (params: { cwd: string }) => Promise<LoadedDialectes>

/**
 * What `factCheckOf` takes: the environment and folder the command runs in, and the loader of the installed
 * dialectes (`loadDialectes` when left out; `null` when the facts read hold no schema source: nothing is loaded).
 */
export type FactCheckParams = {
	environment: NodeJS.ProcessEnv
	cwd: string
	loadDialectes?: DialectesLoader | null
}

/** Where the data folder is looked up: the environment and the home folder. */
export type DataFolderLocation = StateFolderLocation

/** What `recordFact` takes. */
export type RecordFactParams = {
	folder: string
	draft: FactDraft
	lot?: string | null
	ask?: string | null
	check?: FactCheck
	now?: () => Date
	seams?: RecordSeams
}

/** What the replacement rule decides of a new fact against the key's current one. */
export type ReplacementDecision = 'replace' | 'reuse'

/** What `factKeyOf` takes. */
export type FactKeyParts = {
	question: string
	subject: FactSubject
	kind: string
	package: string | null
}

/** What a read shows of a fact: a stored state, or one the read found (`unverifiable` by the check, `orphan`, `unreadable`). */
export type FactViewState = FactStoredState | 'unverifiable' | 'orphan' | 'unreadable'

/**
 * A fact file as a read shows it: its id and path, the fact (none when unreadable), its state now, whether it is
 * its key's current one, and (when the read's check found it stale or unverifiable and said why) the reason.
 */
export type FactView = {
	id: string
	path: string
	fact: Fact | undefined
	state: FactViewState
	current: boolean
	reason?: string
}

/** A view of a readable fact: the key's current fact as `currentFact` and `reuseFact` answer it (never unreadable). */
export type CurrentFactView = FactView & { fact: Fact }

/** What a read of the ledger takes: the facts folder and the check applied to valid facts. */
export type ReadFactsParams = {
	folder: string
	check?: FactCheck
}

/** What `currentFact` takes: a key. */
export type CurrentFactParams = ReadFactsParams & { key: string }

/** What `readFact` takes: a fact id. */
export type ReadFactParams = ReadFactsParams & { id: string }

/** What `reuseFact` takes: a key and the effort asked. */
export type ReuseFactParams = CurrentFactParams & { effort: FactEffort }

/**
 * What a reuse finds: the view of the fact that answers, and the views of the candidates that do not (lower effort,
 * stale, unverifiable, unchecked), each with its state and reason.
 */
export type ReuseAnswer = {
	answer: CurrentFactView | undefined
	candidates: FactView[]
}
