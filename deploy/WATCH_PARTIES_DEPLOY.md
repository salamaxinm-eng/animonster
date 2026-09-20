# Watch parties rollout

1. Keep `WATCH_PARTIES_ENABLED=false` while deploying the application and
   applying `migrations/postgres/0020_watch_parties.sql`.
2. Run the regular Plus worker once. It also closes expired rooms and removes
   chat messages from rooms that ended more than 30 days ago.
3. Smoke-test room creation, joining, SSE reconnection, playback commands,
   chat, reactions and the mobile chat sheet in the target environment.
4. Set `WATCH_PARTIES_ENABLED=true` and restart the application.
5. Watch the joint-viewing counters in the admin dashboard: active rooms,
   connections, SSE errors, quota refusals and Kodik corrections.

Turning the flag back off hides room creation and rejects the room API without
removing room or moderation data.
