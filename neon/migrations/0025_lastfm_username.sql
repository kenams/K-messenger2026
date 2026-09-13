-- Last.fm username was stored per-device (SecureStore/localStorage), so
-- "now playing" sync worked on the phone but not the web build for the same
-- account. Moving it onto the profile row makes it set-once, works-everywhere.
alter table public.profiles
  add column if not exists lastfm_username text;

alter table public.profiles
  add constraint profiles_lastfm_username_length check (lastfm_username is null or char_length(lastfm_username) <= 40);
