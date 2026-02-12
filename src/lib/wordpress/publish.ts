// src/lib/wordpress/publish.ts
// SOTA God Mode - Shared WordPress Publish Logic v3.0
// Used by: Express server, Cloudflare Pages Function, Vercel API Route, Supabase Edge Function

export interface WordPressPublishPayload {
  wpUrl: string;
  username: string;
  appPassword: string;
  title: string;
  content: string;
  excerpt?: string;
  status?: "draft" | "publish";
  categories?: number[];
  tags?: number[];
  slug?: string;
  metaDescription?: string;
  seoTitle?: string;
  sourceUrl?: string;
  existingPostId?: number | string;
}

export interface WordPressPublishResult {
  success: boolean;
  updated?: boolean;
  post?: {
    id: number;
    url: string;
    link?: string;
    status: string;
    title: string;
    slug: string;
  };
  error?: string;
  status?: number;
}

/**
 * Transform YouTube iframes to WordPress [embed] shortcodes.
 * Uses a simple regex approach for known YouTube embed patterns.
 */
export function transformYouTubeEmbeds(html: string): string {
  let processed = html;

  // Standalone iframe embeds
  processed = processed.replace(
    /<iframe[^>]*src=["']https?:\/\/(?:www\.)?(?:youtube\.com\/embed|youtube-nocookie\.com\/embed)\/([a-zA-Z0-9_-]+)[^"']*["'][^>]*>[\s\S]*?<\/iframe>/gi,
    (_match, videoId: string) => `[embed]https://www.youtube.com/watch?v=${videoId}[/embed]`,
  );

  // Figure-wrapped iframes with captions
  processed = processed.replace(
    /<figure[^>]*>\s*<div[^>]*>\s*<iframe[^>]*src=["']https?:\/\/(?:www\.)?(?:youtube\.com\/embed|youtube-nocookie\.com\/embed)\/([a-zA-Z0-9_-]+)[^"']*["'][^>]*>[\s\S]*?<\/iframe>\s*<\/div>\s*<figcaption[^>]*>([\s\S]*?)<\/figcaption>\s*<\/figure>/gi,
    (_match, videoId: string, caption: string) => {
      const cleanCaption = caption.replace(/<[^>]*>/g, "").trim();
      return `[embed]https://www.youtube.com/watch?v=${videoId}[/embed]\n<p style="text-align: center; color: #6b7280; font-size: 14px;">${cleanCaption}</p>`;
    },
  );

  return processed;
}

/**
 * Build WordPress-compatible SEO meta fields for all major SEO plugins.
 */
function buildSeoMeta(
  metaDescription: string | undefined,
  seoTitle: string | undefined,
  fallbackTitle: string,
): Record<string, string> {
  const desc = metaDescription || "";
  const title = seoTitle || fallbackTitle;

  return {
    // Yoast
    _yoast_wpseo_metadesc: desc,
    _yoast_wpseo_title: title,
    // Rank Math
    rank_math_description: desc,
    rank_math_title: title,
    // All in One SEO
    _aioseo_description: desc,
    _aioseo_title: title,
  };
}

/**
 * Core publish/update function. Runtime-agnostic (works in Node, Edge, CF Workers).
 */
export async function publishToWordPress(
  payload: WordPressPublishPayload,
): Promise<WordPressPublishResult> {
  const {
    wpUrl,
    username,
    appPassword,
    title,
    content,
    excerpt,
    status = "draft",
    categories,
    tags,
    slug,
    metaDescription,
    seoTitle,
    sourceUrl,
    existingPostId,
  } = payload;

  const baseUrl = wpUrl.replace(/\/+$/, "");
  const apiUrl = `${baseUrl}/wp-json/wp/v2/posts`;

  // Use btoa for edge compatibility, Buffer.from for Node
  const authBase64 =
    typeof btoa === "function"
      ? btoa(`${username}:${appPassword}`)
      : Buffer.from(`${username}:${appPassword}`).toString("base64");

  const authHeaders: Record<string, string> = {
    Authorization: `Basic ${authBase64}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const fetchWithTimeout = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // ─── Find existing post ────────────────────────────────────────
  let targetPostId: number | null = existingPostId ? parseInt(String(existingPostId), 10) : null;
  if (targetPostId !== null && isNaN(targetPostId)) targetPostId = null;

  // Search by slug
  if (!targetPostId && slug) {
    try {
      const cleanSlug = slug.replace(/^\/+|\/+$/g, "").split("/").pop() || slug;
      const searchRes = await fetchWithTimeout(`${apiUrl}?slug=${encodeURIComponent(cleanSlug)}&status=any`, {
        headers: authHeaders,
      });
      if (searchRes.ok) {
        const posts = (await searchRes.json()) as Array<{ id: number }>;
        if (posts.length > 0) targetPostId = posts[0].id;
      }
    } catch {
      /* search is best-effort */
    }
  }

  // Search by source URL slug
  if (!targetPostId && sourceUrl) {
    try {
      const pathMatch = sourceUrl.match(/\/([^/]+)\/?$/);
      if (pathMatch) {
        const sourceSlug = pathMatch[1].replace(/\/$/, "");
        const searchRes = await fetchWithTimeout(
          `${apiUrl}?slug=${encodeURIComponent(sourceSlug)}&status=any`,
          { headers: authHeaders },
        );
        if (searchRes.ok) {
          const posts = (await searchRes.json()) as Array<{ id: number }>;
          if (posts.length > 0) targetPostId = posts[0].id;
        }
      }
    } catch {
      /* search is best-effort */
    }
  }

  // ─── Build post data ──────────────────────────────────────────
  const processedContent = transformYouTubeEmbeds(content);

  const postData: Record<string, unknown> = {
    title,
    content: processedContent,
    status,
  };

  if (excerpt) postData.excerpt = excerpt;
  if (slug) {
    postData.slug = slug.replace(/^\/+|\/+$/g, "").split("/").pop() || slug;
  }
  if (categories && categories.length > 0) postData.categories = categories;
  if (tags && tags.length > 0) postData.tags = tags;

  if (metaDescription || seoTitle) {
    postData.meta = buildSeoMeta(metaDescription, seoTitle, title);
  }

  // ─── Publish / Update ─────────────────────────────────────────
  const targetUrl = targetPostId ? `${apiUrl}/${targetPostId}` : apiUrl;
  const method = targetPostId ? "PUT" : "POST";

  let response: Response;
  try {
    response = await fetchWithTimeout(targetUrl, {
      method,
      headers: authHeaders,
      body: JSON.stringify(postData),
    });
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    const isTimeout = msg.includes("abort") || msg.includes("timeout");
    return {
      success: false,
      error: isTimeout
        ? "Connection to WordPress timed out. Check URL and site availability."
        : `Could not connect to WordPress: ${msg}`,
      status: isTimeout ? 504 : 502,
    };
  }

  const responseText = await response.text();

  if (!response.ok) {
    let errorMessage = `WordPress API error: ${response.status}`;
    try {
      const errorData = JSON.parse(responseText);
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {
      /* use default message */
    }

    if (response.status === 401)
      errorMessage = "Authentication failed. Check username and application password.";
    if (response.status === 403)
      errorMessage = "Permission denied. Ensure the user has publish capabilities.";
    if (response.status === 404)
      errorMessage = "WordPress REST API not found. Ensure permalinks are enabled.";

    return { success: false, error: errorMessage, status: response.status };
  }

  let post: { id: number; link: string; status: string; title?: { rendered: string }; slug: string };
  try {
    post = JSON.parse(responseText);
  } catch {
    return { success: false, error: "Invalid response from WordPress" };
  }

  return {
    success: true,
    updated: !!targetPostId,
    post: {
      id: post.id,
      url: post.link,
      link: post.link,
      status: post.status,
      title: post.title?.rendered || title,
      slug: post.slug,
    },
  };
}

