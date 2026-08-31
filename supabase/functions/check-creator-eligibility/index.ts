/**
 * Server-side re-verification for "Become a Plated Creator". The client
 * computes the same five counts locally to render progress, but this
 * function is the only thing trusted to flip `profiles.compensation_eligible`
 * — that column has no client UPDATE grant (0013_lock_profile_trust_columns.sql).
 * Never trust the client's own progress math for the actual flip.
 *
 * THRESHOLDS below must be kept in sync by hand with CREATOR_THRESHOLDS in
 * src/lib/creatorEligibility.ts — Deno vs. React Native, no shared module.
 *
 * Deploy: supabase functions deploy check-creator-eligibility
 */
import { CORS, json, requireUser, serviceClient } from '../_shared/http.ts';

const THRESHOLDS = {
  platesRated: 25,
  platosPosted: 10,
  followers: 1000,
  likes: 500,
  views: 5000,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const user = await requireUser(req);
  if (!user) return json({ error: 'sign-in required' }, 401);

  const db = serviceClient();

  const { data: profile } = await db
    .from('profiles')
    .select('compensation_eligible')
    .eq('id', user.id)
    .maybeSingle();

  // Already flipped — nothing to recompute or write.
  if (profile?.compensation_eligible) {
    return json({ eligible: true });
  }

  const [{ data: orderRows }, { data: platoRows }, followRes] = await Promise.all([
    db.from('orders').select('id').eq('user_id', user.id),
    db.from('plato_videos').select('id, view_count').eq('user_id', user.id),
    db.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', user.id),
  ]);

  const orderIds: string[] = (orderRows ?? []).map((r: { id: string }) => r.id);
  const platoIds: string[] = (platoRows ?? []).map((r: { id: string }) => r.id);
  const views = (platoRows ?? []).reduce((sum: number, r: { view_count: number | null }) => sum + (r.view_count ?? 0), 0);

  const [orderLikesRes, platoLikesRes] = await Promise.all([
    orderIds.length
      ? db.from('likes').select('order_id', { count: 'exact', head: true }).in('order_id', orderIds)
      : { count: 0 },
    platoIds.length
      ? db.from('plato_likes').select('plato_id', { count: 'exact', head: true }).in('plato_id', platoIds)
      : { count: 0 },
  ]);

  const counts = {
    platesRated: orderIds.length,
    platosPosted: platoIds.length,
    followers: followRes.count ?? 0,
    likes: (orderLikesRes.count ?? 0) + (platoLikesRes.count ?? 0),
    views,
  };

  const meetsAll = (Object.keys(THRESHOLDS) as (keyof typeof THRESHOLDS)[]).every(
    (key) => counts[key] >= THRESHOLDS[key],
  );

  if (meetsAll) {
    const { error } = await db.from('profiles').update({ compensation_eligible: true }).eq('id', user.id);
    if (error) {
      console.error('[check-creator-eligibility] flip failed', error);
      return json({ error: 'could not update eligibility' }, 500);
    }
  }

  return json({ eligible: meetsAll, counts });
});
