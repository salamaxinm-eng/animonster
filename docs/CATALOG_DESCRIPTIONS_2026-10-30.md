# Catalog descriptions — 2026-10-30

A full read-only scan covered 8798 cached cards. The first snapshot found 3677 empty visible descriptions; a later snapshot during active sync found 3678. HTML-only/whitespace-only values count as empty. This supersedes the earlier repair limited to Naruto and Shippuden.

A data-only repair filled 3219 empty descriptions: 3178 from existing active Kodik metadata matched by exact Shikimori ID, 41 from the official Shikimori GraphQL descriptionHtml matched by exact ID. Another candidate had already gained text before the guarded update. Existing nonempty descriptions, other card fields, episodes and updated_at were preserved. Source HTML was converted to plain text before storage. No summaries were invented. A private field-level snapshot was written before modification. The initial remaining set has 458 entries whose checked sources also have no usable description; all external batches completed without errors.

Code changes prevent partial catalog upserts and stale background identity refreshes from erasing descriptions with missing, null, blank or HTML-only values. A matching AniLiberty description can now fill an empty Kodik cache record while preserving its provider identity. Valid incoming descriptions can still update old text. No authorization, playback, layout or metadata query-on-render behavior changed.

Validation: 40 targeted catalog identity, Kodik and SEO tests passed, including real PostgreSQL-compatible upserts, canonical-date and episode preservation, cross-provider fill and the concurrent stale-refresh case. Twenty repaired public card responses returned 200 with visible SSR descriptions exactly matching the selected source texts. The full-catalog check is a database audit; it is not a browser crawl of every URL. Production build, lint and final production audit are checked separately during release.

Private production repair artifacts are under /root/animonster-metadata-repairs-20261030. Do not publish raw provider payloads or secrets. The list of cards still lacking source descriptions is kept separately from restored records.
