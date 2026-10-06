/** One sentence for lost input, wherever it shows (HIVE-140, HIVE-211). */
export const lostSentence = (lost: number, serverName: string, attached: boolean): string =>
  `${String(lost)} ${lost === 1 ? 'action' : 'actions'} (clicks or keystrokes) did not reach ${serverName}; redo ${lost === 1 ? 'it' : 'them'}${attached ? '' : ' once it is back'}.`;
