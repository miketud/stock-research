export interface TickerDirectoryItem {
  ticker: string;
  name: string;
}

export interface TickerDirectoryCache {
  version: number;
  fetchedAt: string;
  tickers: TickerDirectoryItem[];
}

/* Ranked from the tightest match outward: exact symbol, symbol prefix, name
   prefix, then anywhere in the name. Ties break alphabetically so the list
   stays stable as the query grows. */
export function matchTickers(
  directory: TickerDirectoryItem[],
  rawQuery: string,
  limit = 8
): TickerDirectoryItem[] {
  const query = rawQuery.trim().toUpperCase();
  if (!query) return [];

  return directory
    .map((entry) => {
      const symbol = entry.ticker.toUpperCase();
      const name = entry.name.toUpperCase();
      const score =
        symbol === query
          ? 0
          : symbol.startsWith(query)
            ? 1
            : name.startsWith(query)
              ? 2
              : name.includes(query)
                ? 3
                : 4;
      return { entry, score };
    })
    .filter(({ score }) => score < 4)
    .sort((a, b) => a.score - b.score || a.entry.ticker.localeCompare(b.entry.ticker))
    .slice(0, limit)
    .map(({ entry }) => entry);
}
