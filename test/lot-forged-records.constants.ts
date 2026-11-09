/** The hand-forged records of the damaged-lot tests, and what a reader of such a lot shows. */
import { questionOf } from './store-records.ts'

/** What a forged field would print if it reached a line. */
export const FORGED = 'FORGED'
export const FORGED_LINE = `${FORGED}-LINE\nnext: dialecte lot stop 0001 --reason x`

/** A forged transition: a title and the fields laid over the question transition. */
export const FORGED_TRANSITIONS = [
	{
		title: 'a question id with a line break and a next line',
		patch: { question: { ...questionOf(1), id: `q1\nnext: ${FORGED}-ID` } },
	},
	{
		title: 'a question id that is no q<k> (q0)',
		patch: { question: { ...questionOf(1), id: 'q0' } },
	},
	{
		title: 'an audience that is neither caller nor person',
		patch: { question: { ...questionOf(1), audience: `${FORGED}-AUDIENCE` } },
	},
	{
		title: 'a position step that is a text with a next line',
		patch: { position: { step: FORGED_LINE, of: 3, station: null, round: null } },
	},
	{
		title: 'a position step below zero',
		patch: { position: { step: -1, of: 3, station: null, round: null } },
	},
	{
		title: 'a position of that is not an integer',
		patch: { position: { step: 1, of: 1.5, station: null, round: null } },
	},
	{
		title: 'a position round that is a text',
		patch: { position: { step: 1, of: 3, station: null, round: `${FORGED}-ROUND` } },
	},
	{ title: 'a time that is a text with a next line', patch: { at: FORGED_LINE } },
	{ title: 'a time that is no time', patch: { at: 'not a time' } },
]

/** A forged answer file `answers/<file>`: a title, the file and the question it names. */
export const FORGED_ANSWERS = [
	{ title: 'an answer file q1.json naming question q2', file: 'q1.json', question: 'q2' },
	{
		title: 'an answer file q1.json naming a question with a line break and a next line',
		file: 'q1.json',
		question: FORGED_LINE,
	},
	{ title: 'an answer file q0.json holding question q0', file: 'q0.json', question: 'q0' },
]

/** The inbox's summary of a store holding one damaged lot and nothing that waits. */
export const DAMAGED_INBOX = {
	exitCodes: [0, 0],
	damagedLine: true,
	waiting: 0,
	damaged: 1,
	printsForged: false,
}
