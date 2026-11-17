/** The corpora: the manifest's admitted open-licence sources, the cache they are fetched into, the personal licensed entries. */

/** `full`: mutated copies allowed; `schemas-only`: never mutated. */
export type CorpusVerdict = 'full' | 'schemas-only'

/** One archive (tar, tar.gz or zip), of which only the `keep` paths are written, `strip` removed first. */
export type ArchiveFetch = {
	kind: 'archive'
	url: string
	sha256?: string
	strip?: string
	keep: string[]
}

/** Single files, each at its path with its own pin. */
export type FilesFetch = {
	kind: 'files'
	files: Record<string, { url: string; sha256?: string }>
}

/** The schema documents a crawl found once (`--pin`, in create): a normal fetch takes `files` (url -> sha256), each at `<host><path>`. */
export type CrawlFetch = {
	kind: 'crawl'
	start: string[]
	hosts: string[]
	skip?: string[]
	files: Record<string, string>
}

export type SourceFetch = ArchiveFetch | FilesFetch | CrawlFetch

/** A covered file (glob, minus `except`) whose bytes hold none of the texts is removed: a licence header that must be there. */
export type MarkerRule = {
	glob: string
	text: string | string[]
	except?: string[]
}

/** One admitted source of the manifest, as the licence review wrote it. */
export type ManifestSource = {
	id: string
	family: string
	license?: string
	terms?: string
	verdict?: CorpusVerdict
	note?: string
	decision?: string
	/** A regression suite whose entries and instances its own runner reads (`libxml2`, `xmlschema`). */
	suite?: string
	fetch: SourceFetch
	exclude?: string[]
	marker?: MarkerRule[]
	/** Path in the source -> an override file of the cli, placed there. */
	substitute?: Record<string, string>
	/** Path in the source -> globs of the documents a written schema imports, in order. */
	wrappers?: Record<string, string[]>
	/** Globs of the entry schemas, relative to the source's folder. */
	entries?: string[]
	/** Globs of the valid instance documents, relative to the source's folder. */
	instances?: string[]
	/** Remote location -> path in the source, read instead. */
	locations?: Record<string, string>
}

export type CorpusManifest = {
	$comment?: string
	sources: ManifestSource[]
}

/** What the cli ships beside its bundle: the manifest and the folder of the override files. */
export type ShippedCorpus = {
	manifest: CorpusManifest
	overrides: string
}

/** One file of a source, before it is written: its path inside the source's folder and its bytes. */
export type CorpusFile = {
	path: string
	bytes: Uint8Array
}

/** What the lock records of one fetched source. */
export type CorpusLockEntry = {
	files: number
	bytes: number
	verdict: CorpusVerdict
	/** The sha256 of the manifest entry the tree was built from: another entry reads stale. */
	manifest: string
	/** Every file of the tree, relative to the source's folder, with its sha256. */
	sha256: Record<string, string>
}

/** `manifest.lock.json`: what the cache holds, by source id. */
export type CorpusLock = Record<string, CorpusLockEntry>

/** The lock as read: its well-formed entries, and every entry as written (an older writer's kept as it is). */
export type CorpusLockRead = {
	entries: CorpusLock
	raw: Readonly<Record<string, unknown>>
}

/** The instances of a corpus: the folder they are read from and the globs, relative to it, that pick them. */
export type CorpusInstances = {
	folder: string
	globs: string[]
}

/** What one source's fetch ended with. */
export type SourceOutcome =
	| { id: string; kind: 'fetched'; files: number; bytes: number }
	| { id: string; kind: 'refused'; reason: string }

/** `fetched` (open, built from the current manifest entry), `stale` (built from another, or its folder there without a lock entry the cli can read), `missing`, `present` (licensed, its files there). */
export type CorpusState = 'fetched' | 'stale' | 'missing' | 'present'

/** One entry of `dialecte corpus list --json`: an open source of the manifest or a licensed entry of config.yml. */
export type CorpusListEntry = {
	name: string
	source: 'open' | 'licensed'
	verdict: CorpusVerdict
	state: CorpusState
	/** An open source's cache folder. */
	folder?: string
	/** The entry schemas, absolute paths (those present for an open source; the configured XSD for a licensed one). */
	entries: string[]
	/** Where the instances are: an open source's folder with its manifest globs, a licensed folder with `*` (every file). */
	instances?: CorpusInstances
	instanceCount: number
	suite?: string
	license?: string
}

/** One problem `dialecte corpus check` names. */
export type CorpusProblem = {
	name: string
	problem: string
}

/** What an archive's bytes read as: its regular files as the archive names them, or why they cannot be read. */
export type ArchiveRead =
	| { kind: 'files'; files: CorpusFile[] }
	| { kind: 'unknown' }
	| { kind: 'unsupported'; reason: string }

/** A source's tree built from its downloads, or why it was refused. */
export type SourceTree = { kind: 'tree'; files: CorpusFile[] } | { kind: 'refused'; reason: string }

/** A pinned download: its checked bytes, or why the source is refused. */
export type KeptDownload =
	| { kind: 'bytes'; bytes: Uint8Array }
	| { kind: 'refused'; reason: string }

/** One source's fetch: its outcome, and its lock entry when it was written. */
export type FetchedSource =
	| { kind: 'fetched'; outcome: SourceOutcome; lock: CorpusLockEntry }
	| { kind: 'refused'; outcome: SourceOutcome }

/** The personal licensed entries of config.yml `corpora:`, by name. */
export type LicensedCorpora = Readonly<Record<string, { xsd: string; instances?: string }>>

/** The most bytes one download may hold, and one archive once decompressed. */
export type CorpusLimits = {
	downloadBytes: number
	extractedBytes: number
}

/** The cache's fetch lock: taken by this process, or held by another running one. */
export type FetchLock = { kind: 'acquired' } | { kind: 'held'; pid: number }
