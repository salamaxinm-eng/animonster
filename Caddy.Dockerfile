FROM caddy:2.11.4-builder AS builder

# Pin the module so production builds are reproducible.
RUN xcaddy build v2.11.4 --with github.com/mholt/caddy-ratelimit@5625512f24f6f59d6f64fb3aafe5eecff0b286db

FROM caddy:2.11.4-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
