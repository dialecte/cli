import type {
	AcceptanceContext,
	AskSubjectTerms,
	DocumentReport,
	GivenSlice,
	KeyVocabulary,
	ManifestFile,
	OutsideReport,
} from '../src/lib/knowledge/ask/ask.types.ts'

/** A synthetic file id and the manifest the cites are checked against (the file has 200 lines). */
export const REPORT_FILE = 'example/file-1'
export const REPORT_OTHER_FILE = 'example/file-2'
export const REPORT_MANIFEST: ManifestFile[] = [{ id: REPORT_FILE, sha256: 'sha-one', lines: 200 }]
export const REPORT_CURRENT_MOVED: ManifestFile[] = [
	{ id: REPORT_FILE, sha256: 'sha-two', lines: 200 },
]

/** The slices given to the reader: a direct one (lines 10 to 30) and a linked one (lines 100 to 120). */
export const GIVEN_DIRECT: GivenSlice = {
	file: REPORT_FILE,
	from: 10,
	to: 30,
	clause: '1',
	title: 'Example clause',
	linked: false,
	quality: 'good',
}
export const GIVEN_LINKED: GivenSlice = {
	file: REPORT_FILE,
	from: 100,
	to: 120,
	clause: '2',
	title: 'Linked clause',
	linked: true,
	quality: 'good',
}
export const GIVEN_ELSEWHERE: GivenSlice = { ...GIVEN_DIRECT, file: REPORT_OTHER_FILE }
export const GIVEN_DIRECT_ABOUT_D: GivenSlice = { ...GIVEN_DIRECT, title: 'Element D' }

/** The dialecte's names (core's test dialecte) and the ask's subject. */
export const REPORT_VOCABULARY: KeyVocabulary = {
	tags: ['A', 'AA_1', 'D', 'DD_1'],
	attributes: ['a', 'b', 'c'],
	values: ['enabled', 'disabled'],
}
export const SUBJECT_TAG_D: AskSubjectTerms = { tags: ['D'], attributes: [], terms: ['D'] }
export const SUBJECT_CODE_ONLY: AskSubjectTerms = { tags: [], attributes: [], terms: ['CODE_77'] }
export const SUBJECT_ATTRIBUTE_B: AskSubjectTerms = { tags: [], attributes: ['b'], terms: ['b'] }

/** Questions: two positively worded, one negatively worded. */
export const QUESTION_POSITIVE = 'may D hold DD_1?'
export const QUESTION_NEGATIVE = 'is D never without DD_1?'

/** Quotes, each a whole value. */
export const QUOTE_NINE_WORDS = 'the example value of the attribute shall be present'
export const RANGE_HOLDING_NINE_WORDS =
	'in this clause the example value of the attribute shall be present in every case'
export const QUOTE_SPLIT_BY_SPACE = 'the exam- ple value of the attribute shall be present'
export const QUOTE_SPLIT_BY_NEWLINE = 'the exam-\nple value of the attribute shall be present'
export const QUOTE_WITH_LIGATURE = 'the ﬁeld value of the attribute shall be present'
export const RANGE_WITH_FIELD =
	'in this clause the field value of the attribute shall be present in every case'
export const QUOTE_WITH_NON_BREAKING_SPACES = 'the example value of the attribute shall be present'
export const QUOTE_WITH_EN_DASH = 'the non–empty value of the attribute shall be present'
export const RANGE_WITH_HYPHEN =
	'in this clause the non-empty value of the attribute shall be present in every case'
export const QUOTE_REORDERED = 'present be shall attribute the of value example the'
export const RANGE_FIRST_HALF = 'in this clause the exam-'
export const RANGE_SECOND_HALF = 'ple value of the attribute shall be present in every case'
export const RANGE_COMPOUND_FIRST_HALF = 'in this clause the non-'
export const RANGE_COMPOUND_SECOND_HALF =
	'empty value of the attribute shall be present in every case'
export const QUOTE_COMPOUND_WHOLE = 'the non-empty value of the attribute shall be present'

/** Forty-one distinct words: a quote of `n` words is the first `n` of them. */
export const FORTY_ONE_WORDS = [
	'one',
	'two',
	'three',
	'four',
	'five',
	'six',
	'seven',
	'eight',
	'nine',
	'ten',
	'eleven',
	'twelve',
	'thirteen',
	'fourteen',
	'fifteen',
	'sixteen',
	'seventeen',
	'eighteen',
	'nineteen',
	'twenty',
	'twentyone',
	'twentytwo',
	'twentythree',
	'twentyfour',
	'twentyfive',
	'twentysix',
	'twentyseven',
	'twentyeight',
	'twentynine',
	'thirty',
	'thirtyone',
	'thirtytwo',
	'thirtythree',
	'thirtyfour',
	'thirtyfive',
	'thirtysix',
	'thirtyseven',
	'thirtyeight',
	'thirtynine',
	'forty',
	'fortyone',
]

/** One whole table row and one whole code line (three words each), and a row with one word more. */
export const ROW_TEXT = 'DD_1 optional unbounded'
export const ROW_TEXT_LONGER = 'DD_1 optional unbounded here'
export const CODE_TEXT = 'attribute use optional'

/** Quotes naming the subject tag D, with and without a negation near it (cues within eight words). */
export const QUOTE_D_POSITIVE = 'the element D shall hold the child DD_1 in its content model'
export const QUOTE_D_SHALL_NOT = 'the element D shall not hold the child DD_1 in its content model'
export const QUOTE_D_MUST_NOT = 'the element D must not hold the child DD_1 in its content model'
export const QUOTE_D_NEGATION_FAR =
	'the element D holds the child DD_1 in its content model, which is declared for every parent; it shall not be empty'
export const QUOTE_D_EXCEPT =
	'the element D shall not hold the child DD_1 except in its content model'
export const QUOTE_D_UNLESS = 'the element D shall hold the child DD_1 unless the parent is empty'
export const QUOTE_D_ONLY = 'the element D shall hold only the child DD_1 in its content model'
export const QUOTE_D_OTHER_THAN =
	'the element D shall hold children other than DD_1 in its content model'
export const QUOTE_ABOUT_AA = 'the element AA_1 shall hold the child DD_1 in its content model'
export const QUOTE_ABOUT_DD = 'the element DD_1 shall hold the child AA_1 in its content model'
export const QUOTE_NAMING_CODE = 'the entry CODE_77 shall hold the child DD_1 in its content model'
export const QUOTE_NAMING_NOTHING = 'the entry shall hold the child DD_1 in its content model'
export const QUOTE_WITHOUT_DD =
	'the element D shall hold the child in its content model for every parent'

/** Whole documents of a report: the baseline of a document reader and of an outside reader. */
export const DOCUMENT_REPORT: DocumentReport = {
	ask: 'A-0007',
	round: 1,
	reader: 'B',
	nonce: 'nonce-b-1',
	verdict: 'yes',
	value: null,
	answer: 'The element D holds the child DD_1.',
	claims: [
		{
			text: 'D shall hold DD_1',
			supports: 'yes',
			cites: [{ file: REPORT_FILE, from: 12, to: 13, quote: QUOTE_D_POSITIVE }],
		},
	],
	notFound: [],
	familiesRead: ['parents'],
	session: 'session-b',
}
export const OUTSIDE_REPORT: OutsideReport = {
	ask: 'A-0007',
	round: 1,
	reader: 'B',
	nonce: 'nonce-b-1',
	source: 'model',
	verdict: 'yes',
	value: null,
	answer: 'The element D holds the child DD_1.',
	claims: [{ text: 'D holds DD_1', supports: 'yes', cites: [] }],
	notFound: [],
	familiesRead: [],
	session: 'session-b',
}
export const OUTSIDE_WEB_CITE = {
	url: 'https://example.test/page',
	quote: 'the element D shall hold the child DD_1 in its content model',
	retrieved: '2026-11-14',
}

/** The nonces `ask pack` issued for round 1 of ask A-0007, nothing used, nothing accepted, no web. */
export const ACCEPTANCE: AcceptanceContext = {
	ask: 'A-0007',
	round: 1,
	issued: [
		{ reader: 'A', nonce: 'nonce-a-1' },
		{ reader: 'B', nonce: 'nonce-b-1' },
	],
	used: [],
	accepted: [],
	web: false,
}

/** Whole outside reports with one key left out (a report as JSON can lack a key). */
export const OUTSIDE_REPORT_WITHOUT_SESSION = {
	ask: 'A-0007',
	round: 1,
	reader: 'B',
	nonce: 'nonce-b-1',
	source: 'model',
	verdict: 'yes',
	value: null,
	answer: 'The element D holds the child DD_1.',
	claims: [{ text: 'D holds DD_1', supports: 'yes', cites: [] }],
	notFound: [],
	familiesRead: [],
}
export const OUTSIDE_REPORT_WITHOUT_SOURCE = {
	ask: 'A-0007',
	round: 1,
	reader: 'B',
	nonce: 'nonce-b-1',
	verdict: 'yes',
	value: null,
	answer: 'The element D holds the child DD_1.',
	claims: [{ text: 'D holds DD_1', supports: 'yes', cites: [] }],
	notFound: [],
	familiesRead: [],
	session: 'session-b',
}
export const OUTSIDE_REPORT_WITHOUT_ANSWER = {
	ask: 'A-0007',
	round: 1,
	reader: 'B',
	nonce: 'nonce-b-1',
	source: 'model',
	verdict: 'yes',
	value: null,
	claims: [{ text: 'D holds DD_1', supports: 'yes', cites: [] }],
	notFound: [],
	familiesRead: [],
	session: 'session-b',
}

/** Whole ranges: one prose line each, and one table line written with pipes. */
export const RANGE_LINE_D_POSITIVE =
	'in this clause the element D shall hold the child DD_1 in its content model and more'
export const RANGE_LINE_D_SHALL_NOT =
	'in this clause the element D shall not hold the child DD_1 in its content model and more'
export const ROW_TEXT_WITH_PIPES = '| DD_1 | optional | unbounded |'

/** A given slice of a poor block, a quote in another letter case, a 7-word quote the range never holds. */
export const GIVEN_POOR: GivenSlice = { ...GIVEN_DIRECT, quality: 'poor' }
export const QUOTE_NINE_WORDS_UPPER = 'THE EXAMPLE VALUE OF THE ATTRIBUTE SHALL BE PRESENT'
export const QUOTE_SEVEN_WORDS_ABSENT = 'seven words that the range never holds'

/** A quote with an exception cue far from D (more than 8 words). */
export const QUOTE_D_EXCEPTION_FAR =
	'the element D shall hold the child DD_1 in its content model, which is declared for every parent; it applies unless the parent is empty'

/** The question every report test asks. */
export const REPORT_QUESTION = QUESTION_POSITIVE
