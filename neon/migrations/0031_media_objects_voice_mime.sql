-- Voice notes (feat "add voice notes", commit 5f4308e) added audio/m4a and
-- audio/webm to the application's mimeSchema (apps/server/src/mediaService.ts)
-- and to the client's SupportedMediaMime, but the original table check
-- constraint from 0010_media_objects.sql was never widened to match. Every
-- voice note since then has failed at the INSERT in prepareMediaUpload with
-- "new row for relation media_objects violates check constraint
-- media_objects_mime_type_check" — recording worked, the upload never even
-- got a signed URL. Root cause of "l'envoi ne part pas" on voice notes.
alter table public.media_objects drop constraint if exists media_objects_mime_type_check;
alter table public.media_objects add constraint media_objects_mime_type_check
  check (mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime','audio/m4a','audio/webm'));
