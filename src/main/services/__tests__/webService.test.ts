import { describe, it, expect } from 'vitest'
import { WebService } from '../WebService'

// Access private methods via cast — avoids refactoring the class just for tests.
type WebServicePrivate = {
  parseDuckDuckGoHtml(html: string, limit: number): import('../WebService').SearchResult[]
  resolveDuckDuckGoUrl(raw: string): string | null
  extractMainContent(html: string): string
  stripHtml(html: string): string
}

function priv(svc: WebService): WebServicePrivate {
  return svc as unknown as WebServicePrivate
}

// Minimal DDG HTML SERP fixture (real structure as of 2025)
const DDG_FIXTURE = `
<div class="result results_links results_links_deep web-result ">
  <div class="links_main links_deep result__body">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Farticle&rut=abc">
        Example Article
      </a>
    </h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Farticle">
      This is a <b>great</b> snippet about the topic.
    </a>
  </div>
</div>
<div class="result results_links results_links_deep web-result ">
  <div class="links_main links_deep result__body">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fother.org%2Fpage&rut=xyz">
        Other Page
      </a>
    </h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fother.org%2Fpage">
      Another snippet here.
    </a>
  </div>
</div>
<div class="result results_links result--ad web-result ">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fad.example.com">
    Sponsored Ad
  </a>
</div>
`

describe('WebService.parseDuckDuckGoHtml', () => {
  const svc = new WebService()

  it('extracts organic results and decodes DDG redirect URLs', () => {
    const results = priv(svc).parseDuckDuckGoHtml(DDG_FIXTURE, 10)
    expect(results.length).toBeGreaterThanOrEqual(1)
    const first = results[0]
    expect(first.url).toBe('https://example.com/article')
    expect(first.title.trim()).toBeTruthy()
  })

  it('strips HTML from titles and snippets', () => {
    const results = priv(svc).parseDuckDuckGoHtml(DDG_FIXTURE, 10)
    for (const r of results) {
      expect(r.title).not.toMatch(/<[^>]+>/)
      expect(r.snippet).not.toMatch(/<[^>]+>/)
    }
  })

  it('respects limit', () => {
    const results = priv(svc).parseDuckDuckGoHtml(DDG_FIXTURE, 1)
    expect(results.length).toBe(1)
  })

  it('filters out ad results (result--ad)', () => {
    const results = priv(svc).parseDuckDuckGoHtml(DDG_FIXTURE, 10)
    expect(results.every(r => !r.url.includes('ad.example.com'))).toBe(true)
  })

  it('deduplicates identical URLs', () => {
    const doubled = DDG_FIXTURE + DDG_FIXTURE
    const results = priv(svc).parseDuckDuckGoHtml(doubled, 10)
    const urls = results.map(r => r.url)
    expect(new Set(urls).size).toBe(urls.length)
  })
})

describe('WebService.resolveDuckDuckGoUrl', () => {
  const svc = new WebService()

  it('decodes uddg redirect', () => {
    const url = priv(svc).resolveDuckDuckGoUrl(
      '//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpath'
    )
    expect(url).toBe('https://example.com/path')
  })

  it('passes plain https URL through', () => {
    const url = priv(svc).resolveDuckDuckGoUrl('https://example.com')
    expect(url).toBe('https://example.com')
  })

  it('returns null for relative paths', () => {
    expect(priv(svc).resolveDuckDuckGoUrl('/relative/path')).toBeNull()
  })

  it('returns null for javascript: URIs', () => {
    expect(priv(svc).resolveDuckDuckGoUrl('javascript:void(0)')).toBeNull()
  })
})

describe('WebService.extractMainContent', () => {
  const svc = new WebService()

  it('prefers <article> over <body>', () => {
    const html = `<html><body><nav>Nav</nav><article>Main content here</article></body></html>`
    const text = priv(svc).extractMainContent(html)
    expect(text).toContain('Main content here')
    expect(text).not.toContain('Nav')
  })

  it('strips script and style tags', () => {
    const html = `<body><script>alert(1)</script><style>.a{color:red}</style><p>Visible</p></body>`
    const text = priv(svc).extractMainContent(html)
    expect(text).not.toContain('alert')
    expect(text).not.toContain('color:red')
    expect(text).toContain('Visible')
  })

  it('strips nav and footer', () => {
    const html = `<body><nav>Navigation</nav><main>Content</main><footer>Footer</footer></body>`
    const text = priv(svc).extractMainContent(html)
    expect(text).toContain('Content')
    expect(text).not.toContain('Navigation')
    expect(text).not.toContain('Footer')
  })
})

describe('WebService.formatSearchAsContext', () => {
  const svc = new WebService()

  it('includes query and URLs in output', () => {
    const result = {
      query: 'test query',
      results: [
        { title: 'Title One', url: 'https://one.com', snippet: 'Snippet one', content: 'Body one' },
        { title: 'Title Two', url: 'https://two.com', snippet: '', content: '', error: 'Timeout' }
      ]
    }
    const ctx = svc.formatSearchAsContext(result)
    expect(ctx).toContain('test query')
    expect(ctx).toContain('https://one.com')
    expect(ctx).toContain('Body one')
    expect(ctx).toContain('https://two.com')
    expect(ctx).toContain('Timeout')
  })
})
