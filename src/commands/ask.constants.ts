import type { CiteRefusal } from '../lib/knowledge/ask/ask.types.ts'

/** The options `ask` takes: those with a value and the flags. */
export const ASK_VALUE_OPTIONS = [
	'about',
	'code',
	'method',
	'kind',
	'package',
	'effort',
	'lot',
	'limit',
] as const
export const ASK_FLAGS = ['decision', 'no-facts', 'no-standard', 'person-only', 'json'] as const

/** The command's name, the start of every refusal (`ask: ...`). */
export const ASK_COMMAND = 'ask'

/** How many slices the ask hands on when `--limit` is not given (D12). */
export const DEFAULT_ASK_LIMIT = 10

/** The effort of an ask outside a lot when `--effort` is not given (D19). */
export const DEFAULT_ASK_EFFORT = 'medium'

/** A `--limit` value: a positive whole number. */
export const ASK_LIMIT_PATTERN = /^[1-9]\d*$/u

/** The first word that makes `ask` record a person's answer (rung 6). */
export const ANSWER_VERB = 'answer'

/** The options `ask answer` takes: those with a value and the flags. */
export const ANSWER_VALUE_OPTIONS = ['by', 'cite', 'quote', 'verdict', 'lot'] as const
export const ANSWER_FLAGS = ['json'] as const

/** The version of the `ask answer --json` object's shape (U5): it starts at 1. */
export const ANSWER_JSON_SCHEMA = 1

/** A `--cite` value: `<file id>:<from>-<to>`, the file id holding its own `/` and `:`. */
export const ANSWER_CITE_PATTERN = /^(?<file>.+):(?<from>\d+)-(?<to>\d+)$/u

/** The start of the answer's usage line in the command map: printed after a usage refusal of the answer. */
export const ANSWER_USAGE_START = 'dialecte ask answer'

/** The refusals and lines of `ask answer`; `{...}` are filled in. */
export const ANSWER_MESSAGES = {
	needsAsk: 'expected an ask id and the answer: dialecte ask answer <ask-id> "<answer>" --by <who>',
	needsText: 'expected the answer after {ask}: dialecte ask answer {ask} "<answer>" --by <who>',
	needsBy:
		'expected --by <who>: the person who answers: dialecte ask answer {ask} "<answer>" --by <who>',
	citeNeedsQuote:
		'--cite needs --quote "<the words cited>": the cite is checked as a reader cite, its quote in its lines',
	quoteNeedsCite: '--quote goes with --cite <file id>:<from>-<to>: add --cite, or drop --quote',
	badCite:
		'--cite {cite} is no range: write <file id>:<from>-<to> (whole line numbers, from up to to)',
	badVerdict:
		'--verdict {verdict} is none of {verdicts}: give one of them, or drop --verdict (the fact then says person)',
	recorded: 'answered: ask {ask}: fact {fact} (person {by})',
	miss: 'reader miss: the cited lines were given to a reader in round {round}',
	notGiven: 'reader miss: the cited lines were given to no reader',
	citeRefused: 'cite refused ({refused}): the answer is recorded without it',
} as const

/**
 * The hand-off lines a person gets of a round handed over (I-5): the angles searched, each reader's slices, what
 * each accepted reader said and did not find (or that it did not know); never a quote.
 */
export const HANDOFF_LINES = {
	angles: 'angles searched: {angles}',
	readerSlices: 'reader {letter} read: {slices}',
	said: 'reader {letter} said: {answer} (not found: {notFound})',
	notKnown: 'reader {letter} did not know: {answer} (not found: {notFound})',
} as const
export const HANDOFF_NONE = 'none'
/** A slice in the hand-off (J-8): its file and lines. */
export const HANDOFF_RANGE = '{file}:{from}-{to}'
export const HANDOFF_SEPARATOR = ', '

/** Why a re-ask goes to the person (R2-1): the readers agreed on another answer than the unchecked fact's. */
export const REASK_DIFFERS_REASON = 'reask-differs'

/** The refusal a person's cite gets when the ask's documents changed since the ask (R1-18): the answer is kept. */
export const FILE_CHANGED_REFUSAL: CiteRefusal = 'file-changed'

/** The first word that makes `ask` open a round of readers. */
export const PACK_VERB = 'pack'

/** The first word that makes `ask` check the reports of a round of readers. */
export const VERDICT_VERB = 'verdict'

/** The options `ask pack` takes: those with a value and the flags. */
export const PACK_VALUE_OPTIONS = ['out', 'lot'] as const
export const PACK_FLAGS = ['outside', 'web', 'json'] as const

/** The version of the `ask pack --json` object's shape (U5): it starts at 1. */
export const PACK_JSON_SCHEMA = 1

/** The exit code of a pack: the briefs ready, or nothing left to give (the round skipped, D15). */
export const PACK_EXIT_CODES = { ready: 0, skipped: 1 } as const

/** The state of a pack whose briefs are ready, and of a skipped round at high and below (section 8). */
export const PACK_STATES = {
	ready: 'needs-readers',
	adjudicator: 'needs-adjudicator',
	person: 'needs-person',
} as const

/** Why an outside round is never followed by another (section 18). */
export const OUTSIDE_ONE_ROUND_REASON =
	'outside readers answer in one round only: nothing more is given to them'

/** What a pack runs next: the readers' reports checked, the adjudicator's, a person's answer; `{ask}` filled in. */
export const PACK_NEXT_COMMANDS = {
	verdict: 'dialecte ask verdict {ask} <report.json>...',
	adjudicator: 'dialecte ask verdict {ask} <report.json> --adjudicator',
} as const

/** The refusals and lines of `ask pack`; `{...}` are filled in. */
export const PACK_MESSAGES = {
	needsAsk: 'expected one ask id: dialecte ask pack <ask-id>',
	extraWords: 'expected one ask id, not also {words}: dialecte ask pack <ask-id>',
	webWithoutOutside:
		'--web goes with --outside (it lets outside readers search the web): add --outside, or drop --web',
	unknownAsk:
		'no ask {ask} in {folder}: name an ask id this folder holds (A-<n>), or pass --lot <id|folder> for an ask kept with a lot',
	noRequest:
		'ask {ask} was made before the readers (its folder holds no request.json): ask again: dialecte ask "{question}"',
	answered: 'ask {ask} is answered: nothing to give readers; dialecte facts list reads its fact',
	needsPerson: 'ask {ask} waits for a person, not for readers: {next}',
	outsideOnDocuments:
		'--outside refused: ask {ask} has documents to read; run: dialecte ask pack {ask}',
	documentsOnOutside:
		'ask {ask} found no documents, its readers are outside readers: run: dialecte ask pack {ask} --outside',
	roundClosed:
		'round {round} of ask {ask} closed as {state}, not asking for another round: next: {next}',
	roundBeingWritten:
		'{folder} holds no pack.json: another pack is opening round {round}; run dialecte ask pack {ask} again once it ends (when none runs, move that folder aside first)',
	ready: 'needs-readers: ask {ask} round {round}: {count} readers, one brief each',
	reader: '  {letter}  {brief}  slices: {slices}',
	noSlice: 'none (outside readers)',
	skipped: '{state}: ask {ask}: nothing new to give for round {round}: {reason}',
	adjudicatorReady:
		"needs-adjudicator: ask {ask} round {round}: the readers did not agree; the adjudicator's brief: {brief}",
	next: 'next: {next}',
} as const

/** The options `ask verdict` takes: those with a value and the flags. */
export const VERDICT_VALUE_OPTIONS = ['lot'] as const
export const VERDICT_FLAGS = ['adjudicator', 'json'] as const
/** The verdict's options that may be given several times (I-12): `--missing <L>`, a reader that wrote nothing. */
export const VERDICT_REPEATABLE_OPTIONS = ['missing'] as const

/** The version of the `ask verdict --json` object's shape (U5): it starts at 1. */
export const VERDICT_JSON_SCHEMA = 1

/** The exit code of each state a verdict leaves the ask in: answered, the person, another round or the adjudicator. */
export const VERDICT_EXIT_CODES = {
	answered: 0,
	'needs-person': 1,
	'needs-readers': 3,
	'needs-adjudicator': 3,
} as const

/** The state of the ask after each outcome of a round (D6). */
export const VERDICT_STATES = {
	answered: 'answered',
	'next-round': 'needs-readers',
	'needs-adjudicator': 'needs-adjudicator',
	'needs-person': 'needs-person',
} as const

/** The refusals the report of a round is never counted for: it is not a report of this round (nothing recorded). */
export const FOREIGN_REFUSALS = ['schema', 'wrong-ask', 'wrong-round'] as const

/** The refusals and lines of `ask verdict`; `{...}` are filled in. */
export const VERDICT_MESSAGES = {
	needsAsk: 'expected an ask id and its reports: dialecte ask verdict <ask-id> <report.json>...',
	needsReport:
		'expected at least one report file after the ask id, or --missing <L> for each reader that wrote nothing: dialecte ask verdict {ask} <report.json>...',
	oneAdjudicatorReport:
		"--adjudicator takes the adjudicator's one report, not {count}: dialecte ask verdict {ask} <report.json> --adjudicator",
	unknownAsk:
		'no ask {ask} in {folder}: name an ask id this folder holds (A-<n>), or pass --lot <id|folder> for an ask kept with a lot',
	noRound: 'ask {ask} has no round open: open one first: dialecte ask pack {ask}',
	answered:
		'ask {ask} is answered (round {round}, fact {fact}): nothing was recorded; dialecte facts list reads its fact',
	roundClosed:
		'round {round} of ask {ask} is closed ({state}): its reports were counted, nothing was recorded; next: {next}',
	notAdjudicator:
		"--adjudicator refused: ask {ask} is not waiting for the adjudicator (round {round} holds no adjudicator's brief open); check readers' reports without --adjudicator",
	adjudicatorOpen:
		"round {round} of ask {ask} waits for the adjudicator's report: check it with --adjudicator: dialecte ask verdict {ask} <report.json> --adjudicator",
	unreadableReport:
		'{file} does not read as JSON: write the report as one JSON object, as the brief shows',
	noneCounted:
		'no report of round {round} of ask {ask} was counted, nothing was recorded: each is refused as not of this round; write each report from its brief of round {round}, or answer the ask yourself: dialecte ask answer {ask} "<answer>" --by <who>',
	refusedReport: '  {file}: refused {refused}: {faults}',
	acceptedReport: '  {letter}: accepted ({verified} of {claims} claims verified)',
	roundInProgress:
		'round {round} of ask {ask} is in progress: another verdict run holds {path} (process {pid}); nothing was recorded; run ask verdict again once it ends (a claim whose process is gone is taken over after {seconds} s)',
	closedByAnother:
		'round {round} of ask {ask} was closed by another verdict run while this one ran: nothing more was recorded; dialecte ask pack {ask} says where it stands',
	closedByAnotherAfterFact:
		'round {round} of ask {ask} was closed by another verdict run while this one ran: its verdict stands; the fact {fact} this run recorded first stays in the ledger (dialecte facts list reads it); dialecte ask pack {ask} says where it stands',
	missingReports:
		'round {round} of ask {ask} has no report file of reader {letters}: nothing was recorded; give one report file per reader the round was given, refused ones too, and declare a reader that wrote nothing (it counts as refused missing): dialecte ask verdict {ask} <report.json>... {declared}',
	missingFlag: '--missing {letter}',
	missingFlagSeparator: ' ',
	missingAndGiven:
		'--missing {letter} names a reader whose report file is given too: drop --missing {letter}, or that report file',
	missingNotIssued:
		'--missing {letter} names no reader of round {round} of ask {ask} (its readers: {letters}): name a letter the round gave a brief to',
	missingFault: 'reader {letter} wrote no report: declared with --missing {letter}',
	stateLine: '{state}: ask {ask} round {round}: {reason}',
	answeredReason: 'answered: {text}',
	fact: 'fact {fact}',
	next: 'next: {next}',
	faultSeparator: '; ',
} as const

/** The id a fact draft holds while it is held against the boundary, before the ledger numbers it (D29). */
export const PENDING_FACT_ID = 'pending'

/** The start of the verdict's usage line in the command map: printed after a usage refusal of the verdict. */
export const VERDICT_USAGE_START = 'dialecte ask verdict'

/** The start of the pack's usage line in the command map: printed after a usage refusal of the pack. */
export const PACK_USAGE_START = 'dialecte ask pack'

/** How a reader's slice ids are joined on its line. */
export const PACK_SLICE_SEPARATOR = ', '

/** How a re-ask names its fact's subject as an `--about` (`[parent/]tag[@attribute]`); `{...}` are filled in. */
export const ABOUT_TEMPLATES = {
	parent: '{parent}/{tag}',
	attribute: '{about}@{attribute}',
} as const

/** The kind a re-ask's request records when its fact's kind is no kind the ladder knows. */
export const REASK_FALLBACK_KIND = 'semantic'

/** The refusals and lines of the command; `{...}` are filled in. */
export const ASK_MESSAGES = {
	needsQuestion: 'expected the question: dialecte ask "<question>"',
	unknownKind: '--kind {kind} is no kind: pass one of {kinds}',
	unknownEffort: '--effort {effort} is no effort: pass one of {efforts}',
	badLimit: '--limit needs a positive whole number, not {value}',
	unknownPackage:
		'--package {name} is not an installed dialecte; installed: {installed}: pass one of them to --package',
	lotEffort:
		'--effort {asked} refused: the lot {lot} runs at {effort} effort, and its asks take the lot effort: ask again without --effort (or with --effort {effort})',
	answer: 'answer: {text}',
	source: 'source: {source}',
	sourceFact: 'fact {fact}',
	recorded: 'ask {ask}: rung {rung}{fact}',
	recordedFact: ', fact {fact}',
	candidate: 'candidate {fact}: {why}',
	needsPerson: 'needs-person: ask {ask}: no rung up to {rung} answers; a person answers it',
	needsReaders: 'needs-readers: ask {ask}: the slices of the documents for the readers ({count})',
	needsOutside:
		'needs-readers: ask {ask}: no documents for this dialecte here: outside readers answer it (an outside answer stays unchecked until documents confirm it)',
	noSlice: 'no slice of the documents matched: the readers start from the angles',
	slice: '  {id}  {file}:{from}-{to}{clause}  score {score}{linked}',
	sliceClause: '  {clause}',
	sliceLinked: '  [linked]',
	angle: '  {id} {family}: {terms}',
	next: 'next: {next}',
	boundary: 'boundary: {answer} (definition)',
	conflict:
		'! conflict: the standard names {outside} the XSD rejects; the XSD wins - fix the XSD and ask again',
} as const

/** The version of the `ask --json` object's shape (D30): it starts at 1 and grows with a change of its members. */
export const ASK_JSON_SCHEMA = 1

/** The `next` of an ask that needs readers on the documents, on the outside route, and of one that needs a person. */
export const NEXT_COMMANDS = {
	pack: 'dialecte ask pack {ask}',
	packOutside: 'dialecte ask pack {ask} --outside',
	answer: 'dialecte ask answer {ask} "<answer>" --by <who>',
} as const

/** What a verdict runs next: the pack (another round, or the adjudicator's brief), a person's answer (R1-14). */
export const VERDICT_NEXT_COMMANDS = {
	pack: NEXT_COMMANDS.pack,
	answer: NEXT_COMMANDS.answer,
} as const

/** How the terms of an angle are joined in the text answer. */
export const ANGLE_TERMS_SEPARATOR = ', '

/** The exit code of each final state of an ask (D20): answered, a person next, readers next. */
export const ASK_EXIT_CODES = { answered: 0, 'needs-person': 1, 'needs-readers': 3 } as const
