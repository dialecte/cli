/**
 * One lot's landing as `lot close` settles it before deciding: the line naming how it landed (its landed fact), or why
 * it is kept (not merged, damaged, canceled); neither for a lot to be read still.
 */
export type SettledLanding = { landed?: string; kept?: string }
