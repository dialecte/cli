import type { AskSubjectTerms, SubjectTermsOfParams } from './ask.types.ts'

/** The ask's subject as the readers' briefs and the checks name it: its tags, its attributes, its codes and methods. */
export function subjectTermsOf(params: SubjectTermsOfParams): AskSubjectTerms {
	const { subject } = params
	return {
		tags: subject.tags.map((tag) => tag.tag),
		attributes: [...subject.attributes],
		terms: [...subject.codes, ...subject.methods],
	}
}
