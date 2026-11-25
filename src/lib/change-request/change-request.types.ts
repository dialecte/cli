import type { ChangelogSection } from '../changelog/changelog.types.ts'
import type { HostNouns } from '../host/host.types.ts'
import type { BodyQuality } from '../quality/quality.types.ts'
import type { DesignRow, ReviewRecord } from '../review-rounds/review-record.types.ts'
import type { Effort, RiskClass } from '../risk/risk.types.ts'
import type { BriefSection } from '../store/brief.types.ts'
import type { TestsRecord } from '../tdd/tests-record.types.ts'

/** A step of the brief as the body shows it: its title and behaviours, never its spec. */
export type ChangeRequestStep = { title: string; behaviours: string[] }

/** The changelog of the lot: the sections of the fragments it adds, or the reason of its no-entry note. */
export type ChangeRequestChangelog =
	| { kind: 'entries'; entries: { section: ChangelogSection; text: string; file: string }[] }
	| { kind: 'none'; reason: string; file: string }

/** Everything a change request is rendered from, read from the lot's records; a source absent is undefined. */
export type ChangeRequestSources = {
	/** The commit messages of the brief's lots, in order: the first is the title. */
	messages: string[]
	summary?: string
	steps?: ChangeRequestStep[]
	/** The sections the lot writes for its reviewer (the brief's), shown verbatim; absent when it gives none. */
	sections?: BriefSection[]
	issue?: number
	changelog?: ChangeRequestChangelog
	tests?: TestsRecord
	/** The state hash of the tree the change request lands (its committed head): a tests part of another tree is stale. */
	treeHash: string
	review?: ReviewRecord
	/** The lot's design row from its live standing; the review record's row when absent. */
	design?: DesignRow
	riskClass?: RiskClass
	/** The overlaps the lot accepted: the other lot (shown by its index) and why, never the met paths or who. */
	overlaps?: { lot: string; reason: string }[]
	effort?: Effort
	/** The change request of the lot's stack parent (33CI CI4); undefined for a lot not stacked or a parent not landed. */
	dependsOn?: number
	/** Whether the newest gate run of the lot's tree passed its docs step; undefined when none ran it. */
	docsPassed?: boolean
	/** The version the lot sets: the head's package.json version when it differs from the base's; absent otherwise. */
	bumpedTo?: string
	/** Whether the lot is a release lot (the only kind that bumps the version). */
	release: boolean
	/** The base-aware findings judged on the committed head against the body's base, or why not judged. */
	quality?: BodyQuality
}

/** A change request's text: the title (the lot's message) and the body rendered from the template. */
export type ChangeRequestText = { title: string; body: string }

/** A piece of record-sourced free text the body shows, and the record it comes from (named by a refusal). */
export type PublicPiece = {
	record: string
	text: string
	/** Text committed to the repository (a changelog fragment): public already, its paths are not checked. */
	committed?: boolean
}

/** Why a body is not sent: what a piece holds (the rule's label, the word when it is no private reference). */
export type PublicRefusal = { record: string; label: string; word?: string }

/** A path the lot's commits change since the merge base, with git's status letter (`A`, `M`, `D`). */
export type ChangedFile = { status: string; path: string }

/** A change request ready to compose: the template checked and the sources read and checked as public text. */
/** A change request ready to compose: its template, its read sources and the host's nouns for its printed lines. */
export type PreparedChangeRequest = {
	template: string
	sources: ChangeRequestSources
	nouns: HostNouns
}

/**
 * A row of a lot's sent record (`sent-body.jsonl`): the hashes of lines the cli sent above the kept heading of one change
 * request; the rows of a number together are every line it ever sent there.
 */
export type SentRow = { schema: 1; changeRequest: number; at: string; lines: string[] }
