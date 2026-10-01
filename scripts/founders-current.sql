SELECT f.founder_number,f.user_id,u.nick,f.payment_id,
       f.qualifying_amount,f.first_qualifying_payment_at,
       g.lifetime,g.expires,
       (SELECT count(*) FROM user_cosmetics c WHERE c.user_id=f.user_id AND c.source='founder') AS cosmetic_count
FROM founding_members f JOIN users u ON u.id=f.user_id
LEFT JOIN grants g ON g.order_id='founder:' || f.founder_number::text
ORDER BY f.founder_number;
