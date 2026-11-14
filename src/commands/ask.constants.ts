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

/** The verbs of `ask` the reader station builds (K3): until then, a first word naming one is refused. */
export const UNBUILT_ASK_VERBS = ['pack', 'answer'] as const

/** The refusals and lines of the command; `{...}` are filled in. */
export const ASK_MESSAGES = {
	needsQuestion: 'expected the question: dialecte ask "<question>"',
	unbuiltVerb:
		'{verb} is not built yet (it comes with the reader station): nothing was written; for now the readers read the slices the ask listed, and a question is asked as dialecte ask "<question>"',
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

/** How the terms of an angle are joined in the text answer. */
export const ANGLE_TERMS_SEPARATOR = ', '

/** The exit code of each final state of an ask (D20): answered, a person next, readers next. */
export const ASK_EXIT_CODES = { answered: 0, 'needs-person': 1, 'needs-readers': 3 } as const
