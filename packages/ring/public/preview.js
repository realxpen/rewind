const byId = id => document.getElementById(id);
const video = byId('video');
const status = message => { byId('status').textContent = message; };
let peer, sessionId, heartbeat, frameUrl, frameBlob, capturedAt, latestObservationId, latestDiffCheckpointId, pending = false, observing = false, saving = false, comparing = false, rewinding = false;

async function api(path, data) {
  const response = await fetch(`/api/${path}`, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
function controls() {
  byId('start').disabled = pending || Boolean(peer || sessionId) || !byId('devices').value;
  byId('stop').disabled = pending || !Boolean(peer || sessionId);
  byId('devices').disabled = pending || Boolean(peer || sessionId);
  byId('reload').disabled = pending || Boolean(peer || sessionId);
  byId('capture').disabled = pending || observing || !peer || video.readyState < 2 || !video.videoWidth;
  byId('saveCheckpoint').disabled = saving || observing || !latestObservationId;
  document.querySelectorAll('[data-compare-checkpoint]').forEach(button => {
    button.disabled = comparing || observing || rewinding || !latestObservationId;
  });
  byId('startRewind').disabled = rewinding || comparing || observing || !latestObservationId || !latestDiffCheckpointId;
}
function hideRewind() {
  byId('rewindPanel').hidden = true;
  byId('rewindList').replaceChildren();
}
function hideDiff() {
  latestDiffCheckpointId = undefined;
  byId('diffPanel').hidden = true;
  byId('diffList').replaceChildren();
  byId('startRewind').hidden = true;
  hideRewind();
}
function describeSnapshot(snapshot) {
  if (!snapshot) return '';
  const parts = [];
  if (snapshot.relations?.length) parts.push(snapshot.relations.map(r => `${r.type}${r.target ? ` ${r.target}` : ''}`).join(', '));
  if (snapshot.attributes && Object.keys(snapshot.attributes).length) parts.push(Object.entries(snapshot.attributes).map(([key, value]) => `${key}=${String(value)}`).join(', '));
  return parts.join(' · ');
}
function renderDiff(result) {
  latestDiffCheckpointId = result.checkpoint.id;
  byId('diffTitle').textContent = `Compared with ${result.checkpoint.name}`;
  byId('matchScore').textContent = `${result.match.percentage}%`;
  byId('diffSummary').textContent = result.changeCount === 0
    ? 'No meaningful differences remain. This scene matches the checkpoint.'
    : `${result.changeCount} meaningful ${result.changeCount === 1 ? 'change' : 'changes'} detected. ${result.match.unknown ? `${result.match.unknown} uncertain.` : ''}`;
  const items = result.changes.map(change => {
    const item = document.createElement('li');
    if (change.type === 'UNKNOWN') item.className = 'unknown';
    const type = document.createElement('span'); type.className = 'diff-type'; type.textContent = change.type;
    const title = document.createElement('strong'); title.textContent = `${change.entity} · ${change.category}`;
    const reason = document.createElement('p'); reason.textContent = change.reason;
    const expected = describeSnapshot(change.expected);
    const actual = describeSnapshot(change.actual);
    const detail = document.createElement('span'); detail.className = 'muted';
    detail.textContent = [expected ? `Expected: ${expected}` : '', actual ? `Current: ${actual}` : '', `Confidence: ${Math.round(change.confidence * 100)}%`].filter(Boolean).join(' · ');
    item.append(type, title, reason, detail);
    return item;
  });
  if (!items.length) {
    const item = document.createElement('li'); item.className = 'muted'; item.textContent = 'MATCH — no unresolved semantic differences.'; items.push(item);
  }
  byId('diffList').replaceChildren(...items);
  byId('startRewind').hidden = result.match.restored;
  hideRewind();
  byId('diffPanel').hidden = false;
  controls();
  byId('diffPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderRewind(result) {
  byId('rewindTitle').textContent = `Rewind to ${result.checkpoint.name}`;
  byId('rewindState').textContent = result.state;
  byId('rewindSummary').textContent = result.state === 'RESTORED'
    ? 'The current scene already matches this checkpoint.'
    : result.plan.actions.length
      ? `${result.plan.actions.length} deterministic restoration ${result.plan.actions.length === 1 ? 'step' : 'steps'} ready.${result.plan.blockedUnknowns.length ? ` ${result.plan.blockedUnknowns.length} uncertain item(s) need re-observation.` : ''}`
      : 'No safe deterministic action can be generated until uncertain items are observed again.';
  const items = result.plan.actions.map((action, index) => {
    const item = document.createElement('li');
    const step = document.createElement('span'); step.className = 'restore-step'; step.textContent = `STEP ${index + 1} · ${action.sourceTypes.join(', ')}`;
    const instruction = document.createElement('strong'); instruction.textContent = action.instruction;
    const verification = document.createElement('p'); verification.textContent = action.verificationHint;
    const meta = document.createElement('span'); meta.className = 'muted'; meta.textContent = `Confidence: ${Math.round(action.confidence * 100)}% · Status: ${action.status}`;
    item.append(step, instruction, verification, meta);
    return item;
  });
  for (const entity of result.plan.blockedUnknowns) {
    const item = document.createElement('li'); item.className = 'unknown';
    const step = document.createElement('span'); step.className = 'restore-step'; step.textContent = 'UNCERTAIN';
    const instruction = document.createElement('strong'); instruction.textContent = `Re-observe ${entity} before acting.`;
    const meta = document.createElement('span'); meta.className = 'muted'; meta.textContent = 'REWIND will not invent a restoration action for low-confidence state.';
    item.append(step, instruction, meta); items.push(item);
  }
  if (!items.length) {
    const item = document.createElement('li'); item.className = 'muted'; item.textContent = 'No restoration actions required.'; items.push(item);
  }
  byId('rewindList').replaceChildren(...items);
  byId('rewindPanel').hidden = false;
  byId('rewindPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function compareCheckpoint(checkpointId) {
  if (!latestObservationId || comparing || !byId('space').reportValidity()) return;
  comparing = true; controls(); status('Comparing the current physical state with the saved checkpoint…');
  try {
    const result = await api('diff', {
      spaceId: byId('space').value,
      observationId: latestObservationId,
      checkpointId,
    });
    renderDiff(result);
    status(result.match.restored ? `${result.checkpoint.name} matches the current scene.` : `${result.changeCount} meaningful changes found. Start Rewind when ready.`);
  } catch (error) {
    hideDiff(); status(error.message || 'Could not compare the current state.');
  } finally { comparing = false; controls(); }
}
async function startRewind() {
  if (!latestObservationId || !latestDiffCheckpointId || rewinding || !byId('space').reportValidity()) return;
  rewinding = true; controls(); status('Building a deterministic restoration plan…');
  try {
    const result = await api('rewind', {
      spaceId: byId('space').value,
      observationId: latestObservationId,
      checkpointId: latestDiffCheckpointId,
    });
    renderRewind(result);
    status(result.state === 'RESTORED' ? `${result.checkpoint.name} is already restored.` : `REWIND guidance ready: ${result.plan.actions.length} action(s).`);
  } catch (error) {
    hideRewind(); status(error.message || 'Could not start Rewind.');
  } finally { rewinding = false; controls(); }
}
function checkpointItem(checkpoint) {
  const item = document.createElement('li');
  const title = document.createElement('strong');
  title.textContent = checkpoint.name;
  const meta = document.createElement('span');
  meta.className = 'muted';
  meta.textContent = `${checkpoint.entityCount} entities · ${new Date(checkpoint.createdAt).toLocaleString()} · ${checkpoint.stateHash.slice(0, 10)}`;
  const actions = document.createElement('div'); actions.className = 'checkpoint-actions';
  const compare = document.createElement('button');
  compare.textContent = 'Compare current state'; compare.dataset.compareCheckpoint = checkpoint.id;
  compare.disabled = !latestObservationId;
  compare.onclick = () => compareCheckpoint(checkpoint.id);
  actions.append(compare); item.append(title, meta, actions);
  return item;
}
async function refreshCheckpoints() {
  const space = byId('space').value;
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(space)) return;
  byId('refreshCheckpoints').disabled = true;
  try {
    const checkpoints = await api(`checkpoints?spaceId=${encodeURIComponent(space)}`);
    byId('checkpoints').replaceChildren(...(checkpoints.length
      ? checkpoints.map(checkpointItem)
      : [Object.assign(document.createElement('li'), { className: 'muted', textContent: 'No saved checkpoints for this space.' })]));
  } catch (error) {
    byId('checkpoints').replaceChildren(Object.assign(document.createElement('li'), { className: 'muted', textContent: error.message }));
  } finally { byId('refreshCheckpoints').disabled = false; controls(); }
}
async function discover() {
  pending = true; controls(); status('Discovering devices…');
  try {
    const devices = await api('devices');
    byId('devices').replaceChildren(...devices.map(device => {
      const option = document.createElement('option'); option.value = device.id; option.textContent = device.name; return option;
    }));
    status(devices.length ? 'Camera ready. Start live view.' : 'No Ring devices found.');
    await refreshCheckpoints();
  } catch (error) { status(error.message); }
  finally { pending = false; controls(); }
}
async function stop() {
  clearInterval(heartbeat);
  if (peer) { peer.onconnectionstatechange = null; peer.close(); peer = undefined; }
  video.srcObject = null;
  if (sessionId) {
    await api('stop', { id: sessionId });
    sessionId = undefined;
  }
}
function gatherIce(pc) {
  return new Promise(resolve => {
    const timer = setTimeout(() => { cleanup(); resolve(); }, 3_000);
    const check = () => { if (pc.iceGatheringState === 'complete') { cleanup(); resolve(); } };
    const cleanup = () => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', check); };
    pc.addEventListener('icegatheringstatechange', check); check();
  });
}
async function waitForVideo() {
  const deadline = Date.now() + 25_000;
  while (video.readyState < 2 || !video.videoWidth) {
    if (Date.now() > deadline) throw new Error('No video frame arrived. Check the camera or try again.');
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}
byId('start').onclick = async () => {
  pending = true; controls(); status('Connecting to Ring…');
  try {
    peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
    const stream = new MediaStream(); video.srcObject = stream;
    peer.ontrack = event => { stream.addTrack(event.track); video.play().catch(() => {}); };
    peer.addTransceiver('audio', { direction: 'sendrecv' });
    peer.addTransceiver('video', { direction: 'recvonly' });
    await peer.setLocalDescription(await peer.createOffer());
    await gatherIce(peer);
    const session = await api('start', { deviceId: byId('devices').value, offer: peer.localDescription.sdp });
    sessionId = session.id;
    heartbeat = setInterval(() => api('heartbeat', { id: sessionId }).catch(() => status('Session contact lost. Stop and reconnect.')), 15_000);
    await peer.setRemoteDescription({ type: 'answer', sdp: session.answer });
    await waitForVideo();
    peer.onconnectionstatechange = () => {
      if (peer?.connectionState === 'failed') {
        void stop().then(() => status('Connection lost. Start again.')).catch(() => status('Connection lost; click Stop to retry cleanup.')).finally(controls);
      }
    };
    status('Live video connected. You can capture a frame.');
  } catch (error) {
    try { await stop(); status(error.message); }
    catch { status(`${error.message} Session cleanup failed; click Stop to retry.`); }
  } finally { pending = false; controls(); }
};
byId('stop').onclick = async () => {
  pending = true; controls();
  try { await stop(); status('Stream stopped.'); }
  catch (error) { status(error.message + ' Click Stop to retry cleanup.'); }
  finally { pending = false; controls(); }
};
function discard() {
  if (frameUrl) URL.revokeObjectURL(frameUrl);
  frameUrl = frameBlob = capturedAt = latestObservationId = latestDiffCheckpointId = undefined;
  byId('frame').removeAttribute('src'); byId('download').removeAttribute('href');
  byId('snapshot').hidden = true; byId('result').hidden = true; byId('result').textContent = '';
  byId('savePanel').hidden = true; hideDiff(); controls(); void refreshCheckpoints();
}
byId('capture').onclick = async () => {
  if (video.readyState < 2 || !video.videoWidth) return;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1280 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const time = new Date().toISOString();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .88));
  if (!blob) { status('Could not capture the video frame. Try again.'); return; }
  discard(); frameBlob = blob; capturedAt = time; frameUrl = URL.createObjectURL(blob);
  byId('frame').src = frameUrl; byId('download').href = frameUrl;
  byId('captureTime').textContent = `Captured ${new Date(time).toLocaleString()}`;
  byId('snapshot').hidden = false; status('Frame captured. Review it before sending to Nova.');
};
byId('observe').onclick = async () => {
  if (!frameBlob) return;
  if (!byId('space').reportValidity()) return;
  observing = true; controls(); byId('observe').disabled = true; byId('discard').disabled = true;
  byId('result').hidden = true; byId('savePanel').hidden = true; latestObservationId = latestDiffCheckpointId = undefined; hideDiff(); status('Nova is observing the captured frame…');
  try {
    const image = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(frameBlob);
    });
    const result = await api('observe', { image, capturedAt, spaceId: byId('space').value });
    latestObservationId = result.observationId;
    byId('result').textContent = JSON.stringify(result, null, 2); byId('result').hidden = false; byId('savePanel').hidden = false;
    await refreshCheckpoints();
    status('Observation validated. Save it or compare the current state with a checkpoint.');
  } catch (error) { status(error.message || 'Could not read the frame.'); }
  finally { observing = false; controls(); byId('observe').disabled = false; byId('discard').disabled = false; }
};
byId('saveCheckpoint').onclick = async () => {
  if (!latestObservationId || !byId('space').reportValidity() || !byId('checkpointName').reportValidity()) return;
  saving = true; controls(); status('Saving semantic checkpoint to DynamoDB…');
  try {
    const checkpoint = await api('checkpoints', {
      observationId: latestObservationId,
      spaceId: byId('space').value,
      name: byId('checkpointName').value,
    });
    status(`${checkpoint.name} saved. You can now compare future observations against it.`);
    await refreshCheckpoints();
  } catch (error) { status(error.message || 'Checkpoint could not be saved.'); }
  finally { saving = false; controls(); }
};
byId('startRewind').onclick = startRewind;
byId('discard').onclick = discard;
byId('reload').onclick = discover;
byId('refreshCheckpoints').onclick = refreshCheckpoints;
byId('devices').onchange = controls;
byId('space').onchange = () => { latestObservationId = latestDiffCheckpointId = undefined; byId('savePanel').hidden = true; hideDiff(); controls(); void refreshCheckpoints(); };
video.onloadeddata = controls;
window.addEventListener('pagehide', () => {
  if (sessionId) navigator.sendBeacon('/api/stop', new Blob([JSON.stringify({ id: sessionId })], { type: 'application/json' }));
  peer?.close();
});
void discover();
