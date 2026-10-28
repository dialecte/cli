/** Mints an id as the module loads: a run must seed it too. */
const mintedAtLoad = crypto.randomUUID()

export default async function answerLoadId(): Promise<string> {
	return mintedAtLoad
}
