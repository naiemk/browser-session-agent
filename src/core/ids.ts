let counter = 0;

/** Short, sortable-enough ids for observations, events, and entities. */
export function shortId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  const stamp = Date.now().toString(36);
  const seq = counter.toString(36).padStart(3, "0");
  return `${prefix}_${stamp}${seq}`;
}
