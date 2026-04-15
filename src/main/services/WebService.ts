export interface WikipediaResult {
  title: string
  extract: string
  sections: Array<{ title: string; content: string }>
  url: string
  lang: string
}

export class WebService {
  /**
   * Fetch a Wikipedia article using the REST API (no key needed).
   * Falls back to English if the topic isn't found in the requested language.
   */
  async fetchWikipedia(topic: string, lang = 'fr'): Promise<WikipediaResult> {
    const encoded = encodeURIComponent(topic.trim().replace(/\s+/g, '_'))

    // Summary (plain-text extract + canonical URL)
    const summaryRes = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`
    )
    if (!summaryRes.ok) {
      // Retry in English if French not found
      if (lang !== 'en') return this.fetchWikipedia(topic, 'en')
      throw new Error(`Wikipedia: "${topic}" introuvable (${summaryRes.status})`)
    }
    const summary = await summaryRes.json() as {
      title: string
      extract: string
      content_urls: { desktop: { page: string } }
    }

    // Sections (mobile-sections endpoint)
    let sections: Array<{ title: string; content: string }> = []
    try {
      const sectionsRes = await fetch(
        `https://${lang}.wikipedia.org/api/rest_v1/page/mobile-sections/${encoded}`
      )
      if (sectionsRes.ok) {
        const data = await sectionsRes.json() as {
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
      // Sections are optional — continue with just the extract
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
   * Fetch an arbitrary URL and return plain text (basic HTML strip).
   * Max 8 000 chars to avoid bloating the prompt.
   */
  async fetchUrl(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CortX/1.0 (knowledge agent)' }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
    const html = await res.text()
    return this.stripHtml(html).substring(0, 8000)
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

  private stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
  }
}

export const webService = new WebService()
