const byId = id => document.getElementById(id);
const video = byId('video');
const status = message => { byId('status').textContent = message; };
let peer, sessionId, heartbeat, frameUrl, frameBlob, capturedAt, pending = false, observing = false;
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
}
async function discover() {
  pending = true; controls(); status('Discovering devices…');
  try {
    const devices = await api('devices');
    byId('devices').replaceChildren(...devices.map(device => {
      const option = document.createElement('option'); option.value = device.id; option.textContent = device.name; return option;
    }));
    status(devices.length ? 'Camera ready. Start live view.' : 'No Ring devices found.');
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
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Camera connection timed out while preparing the offer. Try again.')); }, 15_000);
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
    peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
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
  frameUrl = frameBlob = capturedAt = undefined;
  byId('frame').removeAttribute('src'); byId('download').removeAttribute('href');
  byId('snapshot').hidden = true; byId('result').hidden = true; byId('result').textContent = '';
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
  byId('result').hidden = true; status('Nova is observing the captured frame…');
  try {
    const image = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(frameBlob);
    });
    const result = await api('observe', { image, capturedAt, spaceId: byId('space').value });
    byId('result').textContent = JSON.stringify(result, null, 2); byId('result').hidden = false;
    status('Observation validated. No checkpoint saved yet.');
  } catch (error) { status(error.message || 'Could not read the frame.'); }
  finally { observing = false; controls(); byId('observe').disabled = false; byId('discard').disabled = false; }
};
byId('discard').onclick = discard;
byId('reload').onclick = discover;
byId('devices').onchange = controls;
video.onloadeddata = controls;
window.addEventListener('pagehide', () => {
  if (sessionId) navigator.sendBeacon('/api/stop', new Blob([JSON.stringify({ id: sessionId })], { type: 'application/json' }));
  peer?.close();
});
void discover();
