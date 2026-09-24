const byId = id => document.getElementById(id);
const video = byId('video');
const status = message => { byId('status').textContent = message; };
const AUTO_LIVE_KEY = 'rewind.live.auto';
const LIVE_SOURCE_KEY = 'rewind.live.source';
let peer, sessionId, heartbeat, localStream, frameUrl, frameBlob, capturedAt, latestObservationId, latestDiffCheckpointId, pending = false, observing = false, saving = false, comparing = false, rewinding = false, agentRunning = false;
let liveConnectPromise, reconnectTimer, videoWatchdog, heartbeatFailures = 0, reconnectAttempts = 0;
let reconnecting = false, videoWatchdogChecking = false, lastVideoProgress, lastVideoProgressAt = 0;
let autoLiveWanted = localStorage.getItem(AUTO_LIVE_KEY) === '1';
let liveSource = localStorage.getItem(LIVE_SOURCE_KEY) === 'camera' ? 'camera' : 'ring';

function activeConnection() {
  return liveSource === 'camera' ? Boolean(localStream) : Boolean(peer || sessionId);
}
function videoReady() {
  const sourceConnected = liveSource === 'camera' ? Boolean(localStream) : Boolean(peer && sessionId);
  return Boolean(sourceConnected && video.readyState >= 2 && video.videoWidth);
}
function updateSourceUi() {
  const camera = liveSource === 'camera';
  byId('liveSource').value = liveSource;
  byId('ringDeviceWrap').hidden = camera;
  byId('cameraDeviceWrap').hidden = !camera;
  byId('liveSourceTitle').textContent = camera ? 'Camera / Phone observation' : 'Ring observation';
  byId('liveTitle').textContent = camera ? 'Camera / Phone Live' : 'Ring Playground';
}
async function publishLiveSourceSelection() {
  if (!byId('space').reportValidity()) return;
  await api('live-source', { spaceId: byId('space').value, source: liveSource });
}
function setAutoLiveWanted(value) {
  autoLiveWanted = value;
  if (value) localStorage.setItem(AUTO_LIVE_KEY, '1');
  else localStorage.removeItem(AUTO_LIVE_KEY);
}
function clearReconnectTimer() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = undefined;
}
function scheduleLiveReconnect(delay = 800) {
  if (!autoLiveWanted || reconnectTimer || reconnecting || liveConnectPromise || reconnectAttempts >= 6) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    reconnectAttempts += 1;
    reconnecting = true;
    let retry = false;
    void stop()
      .then(() => connectLiveView({ automatic: true }))
      .catch(error => {
        status(error?.message || 'Could not restart the Ring live view.');
        retry = reconnectAttempts < 6;
        if (!retry) status('Ring live view needs attention. Click Start live view to retry.');
      })
      .finally(() => {
        reconnecting = false;
        if (retry) scheduleLiveReconnect(1_500);
      });
  }, delay);
}
function clearVideoWatchdog() {
  if (videoWatchdog) clearInterval(videoWatchdog);
  videoWatchdog = undefined;
  videoWatchdogChecking = false;
  lastVideoProgress = undefined;
  lastVideoProgressAt = 0;
}
async function readVideoProgress() {
  if (peer && typeof peer.getStats === 'function') {
    try {
      const reports = await peer.getStats();
      for (const report of reports.values()) {
        if (report.type !== 'inbound-rtp') continue;
        if (report.kind !== 'video' && report.mediaType !== 'video') continue;
        if (Number.isFinite(report.framesDecoded)) return { metric: 'framesDecoded', value: report.framesDecoded };
        if (Number.isFinite(report.packetsReceived)) return { metric: 'packetsReceived', value: report.packetsReceived };
        if (Number.isFinite(report.bytesReceived)) return { metric: 'bytesReceived', value: report.bytesReceived };
      }
    } catch {}
  }

  const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  return { metric: 'currentTime', value: currentTime };
}
function videoProgressed(previous, current) {
  if (!previous || previous.metric !== current.metric) return true;
  return current.value > previous.value;
}
function startVideoWatchdog() {
  clearVideoWatchdog();
  lastVideoProgressAt = Date.now();
  void readVideoProgress().then(progress => { lastVideoProgress = progress; }).catch(() => {});

  videoWatchdog = setInterval(() => {
    if (!autoLiveWanted || reconnecting || liveConnectPromise || !peer || !sessionId || videoWatchdogChecking) return;
    if (video.readyState < 2 || !video.videoWidth) return;

    videoWatchdogChecking = true;
    void readVideoProgress()
      .then(progress => {
        if (videoProgressed(lastVideoProgress, progress)) {
          lastVideoProgress = progress;
          lastVideoProgressAt = Date.now();
          return;
        }
        if (Date.now() - lastVideoProgressAt >= 8_000) {
          clearVideoWatchdog();
          status('Ring Playground video stopped advancing. Replaying live view…');
          scheduleLiveReconnect(250);
        }
      })
      .finally(() => { videoWatchdogChecking = false; });
  }, 2_000);
}

async function api(path, data) {
  const response = await fetch(`/api/${path}`, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
function controls() {
  const connected = activeConnection();
  const sourceHasDevice = liveSource === 'ring'
    ? Boolean(byId('devices').value)
    : Boolean(byId('cameraDevices').value || navigator.mediaDevices?.getUserMedia);
  byId('start').disabled = pending || connected || !sourceHasDevice;
  byId('stop').disabled = pending || !connected;
  byId('devices').disabled = pending || connected || liveSource !== 'ring';
  byId('cameraDevices').disabled = pending || connected || liveSource !== 'camera';
  byId('liveSource').disabled = pending || connected;
  byId('reload').disabled = pending || connected;
  byId('capture').disabled = pending || observing || agentRunning || !videoReady();
  byId('saveCheckpoint').disabled = saving || observing || agentRunning || !latestObservationId;
  byId('agentSend').disabled = pending || observing || agentRunning || !videoReady();
  document.querySelectorAll('[data-compare-checkpoint]').forEach(button => {
    button.disabled = comparing || observing || rewinding || agentRunning || !latestObservationId;
  });
  byId('startRewind').disabled = rewinding || comparing || observing || agentRunning || !latestObservationId || !latestDiffCheckpointId;
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
  const evidenceCoverage = Number.isFinite(result.match.coveragePercentage) ? result.match.coveragePercentage : 100;
  byId('matchScore').textContent = `${result.match.percentage}%`;
  byId('matchScore').dataset.coverage = String(evidenceCoverage);
  byId('diffSummary').textContent = result.match.restored
    ? 'No meaningful differences remain. This scene matches the checkpoint.'
    : result.changeCount === 0
      ? `No confirmed differences, but evidence coverage is ${evidenceCoverage}%. Re-observe uncertain items before declaring restoration complete.`
      : `${result.changeCount} meaningful ${result.changeCount === 1 ? 'difference' : 'differences'} found. ${result.match.unknown ? `${result.match.unknown} uncertain. ` : ''}${evidenceCoverage < 100 ? `Evidence coverage: ${evidenceCoverage}%.` : ''}`;
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
async function discoverLocalCameras() {
  const select = byId('cameraDevices');
  if (!navigator.mediaDevices?.enumerateDevices) {
    select.replaceChildren();
    return [];
  }
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
  const current = select.value;
  select.replaceChildren(...devices.map((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Camera ${index + 1}`;
    return option;
  }));
  if (current && devices.some(device => device.deviceId === current)) select.value = current;
  return devices;
}
async function discover() {
  pending = true; controls(); status('Discovering live sources…');
  try {
    const ringDevices = await api('devices');
    byId('devices').replaceChildren(...ringDevices.map(device => {
      const option = document.createElement('option'); option.value = device.id; option.textContent = device.name; return option;
    }));
    const cameras = await discoverLocalCameras();
    updateSourceUi();
    await publishLiveSourceSelection();
    const ready = liveSource === 'ring' ? ringDevices.length > 0 : Boolean(cameras.length || navigator.mediaDevices?.getUserMedia);
    status(ready
      ? `${liveSource === 'ring' ? 'Ring' : 'Camera / Phone'} source ready. Start live view.`
      : liveSource === 'ring' ? 'No Ring devices found.' : 'No browser camera is available.');
    await refreshCheckpoints();
    if (liveSource === 'ring' && ringDevices.length && autoLiveWanted) scheduleLiveReconnect(250);
  } catch (error) { status(error.message); }
  finally { pending = false; controls(); }
}
async function stop({ notifyServer = true } = {}) {
  clearInterval(heartbeat);
  clearVideoWatchdog();
  heartbeat = undefined;
  heartbeatFailures = 0;
  const currentPeer = peer;
  peer = undefined;
  if (currentPeer) {
    currentPeer.onconnectionstatechange = null;
    currentPeer.close();
  }
  const currentLocalStream = localStream;
  localStream = undefined;
  currentLocalStream?.getTracks().forEach(track => track.stop());
  video.srcObject = null;
  const currentSessionId = sessionId;
  sessionId = undefined;
  if (notifyServer && currentSessionId) {
    try {
      await api('stop', { id: currentSessionId });
    } catch (error) {
      if (!/Session not found/i.test(error?.message || '')) throw error;
    }
  }
  controls();
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
async function waitForFreshVideoFrame(timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  const baselineSessionId = sessionId;
  let previous = await readVideoProgress();

  while (Date.now() <= deadline) {
    await new Promise(resolve => setTimeout(resolve, 120));
    if (video.readyState < 2 || !video.videoWidth || !sessionId) continue;
    if (sessionId !== baselineSessionId) return;
    const current = await readVideoProgress();
    if (videoProgressed(previous, current)) {
      lastVideoProgress = current;
      lastVideoProgressAt = Date.now();
      return;
    }
    previous = current;
  }
  throw new Error('Ring video is not advancing yet.');
}
function videoBlob() {
  if (video.readyState < 2 || !video.videoWidth) throw new Error('Start the selected live source and wait for video before asking REWIND.');
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1280 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not capture the Ring frame.')), 'image/jpeg', .88));
}
function base64Blob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
async function captureFreshAgentObservation() {
  if (!byId('space').reportValidity()) throw new Error('Choose a valid space first.');
  const blob = await videoBlob();
  const time = new Date().toISOString();
  const image = await base64Blob(blob);
  const result = await api('observe', { image, capturedAt: time, spaceId: byId('space').value });
  latestObservationId = result.observationId;
  return result;
}
async function connectCameraView({ automatic = false } = {}) {
  if (videoReady()) return;
  if (liveConnectPromise) return liveConnectPromise;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot access a camera.');

  liveConnectPromise = (async () => {
    pending = true; controls();
    status(automatic ? 'Reconnecting Camera / Phone live view…' : 'Connecting to Camera / Phone…');
    try {
      clearReconnectTimer();
      if (peer || sessionId || localStream) {
        try { await stop(); }
        catch { await stop({ notifyServer: false }).catch(() => {}); }
      }
      const selectedDeviceId = byId('cameraDevices').value;
      const videoConstraints = selectedDeviceId
        ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } };
      localStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
      video.srcObject = localStream;
      await video.play().catch(() => {});
      await waitForVideo();

      const track = localStream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          localStream = undefined;
          controls();
          status('Camera / Phone stream ended. Start live view to reconnect.');
        };
      }
      await discoverLocalCameras();
      const activeDeviceId = track?.getSettings?.().deviceId;
      if (activeDeviceId && [...byId('cameraDevices').options].some(option => option.value === activeDeviceId)) {
        byId('cameraDevices').value = activeDeviceId;
      }

      reconnectAttempts = 0;
      setAutoLiveWanted(true);
      await publishLiveSourceSelection();
      status('Camera / Phone live video connected. REWIND can now observe your real desk.');
    } catch (error) {
      try { await stop(); }
      catch { await stop({ notifyServer: false }).catch(() => {}); }
      const name = error?.name || '';
      const message = name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access in the browser and try again.'
        : name === 'NotFoundError'
          ? 'No usable camera was found.'
          : error?.message || 'Could not connect to Camera / Phone.';
      status(message);
      throw error;
    } finally {
      pending = false; controls();
    }
  })();

  try {
    await liveConnectPromise;
  } finally {
    liveConnectPromise = undefined;
  }
}

async function connectLiveView({ automatic = false } = {}) {
  if (videoReady()) return;
  if (liveConnectPromise) return liveConnectPromise;

  liveConnectPromise = (async () => {
    pending = true; controls();
    status(automatic ? 'Reconnecting Ring live view…' : 'Connecting to Ring…');
    try {
      clearReconnectTimer();
      if (!byId('devices').value) throw new Error('No Ring device is selected.');
      if (peer || sessionId) {
        try { await stop(); }
        catch { await stop({ notifyServer: false }); }
      }

      peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
      const stream = new MediaStream(); video.srcObject = stream;
      const replayEndedStream = message => {
        if (!autoLiveWanted) return;
        status(message);
        scheduleLiveReconnect(250);
      };
      stream.addEventListener('inactive', () => {
        replayEndedStream('Ring Playground stream ended. Replaying live view…');
      });
      peer.ontrack = event => {
        const track = event.track;
        stream.addTrack(track);
        video.play().catch(() => {});
        if (track.kind === 'video') {
          track.onended = () => {
            replayEndedStream('Ring Playground clip ended. Replaying live view…');
          };
        }
      };
      peer.addTransceiver('audio', { direction: 'sendrecv' });
      peer.addTransceiver('video', { direction: 'recvonly' });
      await peer.setLocalDescription(await peer.createOffer());
      await gatherIce(peer);
      const session = await api('start', { deviceId: byId('devices').value, offer: peer.localDescription.sdp });
      sessionId = session.id;
      heartbeatFailures = 0;
      heartbeat = setInterval(() => {
        const id = sessionId;
        if (!id) return;
        void api('heartbeat', { id }).then(() => {
          heartbeatFailures = 0;
        }).catch(() => {
          heartbeatFailures += 1;
          if (heartbeatFailures === 1) {
            status('REWIND restarted or lost the Ring session. Reconnecting live view…');
            scheduleLiveReconnect(250);
          }
        });
      }, 5_000);
      await peer.setRemoteDescription({ type: 'answer', sdp: session.answer });
      await waitForVideo();
      startVideoWatchdog();
      peer.onconnectionstatechange = () => {
        if (peer?.connectionState === 'failed') {
          status('Ring connection was lost. Reconnecting live view…');
          scheduleLiveReconnect(250);
        }
      };
      reconnectAttempts = 0;
      setAutoLiveWanted(true);
      status('Live video connected. You can ask REWIND or capture a frame manually.');
    } catch (error) {
      try { await stop(); }
      catch { await stop({ notifyServer: false }).catch(() => {}); }
      status(error?.message || 'Could not connect to Ring.');
      throw error;
    } finally {
      pending = false; controls();
    }
  })();

  try {
    await liveConnectPromise;
  } finally {
    liveConnectPromise = undefined;
  }
}

async function connectSelectedLiveView(options = {}) {
  return liveSource === 'camera' ? connectCameraView(options) : connectLiveView(options);
}

async function ensureLiveViewForObservation() {
  setAutoLiveWanted(true);
  reconnectAttempts = 0;
  const selectedAvailable = liveSource === 'ring' ? byId('devices').value : navigator.mediaDevices?.getUserMedia;
  if (!selectedAvailable) await discover();
  await publishLiveSourceSelection();

  const reconnectDeadline = Date.now() + 8_000;
  while ((reconnecting || liveConnectPromise) && Date.now() < reconnectDeadline) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (videoReady()) return;

  try { await stop(); }
  catch { await stop({ notifyServer: false }).catch(() => {}); }
  await connectSelectedLiveView({ automatic: true });
  await waitForVideo();
}
window.ensureLiveViewForObservation = ensureLiveViewForObservation;

byId('start').onclick = () => {
  setAutoLiveWanted(true);
  reconnectAttempts = 0;
  void connectSelectedLiveView().catch(() => {});
};
byId('stop').onclick = async () => {
  setAutoLiveWanted(false);
  clearReconnectTimer();
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
    const image = await base64Blob(frameBlob);
    const result = await api('observe', { image, capturedAt, spaceId: byId('space').value });
    latestObservationId = result.observationId;
    byId('result').textContent = JSON.stringify(result, null, 2); byId('result').hidden = false; byId('savePanel').hidden = false;
    await refreshCheckpoints();
    status('Observation validated. Save it or compare the current state with a checkpoint.');
  } catch (error) { status(error.message || 'Could not read the frame.'); }
  finally { observing = false; controls(); byId('observe').disabled = false; byId('discard').disabled = false; }
};
byId('agentSend').onclick = async () => {
  const prompt = byId('agentPrompt').value.trim();
  if (!prompt || agentRunning || !videoReady() || !byId('space').reportValidity()) return;
  agentRunning = true; controls(); byId('agentResponse').hidden = true; byId('agentSession').textContent = '';
  try {
    status('Capturing a fresh live frame for REWIND…');
    const observation = await captureFreshAgentObservation();
    status('Nova validated the live frame. Strands is choosing the approved REWIND tool…');
    const result = await api('agent', {
      prompt,
      spaceId: byId('space').value,
      observationId: observation.observationId,
    });
    byId('agentResponse').textContent = result.text;
    byId('agentResponse').hidden = false;
    const session = result.session || {};
    byId('agentSession').textContent = `Session: ${session.activeSpaceId || 'no-space'} · ${session.activeCheckpointName || 'no-checkpoint'} · ${session.lastDeterministicState || 'no-state'}`;
    await refreshCheckpoints();
    status('REWIND agent completed using a fresh live-source → Nova observation.');
  } catch (error) {
    byId('agentResponse').textContent = error.message || 'REWIND agent request failed.';
    byId('agentResponse').hidden = false;
    status(error.message || 'REWIND agent request failed.');
  } finally { agentRunning = false; controls(); }
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
byId('cameraDevices').onchange = controls;
byId('liveSource').onchange = async () => {
  liveSource = byId('liveSource').value === 'camera' ? 'camera' : 'ring';
  localStorage.setItem(LIVE_SOURCE_KEY, liveSource);
  updateSourceUi();
  latestObservationId = latestDiffCheckpointId = undefined;
  hideDiff();
  await publishLiveSourceSelection().catch(error => status(error.message));
  controls();
};
byId('space').onchange = () => {
  latestObservationId = latestDiffCheckpointId = undefined;
  byId('savePanel').hidden = true;
  byId('agentSession').textContent = '';
  hideDiff();
  controls();
  void publishLiveSourceSelection().catch(error => status(error.message));
  void refreshCheckpoints();
};
video.onloadeddata = controls;
window.addEventListener('pagehide', () => {
  if (sessionId) navigator.sendBeacon('/api/stop', new Blob([JSON.stringify({ id: sessionId })], { type: 'application/json' }));
  peer?.close();
  localStream?.getTracks().forEach(track => track.stop());
});
updateSourceUi();
void discover();
