/**
 * The index of one standard folder, from the cache or built: every file is hashed (the manifest); a complete
 * folder for that manifest hash is reused unless `rebuild`. A build writes into `<hash>.tmp-<pid>/` beside
 * it, each file hashed again when its text is read and once more after the whole build (any difference
 * aborts: the temporary folder is removed and nothing is left), then renames it into place; when another
 * builder put the folder there first, the own temporary folder is removed and the winner reused; any other
 * rename error is answered with its code and the folder. A rebuild moves the old folder aside, renames the new
 * one in, then removes the old one. Temporary and aside folders of processes that are gone are removed first,
 * and never read as an index. The tags file of the
 * installed dialectes is written beside the rest when that set has none yet.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { isProcessAlive } from '../../process-alive.ts'
import { formatDuration } from '../../progress/format-duration.ts'
import { fillMessage } from './fill-message.ts'
import { indexStandardText } from './index-standard-text.ts'
import { searchIndexOf } from './search-index-of.ts'
import {
	ASIDE_INFIX,
	BUILD_OUTCOMES,
	BUILD_STEP_NAME,
	CACHE_LOCATION,
	FILE_CHANGED_MESSAGE,
	INDEX_FORMAT,
	LEFT_FOLDER_PATTERN,
	MISSING_ENTRY_CODE,
	PLACE_FAILED_MESSAGE,
	TARGET_TAKEN_CODES,
	TEMPORARY_INFIX,
} from './standard-cache.constants.ts'
import {
	isCompleteIndexFolder,
	readIndexFolder,
	readTagsFile,
	tagsPathOf,
	writeIndexFolder,
	writeTagsFile,
} from './standard-index-folder.ts'
import { tagLinksOf } from './tag-links-of.ts'

import type {
	EnsureStandardIndexParams,
	StandardAborted,
	StandardAsideMove,
	StandardBuildAnswer,
	StandardBuildOutcome,
	StandardHashedFile,
	StandardIndexAnswer,
	StandardIndexState,
	StandardInstalledVocabulary,
	StandardManifest,
	StandardPlacement,
} from './standard-cache.types.ts'
import type { StandardFileIndex } from './standard-index.types.ts'
import type { StandardFile } from './standard-input.types.ts'
import type { StandardSearchIndex } from './standard-search.types.ts'

export async function ensureStandardIndex(
	params: EnsureStandardIndexParams,
): Promise<StandardIndexAnswer> {
	const startedAt = Date.now()
	const { standard, installed } = params
	const folder = join(params.cacheRoot, CACHE_LOCATION.standardFolder, standard.id)
	const hashed = standard.files.map(hashedFileOf)
	const manifestHash = manifestHashOf({ hashed })
	const target = join(folder, manifestHash)
	const ready = { standardId: standard.id, manifestHash, startedAt, target, installed }
	if (!params.rebuild && isCompleteIndexFolder({ folder: target }))
		return readyAnswer({ ...ready, state: 'reused' })
	removeStaleTemporaryFolders({ folder })
	const temporary = `${target}${TEMPORARY_INFIX}${process.pid}`
	const step = params.progress?.start({ name: BUILD_STEP_NAME, detail: standard.id })
	// what the running line ends with: the build's outcome and its time
	let outcome: StandardBuildOutcome = BUILD_OUTCOMES.failed
	try {
		const built = await buildInto({ ...params, hashed, folder: temporary })
		if (built.kind === 'aborted') {
			rmSync(temporary, { recursive: true, force: true })
			outcome = BUILD_OUTCOMES.aborted
			return built
		}
		if (isCompleteIndexFolder({ folder: target }) && !params.rebuild) {
			rmSync(temporary, { recursive: true, force: true })
			outcome = BUILD_OUTCOMES.reused
			return readyAnswer({ ...ready, state: 'reused' })
		}
		const placed = placeFolder({ temporary, target, replace: params.rebuild })
		// nothing kept: exit 1 with the code and the folder, the running line ending failed
		if (placed.kind === 'failed') return { kind: 'aborted', message: placed.message }
		outcome = placed.kind === 'taken' ? BUILD_OUTCOMES.reused : BUILD_OUTCOMES.built
		if (placed.kind === 'taken') return readyAnswer({ ...ready, state: 'reused' })
		return readyAnswer({ ...ready, state: 'built', search: built.search })
	} catch (error) {
		rmSync(temporary, { recursive: true, force: true })
		throw error
	} finally {
		step?.finish(
			`${BUILD_STEP_NAME} ${standard.id} ${outcome} ${formatDuration(Date.now() - startedAt)}`,
		)
	}
}

/** The ready answer: the search index built by this run, else read from the target folder. */
function readyAnswer(params: {
	standardId: string
	manifestHash: string
	startedAt: number
	target: string
	installed: StandardInstalledVocabulary
	state: StandardIndexState
	search?: StandardSearchIndex
}): StandardIndexAnswer {
	return {
		kind: 'ready',
		index: {
			standardId: params.standardId,
			manifestHash: params.manifestHash,
			state: params.state,
			elapsed: Date.now() - params.startedAt,
			search:
				params.search ?? readSearchIndex({ folder: params.target, installed: params.installed }),
		},
	}
}

function hashedFileOf(file: StandardFile): StandardHashedFile {
	const bytes = readFileSync(file.path)
	return {
		id: file.id,
		name: file.name,
		path: file.path,
		size: bytes.length,
		sha256: sha256Of(bytes),
	}
}

/** sha256 (hex) of the format number and the (id, sha256) pairs sorted by id. */
function manifestHashOf(params: { hashed: StandardHashedFile[] }): string {
	const pairs = params.hashed
		.map((file) => [file.id, file.sha256])
		.sort(([left], [right]) => (left < right ? -1 : 1))
	return sha256Of(JSON.stringify({ indexFormat: INDEX_FORMAT, files: pairs }))
}

/**
 * Indexes every file into the temporary folder: its text hashed when read, every file hashed again after
 * the build; a file whose hash moved aborts with its name and id.
 */
async function buildInto(
	params: EnsureStandardIndexParams & { hashed: StandardHashedFile[]; folder: string },
): Promise<StandardBuildAnswer> {
	const { hashed, installed } = params
	const files: StandardFileIndex[] = []
	for (const file of hashed) {
		// a turn of the event loop between files: the running line redraws its elapsed time
		await nextTurn()
		const bytes = readFileSync(file.path)
		params.afterFileRead?.({ path: file.path })
		if (sha256Of(bytes) !== file.sha256) return abortedBy(file)
		files.push(indexStandardText({ fileId: file.id, text: bytes.toString('utf8') }))
	}
	const search = searchIndexOf({ files, vocabulary: installed.vocabulary })
	const manifest: StandardManifest = {
		files: hashed.map((file, index) => ({
			id: file.id,
			name: file.name,
			size: file.size,
			sha256: file.sha256,
			lines: files[index].lineCount,
		})),
		built: new Date().toISOString(),
		cliVersion: params.cliVersion,
		indexFormat: INDEX_FORMAT,
	}
	writeIndexFolder({ folder: params.folder, manifest, search })
	if (installed.installedHash !== undefined)
		writeTagsFile({
			path: tagsPathOf({ folder: params.folder, installedHash: installed.installedHash }),
			content: { vocabulary: installed.vocabulary, tagLinks: search.tagLinks },
		})
	const moved = hashed.find((file) => sha256Of(readFileSync(file.path)) !== file.sha256)
	return moved ? abortedBy(moved) : { kind: 'built', search }
}

/**
 * Renames the temporary folder into place (replacing the target on a rebuild); false when another builder
 * put the target there first, the own temporary folder then removed.
 */
function placeFolder(params: {
	temporary: string
	target: string
	replace: boolean
}): StandardPlacement {
	const { temporary, target } = params
	// a rebuild moves the old folder aside first: the target is never seen half removed
	const aside = params.replace
		? moveAside({ temporary, target, aside: `${target}${ASIDE_INFIX}${process.pid}` })
		: { kind: 'moved' as const, aside: undefined }
	if (aside.kind === 'failed') return aside
	return placeInto({ temporary, target, aside: aside.aside })
}

/**
 * Moves the old folder of a rebuild aside. Gone already (another rebuild moved it, or there was none): nothing
 * to move, go on. Any other error: the temporary folder removed, the placement failed with the code.
 */
function moveAside(params: {
	temporary: string
	target: string
	aside: string
}): StandardAsideMove {
	const { temporary, target, aside } = params
	try {
		renameSync(target, aside)
		return { kind: 'moved', aside }
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code ?? String(error)
		if (code === MISSING_ENTRY_CODE) return { kind: 'moved', aside: undefined }
		rmSync(temporary, { recursive: true, force: true })
		return {
			kind: 'failed',
			message: fillMessage({
				template: PLACE_FAILED_MESSAGE,
				values: { code, from: target, to: aside },
			}),
		}
	}
}

/** Renames the temporary folder into place, then removes the old folder moved aside (if any). */
function placeInto(params: {
	temporary: string
	target: string
	aside: string | undefined
}): StandardPlacement {
	const { temporary, target, aside } = params
	try {
		renameSync(temporary, target)
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code ?? String(error)
		rmSync(temporary, { recursive: true, force: true })
		if (TARGET_TAKEN_CODES.includes(code)) {
			// another builder's folder is in place: the old one goes
			if (aside !== undefined) rmSync(aside, { recursive: true, force: true })
			return { kind: 'taken' }
		}
		// the old folder back where it was, for the readers
		if (aside !== undefined) renameSync(aside, target)
		return {
			kind: 'failed',
			message: fillMessage({
				template: PLACE_FAILED_MESSAGE,
				values: { code, from: temporary, to: target },
			}),
		}
	}
	if (aside !== undefined) rmSync(aside, { recursive: true, force: true })
	return { kind: 'placed' }
}

/** The search index of a complete folder, its tags file written first when the installed set has none. */
function readSearchIndex(params: {
	folder: string
	installed: StandardInstalledVocabulary
}): StandardSearchIndex {
	const { folder, installed } = params
	const { files, words } = readIndexFolder({ folder })
	const search: StandardSearchIndex = {
		files,
		vocabulary: installed.vocabulary,
		words: words.words,
		units: words.units,
		lineUnits: words.lineUnits,
		tagLinks: {},
	}
	if (installed.installedHash === undefined) return search
	const path = tagsPathOf({ folder, installedHash: installed.installedHash })
	if (existsSync(path)) return { ...search, tagLinks: readTagsFile({ path }).tagLinks }
	const tagLinks = tagLinksOf({
		files,
		units: words.units,
		lineUnits: words.lineUnits,
		vocabulary: installed.vocabulary,
	})
	writeTagsFile({ path, content: { vocabulary: installed.vocabulary, tagLinks } })
	return { ...search, tagLinks }
}

/**
 * Removes every `<name>.tmp-<pid>` (a build) and `<name>.old-<pid>` (a folder a rebuild moved aside) of the
 * standard's cache folder whose process is gone.
 */
function removeStaleTemporaryFolders(params: { folder: string }): void {
	if (!existsSync(params.folder)) return
	for (const name of readdirSync(params.folder)) {
		const pid = LEFT_FOLDER_PATTERN.exec(name)?.[1]
		if (pid !== undefined && !isProcessAlive(Number(pid)))
			rmSync(join(params.folder, name), { recursive: true, force: true })
	}
}

function abortedBy(file: StandardHashedFile): StandardAborted {
	return {
		kind: 'aborted',
		message: fillMessage({
			template: FILE_CHANGED_MESSAGE,
			values: { name: file.name, id: file.id },
		}),
	}
}

function nextTurn(): Promise<void> {
	return new Promise(function resolveOnNextTurn(resolve) {
		setImmediate(resolve)
	})
}

function sha256Of(content: Buffer | string): string {
	return createHash('sha256').update(content).digest('hex')
}
