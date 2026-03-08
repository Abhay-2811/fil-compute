const MAX_ENTRIES = 100;

export interface OutputEntry {
  stdout: string;
  stderr?: string;
}

const store = new Map<string, OutputEntry>();

export function setOutput(jobId: string, entry: OutputEntry): void {
  if (store.size >= MAX_ENTRIES) {
    const firstKey = store.keys().next().value;
    if (firstKey != null) store.delete(firstKey);
  }
  store.set(jobId, entry);
}

export function getOutput(jobId: string): OutputEntry | undefined {
  return store.get(jobId);
}
