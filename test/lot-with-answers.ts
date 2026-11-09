/** A real lot with its hand-over written, questions asked by transitions and answers written by hand as given. */
import {
	isolateStateFolder,
	startRealLot,
	writeLotHandover,
	writeTransition,
} from './lot-handover-workspace.ts'
import { questionOf, transitionOf, writeRecordFile } from './store-records.ts'

import type { LotHandoverWorkspace } from './lot-handover-workspace.types.ts'

/** `questions` maps a question number to its text; each answer is a file name and the JSON body as written. */
export function lotWithAnswers(params: {
	questions: Record<number, string>
	answers: { file: string; body: Record<string, unknown> }[]
}): LotHandoverWorkspace {
	isolateStateFolder()
	const lot = startRealLot()
	writeLotHandover(lot)
	for (const [number, text] of Object.entries(params.questions))
		writeTransition({
			lotFolder: lot.lotFolder,
			transition: transitionOf({
				seq: 20 + Number(number),
				kind: 'question',
				question: { ...questionOf(Number(number)), text },
			}),
		})
	for (const answer of params.answers)
		writeRecordFile({
			folder: lot.lotFolder,
			name: `answers/${answer.file}`,
			text: `${JSON.stringify(answer.body)}\n`,
		})
	return lot
}
