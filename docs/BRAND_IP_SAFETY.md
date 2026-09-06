# K-ssenger — Brand & IP safety guardrails

Status: release requirement for Premium V1.

K-ssenger is an independent product. It is not Microsoft, MSN Messenger, Windows Live Messenger, Skype, or an official continuation of any Microsoft product.

## Mandatory release rules

- Do not use Microsoft/MSN/Windows Live/Skype logos, icons, sounds, fonts, screenshots, animations, artwork, source assets, or other proprietary brand assets.
- Do not market K-ssenger as "MSN returns", "new MSN", "official", "licensed", "certified", or with wording that could imply Microsoft sponsorship, affiliation, approval, or authorship.
- Product name, developer identity, app icon, store listing, screenshots, sounds, notification effects, UI artwork, and promotional collateral must be original K-ssenger assets.
- Nostalgic interaction patterns may inspire product design, but identifiable Microsoft trade dress must not be copied pixel-for-pixel.
- User-facing feature names should use K-ssenger-native terminology rather than historical Microsoft feature branding. The attention interaction is named **K-Pulse** in release-facing copy. Legacy internal identifiers may remain temporarily during refactors but must not leak into store/public branding.
- Presence labels that are ordinary descriptive language (for example Online, Away, Busy, Offline) may be used as generic status descriptions, while their visual treatment remains original.
- No claim of production end-to-end encryption until a vetted native protocol is integrated and independently proven in supported clients.
- Before commercial launch, perform a professional trademark clearance search for the K-ssenger name/logo in the intended territories and relevant software/communications classes. A repository check is not a substitute for trademark counsel or an official clearance search.

## Public disclaimer

Where historical inspiration is discussed editorially, use neutral factual wording and make independence clear. Recommended disclaimer:

> K-ssenger is an independent messaging product and is not affiliated with, sponsored by, endorsed by, or produced by Microsoft.

Do not place Microsoft marks in the K-ssenger product name, logo, domain, social handles, or feature branding.

## Release gate

A release candidate must fail brand review if it contains copied third-party assets, misleading affiliation language, or public-facing legacy feature branding that has not been cleared.

References reviewed 2026-09-03: Microsoft Trademark and Brand Guidelines, Microsoft Windows app trademark/copyright guidance, Microsoft copyrighted-content permissions guidance, and INPI guidance on trademark validity/availability and likelihood of confusion. This document is an engineering/brand risk control, not legal advice.