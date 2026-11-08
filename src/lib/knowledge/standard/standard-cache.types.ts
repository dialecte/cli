import type { StepProgress } from '../../progress/step-progress.types.ts'
import type { BUILD_OUTCOMES } from './standard-cache.constants.ts'
import type {
	StandardCrossReference,
	StandardDefinition,
	StandardFileIndex,
	StandardHeading,
	StandardOriginalRange,
	StandardQuality,
	StandardTable,
} from './standard-index.types.ts'
import type { StandardFolder } from './standard-input.types.ts'
import type {
	StandardSearchIndex,
	StandardTagLinks,
	StandardUnits,
	StandardVocabulary,
	StandardWordIndex,
} from './standard-search.types.ts'

/**
 * The vocabulary of the selected installed dialectes, their sorted `name@version` list, and the hash of that
 * list naming its tags file (none when no dialecte is selected).
 */
export type StandardInstalledVocabulary = {
	vocabulary: StandardVocabulary
	packages: string[]
	installedHash: string | undefined
}

/** The vocabulary read, or a `--package` no installed dialecte has (with the names of the installed ones). */
export type StandardInstalledVocabularyAnswer =
	| { kind: 'read'; installed: StandardInstalledVocabulary }
	| { kind: 'unknownPackage'; name: string; installed: string[] }

/** One file of a manifest: its id, name, size in bytes, sha256 (hex) and original line count. */
export type StandardManifestFile = {
	id: string
	name: string
	size: number
	sha256: string
	lines: number
}

/** `manifest.json`: the files in id order, the build time, the cli version and the index format. */
export type StandardManifest = {
	files: StandardManifestFile[]
	built: string
	cliVersion: string
	indexFormat: number
}

/** A file read and hashed before the build: its manifest entry without the line count, and its path. */
export type StandardHashedFile = Omit<StandardManifestFile, 'lines'> & { path: string }

/** Whether an index was built by this run or found complete in the cache. */
export type StandardIndexState = 'built' | 'reused'

/** An index ready to answer: its standard, its manifest hash, how it came, its files and search index. */
export type StandardReadyIndex = {
	standardId: string
	manifestHash: string
	state: StandardIndexState
	elapsed: number
	search: StandardSearchIndex
}

/** A build that did not hold: a file changed while it was read (exit 1), said with its name and id. */
export type StandardAborted = { kind: 'aborted'; message: string }

/** An index ready, or a build that did not hold. */
export type StandardIndexAnswer = { kind: 'ready'; index: StandardReadyIndex } | StandardAborted

/**
 * Putting the built folder in place: done, taken by another builder first (its folder is reused), or a
 * rename that failed for another reason (exit 1, its code and the folder said).
 */
export type StandardPlacement =
	| { kind: 'placed' }
	| { kind: 'taken' }
	| { kind: 'failed'; message: string }

/** A rebuild's old folder moved aside (none when it was gone), or the placement failed. */
export type StandardAsideMove =
	| { kind: 'moved'; aside: string | undefined }
	| { kind: 'failed'; message: string }

/** How the running line of a build ends. */
export type StandardBuildOutcome = (typeof BUILD_OUTCOMES)[keyof typeof BUILD_OUTCOMES]

/** What building into the temporary folder gives: the search index, or a build that did not hold. */
export type StandardBuildAnswer = { kind: 'built'; search: StandardSearchIndex } | StandardAborted

export type EnsureStandardIndexParams = {
	standard: StandardFolder
	/** The cache folder of the cli (`<cache>/dialecte`). */
	cacheRoot: string
	installed: StandardInstalledVocabulary
	rebuild: boolean
	cliVersion: string
	/** The running line, on a terminal only. */
	progress?: StepProgress
	afterFileRead?: (params: { path: string }) => void
}

/** `quality.json` per file: its quality and its dropped runs. */
export type StandardQualityEntry = StandardQuality & { noiseRanges: StandardOriginalRange[] }

/** What a file id maps to in the per-file files of an index folder. */
export type StandardPerFile<Value> = Record<string, Value>

/** `words.json`: the word index and the units, which do not depend on the installed dialectes. */
export type StandardWordsFile = StandardUnits & { words: StandardWordIndex }

/** A `tags-<installed hash>.json`: the vocabulary it was made of and its links. */
export type StandardTagsFile = {
	vocabulary: StandardVocabulary
	tagLinks: StandardTagLinks
}

/** What an index folder holds, read back: its manifest, its files in the manifest's order, its word index. */
export type StandardIndexFolderContent = {
	manifest: StandardManifest
	files: StandardFileIndex[]
	words: StandardWordsFile
}

/** The per-file parts of an index folder. */
export type StandardIndexParts = {
	quality: StandardPerFile<StandardQualityEntry>
	headings: StandardPerFile<StandardHeading[]>
	definitions: StandardPerFile<StandardDefinition[]>
	tables: StandardPerFile<StandardTable[]>
	crossReferences: StandardPerFile<StandardCrossReference[]>
}
