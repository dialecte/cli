/**
 * The saved reviews of a lot's design (FIX-design-needs-critic): what a review file says (`Design: <hash>` and
 * `Verdict: READY | NOT READY`), the review files of the recorded design's folder found by content, the files a person
 * names, and where they stand for one recorded hash. A reviewer is anyone: nothing here names who wrote a file.
 */
import { readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { designFileContentOf, isDesignFileRefusal } from './design-file.ts'
import { designHashOf } from './design-records.ts'
import {
	REVIEW_DESIGN_KEY,
	REVIEW_EMPHASIS,
	REVIEW_EXTENSION,
	REVIEW_FENCES,
	REVIEW_HASH_LENGTHS,
	REVIEW_HASH_SPOILER,
	REVIEW_HEX_RUN,
	REVIEW_LEADING_EMPHASIS,
	REVIEW_QUOTE,
	REVIEW_TRAILING_EMPHASIS,
	REVIEW_VERDICT_KEY,
	VERDICT_NOT_READY,
	VERDICT_READY,
	VERDICT_READY_FOLLOWERS,
	VERDICT_SHOWN_LENGTH,
	VERDICT_UNCLOSED_FENCE,
} from './design.constants.ts'

import type {
	DesignFileContent,
	DesignFileRefusal,
	DesignReviews,
	VerdictFile,
	VerdictRead,
	VerdictStanding,
	VerdictWord,
} from './design.types.ts'

/**
 * What a review's text says: every hash prefix its `Design:` lines name, and its last `Verdict:` line read as ready,
 * not ready or unrecognized. Fenced and quoted lines are never read; a fence left open makes the verdict unrecognized.
 *
 * @intent read which design a saved review read and whether it passed it
 * @internal
 */
export function verdictOfText(params: { text: string }): VerdictRead {
	const designs: string[] = []
	let verdict: VerdictRead['verdict']
	let fenced = false
	for (const raw of params.text.split('\n')) {
		const line = raw.trim()
		if (isFenceLine(line)) {
			fenced = !fenced
			continue
		}
		if (fenced || line.startsWith(REVIEW_QUOTE)) continue
		const pair = keyValueOf(line)
		if (pair === undefined) continue
		if (pair.key === REVIEW_DESIGN_KEY) {
			const named = hashPrefixOf(pair.value)
			if (named !== undefined) designs.push(named)
		}
		if (pair.key === REVIEW_VERDICT_KEY) verdict = verdictOfValue(pair.value)
	}
	if (fenced) verdict = { word: 'unrecognized', written: VERDICT_UNCLOSED_FENCE }
	return verdict === undefined ? { designs } : { designs, verdict }
}

/**
 * The review files directly in `folder`: each `*.md` entry, its links followed, read once; a file that cannot be read,
 * is empty, is not UTF-8 or lies in a scratch or temporary folder is skipped, and so are the recorded design (by real
 * path) and any file whose bytes hash to the recorded hash. `gone` when the folder is.
 *
 * @intent find a design's saved reviews beside it, by what they say
 * @internal
 */
export function readVerdictFolder(params: {
	folder: string
	recorded: string
	recordedHash: string
	cwd: string
	sharedTemporaryRoots: readonly string[]
}): VerdictFile[] | 'gone' {
	const entries = folderEntriesOf(params.folder)
	if (entries === undefined) return 'gone'
	const recorded = realPathOf(params.recorded)
	return entries
		.filter(function isReview(entry) {
			return entry.endsWith(REVIEW_EXTENSION)
		})
		.sort()
		.flatMap(function readEntry(entry) {
			const content = designFileContentOf({
				file: join(params.folder, entry),
				cwd: params.cwd,
				sharedTemporaryRoots: params.sharedTemporaryRoots,
			})
			if (isDesignFileRefusal(content) || content.file === recorded) return []
			const file = verdictFileOf({ content, name: entry })
			return file.hash === params.recordedHash ? [] : [file]
		})
}

/**
 * The review files a person named, each read once, and the refusal of each that cannot be read, is empty, is not UTF-8
 * or lies in a scratch or temporary folder.
 *
 * @intent read the reviews a person points at
 * @internal
 */
export function readNamedVerdictFiles(params: {
	files: readonly string[]
	cwd: string
	sharedTemporaryRoots: readonly string[]
}): { files: VerdictFile[]; refusals: DesignFileRefusal[] } {
	const reads = params.files.map(function readNamed(file) {
		return designFileContentOf({
			file,
			cwd: params.cwd,
			sharedTemporaryRoots: params.sharedTemporaryRoots,
		})
	})
	return {
		files: reads.flatMap(function fileOf(read) {
			return isDesignFileRefusal(read)
				? []
				: [verdictFileOf({ content: read, name: basename(read.file) })]
		}),
		refusals: reads.filter(isDesignFileRefusal),
	}
}

/**
 * Where the reviews stand for the recorded `hash`: `blocked` when a file naming it says anything but READY, else
 * `ready` when one naming it says READY, else `missing`; with the READY files naming only an `earlier` recorded hash
 * and the files naming it without a verdict.
 *
 * @intent tell whether a saved review passed exactly the design being approved
 * @internal
 */
export function verdictStandingOf(params: {
	hash: string
	earlier: readonly string[]
	files: readonly VerdictFile[]
}): VerdictStanding {
	const { hash } = params
	const naming = params.files.filter(function namesTheHash(file) {
		return namesHash({ read: file.read, hash })
	})
	const ready = naming.filter(function saysReady(file) {
		return file.read.verdict?.word === 'ready'
	})
	const blocking = naming.filter(function saysOther(file) {
		return file.read.verdict !== undefined && file.read.verdict.word !== 'ready'
	})
	const noVerdict = naming
		.filter(function holdsNoVerdict(file) {
			return file.read.verdict === undefined
		})
		.map(nameOf)
	const earlierReady = params.files
		.filter(function readyElsewhere(file) {
			return file.read.verdict?.word === 'ready' && !namesHash({ read: file.read, hash })
		})
		.flatMap(function earlierNamed(file) {
			return params.earlier
				.filter(function namedThere(earlier) {
					return earlier !== hash && namesHash({ read: file.read, hash: earlier })
				})
				.map(function entryOf(earlier) {
					return { name: file.name, hash: earlier }
				})
		})
	return {
		state: blocking.length > 0 ? 'blocked' : ready.length > 0 ? 'ready' : 'missing',
		ready,
		blocking,
		earlierReady,
		noVerdict,
	}
}

/**
 * The reviews an approval of `recordedHash` reads: the review files of `folder` (none when it is gone) and the
 * `named` ones, each real path counted once; the named files refused, naming another hash or naming it without a
 * verdict (left out of the standing: their refusal names them); and where the rest stand.
 *
 * @intent gather every saved review a design approval rests on, and what is wrong with the ones a person named
 * @internal
 */
export function designReviewsOf(params: {
	folder: string
	recorded: string
	recordedHash: string
	earlier: readonly string[]
	named: readonly string[]
	cwd: string
	sharedTemporaryRoots: readonly string[]
}): DesignReviews {
	const { recordedHash } = params
	const scanned = readVerdictFolder(params)
	const named = readNamedVerdictFiles({
		files: params.named,
		cwd: params.cwd,
		sharedTemporaryRoots: params.sharedTemporaryRoots,
	})
	const scannedFiles = uniqueByFile(scanned === 'gone' ? [] : scanned)
	const seen = new Set(scannedFiles.map(fileOf))
	const namedFiles = uniqueByFile(named.files)
	const namesOther = namedFiles.filter(function namesOtherHash(file) {
		return !namesHash({ read: file.read, hash: recordedHash })
	})
	const namedNoVerdict = namedFiles.filter(function holdsNoVerdict(file) {
		return namesHash({ read: file.read, hash: recordedHash }) && file.read.verdict === undefined
	})
	// a named file refused (another hash, no verdict) is named once, by its refusal, never again as a hint
	const refused = new Set([...namesOther, ...namedNoVerdict].map(fileOf))
	const extra = namedFiles.filter(function counted(file) {
		return !seen.has(file.file) && !refused.has(file.file)
	})
	const scannedCounted = scannedFiles.filter(function notRefused(file) {
		return !refused.has(file.file)
	})
	return {
		folder: scanned === 'gone' ? 'gone' : 'read',
		refusals: named.refusals,
		namesOther: namesOther.map(fileOf),
		namedNoVerdict: namedNoVerdict.map(fileOf),
		standing: verdictStandingOf({
			hash: recordedHash,
			earlier: params.earlier,
			files: [...scannedCounted, ...extra],
		}),
	}
}

/**
 * Whether a review names `hash`: one of its `Design:` lines holds a prefix of it.
 *
 * @intent tell whether a review read these exact bytes
 * @internal
 */
export function namesHash(params: { read: VerdictRead; hash: string }): boolean {
	const hash = params.hash.toLowerCase()
	return params.read.designs.some(function isPrefix(prefix) {
		return hash.startsWith(prefix)
	})
}

/** A review read from its one buffer: the real path, the name it is shown by, the bytes' sha256, the text and parse. */
function verdictFileOf(params: { content: DesignFileContent; name: string }): VerdictFile {
	const { content } = params
	return {
		file: content.file,
		name: params.name,
		hash: designHashOf(content.bytes),
		text: content.text,
		read: verdictOfText({ text: content.text }),
	}
}

/** The names a folder holds; undefined when it is gone or no folder. */
function folderEntriesOf(folder: string): string[] | undefined {
	try {
		return statSync(folder).isDirectory() ? readdirSync(folder) : undefined
	} catch {
		return undefined
	}
}

function isFenceLine(line: string): boolean {
	return REVIEW_FENCES.some(function opens(fence) {
		return line.startsWith(fence)
	})
}

/** A line's key (emphasis stripped around it, lower case) and its value (every emphasis character removed, trimmed). */
function keyValueOf(line: string): { key: string; value: string } | undefined {
	const bare = line.replace(REVIEW_LEADING_EMPHASIS, '')
	const colon = bare.indexOf(':')
	if (colon < 0) return undefined
	return {
		key: bare.slice(0, colon).replace(REVIEW_TRAILING_EMPHASIS, '').trim().toLowerCase(),
		value: bare
			.slice(colon + 1)
			.replace(REVIEW_EMPHASIS, '')
			.trim(),
	}
}

/** The hash prefix a `Design:` value names, lower case: a hex run of 12 to 64 that no letter or digit follows. */
function hashPrefixOf(value: string): string | undefined {
	const run = REVIEW_HEX_RUN.exec(value)?.[0]
	if (run === undefined) return undefined
	if (run.length < REVIEW_HASH_LENGTHS.shortest || run.length > REVIEW_HASH_LENGTHS.longest)
		return undefined
	const next = value.charAt(run.length)
	return next !== '' && REVIEW_HASH_SPOILER.test(next) ? undefined : run.toLowerCase()
}

/** A `Verdict:` value read: READY (alone or before notes, a stop or a dash), NOT READY, or anything else. */
function verdictOfValue(value: string): { word: VerdictWord; written: string } {
	const written = value.slice(0, VERDICT_SHOWN_LENGTH)
	if (value.startsWith(VERDICT_NOT_READY)) return { word: 'not-ready', written }
	if (value === VERDICT_READY) return { word: 'ready', written }
	if (value.startsWith(VERDICT_READY)) {
		const rest = value.slice(VERDICT_READY.length).trimStart()
		if (VERDICT_READY_FOLLOWERS.includes(rest.charAt(0))) return { word: 'ready', written }
	}
	return { word: 'unrecognized', written }
}

/** The files, each real path once, the first kept: a link to a file already read reads it no second time. */
function uniqueByFile(files: readonly VerdictFile[]): VerdictFile[] {
	const seen = new Set<string>()
	return files.filter(function firstOfItsPath(file) {
		if (seen.has(file.file)) return false
		seen.add(file.file)
		return true
	})
}

function fileOf(file: VerdictFile): string {
	return file.file
}

function nameOf(file: VerdictFile): string {
	return file.name
}
