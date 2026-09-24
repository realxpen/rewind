let activeRewindSessionId;
let lastVerifiedObservationId;
let motionCursor = 0;
let motionPollBusy = false;
let motionVerifyBusy = false;

function updateVerifyControls() {
  const panel = byId('verifyPanel');
  const button = byId('checkAgain');
  if (!panel || !button) return;
  panel.hidden = !activeRewindSessionId;
  button.disabled = !activeRewindSessionId || !latestObservationId || latestObservationId === lastVerifiedObservationId || observing || rewinding || motionVerifyBusy;
}

function applyVerificationResult(result, source) {
  renderRewind(result);
  byId('verifyState').textContent = result.state;
  byId('verifySummary').textContent = result.progress.restored
    ? `100% RESTORED — the current physical state matches the saved checkpoint.${source === 'motion' ? ' Verified after a signed Ring motion event.' : ''}`
    : `${result.progress.percentage}% restored · ${result.progress.remainingChanges} semantic difference(s) remain${result.progress.unknownChanges ? ` · ${result.progress.unknownChanges} uncertain` : ''}. Follow the remaining PENDING guidance, then ${source === 'motion' ? 'move again or use Check Again' : 'capture a fresh frame, observe with Nova, then Check Again'}.`;
  status(result.progress.restored
    ? `${result.checkpoint.name}: 100% RESTORED${source === 'motion' ? ' after Ring motion verification' : ''}.`
    : `${result.progress.percentage}% restored. ${result.progress.remainingChanges} difference(s) remain.`);
}

async function verifyObservation(observationId, source = 'manual') {
  const result = await api('rewind/verify', {
    spaceId: byId('space').value,
    observationId,
    rewindSessionId: activeRewindSessionId,
  });
  lastVerifiedObservationId = observationId;
  applyVerificationResult(result, source);
  return result;
}

byId('startRewind').onclick = async () => {
  if (!latestObservationId || !latestDiffCheckpointId || rewinding || !byId('space').reportValidity()) return;
  rewinding = true; controls(); status('Building a deterministic restoration plan…');
  try {
    const result = await api('rewind', {
      spaceId: byId('space').value,
      observationId: latestObservationId,
      checkpointId: latestDiffCheckpointId,
    });
    activeRewindSessionId = result.rewindSessionId;
    lastVerifiedObservationId = latestObservationId;
    renderRewind(result);
    byId('verifyState').textContent = result.state === 'RESTORED' ? 'RESTORED' : 'WAITING_FOR_CHANGE';
    byId('verifySummary').textContent = result.state === 'RESTORED'
      ? 'The scene already matches this checkpoint.'
      : 'Follow one or more guidance steps. Signed Ring motion can trigger verification automatically; Check Again remains available.';
    status(result.state === 'RESTORED' ? `${result.checkpoint.name} is already restored.` : `REWIND guidance ready: ${result.plan.actions.length} action(s).`);
  } catch (error) {
    activeRewindSessionId = undefined;
    lastVerifiedObservationId = undefined;
    hideRewind();
    status(error.message || 'Could not start Rewind.');
  } finally {
    rewinding = false;
    controls();
    updateVerifyControls();
  }
};

byId('checkAgain').onclick = async () => {
  if (!activeRewindSessionId || !latestObservationId || latestObservationId === lastVerifiedObservationId || !byId('space').reportValidity()) return;
  rewinding = true; controls(); updateVerifyControls(); status('Checking restoration progress against the saved checkpoint…');
  try {
    await verifyObservation(latestObservationId, 'manual');
  } catch (error) {
    status(error.message || 'Could not verify Rewind progress.');
  } finally {
    rewinding = false;
    controls();
    updateVerifyControls();
  }
};

async function frameForMotionVerification() {
  if (!peer || video.readyState < 2 || !video.videoWidth) throw new Error('Live Ring video is not ready for motion verification.');
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1280 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .88));
  if (!blob) throw new Error('Could not capture a Ring frame after motion.');
  const image = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return { image, capturedAt: new Date().toISOString() };
}

async function verifyFromMotion(event) {
  if (!activeRewindSessionId || motionVerifyBusy || observing || rewinding || !byId('space').reportValidity()) return;
  if (!peer || video.readyState < 2 || !video.videoWidth) {
    status('Signed Ring motion received. Live video is not ready, so use Check Again after a fresh observation.');
    return;
  }

  motionVerifyBusy = true;
  observing = true;
  controls();
  updateVerifyControls();
  byId('verifyState').textContent = 'MOTION_DETECTED';
  byId('verifySummary').textContent = `Signed Ring motion received (${event.subType || 'motion'}). Waiting briefly for the scene to settle, then verifying automatically…`;
  status('Signed Ring motion received. Preparing automatic verification…');

  try {
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (!activeRewindSessionId) return;
    const frame = await frameForMotionVerification();
    const observation = await api('observe', {
      image: frame.image,
      capturedAt: frame.capturedAt,
      spaceId: byId('space').value,
    });
    latestObservationId = observation.observationId;
    await verifyObservation(latestObservationId, 'motion');
  } catch (error) {
    byId('verifyState').textContent = 'WAITING_FOR_CHANGE';
    byId('verifySummary').textContent = 'Automatic motion verification did not complete. Capture/observe a fresh frame and use Check Again; the fallback remains available.';
    status(error.message || 'Motion verification failed. Use Check Again.');
  } finally {
    observing = false;
    motionVerifyBusy = false;
    controls();
    updateVerifyControls();
  }
}

async function pollMotionEvents() {
  if (motionPollBusy) return;
  motionPollBusy = true;
  try {
    const response = await fetch(`http://${location.hostname}:3003/events?cursor=${motionCursor}`, { cache: 'no-store' });
    if (!response.ok) return;
    const result = await response.json();
    if (Number.isSafeInteger(result.cursor)) motionCursor = result.cursor;
    const motionEvents = Array.isArray(result.events)
      ? result.events.filter(event => event && event.type === 'motion_detected')
      : [];
    if (motionEvents.length && activeRewindSessionId) {
      await verifyFromMotion(motionEvents[motionEvents.length - 1]);
    }
  } catch {
    // Phase 7 ingress is optional during local/manual operation. Never break Check Again.
  } finally {
    motionPollBusy = false;
  }
}

byId('space').addEventListener('change', () => {
  activeRewindSessionId = undefined;
  lastVerifiedObservationId = undefined;
  byId('verifyPanel').hidden = true;
});

setInterval(updateVerifyControls, 250);
setInterval(() => void pollMotionEvents(), 1500);
updateVerifyControls();
void pollMotionEvents();

/* Phase 12 focused Demo Mode. Presentation only; deterministic services retain authority. */
(() => {
  const el = id => document.getElementById(id);
  const focusCard = el('focusCard');
  const focusStage = el('focusStage');
  const focusTitle = el('focusTitle');
  const focusMetric = el('focusMetric');
  const focusSummary = el('focusSummary');
  const focusList = el('focusList');
  const focusPrimary = el('focusPrimary');
  const focusHint = el('focusHint');
  const demoMount = el('demoToolbarMount');
  const controlledPanel = el('controlledDemoPanel');
  const liveDetails = el('liveRingDetails');
  const advancedDetails = el('advancedDetails');

  if (!focusCard || !focusPrimary) return;
  if (controlledPanel && demoMount && controlledPanel.parentElement !== demoMount) demoMount.append(controlledPanel);

  const style = document.createElement('style');
  style.textContent = `
    .app{max-width:1180px!important;padding-left:22px!important;padding-right:22px!important}
    #demoToolbarMount{margin-bottom:12px}
    .controlled-demo-panel{padding:12px 14px!important;border-radius:15px!important;box-shadow:none!important;background:rgba(14,20,29,.8)!important}
    .controlled-demo-panel .section-head{margin-bottom:9px!important;align-items:center!important}
    .controlled-demo-panel .section-head h2{font-size:12px!important}
    .controlled-demo-panel .section-head p{display:none!important}
    .demo-disclosure{font-size:9px!important;padding:5px 7px!important}
    .source-switch{max-width:420px;margin:0!important}
    #controlledDemoBody{margin-top:9px!important}
    .demo-warning{padding:8px 10px!important;gap:8px!important;font-size:10px!important}
    .scenario-grid{gap:6px!important;margin-top:8px!important}
    .scenario-button{padding:8px 10px!important;border-radius:10px!important}
    .scenario-button span{font-size:8px!important}.scenario-button strong{font-size:11px!important}.scenario-button small{font-size:9px!important}
    .demo-actions{margin-top:7px!important}.demo-actions button{display:none!important}.demo-actions .muted{margin-left:0!important;font-size:10px!important}
    .demo-route{display:none!important}
    .demo-hint{display:none!important}
    #advancedDetails .prompt-suggestions{margin-bottom:8px}
    #advancedDetails #result{max-height:320px;overflow:auto}
    #advancedDetails .diff-list li p,#advancedDetails .restore-list li p{margin:5px 0}
    @media(max-width:640px){.app{padding-left:11px!important;padding-right:11px!important}.demo-disclosure{display:none!important}}
  `;
  document.head.append(style);

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function cleanEntity(value) {
    return String(value || 'Item')
      .split('·')[0]
      .trim()
      .replace(/[._-]+/g, ' ')
      .replace(/\bmain\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  function setItems(items) {
    const nodes = items.slice(0, 6).map(item => {
      const li = document.createElement('li');
      li.textContent = item.text;
      if (item.state) li.className = item.state;
      return li;
    });
    if (!nodes.length) {
      const li = document.createElement('li');
      li.className = 'current';
      li.textContent = 'REWIND is ready.';
      nodes.push(li);
    }
    focusList.replaceChildren(...nodes);
  }

  function setPrimary(label, action, disabled = false) {
    setText(focusPrimary, label);
    focusPrimary.dataset.action = action;
    focusPrimary.disabled = disabled;
  }

  function percentage() {
    const verifyText = el('verifySummary')?.textContent || '';
    const verified = verifyText.match(/(\d+)%/);
    if (verified) return Number(verified[1]);
    const score = el('matchScore')?.textContent?.match(/(\d+)%/);
    return score ? Number(score[1]) : undefined;
  }

  function diffItems() {
    return [...document.querySelectorAll('#diffList li')].map(item => {
      const type = item.querySelector('.diff-type')?.textContent?.trim() || '';
      const entity = cleanEntity(item.querySelector('strong')?.textContent || item.textContent);
      const suffix = type === 'MOVED' ? 'moved'
        : type === 'REMOVED' ? 'missing'
        : type === 'ADDED' ? 'added'
        : type === 'ATTRIBUTE_CHANGED' ? 'changed'
        : type === 'UNKNOWN' ? 'needs another look'
        : 'changed';
      return { text: `${entity} — ${suffix}` };
    });
  }

  function rewindItems() {
    return [...document.querySelectorAll('#rewindList li')].map(item => {
      const instruction = item.querySelector('strong')?.textContent?.trim() || item.textContent.trim();
      const meta = item.querySelector('.muted')?.textContent || '';
      const statusMatch = meta.match(/Status:\s*([A-Z_]+)/i);
      const state = statusMatch?.[1]?.toUpperCase() === 'VERIFIED' ? 'done' : '';
      return { text: instruction, state };
    });
  }

  function refreshFocus() {
    const source = document.body.dataset.observationSource || 'ring';
    const verifyPanel = el('verifyPanel');
    const rewindPanel = el('rewindPanel');
    const diffPanel = el('diffPanel');
    const verifyState = el('verifyState')?.textContent?.trim();
    const currentPercentage = percentage();

    if (verifyState === 'RESTORED' && currentPercentage === 100) {
      setText(focusStage, 'VERIFY');
      setText(focusTitle, '100% RESTORED');
      setText(focusMetric, '100%');
      setText(focusSummary, 'Reality matches the saved checkpoint. All deterministic restoration checks passed.');
      setItems([{ text: 'Verification complete', state: 'done' }, { text: 'No unresolved semantic differences remain', state: 'done' }]);
      setPrimary('Done', 'done');
      setText(focusHint, 'Restoration truth came from deterministic verification.');
      return;
    }

    if ((verifyPanel && !verifyPanel.hidden) || (rewindPanel && !rewindPanel.hidden)) {
      const actions = rewindItems();
      const verifiedCount = actions.filter(action => action.state === 'done').length;
      const pending = actions.filter(action => action.state !== 'done');
      const pct = Number.isFinite(currentPercentage) ? currentPercentage : 0;
      setText(focusStage, verifyPanel && !verifyPanel.hidden ? 'VERIFY' : 'REWIND');
      setText(focusTitle, pct > 0 ? `${pct}% restored` : 'Rewind in progress');
      setText(focusMetric, `${pct}%`);
      setText(focusSummary, actions.length
        ? `${verifiedCount} of ${actions.length} fixed.${pending[0] ? ` Next: ${pending[0].text}` : ''}`
        : 'Follow the deterministic restoration guidance, then verify again.');
      setItems(actions.map((action, index) => ({ ...action, state: action.state || (index === verifiedCount ? 'current' : '') })));
      const checkAgain = el('checkAgain');
      setPrimary('Check Again', 'verify', Boolean(checkAgain?.disabled));
      setText(focusHint, checkAgain?.disabled
        ? 'In Controlled Demo, choose Partial or Restored above after making progress.'
        : 'Capture the new state and recompute restoration progress.');
      return;
    }

    if (diffPanel && !diffPanel.hidden) {
      const changes = diffItems();
      const pct = Number.isFinite(currentPercentage) ? currentPercentage : 0;
      const coverage = Number(el('matchScore')?.dataset.coverage || 100);
      setText(focusStage, 'DIFF');
      setText(focusTitle, `${changes.length} ${changes.length === 1 ? 'thing' : 'things'} changed`);
      setText(focusMetric, coverage < 100 ? `${pct}% MATCH · ${coverage}% COVERED` : `${pct}% MATCH`);
      setText(focusSummary, el('diffSummary')?.textContent || 'The saved checkpoint and current physical state differ. These results come from deterministic comparison.');
      setItems(changes);
      const startRewind = el('startRewind');
      setPrimary('Start Rewind', 'rewind', Boolean(startRewind?.disabled || startRewind?.hidden));
      setText(focusHint, 'REWIND will turn these differences into an ordered restoration plan.');
      return;
    }

    const compareControlled = el('compareControlledBaseline');
    if (source === 'demo' && compareControlled && !compareControlled.disabled) {
      setText(focusStage, 'DIFF');
      setText(focusTitle, 'Ready to compare');
      setText(focusMetric, 'READY');
      setText(focusSummary, 'Choose Messy above, then compare the current controlled state with Demo Ready.');
      setItems([{ text: 'Demo Ready checkpoint saved', state: 'done' }, { text: 'Load Messy and compare', state: 'current' }]);
      setPrimary('Compare current state', 'compare-demo');
      setText(focusHint, 'Controlled Demo uses server-owned validated semantic fixtures, not live camera truth.');
      return;
    }

    if (source === 'demo') {
      setText(focusStage, 'SAVE');
      setText(focusTitle, 'Save your clean setup');
      setText(focusMetric, 'READY');
      setText(focusSummary, 'Save Demo Ready as the semantic checkpoint for this restoration run.');
      setItems([{ text: 'Controlled Demo — validated semantic fixtures', state: 'current' }, { text: 'No arbitrary browser-supplied state is accepted' }]);
      setPrimary('Save this state', 'save-demo');
      setText(focusHint, 'Controlled Demo is clearly separated from live camera evidence.');
      return;
    }

    if (latestObservationId && el('savePanel') && !el('savePanel').hidden) {
      setText(focusStage, 'SAVE');
      setText(focusTitle, 'Semantic state ready');
      setText(focusMetric, 'READY');
      setText(focusSummary, 'Nova produced a validated physical-state observation. Save it as a checkpoint.');
      setItems([{ text: 'Live frame captured', state: 'done' }, { text: 'Nova semantic state validated', state: 'done' }, { text: 'Save checkpoint', state: 'current' }]);
      setPrimary('Save this state', 'save-live', Boolean(el('saveCheckpoint')?.disabled));
      setText(focusHint, 'Raw footage is not persisted by the checkpoint flow.');
      return;
    }

    if (el('snapshot') && !el('snapshot').hidden && !latestObservationId) {
      setText(focusStage, 'SAVE');
      setText(focusTitle, 'Frame captured');
      setText(focusMetric, 'OBSERVE');
      setText(focusSummary, 'Send this ephemeral frame to Nova to extract validated semantic state.');
      setItems([{ text: 'Live frame captured', state: 'done' }, { text: 'Observe with Nova', state: 'current' }]);
      setPrimary('Observe with Nova', 'observe', Boolean(el('observe')?.disabled));
      setText(focusHint, 'The image stays ephemeral; the semantic state is what REWIND remembers.');
      return;
    }

    if (videoReady() && el('capture') && !el('capture').disabled) {
      setText(focusStage, 'SAVE');
      setText(focusTitle, 'Live camera connected');
      setText(focusMetric, 'LIVE');
      setText(focusSummary, 'Capture the current frame to create a semantic checkpoint.');
      setItems([{ text: 'Live camera connected', state: 'done' }, { text: 'Capture current state', state: 'current' }]);
      setPrimary('Capture current state', 'capture');
      setText(focusHint, 'The selected live source is real camera evidence.');
      return;
    }

    setText(focusStage, 'SAVE');
    setText(focusTitle, 'Save your clean setup');
    setText(focusMetric, 'READY');
    setText(focusSummary, 'Choose Ring or Camera / Phone above, start the live view, then save the physical state you want to return to.');
    setItems([{ text: 'Choose an observation source', state: 'current' }, { text: 'AI observes. Deterministic code decides.' }]);
    const canStart = el('start') && !el('start').disabled;
    setPrimary(canStart ? 'Start live camera' : 'Choose live camera', canStart ? 'start-live' : 'open-live');
    setText(focusHint, 'Controlled Demo and engineering tools are available under Advanced.');
  }

  function runAction(action) {
    if (action === 'open-live') {
      if (liveDetails) liveDetails.open = true;
      liveDetails?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (action === 'start-live') el('start')?.click();
    else if (action === 'capture') el('capture')?.click();
    else if (action === 'observe') el('observe')?.click();
    else if (action === 'save-live') el('saveCheckpoint')?.click();
    else if (action === 'save-demo') el('saveControlledBaseline')?.click();
    else if (action === 'compare-demo') el('compareControlledBaseline')?.click();
    else if (action === 'rewind') el('startRewind')?.click();
    else if (action === 'verify') el('checkAgain')?.click();
    else if (action === 'done') el('dismissCompletion')?.click();
  }

  focusPrimary.addEventListener('click', () => runAction(focusPrimary.dataset.action));

  const observed = [
    el('status'), el('diffPanel'), el('diffList'), el('matchScore'), el('rewindPanel'), el('rewindList'),
    el('verifyPanel'), el('verifySummary'), el('verifyState'), el('progressValue'), el('snapshot'), el('savePanel'),
    el('start'), el('capture'), el('observe'), el('saveCheckpoint'), el('checkAgain'), controlledPanel,
  ].filter(Boolean);
  const observer = new MutationObserver(() => refreshFocus());
  for (const node of observed) observer.observe(node, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'class'] });

  document.querySelectorAll('[data-source],[data-scenario],[data-source-choice]').forEach(button => button.addEventListener('click', () => setTimeout(refreshFocus, 0)));
  el('saveControlledBaseline')?.addEventListener('click', () => setTimeout(refreshFocus, 0));
  el('compareControlledBaseline')?.addEventListener('click', () => setTimeout(refreshFocus, 0));

  // Keep the primary story in view even when legacy evidence panels call scrollIntoView.
  let lastStage = '';
  const stageObserver = new MutationObserver(() => {
    const stage = focusStage?.textContent || '';
    if (stage && stage !== lastStage) {
      lastStage = stage;
      requestAnimationFrame(() => focusCard.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  });
  if (focusStage) stageObserver.observe(focusStage, { childList: true, characterData: true, subtree: true });

  if (advancedDetails) advancedDetails.open = false;
  if (liveDetails) liveDetails.open = false;
  refreshFocus();
  setInterval(refreshFocus, 500);
})();
