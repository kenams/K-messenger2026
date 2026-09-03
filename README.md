# K-ssenger

K-ssenger is an independent social messenger for presence-first private conversations, groups, Moments and opt-in location sharing.

## Vision

The product centers on human presence: seeing who is available, starting a real conversation quickly, sharing context, meeting up voluntarily and keeping social identity expressive without copying another brand.

## Product Pillars

- Contacts and rich presence
- Private chat and groups with a vetted E2EE protocol before any production E2EE claim
- K-Pulse as the signature attention interaction
- K-MAP for voluntary social location sharing
- Moments for ephemeral content
- Communities, groups and channels
- Customizable profile: handle, avatar, status and music

## K-MAP

K-MAP is an opt-in social map integrated into K-ssenger:

- one-time location share
- time-limited live location
- "Je viens vers toi" mode
- ETA and route
- "On se capte ?"
- Meet Mode
- groups / road trips
- Ghost Mode
- exact or approximate precision depending on contact-level privacy

Location is OFF by default. There is no hidden tracking and no permanent sharing.

## Security

- HTTPS/WSS in production
- server-side authentication and authorization
- no private-message plaintext in server logs, push payloads or database rows
- no server-side private E2EE key
- secure key storage on iOS/Android
- block and device revocation
- granular privacy controls

## Status

This repository is the reference workspace for consolidating K-ssenger mobile, server, product and UX work.

See `docs/PROJECT_STATE.md` for the current verified implementation state.
