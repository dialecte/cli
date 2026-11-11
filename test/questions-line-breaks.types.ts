import type { RaiseQuestionParams } from '../src/lib/store/questions.types.ts'

/** A question whose options or station hold a line break: its title and the fields it overrides. */
export type LineBreakRow = {
	title: string
	overrides: Partial<Pick<RaiseQuestionParams, 'options' | 'station'>>
}
