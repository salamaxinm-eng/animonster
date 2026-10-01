import postgres from 'postgres';
import { readFile } from 'node:fs/promises';

// Run --preview against production first. --apply is repeatable and refuses to
// rewrite an existing number, even if the historical ordering has changed.
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const apply = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const previewQuery = await readFile(new URL('./founders-candidates.sql', import.meta.url), 'utf8');
const candidates = async (tx) => tx.unsafe(previewQuery);
try {
  if (!apply) {
    const rows = await candidates(sql);
    for (const row of rows)
      console.log(`Founder #${String(row.founder_number).padStart(3, '0')} — ${row.user_id} — ${new Date(Number(row.paid_at)).toISOString()} — ${row.amount} ₽`);
    if (!rows.length) console.log('No qualifying historical payments.');
  } else {
    await sql.begin(async (tx) => {
      const rows = await candidates(tx);
      const [state] = await tx`SELECT id,backfilled FROM founding_sequence WHERE id=1 FOR UPDATE`;
      const existing = await tx`SELECT user_id,founder_number,payment_id FROM founding_members ORDER BY founder_number`;
      if (!state.backfilled && existing.length)
        throw new Error('Founder assignments exist before historical backfill; manual review required');
      if (!state.backfilled) {
        for (const row of rows) {
          await tx`
            INSERT INTO founding_members(user_id,founder_number,payment_id,qualifying_amount,
              first_qualifying_payment_at,created_at)
            VALUES (${row.user_id},${row.founder_number},${row.payment_id},${row.amount},
              ${row.paid_at},${Date.now()})
            ON CONFLICT(user_id) DO NOTHING
          `;
        }
        await tx`UPDATE founding_sequence SET next_number=${Math.max(1, rows.length + 1)},backfilled=true WHERE id=1`;
        console.log(`Backfilled ${rows.length} Founder members.`);
      } else {
        // A later chargeback must not change a permanent historical seat.
        // Once assignment has started, replay only repairs rewards.
        console.log(`Preserved ${existing.length} existing Founder assignments.`);
      }
    });
    // Importing TS from this standalone script would require a runtime loader.
    // The application also retries synchronization on payment verification;
    // apply all historical rewards here with the same idempotency keys.
    const members = await sql`SELECT user_id,founder_number,first_qualifying_payment_at FROM founding_members ORDER BY founder_number`;
    for (const member of members) {
      const n = Number(member.founder_number);
      const pin = `pin:founder-${String(n).padStart(3, '0')}`;
      const date = new Date(Number(member.first_qualifying_payment_at));
      date.setUTCMonth(date.getUTCMonth() + (n <= 3 ? 12 : 6));
      const expires = n === 1 ? 0 : date.getTime();
      await sql.begin(async (tx) => {
        for (const cosmetic of ['tag:founding-10', pin, 'frame:founder', 'background:founder'])
          await tx`
            INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata)
            VALUES (${member.user_id},${cosmetic},${Date.now()},'founder',${`founder:${cosmetic}`},${JSON.stringify({ founderNumber: n })}::jsonb)
            ON CONFLICT(user_id,cosmetic_id) DO NOTHING
          `;
        await tx`
          INSERT INTO grants(order_id,user_id,starts_at,expires,reason,lifetime)
          VALUES (${`founder:${n}`},${member.user_id},${member.first_qualifying_payment_at},${expires},${`Founder #${String(n).padStart(3, '0')}`},${n === 1})
          ON CONFLICT(order_id) DO NOTHING
        `;
        await tx`
          UPDATE users SET tag=COALESCE(tag,'founding-10'),
            pin=COALESCE(pin,${`founder-${String(n).padStart(3, '0')}`}),
            profile_frame=CASE WHEN profile_frame='none' THEN 'founder' ELSE profile_frame END,
            profile_background=COALESCE(profile_background,'/rewards/founder/background.svg')
          WHERE id=${member.user_id}
        `;
      });
    }
    console.log(`Synchronized rewards for ${members.length} Founder members.`);
  }
} finally {
  await sql.end();
}
