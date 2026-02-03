export type WordPressDiscoveryProgress = {
  endpoint: "posts" | "pages";
  page: number;
  totalPages?: number;
  discovered: number;
};

export type DiscoverWordPressUrlsOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  perPage?: number;
  maxPages?: number;
  maxUrls?: number;
  onProgress?: (p: WordPressDiscoveryProgress) => void;
};

function normalizeToOrigin(input: string): string {
  const trimmed = input.trim();
  const withProto = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
  const url = new URL(withProto);
  return url.origin;
}

function linkAbort(from: AbortSignal | undefined, controller: AbortController): () => void {
  if (!from) return () => undefined;
  const handler = () => controller.abort();
  if (from.aborted) {
    controller.abort();
    return () => undefined;
  }
  from.addEventListener("abort", handler, { once: true });
  return () => from.removeEventListener("abort", handler);
}

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ res: Response; json: unknown }>
{
  const controller = new AbortController();
  const unlink = linkAbort(signal, controller);
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      mode: "cors",
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    return { res, json };
  } finally {
    window.clearTimeout(timeoutId);
    unlink();
  }
}

async function fetchWpLinks(
  origin: string,
  endpoint: "posts" | "pages",
  opts: Required<Pick<DiscoverWordPressUrlsOptions, "timeoutMs" | "perPage" | "maxPages" | "maxUrls">> &
    Pick<DiscoverWordPressUrlsOptions, "signal" | "onProgress">,
  out: Set<string>
): Promise<void> {
  const base = origin.replace(/\/+$/, "");
  const perPage = Math.min(100, Math.max(1, opts.perPage));

  const mkUrl = (page: number) =>
    `${base}/wp-json/wp/v2/${endpoint}?per_page=${perPage}&page=${page}&_fields=link`;

  // Page 1 to detect if WP is available + (optionally) total pages
  const first = await fetchJsonWithTimeout(mkUrl(1), opts.timeoutMs, opts.signal);
  if (!first.res.ok || !Array.isArray(first.json)) return;

  const parseLinks = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    const links: string[] = [];
    for (const item of arr) {
      const link = (item as any)?.link;
      if (typeof link === "string" && link.startsWith("http")) links.push(link);
    }
    return links;
  };

  const addLinks = (links: string[]) => {
    for (const l of links) {
      if (out.size >= opts.maxUrls) break;
      out.add(l);
    }
  };

  addLinks(parseLinks(first.json));

  const totalPagesHeader = first.res.headers.get("X-WP-TotalPages");
  const totalPages = totalPagesHeader ? Number(totalPagesHeader) : undefined;

  opts.onProgress?.({ endpoint, page: 1, totalPages, discovered: out.size });

  // If we know total pages, fetch the rest in small parallel batches; otherwise iterate until empty.
  const maxPages = Math.max(1, opts.maxPages);
  const finalPage = totalPages ? Math.min(totalPages, maxPages) : maxPages;
  const concurrency = 4;

  let page = 2;
  while (page <= finalPage && out.size < opts.maxUrls) {
    if (opts.signal?.aborted) throw new Error("Cancelled");

    const batchPages = Array.from({ length: concurrency }, (_, i) => page + i).filter((p) => p <= finalPage);
    page += batchPages.length;

    const results = await Promise.all(
      batchPages.map(async (p) => {
        const r = await fetchJsonWithTimeout(mkUrl(p), opts.timeoutMs, opts.signal);
        if (!r.res.ok) return { page: p, links: [] as string[], empty: true };
        const links = parseLinks(r.json);
        return { page: p, links, empty: links.length === 0 };
      })
    );

    for (const r of results) {
      addLinks(r.links);
      opts.onProgress?.({ endpoint, page: r.page, totalPages, discovered: out.size });

      // If we don't know totalPages and we hit an empty page, stop early.
      if (!totalPages && r.empty) {
        return;
      }
    }
  }
}

/**
 * Fast path for WordPress sites: fetch URLs via the public WP REST API.
 * This bypasses sitemap/CORS problems and is typically much faster.
 */
export async function discoverWordPressUrls(
  siteUrlOrOrigin: string,
  options: DiscoverWordPressUrlsOptions = {}
): Promise<string[]> {
  const origin = normalizeToOrigin(siteUrlOrOrigin);
  const timeoutMs = Math.max(2000, options.timeoutMs ?? 8000);
  const perPage = Math.min(100, Math.max(1, options.perPage ?? 100));
  const maxPages = Math.max(1, options.maxPages ?? 200);
  const maxUrls = Math.max(100, options.maxUrls ?? 50000);

  const out = new Set<string>();
  await fetchWpLinks(
    origin,
    "posts",
    { timeoutMs, perPage, maxPages, maxUrls, signal: options.signal, onProgress: options.onProgress },
    out
  );
  await fetchWpLinks(
    origin,
    "pages",
    { timeoutMs, perPage, maxPages, maxUrls, signal: options.signal, onProgress: options.onProgress },
    out
  );

  return Array.from(out);
}
