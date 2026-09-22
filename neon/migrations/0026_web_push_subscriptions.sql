-- Extend push_subscriptions to also carry browser Web Push subscriptions
-- (no native app install required — the K-ssenger web build is the primary
-- surface right now). For platform='web', `expo_push_token` reuses its
-- existing unique/not-null column to hold the PushSubscription.endpoint URL
-- (it is just as unique per-device as a native token); the two new columns
-- hold the subscription's encryption keys, required to encrypt payloads
-- with the Web Push protocol.

alter table public.push_subscriptions
  add column if not exists web_p256dh text,
  add column if not exists web_auth text;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_platform_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_platform_check
  check (platform in ('android', 'ios', 'web'));

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_web_keys_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_web_keys_check
  check (platform <> 'web' or (web_p256dh is not null and web_auth is not null));
