import type { AskRequest, AskRequestRecord } from './ask.types.ts'

/**
 * The ladder's request for what an ask's request record asked: facts never read nor written, the documents read,
 * never the person only (a pack or a verdict rebuilds what the ask read, it records nothing of its own).
 */
export function ladderRequestOf(params: { request: AskRequestRecord }): AskRequest {
	const { request } = params
	return {
		question: request.question,
		...(request.about === null ? {} : { about: request.about }),
		...(request.code === null ? {} : { code: request.code }),
		...(request.method === null ? {} : { method: request.method }),
		...(request.package === null ? {} : { packageName: request.package }),
		kind: request.kind,
		decision: request.decision,
		effort: request.effort,
		noFacts: true,
		limit: request.limit,
		noStandard: false,
		personOnly: false,
	}
}
