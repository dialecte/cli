/**
 * The gathering half of `lot pr`: the lot's records read for its pull request, then checked as public text
 * (`preparePullRequest`). Every read is of the lot's store folder or of the committed head of its worktree (the tree
 * the pull request lands); a path it names passes only when a commit of the tree holds it. A record missing is undefined, never a guess.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CHANGELOG_FILE, NO_ENTRY_EXTENSION } from '../changelog/changelog.constants.ts'
import { readSections } from '../changelog/sections.ts'
import { readContribRecord, readGateRecords } from '../gate-records/gate-records.ts'
import { hashStateTree } from '../gate-records/state-hash.ts'
import { readGit, tryReadGit } from '../git.ts'
import { readReviewRecord, verdictsAt } from '../review-rounds/review-record.ts'
import { riskStandingOf } from '../risk/risk-records.ts'
import { GENERIC_REFERENCE_PATTERNS } from '../rules/committed-text.constants.ts'
import { readListedPatterns } from '../rules/committed-text.ts'
import { forbiddenWordPatterns, readForbiddenWords } from '../rules/forbidden-words.ts'
import { lotsOf } from '../store/brief.ts'
import { readLotOverlaps } from '../store/lot-overlaps.ts'
import { folderPlanEntryIds } from '../store/public-text.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { readTestsRecord } from '../tdd/tests-record.ts'
import { linesOf, templateFaultOf } from './compose-pull-request.ts'
import { publicPiecesOf, publicRefusalOf } from './public-body.ts'
import {
	ADDED_STATUS,
	DOCS_STEP,
	FRAGMENT_PATTERN,
	PULL_REQUEST_LINES,
	TEMPLATE_PATH,
} from './pull-request.constants.ts'
import { recordValueFault } from './record-values.ts'

import type { ReferencePattern } from '../rules/committed-text.types.ts'
import type {
	ChangedFile,
	PreparedPullRequest,
	PullRequestChangelog,
	PullRequestSources,
	PullRequestStep,
} from './pull-request.types.ts'

/**
 * The lot's template and sources, checked: the repository's template holds every marker, and the free text of the
 * records holds no reference, forbidden word, plan entry id, link or path outside the tree. The refusal line otherwise.
 *
 * @intent render a lot's pull request from its records, public text only
 * @internal
 */
export function preparePullRequest(params: {
	lotFolder: string
	worktree: string
	/** The base branch the pull request lands on, as git names it (`origin/main`). */
	baseRef: string
	/**
	 * Where the template is read, in order, the first that holds the renderer's markers taken: the lot's head alone
	 * (the text it lands), or also the base (an early check of a lot cut before the template changed).
	 */
	templateRefs?: readonly string[]
}): PreparedPullRequest | { refusal: string } {
	const template = templateOf({ worktree: params.worktree, refs: params.templateRefs ?? ['HEAD'] })
	if ('refusal' in template) return template
	const sources = readPullRequestSources(params)
	if ('refusal' in sources) return sources
	const forged = recordValueFault(sources)
	if (forged !== undefined)
		return {
			refusal: PULL_REQUEST_LINES.recordValue
				.replace('{record}', forged.record)
				.replace('{field}', forged.field),
		}
	const lists = referencePatternsOf({ root: params.worktree })
	if ('refusal' in lists) return lists
	const base = mergeBaseOf(params)
	const refused = publicRefusalOf({
		pieces: publicPiecesOf(sources),
		patterns: lists.patterns,
		ids: folderPlanEntryIds({ folder: params.lotFolder }),
		treeFiles: treeFilesOf({ worktree: params.worktree, base }),
	})
	if (refused !== undefined)
		return {
			refusal: PULL_REQUEST_LINES.refused
				.replace('{label}', refused.label)
				.replace('{word}', () => (refused.word === undefined ? '' : ` \`${refused.word}\``))
				.replace('{record}', () => refused.record),
		}
	return { template: template.text, sources }
}

/**
 * The template of the first ref that holds one with every marker; else the refusal of the first ref: no template, or
 * the template's fault.
 */
function templateOf(params: {
	worktree: string
	refs: readonly string[]
}): { text: string } | { refusal: string } {
	const reads = params.refs.map(function templateAt(ref) {
		const text = tryReadGit({ root: params.worktree, args: ['show', `${ref}:${TEMPLATE_PATH}`] })
		return { text, fault: text === undefined ? undefined : templateFaultOf(text) }
	})
	const usable = reads.find((read) => read.text !== undefined && read.fault === undefined)
	if (usable?.text !== undefined) return { text: usable.text }
	const [first] = reads
	if (first?.text === undefined)
		return { refusal: PULL_REQUEST_LINES.noTemplateFile.replace('{template}', TEMPLATE_PATH) }
	return {
		refusal: PULL_REQUEST_LINES.noTemplate
			.replace('{template}', TEMPLATE_PATH)
			.replace('{fault}', () => first.fault ?? ''),
	}
}

/** The lot's sources for its pull request; the refusal when its brief does not read or names no commit message. */
export function readPullRequestSources(params: {
	lotFolder: string
	worktree: string
	baseRef: string
}): PullRequestSources | { refusal: string } {
	const briefPath = join(params.lotFolder, STORE_FILES.brief)
	let brief: Record<string, unknown>
	try {
		brief = JSON.parse(readFileSync(briefPath, 'utf8')) as Record<string, unknown>
	} catch (error) {
		return { refusal: unreadBrief({ brief: briefPath, reason: (error as Error).message }) }
	}
	const lots = lotsOf(brief.lots)
	if (lots.lots === undefined)
		return {
			refusal: unreadBrief({
				brief: briefPath,
				reason: lots.refused.map((refusal) => refusal.detail).join('; '),
			}),
		}
	const base = mergeBaseOf(params)
	const changes = changedFilesOf({ worktree: params.worktree, base })
	const treeHash = hashStateTree(
		readGit({ root: params.worktree, args: ['rev-parse', 'HEAD^{tree}'] }).trim(),
	)
	const standing = riskStandingOf({ folder: params.lotFolder })
	const tests = readTestsRecord({ folder: params.lotFolder })
	const record = readReviewRecord({ folder: params.lotFolder })
	const review =
		record === undefined
			? undefined
			: verdictsAt({
					record,
					head: readGit({ root: params.worktree, args: ['rev-parse', 'HEAD'] }).trim(),
				})
	const changelog = changelogOf({ worktree: params.worktree, changes })
	const docsPassed = docsPassedOn({ worktree: params.worktree, treeHash })
	const overlaps = readLotOverlaps({ lotFolder: params.lotFolder }).overlaps.map((record) => ({
		lot: record.lot,
		reason: record.reason,
	}))
	return {
		messages: lots.lots.map((lot) => lot.message.trim()),
		...(typeof brief.summary === 'string' && { summary: brief.summary }),
		...(Array.isArray(brief.steps) && { steps: stepsOf(brief.steps) }),
		...(typeof brief.issue === 'number' && { issue: brief.issue }),
		...(changelog !== undefined && { changelog }),
		...(tests !== undefined && { tests }),
		treeHash,
		...(review !== undefined && { review }),
		...(standing.comparedClass !== undefined && { riskClass: standing.comparedClass }),
		...(standing.effort !== undefined && { effort: standing.effort }),
		...(overlaps.length > 0 && { overlaps }),
		...(docsPassed !== undefined && { docsPassed }),
		versionBumped:
			versionAt({ worktree: params.worktree, commit: base }) !==
			versionAt({ worktree: params.worktree, commit: 'HEAD' }),
		release:
			changes.some((change) => change.status === 'D' && FRAGMENT_PATTERN.test(change.path)) &&
			changes.some((change) => change.path === CHANGELOG_FILE),
	}
}

function unreadBrief(params: { brief: string; reason: string }): string {
	return PULL_REQUEST_LINES.unreadBrief
		.replace('{brief}', () => params.brief)
		.replace('{reason}', () => params.reason)
}

/** The steps of the brief as the body shows them: their titles and behaviours; a malformed one left out. */
function stepsOf(steps: unknown[]): PullRequestStep[] {
	return steps.flatMap(function stepOf(step): PullRequestStep[] {
		const { title, behaviours } = (step ?? {}) as { title?: unknown; behaviours?: unknown }
		if (typeof title !== 'string' || !Array.isArray(behaviours)) return []
		return [
			{
				title,
				behaviours: behaviours.filter(
					(behaviour): behaviour is string => typeof behaviour === 'string',
				),
			},
		]
	})
}

/** Where the lot's branch left the base branch: its merge base, or the base itself when git cannot tell. */
function mergeBaseOf(params: { worktree: string; baseRef: string }): string {
	return (
		tryReadGit({ root: params.worktree, args: ['merge-base', params.baseRef, 'HEAD'] })?.trim() ||
		params.baseRef
	)
}

/** The paths the lot's commits change since `base`, each with its status letter (renames as delete and add). */
function changedFilesOf(params: { worktree: string; base: string }): ChangedFile[] {
	// a base git cannot resolve (a branch not fetched yet) changes nothing: the caller's own checks name it
	const fields = (
		tryReadGit({
			root: params.worktree,
			args: ['diff', '--name-status', '--no-renames', '-z', params.base, 'HEAD'],
		}) ?? ''
	)
		.split('\0')
		.filter((field) => field !== '')
	const changes: ChangedFile[] = []
	for (let index = 0; index + 1 < fields.length; index += 2)
		changes.push({ status: fields[index], path: fields[index + 1] })
	return changes
}

/**
 * The changelog of the fragments the lot adds (an edit of another lot's fragment is that lot's), as its head holds them: their sections, in file order; with
 * none, the reason of its no-entry note; undefined when the lot writes neither. A fragment that does not read is left
 * out (the commit's own check names it).
 */
function changelogOf(params: {
	worktree: string
	changes: ChangedFile[]
}): PullRequestChangelog | undefined {
	const written = params.changes
		.filter((change) => change.status === ADDED_STATUS && FRAGMENT_PATTERN.test(change.path))
		.map((change) => change.path)
		.sort()
	const entries = written
		.filter((path) => !path.endsWith(NO_ENTRY_EXTENSION))
		.flatMap(function entriesOf(file) {
			const read = readSections({
				text: headText({ worktree: params.worktree, path: file }),
				mode: 'fragment',
			})
			return 'problem' in read ? [] : read.sections.map((entry) => ({ ...entry, file }))
		})
	if (entries.length > 0) return { kind: 'entries', entries }
	const note = written.find((path) => path.endsWith(NO_ENTRY_EXTENSION))
	if (note === undefined) return undefined
	return {
		kind: 'none',
		reason: headText({ worktree: params.worktree, path: note }).trim(),
		file: note,
	}
}

function headText(params: { worktree: string; path: string }): string {
	return linesOf(readGit({ root: params.worktree, args: ['show', `HEAD:${params.path}`] })).join(
		'\n',
	)
}

/** Whether the newest gate or contrib run on the landed tree that ran the docs step passed it; undefined when none did. */
function docsPassedOn(params: { worktree: string; treeHash: string }): boolean | undefined {
	const contrib = readContribRecord(params.worktree)
	const runs = [...readGateRecords(params.worktree), ...(contrib === undefined ? [] : [contrib])]
		.filter((record) => record.stateHash === params.treeHash)
		.filter((record) => record.steps.some((step) => step.name === DOCS_STEP))
		.sort((left, right) => right.at.localeCompare(left.at))
	return runs[0]?.steps.find((step) => step.name === DOCS_STEP)?.status === 'passed'
		? true
		: runs.length === 0
			? undefined
			: false
}

/** The `version` of the package.json `commit` holds; undefined without one. */
function versionAt(params: { worktree: string; commit: string }): string | undefined {
	const text = tryReadGit({
		root: params.worktree,
		args: ['show', `${params.commit}:package.json`],
	})
	try {
		const version = (JSON.parse(text ?? '') as { version?: unknown }).version
		return typeof version === 'string' ? version : undefined
	} catch {
		return undefined
	}
}

/** The reference patterns of the repository's lists, or the refusal when one cannot be read. */
function referencePatternsOf(params: {
	root: string
}): { patterns: ReferencePattern[] } | { refusal: string } {
	try {
		return {
			patterns: [
				...GENERIC_REFERENCE_PATTERNS,
				...readListedPatterns(params.root),
				...forbiddenWordPatterns(readForbiddenWords({ root: params.root })),
			],
		}
	} catch (error) {
		return {
			refusal: PULL_REQUEST_LINES.unchecked.replace('{reason}', () => (error as Error).message),
		}
	}
}

/**
 * The files of the lot's tree: those its committed head holds and those its base holds (a file the lot deletes still
 * names the tree). An untracked file of the worktree is none: no commit of the pull request holds it.
 */
function treeFilesOf(params: { worktree: string; base: string }): ReadonlySet<string> {
	const files = new Set(
		[params.base, 'HEAD'].flatMap(function filesAt(commit) {
			return (
				tryReadGit({
					root: params.worktree,
					args: ['ls-tree', '-r', '-z', '--name-only', commit],
				}) ?? ''
			).split('\0')
		}),
	)
	files.delete('')
	return files
}
