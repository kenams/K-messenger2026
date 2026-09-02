# K-MAP — Functional & Security Specification

## Goal

K-MAP is the social GPS layer of K-ssenger. It is not a public people-tracking map and must never expose location by default.

## Core actions

1. Share current location
2. Share live location for a selected duration
3. `Je viens vers toi`
4. `On se capte ?`
5. Choose / suggest a meeting point
6. Start a temporary group road-trip session
7. Enter Meet Mode
8. Enter Ghost Mode

## Privacy model

Location is OFF by default.

Every live share must define:
- owner user id
- allowed audience
- precision mode
- created_at
- expires_at
- revoked_at
- purpose

Audience examples:
- one contact
- selected contacts
- one group
- favorites

Never use `all users` as the default audience.

## Precision

### Precise
Coordinates suitable for navigation.

### Approximate
Server/client representation deliberately reduced to a coarse area. Exact coordinates must not be sent to unauthorized recipients merely to blur them in the UI.

## Ghost Mode

Ghost Mode immediately disables:
- K-MAP visibility
- active location shares
- ETA sharing
- Meet Mode visibility
- road-trip visibility

Ghost Mode must not silently change the user's normal chat presence status.

## Block behavior

Blocking another user must immediately:
- remove their access to current live location
- stop future K-MAP delivery
- prevent location requests
- prevent `On se capte ?`
- prevent route/ETA sharing
- prevent Wizz from K-MAP

Cached precise location for the blocked user must expire/evict as quickly as technically practical.

## Live share lifecycle

States:
- requested
- active
- paused
- expired
- revoked

A live share has a hard expiry. No infinite share in V1.

Suggested durations:
- 15 min
- 1 h
- 8 h

## Je viens vers toi

Sender explicitly chooses a destination/contact.
Recipient can see:
- sender display name
- current ETA
- optional route progress
- share expiration

Recipient cannot silently extend the share.

## On se capte ?

Flow:
1. Alice requests a meet session with Bob.
2. Bob accepts or declines.
3. Only after acceptance are locations used for the session.
4. App computes travel estimates.
5. App can suggest a midpoint / rendezvous location.
6. Both users can stop sharing independently.

## Meet Mode

Temporary opt-in status such as `Disponible pour sortir`.

Must include:
- explicit activation
- auto-expiration
- selectable audience
- approximate location by default

## Road Trip / Group mode

Temporary map session linked to a group/conversation.

Each member opts in individually.
Members can leave location sharing without leaving the chat group.

Show:
- opted-in members
- ETA to rendezvous/destination
- optional route progress

Do not expose silent background tracking to group admins.

## Navigation architecture

K-ssenger should integrate an existing mapping/routing stack instead of rebuilding a full Waze engine.

Keep an adapter interface so providers can be swapped:
- map renderer
- geocoding
- routing
- ETA
- traffic provider if later licensed/available

No provider API key with privileged scope should be shipped as a server secret inside the mobile app.

## Data minimization

Persist only what is necessary.
Avoid permanent location history in V1.
Prefer ephemeral/live location records with TTL/expiry.

Potential server entities:
- location_shares
- location_share_members
- meet_sessions
- meet_session_members
- trip_sessions

Do not create a long-term `location_history` table by default.

## Realtime events

Suggested events:
- location:share:start
- location:share:update
- location:share:pause
- location:share:stop
- location:share:expired
- location:request
- location:request:accept
- location:request:decline
- meet:request
- meet:accepted
- meet:declined
- meet:update
- meet:end
- trip:join
- trip:leave
- trip:update
- ghost:enabled

Every event must derive sender identity from authenticated socket/session context, never from a client-supplied user id.

## Security tests

Required negative cases:
- unauthorized user subscribes to a share
- blocked user requests location
- expired share still queried
- revoked share still receives socket updates
- Alice spoofs Bob as location owner
- Alice joins Charlie/Bob trip without membership
- approximate recipient receives exact coordinates
- invisible/ghost user leaks through auxiliary APIs
- stale push reveals precise location
- reconnect accidentally restarts revoked share

## UX safeguards

Whenever live location is active, show a persistent visible indicator with:
- who can see it
- remaining duration
- stop button

Never hide active GPS sharing in a settings submenu.
