export interface WikipediaResult {
  title: string
  extract: string
  sections: Array<{ title: string; content: string }>
  url: string
  lang: string
}

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export interface EnrichedSearchResult extends SearchResult {
  content: string
  error?: string
}

export interface SearchAndFetchResult {
  query: string
  results: EnrichedSearchResult[]
}

interface FetchUrlOptions {
  maxChars?: number
  timeoutMs?: number
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export class WebService {
  /**
   * Fetch a Wikipedia article using the REST API (no key needed).
   * Falls back to English if the topic isn't found in the requested language.
   */
  async fetchWikipedia(topic: string, lang = 'fr'): Promise<WikipediaResult> {
    const encoded = encodeURIComponent(topic.trim().replace(/\s+/g, '_'))

    const summaryRes = await this.fetchWithTimeout(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
      {},
      10000
    )
    if (!summaryRes.ok) {
      if (lang !== 'en') return this.fetchWikipedia(topic, 'en')
      throw new Error(`Wikipedia: "${topic}" introuvable (${summaryRes.status})`)
    }
    const summary = (await summaryRes.json()) as {
      title: string
      extract: string
      content_urls: { desktop: { page: string } }
    }

    let sections: Array<{ title: string; content: string }> = []
    try {
      const sectionsRes = await this.fetchWithTimeout(
        `https://${lang}.wikipedia.org/api/rest_v1/page/mobile-sections/${encoded}`,
        {},
        10000
      )
      if (sectionsRes.ok) {
        const data = (await sectionsRes.json()) as {
          remaining?: { sections: Array<{ title?: string; text: string }> }
        }
        sections = (data.remaining?.sections ?? [])
          .slice(0, 12)
          .map(s => ({
            title: s.title ?? '',
            content: this.stripHtml(s.text ?? '').substring(0, 2000)
          }))
          .filter(s => s.content.length > 50)
      }
    } catch {
      // optional
    }

    return {
      title: summary.title,
      extract: summary.extract,
      sections,
      url: summary.content_urls.desktop.page,
      lang
    }
  }

  /**
   * Search the web via DuckDuckGo's HTML endpoint (no API key, no account).
   * Returns up to `limit` organic results with {title, url, snippet}.
   *
   * Implementation notes:
   *  - Uses `html.duckduckgo.com/html/` (stable, scrapeable).
   *  - Results come back wrapped in a DDG redirect (`//duckduckgo.com/l/?uddg=<encoded>`)
   *    which we decode to the real URL.
   *  - Filters out ad results (class `result--ad`).
   */
  async search(query: string, limit = 5, lang: 'fr' | 'en' = 'fr'): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      kl: lang === 'en' ? 'us-en' : 'fr-fr'
    }).toString()

    // Prefer DDG Lite — simpler table HTML, less bot-detection friction
    try {
      const res = await this.fetchWithTimeout(
        `https://lite.duckduckgo.com/lite/?${params}`,
        {
          headers: {
            'User-Agent': DEFAULT_UA,
            'Accept-Language': lang === 'en' ? 'en-US,en;q=0.9' : 'fr-FR,fr;q=0.9,en;q=0.7',
            'Accept': 'text/html'
          }
        },
        12000
      )
      if (res.ok) {
        const html = await res.text()
        const results = this.parseDuckDuckGoLiteHtml(html, limit)
        if (results.length > 0) return results
        console.warn('[WebService] DDG Lite returned 0 results, falling back to html endpoint')
      } else {
        console.warn('[WebService] DDG Lite HTTP', res.status)
      }
    } catch (err) {
      console.warn('[WebService] DDG Lite failed, falling back:', err)
    }

    // Fallback: original HTML endpoint
    const body = new URLSearchParams({
      q: query,
      kl: lang === 'en' ? 'us-en' : 'fr-fr'
    }).toString()

    const res = await this.fetchWithTimeout(
      'https://html.duckduckgo.com/html/',
      {
        method: 'POST',
        headers: {
          'User-Agent': DEFAULT_UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept-Language': lang === 'en' ? 'en-US,en;q=0.9' : 'fr-FR,fr;q=0.9,en;q=0.7'
        },
        body
      },
      12000
    )

    if (!res.ok) throw new Error(`DuckDuckGo search failed: HTTP ${res.status}`)
    const html = await res.text()
    return this.parseDuckDuckGoHtml(html, limit)
  }

  /**
   * Run a web search, then fetch the top N result pages in parallel.
   * Returns enriched results with main-content text (trimmed to `perPageChars`).
   * Failed fetches carry an `error` field but do not abort the batch.
   */
  async searchAndFetch(
    query: string,
    opts: { limit?: number; perPageChars?: number; timeoutMs?: number; lang?: 'fr' | 'en' } = {}
  ): Promise<SearchAndFetchResult> {
    const limit = opts.limit ?? 4
    const perPageChars = opts.perPageChars ?? 3500
    const timeoutMs = opts.timeoutMs ?? 8000
    const lang = opts.lang ?? 'fr'

    const hits = await this.search(query, limit, lang)
    const enriched = await Promise.all(
      hits.map(async hit => {
        try {
          const content = await this.fetchUrl(hit.url, { maxChars: perPageChars, timeoutMs })
          return { ...hit, content }
        } catch (err) {
          return {
            ...hit,
            content: '',
            error: err instanceof Error ? err.message : String(err)
          }
        }
      })
    )
    return { query, results: enriched }
  }

  /**
   * Fetch an arbitrary URL and return cleaned plain text (main content only).
   * Respects a timeout and a max char budget for prompt size safety.
   */
  async fetchUrl(url: string, opts: FetchUrlOptions = {}): Promise<string> {
    const maxChars = opts.maxChars ?? 8000
    const timeoutMs = opts.timeoutMs ?? 10000

    const res = await this.fetchWithTimeout(
      url,
      {
        headers: {
          'User-Agent': DEFAULT_UA,
          'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.7'
        },
        redirect: 'follow'
      },
      timeoutMs
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)

    const contentType = res.headers.get('content-type') ?? ''
    if (!/text\/|xml|json/.test(contentType)) {
      throw new Error(`Unsupported content-type: ${contentType}`)
    }

    const html = await res.text()
    return this.extractMainContent(html).substring(0, maxChars)
  }

  /** Format a Wikipedia result as a Markdown context block for prompt injection. */
  formatWikipediaAsContext(result: WikipediaResult): string {
    const lines: string[] = [
      `## Source web — Wikipedia (${result.lang}) : ${result.title}`,
      `URL : ${result.url}`,
      '',
      result.extract
    ]
    for (const section of result.sections) {
      if (section.title) lines.push(`\n### ${section.title}`)
      lines.push(section.content)
    }
    return lines.join('\n')
  }

  /** Format a raw URL fetch as a context block. */
  formatUrlAsContext(url: string, text: string): string {
    return `## Source web — ${url}\n\n${text}`
  }

  /** Format a search+fetch batch as one Markdown block for prompt injection. */
  formatSearchAsContext(result: SearchAndFetchResult): string {
    const lines: string[] = [
      `## Recherche web — "${result.query}"`,
      `${result.results.length} résultat(s) DuckDuckGo. Cite les URLs quand tu t'en sers.`,
      ''
    ]
    result.results.forEach((r, i) => {
      lines.push(`### ${i + 1}. ${r.title}`)
      lines.push(`URL : ${r.url}`)
      if (r.snippet) lines.push(`Extrait : ${r.snippet}`)
      if (r.error) {
        lines.push(`_Contenu non récupéré : ${r.error}_`)
      } else if (r.content) {
        lines.push('')
        lines.push(r.content)
      }
      lines.push('')
    })
    return lines.join('\n')
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      return await fetch(url, { ...init, signal: ctrl.signal })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timeout (${timeoutMs}ms): ${url}`)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  /** Parse DDG Lite table layout — simpler and more stable than full HTML SERP. */
  private parseDuckDuckGoLiteHtml(html: string, limit: number): SearchResult[] {
    const results: SearchResult[] = []
    const seen = new Set<string>()

    // DDG Lite: href comes before class in attr order — match the full tag, extract both separately
    const anchorRe = /<a\s[^>]*class='result-link'[^>]*>[\s\S]*?<\/a>/g
    const snippetRe = /<td[^>]+class='result-snippet'[^>]*>([\s\S]*?)<\/td>/g

    const links: Array<{ url: string; title: string }> = []
    let m: RegExpExecArray | null
    while ((m = anchorRe.exec(html)) && links.length < limit * 2) {
      const tag = m[0]
      const hrefMatch = /href="([^"]+)"/.exec(tag)
      const titleMatch = />([^<]+)<\/a>/.exec(tag)
      if (!hrefMatch || !titleMatch) continue
      const url = this.resolveDuckDuckGoUrl(this.decodeHtmlEntities(hrefMatch[1]))
      if (!url || seen.has(url)) continue
      seen.add(url)
      links.push({ url, title: this.stripHtml(titleMatch[1]) })
    }

    const snippets: string[] = []
    while ((m = snippetRe.exec(html))) {
      snippets.push(this.stripHtml(m[1]))
    }

    for (let i = 0; i < Math.min(links.length, limit); i++) {
      results.push({ ...links[i], snippet: snippets[i] ?? '' })
    }
    return results
  }

  /** Parse DuckDuckGo HTML SERP into SearchResult[]. Skips ads. */
  private parseDuckDuckGoHtml(html: string, limit: number): SearchResult[] {
    const results: SearchResult[] = []
    const seen = new Set<string>()

    // Each result is a <div class="result ..."> block. Ad blocks include "result--ad".
    const blockRe = /<div[^>]+class="[^"]*\bresult\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g
    let match: RegExpExecArray | null
    while ((match = blockRe.exec(html)) && results.length < limit) {
      const block = match[0]
      if (/result--ad/.test(block)) continue

      const anchor = /<a[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block)
      if (!anchor) continue
      const rawUrl = this.decodeHtmlEntities(anchor[1])
      const url = this.resolveDuckDuckGoUrl(rawUrl)
      if (!url || seen.has(url)) continue

      const snippetMatch = /class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(block)
        ?? /class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(block)

      seen.add(url)
      results.push({
        url,
        title: this.stripHtml(anchor[2]),
        snippet: snippetMatch ? this.stripHtml(snippetMatch[1]) : ''
      })
    }

    // Fallback: if block regex missed everything, try a flat anchor sweep.
    if (results.length === 0) {
      const flatRe = /<a[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
      while ((match = flatRe.exec(html)) && results.length < limit) {
        const url = this.resolveDuckDuckGoUrl(this.decodeHtmlEntities(match[1]))
        if (!url || seen.has(url)) continue
        seen.add(url)
        results.push({ url, title: this.stripHtml(match[2]), snippet: '' })
      }
    }

    return results
  }

  /** Convert a DDG redirect URL (`//duckduckgo.com/l/?uddg=...`) to the real target. */
  private resolveDuckDuckGoUrl(raw: string): string | null {
    try {
      const normalized = raw.startsWith('//') ? 'https:' + raw : raw
      if (!/^https?:\/\//i.test(normalized)) return null
      const parsed = new URL(normalized)
      if (parsed.hostname.endsWith('duckduckgo.com') && parsed.pathname.startsWith('/l/')) {
        const uddg = parsed.searchParams.get('uddg')
        if (uddg) return decodeURIComponent(uddg)
      }
      return normalized
    } catch {
      return null
    }
  }

  /**
   * Reduce a raw HTML document to readable body text.
   * Drops script/style/nav/header/footer/aside, then prefers <article>/<main> when present.
   */
  private extractMainContent(html: string): string {
    const cleaned = html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|noscript|svg|iframe|form)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, '')

    const article = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(cleaned)
    const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(cleaned)
    const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(cleaned)
    const core = article?.[1] ?? main?.[1] ?? body?.[1] ?? cleaned

    return this.stripHtml(core)
  }

  private stripHtml(html: string): string {
    return this.decodeHtmlEntities(
      html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
    )
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  private decodeHtmlEntities(s: string): string {
    return s
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  }
}

export const webService = new WebService()
