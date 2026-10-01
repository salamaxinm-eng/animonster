WITH first_payment AS (
  SELECT DISTINCT ON (o.user_id) o.user_id,o.id AS payment_id,o.amount,
    COALESCE(o.confirmed_at,o.created_at) AS paid_at
  FROM orders o JOIN users u ON u.id=o.user_id
  WHERE o.status='succeeded' AND o.amount>=1000 AND NOT o.is_test
    AND u.identity NOT LIKE 'preview:%' AND u.identity NOT LIKE 'test:%'
  ORDER BY o.user_id,COALESCE(o.confirmed_at,o.created_at),o.id
)
SELECT row_number() OVER (ORDER BY paid_at,payment_id)::integer AS founder_number,
  user_id,payment_id,amount,paid_at
FROM first_payment ORDER BY paid_at,payment_id LIMIT 10;
