/**
 * The gathering half of `lot describe`: the lot's records read for its change request, then checked as public text
 * (`prepareChangeRequest`). Every read is of the lot's store folder or of the committed head of its worktree (the tree
 * the change request lands); a path it names passes only when a commit of the tree holds it. A record missing is undefined, never a guess.
 */
import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { packageJsonOfText } from '../api/api-index-diff.ts'
import { CHANGELOG_FILE, NO_ENTRY_EXTENSION } from '../changelog/changelog.constants.ts'
import { readSections } from '../changelog/sections.ts'
import { lotGitDeclaredHighOf } from '../design/base-declared.ts'
import { readContribRecord, readGateRecords } from '../gate-records/gate-records.ts'
import { hashStateTree } from '../gate-records/state-hash.ts'
import { readCommitOrNone, readFilesAtRevision, readGit, tryReadGit } from '../git.ts'
import { readLanding } from '../handover/land-record.ts'
import { HOST_VENDORS } from '../host/host-vendors.constants.ts'
import { hostNounsOf, vendorOf } from '../host/select-host.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { lotBaseOf } from '../landing/lot-base.ts'
import { readStackParent } from '../landing/read-stack-parent.ts'
import { PACKAGE_MANIFEST_FILE } from '../package-json.constants.ts'
import { checkBaseAwareAt } from '../quality/check-base-aware.ts'
import { applyQualityOptOuts } from '../quality/quality-pass.ts'
import { isDocsFinding, qualityNotesOf } from '../quality/quality-wording.ts'
import { QUALITY_BODY_TEXTS } from '../quality/quality.constants.ts'
import { designRowOf, readReviewRecord, verdictsAt } from '../review-rounds/review-record.ts'
import { riskStandingOf } from '../risk/risk-records.ts'
import { BASE_AWARE_RULES } from '../rules/check-code-rules.constants.ts'
import { GENERIC_REFERENCE_PATTERNS } from '../rules/committed-text.constants.ts'
import { readListedPatterns } from '../rules/committed-text.ts'
import { forbiddenWordPatterns, readForbiddenWords } from '../rules/forbidden-words.ts'
import { lotsOf } from '../store/brief.ts'
import { readLotOverlaps } from '../store/lot-overlaps.ts'
import { folderPlanEntryIds } from '../store/public-text.ts'
import { readStackRecord } from '../store/stack.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { readTestsRecord } from '../tdd/tests-record.ts'
import {
	ADDED_STATUS,
	DOCS_STEP,
	FRAGMENT_PATTERN,
	HEAD_TREE,
	CHANGE_REQUEST_LINES,
	TEMPLATE_PATHS_JOIN,
} from './change-request.constants.ts'
import { linesOf, templateFaultOf, titleVersionFault } from './compose-change-request.ts'
import { publicPiecesOf, publicRefusalOf } from './public-body.ts'
import { recordValueFault } from './record-values.ts'

import type { HostVendorRecord } from '../host/host.types.ts'
import type { BodyQuality } from '../quality/quality.types.ts'
import type { RuleName } from '../rules/check-code-rules.types.ts'
import type { ReferencePattern } from '../rules/committed-text.types.ts'
import type {
	ChangedFile,
	PreparedChangeRequest,
	ChangeRequestChangelog,
	ChangeRequestSources,
	ChangeRequestStep,
} from './change-request.types.ts'

/**
 * The lot's template and sources, checked: the repository's template holds every marker, and the free text of the
 * records holds no reference, forbidden word, plan entry id, link or path outside the tree. The refusal line otherwise.
 *
 * @intent render a lot's change request from its records, public text only
 * @internal
 */
export function prepareChangeRequest(params: {
	lotFolder: string
	worktree: string
	/** The base branch the change request lands on, as git names it (`origin/main`). */
	baseRef: string
	/**
	 * Where the template is read, in order, the first that holds the renderer's markers taken: the lot's head alone
	 * (the text it lands), or also the base (an early check of a lot cut before the template changed).
	 */
	templateRefs?: readonly string[]
	/** The vendors whose templates the tree may hold (default: every known vendor). */
	vendors?: readonly HostVendorRecord[]
}): PreparedChangeRequest | { refusal: string } {
	const template = templateOf({
		worktree: params.worktree,
		refs: params.templateRefs ?? ['HEAD'],
		vendors: params.vendors ?? HOST_VENDORS,
	})
	if ('refusal' in template) return template
	const sources = readChangeRequestSources(params)
	if ('refusal' in sources) return sources
	const title = titleVersionFault({ sources, lot: basename(params.lotFolder) })
	if (title !== undefined) return { refusal: title }
	const forged = recordValueFault(sources)
	if (forged !== undefined)
		return {
			refusal: CHANGE_REQUEST_LINES.recordValue
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
			refusal: fillMessage({
				template: CHANGE_REQUEST_LINES.refused,
				values: {
					...hostNounsOf({ root: params.worktree }),
					label: refused.label,
					word: refused.word === undefined ? '' : ` \`${refused.word}\``,
					record: refused.record,
				},
			}),
		}
	return { template: template.text, sources, nouns: hostNounsOf({ root: params.worktree }) }
}

/**
 * The template of the first ref, then the first candidate path, that holds one with every marker; else the refusal of
 * the first ref: no candidate path holds a template there, or the first one it holds has a fault. The candidates: the
 * worktree's vendor's own path when it is one of `vendors`, else every vendor's path in list order.
 */
function templateOf(params: {
	worktree: string
	refs: readonly string[]
	vendors: readonly HostVendorRecord[]
}): { text: string } | { refusal: string } {
	const paths = templatePathsOf({ worktree: params.worktree, vendors: params.vendors })
	const reads = params.refs.map(function templatesAt(ref) {
		return paths.flatMap(function templateAt(path) {
			const text = tryReadGit({ root: params.worktree, args: ['show', `${ref}:${path}`] })
			return text === undefined ? [] : [{ path, text, fault: templateFaultOf(text) }]
		})
	})
	const usable = reads.flat().find((read) => read.fault === undefined)
	if (usable !== undefined) return { text: usable.text }
	const first = reads[0]?.[0]
	if (first === undefined)
		return {
			refusal: fillMessage({
				template: CHANGE_REQUEST_LINES.noTemplateFile,
				values: { templates: paths.join(TEMPLATE_PATHS_JOIN) },
			}),
		}
	return {
		refusal: fillMessage({
			template: CHANGE_REQUEST_LINES.noTemplate,
			values: { template: first.path, fault: first.fault ?? '' },
		}),
	}
}

/** The template paths a worktree is read for: its vendor's own when it is one of `vendors`, else every vendor's. */
function templatePathsOf(params: {
	worktree: string
	vendors: readonly HostVendorRecord[]
}): string[] {
	const vendor = vendorOf({ root: params.worktree })
	if (vendor !== undefined && params.vendors.includes(vendor)) return [vendor.changeRequestTemplate]
	return params.vendors.map((each) => each.changeRequestTemplate)
}

/** The lot's sources for its change request; the refusal when its brief does not read or names no commit message. */
export function readChangeRequestSources(params: {
	lotFolder: string
	worktree: string
	baseRef: string
}): ChangeRequestSources | { refusal: string } {
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
	const fork = lotForkOf(params)
	if ('refusal' in fork) return fork
	// a lot not stacked forks at the body's merge-base: one merge-base read serves both
	const base = fork.stacked ? mergeBaseOf(params) : fork.forkPoint
	const changes = changedFilesOf({ worktree: params.worktree, base })
	const version = versionFactsOf({
		worktree: params.worktree,
		forkPoint: fork.forkPoint,
		base,
		changes,
	})
	const treeHash = hashStateTree(
		readGit({ root: params.worktree, args: ['rev-parse', 'HEAD^{tree}'] }).trim(),
	)
	const standing = riskStandingOf({ folder: params.lotFolder })
	const tests = readTestsRecord({ folder: params.lotFolder })
	const review = reviewAtHead(params)
	// the design line reads the lot's live standing: an edit or a scope change since review.jsonl was written counts
	const design = designRowOf({
		folder: params.lotFolder,
		declaredHigh: lotGitDeclaredHighOf({ lotFolder: params.lotFolder }).globs,
	})
	const changelog = changelogOf({ worktree: params.worktree, changes })
	const docsPassed = docsPassedOn({ worktree: params.worktree, treeHash })
	const dependsOn = stackParentChangeRequestOf({ lotFolder: params.lotFolder })
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
		...(design !== undefined && { design }),
		...(standing.comparedClass !== undefined && { riskClass: standing.comparedClass }),
		...(standing.effort !== undefined && { effort: standing.effort }),
		...(overlaps.length > 0 && { overlaps }),
		...(dependsOn !== undefined && { dependsOn }),
		...(docsPassed !== undefined && { docsPassed }),
		quality: bodyQualityOf({ worktree: params.worktree, base }),
		...version,
	}
}

/** The review record's verdicts at the worktree's HEAD; undefined without a review record. */
function reviewAtHead(params: {
	lotFolder: string
	worktree: string
}): ReturnType<typeof verdictsAt> | undefined {
	const record = readReviewRecord({ folder: params.lotFolder })
	if (record === undefined) return undefined
	const head = readGit({ root: params.worktree, args: ['rev-parse', 'HEAD'] }).trim()
	return verdictsAt({ record, head })
}

/**
 * The lot's own fork point (`lotBaseOf`: the base's merge-base, or the newest commit of an open stack parent's line the
 * lot holds) and whether it is stacked; refused for a base that cannot be read here, a stack record or parent that
 * cannot be read, or no fork point, never read against the base branch.
 */
function lotForkOf(params: {
	lotFolder: string
	worktree: string
	baseRef: string
}): { forkPoint: string; stacked: boolean } | { refusal: string } {
	const { worktree, baseRef } = params
	if (readCommitOrNone({ root: worktree, ref: baseRef }) === undefined)
		return {
			refusal: fillMessage({
				template: CHANGE_REQUEST_LINES.unreadBase,
				values: { base: baseRef },
			}),
		}
	const parent = readStackParent({ lotFolder: params.lotFolder, root: worktree })
	if (parent !== undefined && 'refusal' in parent) return parent
	const lotBase = lotBaseOf({
		root: worktree,
		head: 'HEAD',
		baseRef,
		...(parent !== undefined && { parent }),
	})
	if ('refusal' in lotBase) return lotBase
	return { forkPoint: lotBase.forkPoint, stacked: parent !== undefined }
}

/**
 * The version facts of the checklist, read at the lot's own fork point: the version it sets and whether it is a release
 * (a fragment deleted and the changelog changed). A fork point that is the body's `base` reuses its `changes`.
 */
function versionFactsOf(params: {
	worktree: string
	forkPoint: string
	base: string
	changes: readonly ChangedFile[]
}): { bumpedTo?: string; release: boolean } {
	const { worktree, forkPoint } = params
	const changes =
		forkPoint === params.base ? params.changes : changedFilesOf({ worktree, base: forkPoint })
	return {
		...bumpedToOf({ worktree, base: forkPoint }),
		release:
			changes.some((change) => change.status === 'D' && FRAGMENT_PATTERN.test(change.path)) &&
			changes.some((change) => change.path === CHANGELOG_FILE),
	}
}

/**
 * The base-aware findings of the committed head of `worktree` against `base` (the body's own base), its package.json
 * and opt-outs read at the head; not judged, with why, for a head with no package.json or a base git cannot read. No
 * record is read, and nothing of the worktree is written.
 */
function bodyQualityOf(params: { worktree: string; base: string }): BodyQuality {
	const { worktree: root } = params
	const manifest = readFilesAtRevision({
		root,
		revision: HEAD_TREE.revision,
		files: [PACKAGE_MANIFEST_FILE],
	}).get(PACKAGE_MANIFEST_FILE)
	if (manifest === undefined) return { kind: 'not-judged', why: QUALITY_BODY_TEXTS.noPackage }
	const packageJson = packageJsonOfText(manifest)
	if (packageJson === undefined)
		return { kind: 'not-judged', why: QUALITY_BODY_TEXTS.unparsedPackage }
	const commit = tryReadGit({
		root,
		args: ['rev-parse', '--verify', '--quiet', `${params.base}^{commit}`],
	})?.trim()
	if (!commit)
		return {
			kind: 'not-judged',
			why: QUALITY_BODY_TEXTS.noBase.replace('{base}', () => params.base),
		}
	const base = { commit, source: 'base-branch' as const }
	const result = checkBaseAwareAt({
		root,
		base,
		revision: HEAD_TREE.revision,
		treePackageJson: packageJson,
	})
	if ('notJudged' in result) return { kind: 'not-judged', why: result.notJudged }
	// the body judges no file: no opt-out is judged unused, the findings it silences are only counted
	const { recorded } = applyQualityOptOuts({
		result,
		givenFiles: [],
		ranRules: new Set<RuleName>(BASE_AWARE_RULES),
		readTexts: function headTextsOf(files) {
			return readFilesAtRevision({ root, revision: HEAD_TREE.revision, files })
		},
	})
	return {
		kind: 'judged',
		base,
		notes: qualityNotesOf(result),
		duplicates: recorded.duplicates,
		sharedExports: recorded.sharedExports,
		// a removed entry is a note, never a docs finding of the body
		docs: recorded.docs.filter(isDocsFinding),
	}
}

/** The change request number the lot's stack parent landed through (its `landing.json`); undefined when none. */
function stackParentChangeRequestOf(params: { lotFolder: string }): number | undefined {
	const stack = readStackRecord(params)
	if (stack === undefined) return undefined
	return readLanding({ lotFolder: join(dirname(params.lotFolder), stack.parent) })?.number
}

function unreadBrief(params: { brief: string; reason: string }): string {
	return CHANGE_REQUEST_LINES.unreadBrief
		.replace('{brief}', () => params.brief)
		.replace('{reason}', () => params.reason)
}

/** The steps of the brief as the body shows them: their titles and behaviours; a malformed one left out. */
function stepsOf(steps: unknown[]): ChangeRequestStep[] {
	return steps.flatMap(function stepOf(step): ChangeRequestStep[] {
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
	// the base is a commit lotForkOf resolved; a diff git cannot read (a tree gone) changes nothing
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
}): ChangeRequestChangelog | undefined {
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

/** The head's version when it differs from the base's (a base reading none differs); nothing otherwise. */
function bumpedToOf(params: { worktree: string; base: string }): { bumpedTo?: string } {
	const head = versionAt({ worktree: params.worktree, commit: 'HEAD' })
	if (head === undefined) return {}
	return head === versionAt({ worktree: params.worktree, commit: params.base })
		? {}
		: { bumpedTo: head }
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
			refusal: fillMessage({
				template: CHANGE_REQUEST_LINES.unchecked,
				values: { ...hostNounsOf({ root: params.root }), reason: (error as Error).message },
			}),
		}
	}
}

/**
 * The files of the lot's tree: those its committed head holds and those its base holds (a file the lot deletes still
 * names the tree). An untracked file of the worktree is none: no commit of the change request holds it.
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
