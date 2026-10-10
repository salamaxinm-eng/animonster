# VPN promo rollout

Migration 0046 installs `animonster30` disabled. It discounts the fixed VPN plan by
30%, once per account, including renewals. It excludes VPN + Plus and all other
plans. Pending claims reuse their stored payment URL. An ambiguous provider error
keeps the claim reserved; investigate the provider transaction before releasing it.
Confirmed unpaid cancellation releases the claim. Refunds do not restore it.

Back up PostgreSQL, build and migrate before replacing the app. Preserve the
production app's `CLUSTER_APP_BIND_ADDRESS` so the edge proxy remains reachable.
After the new app is healthy, activate exactly once:

```sql
UPDATE payment_promotions
SET enabled=true,
    starts_at=(extract(epoch FROM clock_timestamp())*1000)::bigint,
    expires_at=(extract(epoch FROM clock_timestamp())*1000)::bigint+30*86400000::bigint
WHERE code='animonster30' AND starts_at IS NULL;
```

To stop accepting new discounted orders, set `enabled=false`. Existing pending
payment links keep their recorded amount and can still complete. Never alter a
confirmed order's recorded amount or remove a used claim.
