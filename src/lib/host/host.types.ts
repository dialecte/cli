import type { HOST_READ_METHODS, HOST_VENDOR_NAMES } from './host.constants.ts'

/** A pull request on the host, as a landing reads it. */
export type ChangeRequest = {
	number: number
	url: string
	title: string
	/** Its description as the host holds it (the squash commit's body). */
	body: string
	state: 'open' | 'merged' | 'closed'
	draft: boolean
	/** True while the host merges it once its checks pass: auto-merge on, or in the merge queue. */
	queued: boolean
	/** The commit its head branch pointed at (the last push). */
	head: string
	/** The branch it merges into; undefined when the host did not say. */
	base?: string
	/** The page of its changed files, which `lot review` prints; absent when the host gives none (its `url` is then printed). */
	filesUrl?: string
}

/** Whether the host links pull requests into stacks here, and why not when it does not. */
export type StackSupport = { stacks: true } | { stacks: false; why: string }

/** How the checks on a pull request's head stand: all passed, one failed, one still running, or none at all. */
export type ChecksState = 'green' | 'failing' | 'pending' | 'none'

/** The checks on a pull request's head: their state and the names of the failing and the pending ones. */
export type ChangeRequestChecks = {
	/** The commit the checks ran on (the pull request's head). */
	head: string
	state: ChecksState
	failing: string[]
	pending: string[]
}

/** A line comment of a pull request's review: on a file, at a line when it has one; a reply names what it answers. */
export type ReviewComment = {
	id: number
	path: string
	line?: number
	body: string
	/** The comment this one answers in its thread; absent for a thread's first comment. */
	replyTo?: number
}

/** A host operation's refusal: git's or the host tool's first line. */
export type HostRefusal = { refusal: string }

/**
 * Where lots land: the one seam to the repository's host (each vendor is one adapter). Every call runs in the
 * repository at `root`; none prompts.
 */
export type HostAdapter = {
	/** The pull request `ref` names (a number, or a branch: its newest); undefined when there is none. */
	readChangeRequest(params: { root: string; ref: string }): ChangeRequest | undefined | HostRefusal
	/** A new pull request of `branch` into `base`. */
	openChangeRequest(params: {
		root: string
		branch: string
		base: string
		title: string
		body: string
		draft: boolean
	}): ChangeRequest | HostRefusal
	/** The pull request's title and body replaced by `title` and `body`. */
	editChangeRequest(params: {
		root: string
		number: number
		title: string
		body: string
	}): HostRefusal | undefined
	/** The pull request closed: taken out of the merge queue, never merged. */
	closeChangeRequest(params: { root: string; number: number }): HostRefusal | undefined
	/** The pull request queued: merged by the host once its checks pass (a draft made ready first). */
	queueChangeRequest(params: {
		root: string
		number: number
		draft: boolean
	}): HostRefusal | undefined
	/**
	 * The pull request taken back out of the queue: auto-merge turned off when `queued`, made a draft when not `draft`
	 * (an approval is for one head); nothing asked when it is a draft not queued.
	 */
	draftChangeRequest(params: {
		root: string
		number: number
		queued: boolean
		draft: boolean
	}): HostRefusal | undefined
	/**
	 * Whether the host merges the pull request once its checks pass: auto-merge on, or in the merge queue (which a
	 * pull request read cannot say).
	 */
	readQueued(params: { root: string; number: number }): { queued: boolean } | HostRefusal
	/** The checks on the pull request's head. */
	readChecks(params: { root: string; number: number }): ChangeRequestChecks | HostRefusal
	/** The line comments of the pull request's reviews, oldest first. */
	readReviewComments(params: { root: string; number: number }): ReviewComment[] | HostRefusal
	/** The pull request's changed files opened in the browser (`url` is the pull request's page). */
	openFiles(params: { root: string; url: string }): HostRefusal | undefined
	/** Whether the host links pull requests into stacks here (33CI CI4); no network asked. */
	probeStacks(params: { root: string }): StackSupport
	/** The pull request at `child` (its url) linked on top of the one at `parent` as a stack. */
	linkStack(params: { root: string; parent: string; child: string }): HostRefusal | undefined
	/**
	 * The stack queued up to and including `number`, all or nothing (never auto-merge: refused for a stack); a draft made
	 * ready first.
	 */
	queueStack(params: { root: string; number: number; draft: boolean }): HostRefusal | undefined
	/** The pull request's base branch changed to `base`. */
	retargetChangeRequest(params: {
		root: string
		number: number
		base: string
	}): HostRefusal | undefined
}

/** The adapter as a probe sees it: only the methods the probes use, all reads, so a probe cannot write. */
export type HostReadAdapter = Pick<HostAdapter, (typeof HOST_READ_METHODS)[number]>

/** Whether a host call only reads (short timeout, probed live) or writes (long timeout, never live). */
export type HostCallKind = 'read' | 'write'

/** One call of a host's tool, declared once: the table the argv and the contract check both read. */
export type HostCallSpec = {
	/** The command path: `['pr', 'view']`, `['api']`, `['stack', 'merge']`. */
	words: readonly string[]
	/** Every flag a call site may pass; never the implied ones (`--json`, `-f`, `--jq`), which come from the spec. */
	flags: readonly string[]
	kind: HostCallKind
	/** The fields the tool is asked for, passed by the runner itself. */
	fields?: readonly string[]
	/** The GraphQL query, passed by the runner itself (the entry's endpoint is then `graphql`). */
	graphql?: string
	/** The output filter, passed by the runner itself, so a probe sends the adapter's exact argv. */
	filter?: string
	/** The REST path template; each `{x}` given in `values` is filled, the rest is left to the tool. */
	endpoint?: string
}

/** A host's calls by name. */
export type HostCallTable = Record<string, HostCallSpec>

/** The names of the table's read calls. */
export type ReadCallOf<Calls extends HostCallTable> = {
	[K in keyof Calls]: Calls[K]['kind'] extends 'read' ? K : never
}[keyof Calls]

/** The options one call takes: only its declared flags; an entry with no flags takes none. */
export type HostOptions<Calls extends HostCallTable, K extends keyof Calls> = [
	Calls[K]['flags'][number],
] extends [never]
	? Record<string, never>
	: Partial<Record<Calls[K]['flags'][number], string | true | readonly string[]>>

/** The name of a known host vendor. */
export type HostVendorName = (typeof HOST_VENDOR_NAMES)[number]

/** A host vendor's runtime record: how a repository is recognised as its, and the adapter that serves it. */
export type HostVendor<Calls extends HostCallTable, Subject extends keyof Calls> = {
	name: HostVendorName
	/** The cli the vendor's adapter runs (`gh`). */
	tool: string
	/** The hosts of an origin that mean this vendor (lower-case). */
	remoteHosts: readonly string[]
	/** The calls the adapter makes, by name. */
	calls: Calls
	/** The versions of the tool the record was taken from, by part (the keys `describe.versionOf` takes). */
	recordedVersions: Readonly<Record<string, string>>
	/** The read that finds the pull request the other probes read, and its probe. */
	subject: {
		call: Calls[Subject]['kind'] extends 'write' ? never : Subject
		find: HostSubjectProbe<Calls>
	}
	/** One live probe per other read call; a read without one does not compile. */
	probes: Record<Exclude<ReadCallOf<Calls>, Subject>, HostProbe<Calls>>
	createAdapter(): HostAdapter
}

/** What a vendor's live probes are run with: its tool's runner and the reads of what the tool describes of itself. */
export type HostVendorSeams = {
	/** The runner of the vendor's tool, for the probe-only reads. */
	run: HostToolRun
	describe: HostDescribe
}

/**
 * A tool run with its call table erased (any call name), written out rather than as `HostToolRun<HostCallTable>`: a
 * vendor's run, typed by its own table, is compared with it structurally.
 */
export type HostErasedToolRun = {
	bivarianceHack(params: HostToolCall<string>): { output: string } | HostRefusal
}['bivarianceHack']

/** The probes of a vendor whose call table is erased: the same shapes, run by any call name. */
export type HostErasedProbes = {
	find(params: {
		root: string
		host: HostReadAdapter
		run: HostErasedToolRun
		subject: string
	}): ReturnType<HostSubjectProbe>
	probe(params: {
		root: string
		host: HostReadAdapter
		run: HostErasedToolRun
		subject: string
		changeRequest?: number
	}): HostLine
}

/** A vendor with its call table erased, and what its probes run with: the element of the one list of vendors. */
export type HostVendorRecord = Omit<HostVendor<HostCallTable, string>, 'subject' | 'probes'> & {
	subject: { call: string; find: HostErasedProbes['find'] }
	probes: Readonly<Record<string, HostErasedProbes['probe']>>
} & HostVendorSeams

/** A flag's short and long forms, as a tool's help prints them together (`-q, --jq`). */
export type HostFlagAlias = { short: string; long: string }

/** One field of a GraphQL type: the name of its type, unwrapped, and the names of its arguments. */
export type HostGraphqlField = { type: string; args: readonly string[] }

/** What the record holds of one command: all its flags (short and long), its alias pairs, and its fields when it lists some. */
export type HostContractCommand = {
	flags: readonly string[]
	aliases: readonly HostFlagAlias[]
	fields?: readonly string[]
}

/**
 * What a tool described of itself, recorded: its commands by path (`"pr view"`) and the GraphQL types it was asked
 * about, each with its fields. The root type is `Query`.
 */
export type HostContract = {
	commands: Readonly<Record<string, HostContractCommand>>
	graphql: Readonly<Record<string, Readonly<Record<string, HostGraphqlField>>>>
}

/** One answer of the tool's description: the bytes it printed, kept as they are, and what was read out of them. */
export type HostAnswer<Parsed> = { raw: string } & Parsed

/** A part of the tool that is not installed (an extension): the name it installs under, and the tool's own line. */
export type HostAbsentPart = HostRefusal & { absent: string }

/** The closed reads of what a tool describes of itself; each runs in the repository at `root`. */
export type HostDescribe = {
	/** The command's help: its flags, short and long, and the alias pairs. */
	helpOf(params: {
		root: string
		words: readonly string[]
	}): HostAnswer<{ flags: string[]; aliases: HostFlagAlias[] }> | HostRefusal
	/** The fields the command lists (absent for a tool that lists none). */
	fieldsOf?(params: {
		root: string
		words: readonly string[]
	}): HostAnswer<{ fields: string[] }> | HostRefusal
	/** One GraphQL type: its fields. */
	typeOf(params: {
		root: string
		name: string
	}): HostAnswer<{ fields: Record<string, HostGraphqlField> }> | HostRefusal
	/**
	 * The version of one of the tool's parts (`selector`: a key of the record's versions; a part other than the tool
	 * itself is the first word of its commands); absent when that part is not installed.
	 */
	versionOf(params: {
		root: string
		selector: string
	}): HostAnswer<{ version: string }> | HostAbsentPart | HostRefusal
}

/**
 * One line of the host check: what was probed, what was found, and the command that fixes it (only on a warning or an
 * error). `doctor` re-exports it as `DoctorLine`.
 */
export type HostLine = {
	status: 'ok' | 'warning' | 'error'
	subject: string
	detail: string
	fix?: string
}

/** One call of a vendor's tool for a probe-only read: `call` names an entry of its table. */
export type HostToolCall<Call extends string> = {
	root: string
	call: Call
	positional?: readonly string[]
	options?: Readonly<Record<string, string | true | readonly string[] | undefined>>
	values?: Readonly<Record<string, string>>
	input?: string
}

/** The seam a vendor's tool is called through for a probe-only read: one read call of its table, by name. */
export type HostToolRun<Calls extends HostCallTable = HostCallTable> = {
	/** The read calls of the vendor's table (any name when the table is erased). */
	bivarianceHack(
		params: HostToolCall<HostCallTable extends Calls ? string : Extract<ReadCallOf<Calls>, string>>,
	): { output: string } | HostRefusal
}['bivarianceHack']

/**
 * One live probe of a read call: its line, whose subject is `subject` (the probe's key in the vendor's table);
 * `pullRequest` is the one the vendor's subject probe found, when it did.
 */
export type HostProbe<Calls extends HostCallTable = HostCallTable> = (params: {
	root: string
	host: HostReadAdapter
	run: HostToolRun<Calls>
	subject: string
	changeRequest?: number
}) => HostLine

/**
 * The probe of the read that finds the pull request the other probes read: its line (its subject `subject`, the
 * read's name), and the pull request found.
 */
export type HostSubjectProbe<Calls extends HostCallTable = HostCallTable> = (params: {
	root: string
	host: HostReadAdapter
	run: HostToolRun<Calls>
	subject: string
}) => {
	line: HostLine
	changeRequest?: number
}

/** A vendor's dev-only record: its table, what it recorded, how its implied flags read, and how it is asked again. */
export type HostContractRecord = {
	name: HostVendorName
	calls: HostCallTable
	contract: HostContract
	/** The versions of the tool the record was taken from, by part. */
	versions: Readonly<Record<string, string>>
	impliedFlagsOf(spec: HostCallSpec): string[]
	describe: HostDescribe
}

/** What a contract finding says is wrong. */
export type HostFindingKind =
	| 'unknown-command'
	| 'unknown-flag'
	| 'unknown-field'
	| 'unknown-graphql-field'
	| 'unknown-graphql-argument'
	| 'missing-implied-flag'
	| 'implied-flag-in-flags'
	| 'stale'

/** One thing wrong between a call table and its record: the table key (the command path for a stale one) and why. */
export type HostFinding = { kind: HostFindingKind; key: string; message: string }
