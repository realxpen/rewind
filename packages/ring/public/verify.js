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
