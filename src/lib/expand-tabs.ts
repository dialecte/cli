/** Quoted source as a text form prints it: each tab as four spaces, so the boundary has no tab to escape. */
import { TAB, TAB_SPACES } from './expand-tabs.constants.ts'

/** `text` with every tab written as four spaces. */
export function tabsExpanded(text: string): string {
	return text.split(TAB).join(TAB_SPACES)
}
