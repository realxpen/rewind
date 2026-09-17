# Photo identity anchoring

During an active Rewind session, fresh photo observations are now anchored to the server-owned saved checkpoint vocabulary before Nova observes the image.

The browser does not supply semantic truth. The preview server loads the checkpoint used by the active Rewind session, converts its trusted entity keys/categories into Nova tracked-entity hints, and asks Nova to preserve those identities when the corresponding objects are visible.

This reduces perception identity drift such as the same desk lamp being called `lamp.desk` in one observation and `lamp.main` in another. Deterministic TypeScript still performs the authoritative checkpoint comparison, restoration planning, and verification.

The checkpoint values themselves are not copied into the current observation. Nova must still report only what is visually supported by the fresh image.
