/**
 * The shapes `dialecte run` reads from the installed packages and answers. The cli does not depend
 * on `@dialecte/core`: it loads the core and the dialecte the project has installed, so these types
 * name only the members the runner calls.
 */

/** An element as a ref: what records, errors and diagnostics point at. */
export type ElementRef = { tagName: string; id: string }

/** A record as the runner reads it: its tag, its parent, its children in document order. */
export type RunRecord = ElementRef & {
	parent: ElementRef | null
	children: ElementRef[]
}

/** A staged write, as a prepared transaction lists it. */
export type RunOperation = {
	status: 'created' | 'updated' | 'deleted'
	oldRecord?: { tagName: string }
	newRecord?: { tagName: string }
}

/** The untyped reads the runner needs from a query. */
export type RunQuery = {
	any: { getRecord(ref: ElementRef): Promise<RunRecord | undefined> }
}

/** What `doc.prepare` answers. */
export type RunPreparedTransaction = {
	operations: ReadonlyArray<RunOperation>
	/** One count per record, as the commit merges the operations (core 0.8). */
	summary: { byTag: Record<string, OperationCounts> }
	query: RunQuery
	commit(): Promise<void>
	discard(): void
}

/** The part of a Document the runner relies on; the script gets the whole Document. */
export type RunDocument = {
	query: RunQuery
	transaction(
		callback: (transaction: unknown) => Promise<unknown>,
		options?: { label?: string },
	): Promise<unknown>
	prepare(
		callback: (transaction: unknown) => Promise<unknown>,
		options?: { label?: string },
	): Promise<RunPreparedTransaction>
}

/** The part of a Project the runner relies on. */
export type RunProject = {
	open(name: string): Promise<RunProject>
	initEmptyDocument(): Promise<string>
	importFile(file: File): Promise<{ documentId: string; diagnostics: RunDiagnostic[] }>
	openDocument(documentId: string): RunDocument
	export(params: { documentId: string }): Promise<{ file: Blob }>
	/** Deletes the project: an in-memory run leaves nothing behind for the next one. */
	destroy(): Promise<void>
}

/** A diagnostic as core shapes it: plain data, printed as it comes. */
export type RunDiagnostic = {
	code: string
	severity: string
	source: string
	message: string
	ref: ElementRef & { attribute?: string }
	meta?: Record<string, unknown>
}

/** A structured error as core's `toDialecteError` answers it. */
export type CarriedDialecteError = {
	code: string
	key: string
	message: string
	detail: string
	ref?: { tagName: string; id?: string }
	meta?: Record<string, unknown>
}

/** An expectation, in the shape core's `evaluateExpectations` reads. */
export type RunExpectation = {
	tag: string
	where?: Record<string, string | string[]>
	under?: { tag: string; where?: Record<string, string | string[]> }
	count?: number
}

export type RunExpectationFailure = {
	expectation: RunExpectation
	actualCount: number
	message: string
}

/** The modules of the installed core the runner calls into. */
export type CoreModules = {
	toDialecteError(thrown: unknown): CarriedDialecteError | undefined
	createSeededRandomUuid(params: { seed: number }): () => string
	evaluateExpectations(
		query: RunQuery,
		params: { expectations: readonly RunExpectation[] },
	): Promise<{ passed: RunExpectation[]; failed: RunExpectationFailure[] }>
	/** `@dialecte/core/helpers`, handed to the script as `helpers`. */
	helpers: Record<string, unknown>
	/** `@dialecte/core/utils`, handed to the script as `utils`. */
	utils: Record<string, unknown>
}

/** A loaded module's exports, by name. */
export type ModuleNamespace = Record<string, unknown>

/** The installed packages the cli loads: the dialecte module, when there is one, and the core entries. */
export type InstalledPackages = {
	packageName?: string
	dialecte?: ModuleNamespace
	coreIndex: ModuleNamespace
	helpers: ModuleNamespace
	utils: ModuleNamespace
}

/** What a run needs from the installed packages: a fresh in-memory project, the dialecte, the core. */
export type RunEnvironment = {
	createProject(): RunProject
	/** The dialecte's module namespace, handed to the script as `dialecte`. */
	dialecte: Record<string, unknown>
	core: CoreModules
}

/** What the script finds in its one parameter - the playground's globals. */
export type RunScriptContext = {
	project: RunProject
	doc: RunDocument
	documentId: string
	dialecte: Record<string, unknown>
	helpers: Record<string, unknown>
	utils: Record<string, unknown>
}

/** A script: its default export. What it returns is the outcome's `result`. */
export type RunScript = (context: RunScriptContext) => Promise<unknown>

/** `commit`: every transaction commits. `prepare`: the first transaction is staged, the script stops there. */
export type RunMode = 'commit' | 'prepare'

export type RunScriptParams = {
	/**
	 * Loads the script: called once ids are seeded and the clock is frozen, so what the module does at
	 * its top level is repeatable too. A load failure is thrown, not answered as an outcome.
	 */
	loadScript: () => Promise<RunScript>
	environment: RunEnvironment
	mode: RunMode
	/** The seed of the ids minted while the script runs, and while its input is imported. */
	seed: number
	/**
	 * After this long the run stops waiting and answers a timeout. The script itself cannot be stopped:
	 * a library caller's process keeps running whatever it still does (the command exits).
	 */
	timeoutInMilliseconds: number
	/** Time frozen at this instant while the script runs; the real clock when absent. */
	now?: Date
	/** A file imported first; an empty document otherwise. */
	input?: File
	expectations?: readonly RunExpectation[]
	/** Export the document once the script ran (not in `prepare` mode). */
	exportDocument?: boolean
}

/** What went wrong, as data: a structured error's code, key and the element's path; any other error's message. */
export type RunError = {
	message: string
	code?: string
	key?: string
	detail?: string
	ref?: { tagName: string; id?: string }
	/** The element as a path from the root, `/Root/A/AA_2[2]`, when it is in the document. */
	path?: string
	/** Why there is no `path`: the error names no element, or the element is not in the document. */
	pathNote?: string
	meta?: Record<string, unknown>
}

export type OperationCounts = { created: number; updated: number; deleted: number }

/** What a run answers: one structured outcome, never prose. */
export type RunOutcome = {
	ok: boolean
	error?: RunError
	diagnostics: RunDiagnostic[]
	/** Staged writes, per tag, in tag order: committed ones, or the prepared transaction's. */
	operations: Record<string, OperationCounts>
	/** In `prepare` mode: the staged transaction, nothing committed. */
	prepared?: { label: string | null; report?: unknown; reportNote?: string }
	expectations?: { passed: number; failed: RunExpectationFailure[] }
	/** What the script returned. */
	result?: unknown
	/** Why `result` is given as text: it was not JSON. */
	resultNote?: string
	export?: { bytes: number }
}

/** A value as JSON carries it, and why it was turned into text when it had to be. */
export type JsonSafe = { value: unknown; note?: string }

/** What `runScript` answers: the outcome and the exported file when one was asked. */
export type RunScriptResult = {
	outcome: RunOutcome
	file?: Blob
}
