/** Call with a fresh, deterministically ordered query for every page. */
export async function readAllRows<T, E>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: E | null }>,
) {
  const data: T[] = [];
  for (;;) {
    const result = await page(data.length, data.length + 499);
    if (result.error) return { data: null, error: result.error };
    const rows = result.data || [];
    if (!rows.length) return { data, error: null };
    data.push(...rows);
    // Continue after short pages too: the server may enforce a smaller row cap.
  }
}
