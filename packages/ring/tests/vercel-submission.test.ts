import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile("public/index.html", "utf8");
const app = await readFile("public/app.js", "utf8");
const api = await readFile("api/[...path].ts", "utf8");
const vercel = JSON.parse(await readFile("vercel.json", "utf8")) as {
  git?: { deploymentEnabled?: boolean };
  outputDirectory?: string;
  functions?: Record<string, { maxDuration?: number }>;
};

assert.match(html, /Ctrl\+Z for reality/);
assert.match(html, /Image \+ REWIND Voice/);
assert.match(html, /Take photo/);
assert.match(html, /Analyze with Nova/);
assert.match(html, /semantic state only/i);
assert.match(html, /LIVE RING INTEGRATION PROOF/, "Public submission UI must visibly separate actual Live Ring evidence.");
assert.match(html, /Ring Developer Playground/, "Public submission UI must expose the Ring Playground proof mode.");
assert.match(html, /Ring.*WHEP.*Nova.*PSP/is, "Ring proof mode must describe the real Ring → WHEP → Nova → PSP path.");
assert.match(html, /npm run ring:preview/, "Ring proof mode must point to the existing secure local Ring console.");
assert.match(html, /http:\/\/127\.0\.0\.1:3002/, "Ring proof mode must launch the existing loopback Ring console for recording.");
assert.match(html, /uploaded photos prove the repeatable restoration loop/i, "Ring proof mode must preserve the photo-vs-live evidence boundary.");
assert.match(app, /function setDemoSource\(next\)/, "Public UI must switch explicitly between image and Live Ring evidence.");
assert.match(app, /demoSource = next === "ring" \? "ring" : "image"/, "Live Ring mode selection must be explicit.");
assert.doesNotMatch(html + app, /RING_ACCESS_TOKEN/, "The public browser UI must never request or embed the Ring bearer token.");
assert.match(app, /api\("observe"/);
assert.match(app, /capture="environment"|cameraInput/);
assert.match(html, /remember this room as desk baseline/i);
assert.match(api, /LATEST_OBSERVATION/);
assert.match(api, /persisted: "semantic-state-only"/);
assert.match(api, /alexa-relay/);
assert.match(api, /compareStates/);
assert.match(api, /buildRestorePlan/);
assert.match(api, /runPresenceAudit/);
assert.match(api, /mergeConsensusAbsences/);
assert.match(api, /"ABSENCE_CHECK"/);
assert.match(api, /"LOCALIZATION_CHECK"/);
assert.match(api, /relayAuthorized\(req\)/);
assert.doesNotMatch(api, /console\.info\("Alexa request"/);
assert.doesNotMatch(api, /notebook\.red|notebook\.turquoise/);
assert.match(api, /__rewind_runtime__:/);
assert.equal(vercel.git?.deploymentEnabled, true);
assert.equal(vercel.outputDirectory, "public");
assert.equal(vercel.functions?.["api/[...path].ts"]?.maxDuration, 60);

// Browser JS syntax remains valid.
new Function(app);

console.log("PASS Vercel submission contract: public photo UI + REWIND Voice + semantic-only persistence + Alexa relay + deterministic REWIND.");

const voiceApiSource = api;
assert.match(voiceApiSource, /path === "voice"/, "Submission runtime must expose REWIND Voice.");
assert.match(voiceApiSource, /handleWebVoice/, "REWIND Voice must have a dedicated server handler.");
assert.match(voiceApiSource, /computeResult\(checkpoint, observation/, "REWIND Voice must use the deterministic comparison path.");
assert.match(voiceApiSource, /parseWebVoiceCommand/, "REWIND Voice commands must be parsed explicitly.");
assert.match(voiceApiSource, /webVoiceKey/, "REWIND Voice must isolate browser voice sessions.");
assert.doesNotMatch(voiceApiSource, /notebook\.red|notebook\.turquoise/, "Production voice/runtime code must not hardcode demo objects.");
assert.match(html, /REWIND Voice/, "Public UI must expose REWIND Voice.");
assert.match(html, /External Alexa integration remains available/, "UI must distinguish REWIND Voice from the external Alexa integration.");
assert.match(app, /SpeechRecognition|webkitSpeechRecognition/, "Public UI must support browser microphone recognition when available.");
assert.match(app, /speechSynthesis/, "Public UI must speak REWIND Voice responses when available.");
assert.match(app, /api\("voice"/, "Public UI must call the dedicated REWIND Voice endpoint.");

assert.match(api, /reconcileTrackedEntityAliases/, "Production photo path must reconcile high-confidence tracked-key drift before deterministic DIFF.");
assert.match(api, /matchedCurrentKey/, "Presence audits must return the current candidate key for identity reconciliation.");
assert.match(api, /identityReconciliationCount/, "Observation responses should expose how many safe identity aliases were reconciled.");

assert.match(
  app,
  /mode === "rewind" && chosen\?\.name \? \{ checkpointName: chosen\.name \} : \{\}/,
  "Hidden rewind checkpoint names must never be sent during Remember mode.",
);
assert.match(
  api,
  /command === "remember"\s*\? transcriptCheckpointName/,
  "Remember commands must prefer the checkpoint name parsed from the user's transcript.",
);
assert.doesNotMatch(
  api,
  /const name = spokenName \|\| "desk baseline"/,
  "Remember must never silently fall back to an unrelated checkpoint name.",
);

assert.match(
  api,
  /That was the last pending step\./,
  "REWIND Voice must stop at the end of the pending action list instead of repeating the last action forever.",
);
assert.match(
  api,
  /const nextIndex = state\.actionIndex \+ 1;/,
  "Next-step navigation must advance explicitly through pending actions.",
);
assert.match(
  api,
  /const nextIndex = state\.actionIndex \+ 1;[\s\S]*?if \(nextIndex >= actions\.length\)[\s\S]*?That was the last pending step\.[\s\S]*?return;[\s\S]*?state\.actionIndex = nextIndex;/,
  "After the second action in a two-step plan, the next request must stop before advancing or repeating the last action.",
);
assert.doesNotMatch(
  api,
  /Math\.min\(state\.actionIndex \+ 1, actions\.length - 1\)/,
  "Next-step navigation must never clamp to the last action and repeat it forever.",
);

assert.match(api, /runAdditionAudit/, "Tracked comparison must run a dedicated generic new-object audit.");
assert.match(api, /OPEN_EXTRA_SCAN/, "New-object recall must include an independent open extra scan.");
assert.match(api, /CONTRASTIVE_EXTRA_SCAN/, "New-object recall must include an independent checkpoint-contrastive scan.");
assert.match(api, /mergeConsensusAdditions/, "Only consensus extra-object evidence may be merged into the current semantic state.");
assert.match(api, /additionAuditCount/, "Observation responses should expose consensus extra-object additions.");
assert.doesNotMatch(api, /cup\.blue|kettle\.red/, "Production addition audit must remain object-agnostic.");

assert.match(api, /runObservedCandidateAudit/, "Tracked comparison must classify the exact current candidate keys for extra-object status.");
assert.match(api, /CANDIDATE_IDENTITY_SCAN/, "Observed extras must have an independent identity-focused candidate audit.");
assert.match(api, /CANDIDATE_CONTRAST_SCAN/, "Observed extras must have an independent checkpoint-contrast candidate audit.");
assert.match(api, /applyConsensusObservedExtras/, "Only agreeing candidate audits may promote a current candidate to movable/present extra evidence.");
assert.match(api, /observedExtraConsensusCount/, "Observation responses should expose candidate-consensus promotions.");
