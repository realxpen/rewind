# Phase 12 — Submission Checklist

Hackathon: **Build, Ship, Shape: Amazon Developer Hackathon**  
Devpost slug: amazonappdev2026  
Deadline: **October 23, 2026 at 12:00 PM Pacific Time**  
Current official phase: submissions open.

## Repository

- [x] public GitHub repository: https://github.com/realxpen/rewind
- [x] visibility verified public
- [x] MIT license detected by GitHub
- [x] full source code present
- [x] setup instructions
- [x] actual Ring integration code
- [x] PSP open-source code/tests
- [x] Phase 11 reliability evidence
- [x] unrelated kitchen two-added-object regression preserved in tests/docs
- [x] judge-facing public demo URL

## Required repository documentation

- [x] README.md
- [x] docs/PRD.md
- [x] docs/ARCHITECTURE.md
- [x] docs/PHYSICAL_STATE_PROTOCOL.md
- [x] docs/RING_INTEGRATION.md
- [x] docs/ALEXA_MCP.md
- [x] docs/AWS_ARCHITECTURE.md
- [x] docs/PRIVACY.md
- [x] docs/TESTING.md
- [x] docs/DEMO_SCRIPT.md
- [x] docs/FRICTION_LOG.md
- [x] docs/PRODUCT_FEEDBACK.md
- [x] docs/SUBMISSION_CHECKLIST.md
- [x] docs/DEVPOST_SUBMISSION.md
- [x] docs/SCREENSHOTS.md

## Screenshots

- [ ] clean hero screenshot
- [ ] kitchen REWIND Voice “2 important changes” + first cup instruction screenshot
- [ ] kitchen second-step kettle instruction screenshot
- [ ] kitchen final-step stop screenshot if gallery space permits
- [ ] final REWIND Voice RESTORED screenshot
- [ ] Live Ring Playground proof screenshot
- [ ] architecture export
- [ ] PSP/open-source screenshot
- [ ] privacy review on every image

## Demo video

Devpost requires a public YouTube or Vimeo video, in English, under 3 minutes.

- [x] exact 2:40–2:50 recording script locked in docs/DEMO_SCRIPT.md
- [ ] record clean product footage
- [ ] show 2-change REWIND Voice result
- [ ] show first + second REWIND Voice restore instructions
- [ ] show partial verify
- [ ] show full REWIND Voice restored response
- [ ] briefly show actual Alexa Custom Skill integration
- [ ] show real Ring Playground integration
- [ ] show architecture
- [ ] show PSP/open-source contribution
- [ ] show AWS services
- [ ] remove loading/waiting
- [ ] verify duration under 3:00
- [ ] upload public
- [ ] add URL to Devpost

## Devpost project

Project: **REWIND** / rewind-vk4mdr

- [x] name
- [x] tagline
- [x] final project story drafted
- [x] technology stack drafted
- [x] repository link
- [x] public testing link
- [ ] video URL
- [ ] gallery screenshots
- [ ] thumbnail/cover

## Required human-confirmed fields

- [ ] Submitter Type
- [ ] Organization Name or N/A
- [ ] Country of Residence
- [ ] Canada province or N/A
- [x] Primary Track: Ring
- [x] repository URL
- [x] project status: New
- [x] AWS Builder: Yes
- [x] AWS Builder explanation
- [x] Open Source: Yes
- [x] Open Source direct contribution URL: https://github.com/realxpen/rewind/pull/21
- [x] Open Source project repository URL
- [x] GitHub username: realxpen
- [x] feature requests
- [x] friction log URL
- [x] testing link
- [x] feedback answers drafted
- [ ] age-of-majority checkbox — user must personally attest
- [ ] eligible-jurisdiction checkbox — user must personally attest
- [ ] employee checkbox — user must personally attest

## Track proof

### Ring

- [x] actual Ring technology in source
- [x] live simulator/Playground tested
- [ ] final video visibly shows Ring simulator/Playground

### AWS Builder

- [x] Bedrock/Nova
- [x] DynamoDB
- [x] Strands
- [x] AgentCore Memory
- [x] Lambda
- [x] documentation

### Open Source

- [x] MIT public repository
- [x] PSP schema/types/normalizer/diff/restore/tests/docs
- [x] public PSP contribution PR opened: https://github.com/realxpen/rewind/pull/21

## Final public checks

Run:

~~~bash
npm install
npm test
npm run build
~~~

Then verify repo opens logged out, LICENSE visible, diagrams render, live demo loads, no secrets are exposed, the deployment is tied to the intended Git commit, video plays logged out, duration is under 3:00, required Devpost fields are complete, and final status says Submitted rather than Draft.

## Gate

Phase 12 is not fully closed until public video, clean screenshots, human attestations, and final Devpost submission are complete.
