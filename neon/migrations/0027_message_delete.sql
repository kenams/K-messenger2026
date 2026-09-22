-- "Delete for everyone": the sender can wipe a message's content after the
-- fact (mis-sends happen). Content columns are actually cleared server-side
-- rather than just flagged — deleted_at alone would leave the ciphertext
-- sitting in the DB forever, defeating the point.

alter table public.messages
  add column if not exists deleted_at timestamptz;
