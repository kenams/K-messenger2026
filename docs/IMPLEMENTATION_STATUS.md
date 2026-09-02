# Implementation status

## Implemented on `bootstrap/platform`

- Monorepo baseline
- Node.js + TypeScript + Socket.IO server
- Supabase JWT socket authentication
- Conversation membership authorization
- Active-device ownership/revocation check
- Strict ciphertext-only message DTO validation
- Server-side encrypted-message persistence with clientMessageId idempotency
- Message/conversation/presence rate limiting
- Sensitive log redaction (tokens, keys, ciphertext, precise GPS)
- Helmet/CORS/body-size/socket buffer hardening
- Core Supabase schema and RLS draft
- K-MAP schema/policies baseline
- Security unit tests
- GitHub Actions CI baseline
- Agent-Kah import procedure

## Deliberately not claimed complete

- Production E2EE session protocol on Android/iOS
- Secure native key storage verified on physical devices
- Full mobile UI
- Push
- encrypted attachments
- calls
- groups
- complete K-MAP client
- Moments/Communities
- store builds/review

## Critical next integration

Import Agent-Kah local commits before duplicating mobile/crypto work. Then run server tests/typecheck and resolve any conflicts. Authentication/authorization remains the first release gate.
