export type PagedArray<T> = T[] & {
  total: number;
  page: number;
  pageSize: number;
};

export function asPagedArray<T>(items: T[], response: Record<string, unknown>, fallbackPage = 1, fallbackPageSize = 10): PagedArray<T> {
  return Object.assign(items, {
    total: Number(response['total'] ?? items.length),
    page: Number(response['page'] ?? fallbackPage),
    pageSize: Number(response['page_size'] ?? fallbackPageSize)
  });
}
