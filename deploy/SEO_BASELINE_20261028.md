# Search visibility baseline — 2026-10-28

A promotion-service refusal reports low search positions; it does not diagnose a technical fault or prove an indexing ban. Search Console/Webmaster coverage and query reports are still required to establish actual indexing, impressions and reasons for exclusions. No ranking/time guarantee is made.

Production checks: robots.txt and sitemap.xml returned HTTP 200. XML parsed successfully with 8,784 URLs at audit time. Robots allows public pages. Anime routes already provide individual titles/descriptions, canonical URLs and TVSeries/Movie JSON-LD.

Fixed root-layout canonical `/` incorrectly inherited by unrelated pages. Home now explicitly owns `/`; catalog, genres and recommendations declare their own canonical URLs. Other pages no longer inherit a false home canonical. Added a server catalog wrapper with page-specific title/description and first 24 rating-sorted local database cards; ongoing tab is seeded separately. Client sorting and paging still use the existing catalog API. Database failure preserves the existing client fallback. Initial catalog heading is now H1, with mobile sizing preserved. No changes to payment flows, stored data or legal-page draft.

Verification: TypeScript, changed-source lint, existing sitemap serialization/boundary/failure tests and production build. Search visibility still depends on crawling, indexing, content usefulness and competition; sitemap submission is a discovery hint, not a ranking mechanism.
