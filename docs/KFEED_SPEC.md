# K-Feed — Public vertical video feed

## Goal
K-Feed is a public, vertically scrollable video surface inside K-ssenger. Messaging and presence remain the core product; K-Feed adds public discovery without turning private chats into public content.

## Publishing
Users can upload short videos with caption, thumbnail, age rating and sensitivity metadata. New uploads start in `pending` moderation state. Public distribution requires an approved/limited state according to moderation rules.

## Age model
Birth date is collected during onboarding or before first K-Feed access. The server derives eligibility from date of birth; clients must not be trusted to self-declare a current age on every request.

Initial content tiers:
- 13+: normal public content suitable for teens.
- 16+: stronger themes or mild violence.
- 18+: graphic violence or otherwise adult-limited material where distribution is legally/store-policy appropriate.

K-ssenger must not use a simple 'I am 18' button as the sole access control for restricted content in production. `age_assurance_level` distinguishes declared vs verified assurance so stronger mechanisms can be added where required.

## Sensitive/violent content
Graphic content is blurred/covered by default and never auto-revealed. The card displays a clear content warning before viewing. Users can keep sensitive content hidden globally.

Content that is illegal, exploitative, promotes serious harm, contains sexual content involving minors, or otherwise cannot be safely distributed is removed rather than hidden behind a disclaimer. A warning is not a moderation bypass.

## Feed actions
Like, comment, share, follow/contact, view profile, report, block, mute creator, and 'not interested'. Public comments and profiles are subject to moderation controls.

## Moderation
Report reasons include violence, sexual content, harassment, hate, dangerous acts, minor safety, spam, misinformation and other. Repeated/credible reports may temporarily limit distribution pending review.

Private E2EE messages are not scanned by the public-feed moderation pipeline. Public K-Feed content is server-hosted public UGC and can be moderated independently.

## Ranking/privacy
The ranking system should favor freshness, explicit interests and social relevance without using private message plaintext. Do not feed E2EE content into recommendation models. Provide controls to reset recommendations and reduce personalization.

## Accessibility
Sensitive-content warnings must be screen-reader friendly. Reduce Motion must disable aggressive transitions. Captions/subtitles should be supported before production launch.

## Release gate
Before enabling K-Feed publicly: real age-policy review, abuse/report workflow, blocking, moderation queue, upload validation, storage quotas, copyright/reporting flow, store-policy review, and load testing are required.
