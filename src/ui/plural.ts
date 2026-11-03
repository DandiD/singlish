/** "1 nuova", "0 nuove", "3 nuove": in italiano il singolare vale solo per 1. */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}
