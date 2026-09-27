-- Public, join-without-invite groups for the "Découvrir" discovery feed
-- (browse by interest category, tap "Rejoindre" to join instantly — no
-- owner/admin approval). Model stays exactly the group model that already
-- exists (public.conversations kind='group' + conversation_members): a
-- public group is just a group conversation with is_public=true, tagged
-- with a category. Real E2EE is untouched — joining still goes through the
-- same group_keys wrap-per-member flow as any other group membership
-- (see groupE2ee.ts / 0028_group_e2ee.sql), the server never sees the key.

alter table public.conversations
  add column if not exists is_public boolean not null default false;

alter table public.conversations
  add column if not exists category text;

alter table public.conversations
  drop constraint if exists conversations_category_check;
alter table public.conversations
  add constraint conversations_category_check
  check (category is null or char_length(category) between 1 and 40);

-- Only a group can be public/categorised; a direct conversation never is.
alter table public.conversations
  drop constraint if exists conversations_public_group_only_check;
alter table public.conversations
  add constraint conversations_public_group_only_check
  check (kind = 'group' or (is_public = false and category is null));

create index if not exists conversations_public_category_idx
  on public.conversations (category)
  where is_public = true;
