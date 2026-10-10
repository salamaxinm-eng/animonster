import { body, fail, json, requireUser, sameOrigin } from '@/lib/server/core';
import { quotePromotion } from '@/lib/server/payment-promotions';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user=await requireUser(request);
    const input=await body(request);
    return json(await quotePromotion(user.id,input.promoCode,String(input.plan || 'vpn')));
  } catch(error) { return fail(error); }
}
