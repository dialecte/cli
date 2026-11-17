import type { ChangelogSection } from '../changelog/changelog.types.ts'
import type { ReviewRecord } from '../review-rounds/review-record.types.ts'
import type { Effort, RiskClass } from '../risk/risk.types.ts'
import type { TestsRecord } from '../tdd/tests-record.types.ts'

/** A step of the brief as the body shows it: its title and behaviours, never its spec. */
export type PullRequestStep = { title: string; behaviours: string[] }

/** The changelog of the lot: the sections of the fragments it adds, or the reason of its no-entry note. */
export type PullRequestChangelog =
	| { kind: 'entries'; entries: { section: ChangelogSection; text: string; file: string }[] }
	| { kind: 'none'; reason: string; file: string }

/** Everything a pull request is rendered from, read from the lot's records; a source absent is undefined. */
export type PullRequestSources = {
	/** The commit messages of the brief's lots, in order: the first is the title. */
	messages: string[]
	summary?: string
	steps?: PullRequestStep[]
	issue?: number
	changelog?: PullRequestChangelog
	tests?: TestsRecord
	/** The state hash of the tree the pull request lands (its committed head): a tests part of another tree is stale. */
	treeHash: string
	review?: ReviewRecord
	riskClass?: RiskClass
	/** The overlaps the lot accepted, as the body shows them: the other lot and why, never the met paths or who. */
	overlaps?: { lot: string; reason: string }[]
	effort?: Effort
	/** Whether the newest gate run of the lot's tree passed its docs step; undefined when none ran it. */
	docsPassed?: boolean
	/** Whether the lot changes the package's version. */
	versionBumped: boolean
	/** Whether the lot is a release lot (the only kind that bumps the version). */
	release: boolean
}

/** A pull request's text: the title (the lot's message) and the body rendered from the template. */
export type PullRequestText = { title: string; body: string }

/** A piece of record-sourced free text the body shows, and the record it comes from (named by a refusal). */
export type PublicPiece = { record: string; text: string }

/** Why a body is not sent: what a piece holds (the rule's label, the word when it is no private reference). */
export type PublicRefusal = { record: string; label: string; word?: string }

/** A path the lot's commits change since the merge base, with git's status letter (`A`, `M`, `D`). */
export type ChangedFile = { status: string; path: string }
