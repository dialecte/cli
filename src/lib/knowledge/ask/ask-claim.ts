import { join } from 'node:path'

import { fillMessage } from '../standard/fill-message.ts'
import { ASK_CLAIM_FILE, ASK_CLAIM_STALE_MS, CLAIM_MESSAGES } from './ask.constants.ts'
import { claimFile, claimHolderOf } from './claim-file.ts'

import type { AskClaim, ClaimAskParams } from './ask.types.ts'

/**
 * Takes the one claim on an ask (R1-6, D43 2): `<ask>/ask.claim` holding this process's id, so `ask verdict`, `ask
 * answer` and the answer hook never both record a fact for it. Answers the claim's path (the caller releases it
 * with `releaseClaim`), or the refusal naming the ask in progress, the claim, its process and the fix.
 */
export function claimAsk(params: ClaimAskParams): AskClaim {
	const path = join(params.askFolder, ASK_CLAIM_FILE)
	if (claimFile({ path, staleMs: ASK_CLAIM_STALE_MS })) return { claim: path }
	return {
		refused: fillMessage({
			template: CLAIM_MESSAGES.askInProgress,
			values: {
				ask: params.ask,
				path,
				pid: String(claimHolderOf({ path })?.pid ?? ''),
				seconds: String(ASK_CLAIM_STALE_MS / 1000),
			},
		}),
	}
}
