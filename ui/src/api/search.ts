export interface PathSearchResult {
  path: string;
  score: number;
  isDir: boolean;
}

export async function searchPaths(
  query: string,
  limit: number = 20,
  signal?: AbortSignal,
): Promise<PathSearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const response = await fetch(`/api/search/paths?${params}`, { signal });
  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }
  return await response.json();
}
