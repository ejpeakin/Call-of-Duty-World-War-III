// =====================================================================
//  FortDay "notify" Edge Function: emails a friend request or party invite to the player it was
//  sent to. The game calls it right after sending one: POST { kind: 'friend' | 'invite', id }.
//
//  It only emails rows the caller sent, at most once per row, at most 20 an hour per player,
//  and never to someone who turned emails off. Players never see each other's email addresses:
//  only this function reads them, with the service role key that Supabase gives it.
//
//  Secrets (Supabase → Edge Functions → Secrets): GMAIL_USER, GMAIL_APP_PASSWORD, and optionally
//  SITE_URL. Setup steps are in supabase/SETUP.md.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@6.9.14';

const SITE = Deno.env.get('SITE_URL') || 'https://ejpeakin.github.io/FortDay/';
const GMAIL_USER = Deno.env.get('GMAIL_USER') || '';
const PER_HOUR = 20;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// Gmail over SSL (port 465). Supabase blocks outgoing ports 25 and 587.
const mailer = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: GMAIL_USER, pass: Deno.env.get('GMAIL_APP_PASSWORD') || '' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  if (!GMAIL_USER) return reply(500, { error: 'Email is not set up yet (GMAIL_USER secret is missing).' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // who is asking
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: who } = await admin.auth.getUser(jwt);
  const me = who?.user;
  if (!me) return reply(401, { error: 'Sign in first' });

  let body: { kind?: string; id?: number };
  try { body = await req.json(); } catch { return reply(400, { error: 'Bad request' }); }
  const kind = body.kind === 'friend' || body.kind === 'invite' ? body.kind : null;
  const id = Number(body.id);
  if (!kind || !Number.isInteger(id)) return reply(400, { error: 'Bad request' });
  const table = kind === 'friend' ? 'friend_requests' : 'party_invites';

  const { data: row } = await admin.from(table).select('*').eq('id', id).maybeSingle();
  if (!row || row.from_id !== me.id) return reply(404, { error: 'Not found' });
  if (kind === 'friend' && row.status !== 'pending') return reply(200, { sent: false, reason: 'no longer pending' });
  if (row.emailed_at) return reply(200, { sent: false, reason: 'already emailed' });

  // at most PER_HOUR emails an hour from one player
  const since = new Date(Date.now() - 3600_000).toISOString();
  const counts = await Promise.all(['friend_requests', 'party_invites'].map((t) =>
    admin.from(t).select('id', { count: 'exact', head: true }).eq('from_id', me.id).gte('emailed_at', since)));
  if (counts.reduce((n, c) => n + (c.count || 0), 0) >= PER_HOUR) return reply(429, { error: 'Too many emails this hour' });

  const [{ data: sender }, { data: target }] = await Promise.all([
    admin.from('profiles').select('username').eq('id', me.id).single(),
    admin.from('profiles').select('username, email_notify').eq('id', row.to_id).single(),
  ]);
  if (!target || !target.email_notify) return reply(200, { sent: false, reason: 'emails off' });
  const { data: toUser } = await admin.auth.admin.getUserById(row.to_id);
  const to = toUser?.user?.email;
  if (!to) return reply(200, { sent: false, reason: 'no email' });

  // claim the row first so two calls at once can't both send
  const { data: claimed } = await admin.from(table).update({ emailed_at: new Date().toISOString() })
    .eq('id', id).is('emailed_at', null).select('id');
  if (!claimed || !claimed.length) return reply(200, { sent: false, reason: 'already emailed' });

  const name = sender?.username || 'A player';
  const friend = kind === 'friend';
  const link = friend ? SITE : SITE + '?join=' + encodeURIComponent(row.code);
  const subject = friend ? `${name} sent you a friend request on FortDay` : `${name} invited you to their FortDay party`;
  const line = friend
    ? `${name} wants to be your friend on FortDay. Open the game and accept it in the Friends card on the Play screen.`
    : `${name} invited you to their party (room ${row.code}). The link joins their room while it's open; invites last 30 minutes.`;
  const button = friend ? 'Open FortDay' : 'Join the party';
  const foot = 'You get these emails because you have a FortDay account. Turn them off in the Friends card in the game.';
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;background:#0b1f4a;color:#f2f8ff;border-radius:14px">
  <div style="font-size:26px;font-weight:900;font-style:italic">FORT<span style="color:#6cc8ff">DAY</span></div>
  <p style="font-size:16px;line-height:1.5">${esc(line)}</p>
  <p><a href="${esc(link)}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#2f86ff;color:#fff;font-weight:700;text-decoration:none">${esc(button)}</a></p>
  <p style="font-size:12px;color:#a8c2ea">${esc(foot)}</p></div>`;

  try {
    await mailer.sendMail({ from: `FortDay <${GMAIL_USER}>`, to, subject, text: `${line}\n\n${button}: ${link}\n\n${foot}`, html });
  } catch (e) {
    console.error('send failed', e);
    await admin.from(table).update({ emailed_at: null }).eq('id', id);   // let a later call try again
    return reply(502, { error: 'Could not send the email' });
  }
  return reply(200, { sent: true });
});
