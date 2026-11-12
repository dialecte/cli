/** Who wrote an event: the host through `lot station`, or the cli for one of its own steps. */
export type EventBy = 'host' | 'cli'

/** What the cli of a lot's worktree is: its version, and whether it writes step events. */
export type WorktreeCli = { version: string; stepEvents: boolean }

/** The fields every event line carries. `worktreeCli` is omitted when the worktree was not read. */
export type EventEnvelope = {
	schema: 1
	id: string
	at: string
	lot: string | null
	kind: string
	by: EventBy
	pid: number
	cli: string
	worktreeCli?: WorktreeCli | null
	simulated: boolean
	hostEvent: string | null
}

/** The kinds a reader knows, each with the fields it may carry beside the envelope. */
export type EventFieldsByKind = Readonly<Record<string, readonly string[]>>

/** One event: the envelope and the fields of its kind. */
export type LotEvent = EventEnvelope & Record<string, unknown>

/** What a caller gives to make an envelope; the clock and the pid are injectable. */
export type MakeEnvelopeParams = {
	lot: string | null
	kind: string
	by: EventBy
	cli: string
	simulated: boolean
	hostEvent: string | null
	worktreeCli?: WorktreeCli | null
	now?: () => Date
	pid?: number
}

/** The function that does the one write; answers the bytes written. Injected by the tests only. */
export type WriteBuffer = (params: { descriptor: number; buffer: Buffer }) => number

/** What one append needs: the file, the event, the limit of its line, and the write (injected by the tests only). */
export type WriteEventParams = {
	file: string
	event: LotEvent
	/** The most bytes one line may hold (`EVENT_LINE_LIMIT` for events). */
	limit: number
	writeBuffer?: WriteBuffer
}

/** What the reader found in a file. */
export type ReadEventsResult = {
	events: LotEvent[]
	/** Final lines without `\n` and lines that do not parse (an empty line holds no record: not counted). */
	damaged: number
	unknownKinds: number
	unknownFields: number
}

/** A start and its end, paired by `run`; either may be missing. */
export type EventRun = { run: string; start: LotEvent | undefined; end: LotEvent | undefined }

/** The events once paired: those kept, their runs, and how many repeats were dropped. */
export type PairRunsResult = {
	/** The events kept, in the order given. */
	events: LotEvent[]
	runs: EventRun[]
	duplicates: number
}
