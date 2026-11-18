import type { FileFacts, FunctionFacts } from '../api/source-functions.types.ts'
import type { ApiIndexDiff } from '../risk/risk.types.ts'

/** A path the change touches since the base, relative to the package root, as the presence map holds it. */
export type ChangedPath =
	| { path: string; state: 'added' | 'modified' | 'deleted' }
	| { path: string; state: 'renamed'; from: string }

/** The facts of both sides of a change: every implementation file of the tree, and the base side of the changed ones. */
export type ChangeFacts = {
	changed: ChangedPath[]
	/** Every implementation file of the tree, by path. */
	tree: ReadonlyMap<string, FileFacts>
	/** The base side of each changed, renamed-from or deleted path the base held, by its base path. */
	base: ReadonlyMap<string, FileFacts>
}

/** One function of a side, with the file it is in. */
export type SidedFunction = { file: string; facts: FunctionFacts }

/**
 * The functions of a change: new (added, or its read keys changed) and existing (the same as a base function, its keys
 * changed or not: a function whose keys changed is on both sides and never compared with itself).
 */
export type FunctionSides = { added: SidedFunction[]; existing: SidedFunction[] }

/** The file a specifier names from a file of the package; undefined when none (a dependency, unresolved). */
export type ResolveSpecifier = (request: { from: string; specifier: string }) => string | undefined

/** A `duplicate-read` finding: the new function, the signal, and the existing function it reads like. */
export type DuplicateRead = {
	file: string
	line: number
	name: string
	signal: 'reads' | 'find'
	existing: { file: string; line: number; name: string }
	/** The element and attributes both read (signal `reads`). */
	element?: string
	attributes?: string[]
}

/** What changed of a shared export since the base. */
export type SharedExportChangeKind = 'newly-shared' | 'signature' | 'behaviour' | 'removed'

/** A `shared-export-changed` finding: the export, its folder, the folders importing it, and what changed. */
export type SharedExportChange = {
	/** Where the finding sits: the export's declaration, or for a removed one an importer still importing it, else the exporter's first line. */
	file: string
	line: number
	name: string
	/** The exporter's folder. */
	folder: string
	/** The folders that import it from outside its folder, sorted. */
	importers: string[]
	changes: SharedExportChangeKind[]
}

/** A doc page of the package (a Markdown file under `doc/`, or `README.md`) on the tree side: its text, and whether the change touched it. */
export type DocPage = { path: string; text: string; touched: boolean }

/** A `docs-not-updated` finding: the public entry, what changed of it, where it is declared, and the pages naming it. */
export type DocsNotUpdated = {
	route: string
	change: 'added' | 'removed' | 'signature'
	declaredAt?: string
	/** The pages naming the entry, none touched (for an added entry, none at all). */
	pages: string[]
}

/** The importers of each export, by `<exporter file>#<name>`: the files importing it (a barrel followed one level). */
export type Importers = ReadonlyMap<string, readonly { file: string; line: number }[]>

/** What the readers of both sides share. */
export type SharedExportSides = {
	change: ChangeFacts
	baseFiles: ReadonlyMap<string, FileFacts>
	treeImporters: Importers
	baseImporters: Importers
	/** The type names a changed `*.types.ts` re-declares, by its folder. */
	changedTypes: ReadonlyMap<string, ReadonlySet<string>>
}

/** The base the base-aware rules judged against, and where the run took it. */
export type QualityBase = { commit: string; source: 'lot' | 'base-branch' | 'flag' }

/** What the base-aware rules found on a change: each rule's findings and the public API diff, against `base`. */
export type QualityResult = {
	base: QualityBase
	/** The source files the change touches on the tree's side: where a base-aware opt-out is judged unused. */
	examined: string[]
	duplicates: DuplicateRead[]
	sharedExports: SharedExportChange[]
	publicApi: ApiIndexDiff
	docs: DocsNotUpdated[]
	/** A tsconfig or Vite config changed: the base edges were resolved with the tree's aliases. */
	aliasesChanged: boolean
}

/** `dialecte-quality.json`: the last base-aware run on the change, its tree, its base and what it found. */
export type QualityRecord = QualityResult & {
	schema: number
	/** When it ran, ISO 8601. */
	at: string
	/** HEAD as a full sha. */
	head: string
	/** The tree it judged, as the gate records name a tree. */
	stateHash: string
	/** The findings each opt-out silenced, per rule. */
	allowed: Record<string, number>
}
