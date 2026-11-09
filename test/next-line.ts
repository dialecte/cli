/** A `next` line of a lot's status turned into the words of the command it names, to run it as a host would. */
import { NEXT_PLACEHOLDERS } from './next-line.constants.ts'

/**
 * The words after `dialecte` of a `next` line, its placeholders (`<answer>`, `<who>`, `<text>`) filled with `fill`
 * (each filled value stays one word, spaces included); a double-quoted part is one word.
 */
export function wordsOfNext(params: {
	next: string
	fill?: Partial<Record<string, string>>
}): string[] {
	const filled = Object.entries({ ...NEXT_PLACEHOLDERS, ...params.fill }).reduce(
		(line, [placeholder, value]) =>
			line.replaceAll(new RegExp(`"?<${placeholder}>"?`, 'g'), `"${value}"`),
		params.next.replace(/^dialecte /, ''),
	)
	return [...filled.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2])
}
