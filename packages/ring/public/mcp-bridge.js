(() => {
  let lastRequestId;
  let answering = false;

  async function poll() {
    if (answering) return;
    const video = document.getElementById('video');
    const space = document.getElementById('space');
    if (!video || !space || video.readyState < 2 || !video.videoWidth || !space.value) return;

    try {
      const url = `/api/mcp-observation-request?spaceId=${encodeURIComponent(space.value)}`;
      const response = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (!response.ok) return;
      const request = await response.json();
      if (!request.requested || !request.requestId || request.requestId === lastRequestId) return;

      lastRequestId = request.requestId;
      answering = true;
      const status = document.getElementById('status');
      if (status) status.textContent = 'MCP requested a fresh Ring observation…';
      await captureFreshAgentObservation();
      if (status) status.textContent = 'Fresh Ring → Nova observation delivered to the MCP tool.';
    } catch {
      // Keep polling. The MCP caller owns timeout/error reporting.
    } finally {
      answering = false;
    }
  }

  setInterval(() => void poll(), 750);
})();

/* Phase 10 experience layer. Observes existing deterministic UI state only. */
(() => {
  const el = id => document.getElementById(id);
  const flowSteps = [...document.querySelectorAll('[data-flow]')];
  const statusNode = el('status');
  const matchScore = el('matchScore');
  const rewindState = el('rewindState');
  const verifyState = el('verifyState');
  const progressBar = el('progressBar');
  const progressValue = el('progressValue');
  const progressCaption = el('progressCaption');
  const streamDot = el('streamDot');
  const streamLabel = el('streamLabel');
  const overlayState = el('overlayState');
  const completion = el('completion');
  const completionText = el('completionText');
  const dismissCompletion = el('dismissCompletion');
  const soundToggle = el('soundToggle');
  let completionShownFor = '';
  let soundEnabled = true;
  let audioContext;

  function activateFlow(stage) {
    const order = ['save', 'diff', 'rewind', 'verify'];
    const activeIndex = Math.max(0, order.indexOf(stage));
    flowSteps.forEach((step, index) => step.classList.toggle('active', index <= activeIndex));
  }

  function percentageFromUi() {
    const verifyText = el('verifySummary')?.textContent || '';
    const verified = verifyText.match(/(\d+)%/);
    if (verified) return Number(verified[1]);
    const score = matchScore?.textContent?.match(/(\d+)%/);
    return score ? Number(score[1]) : undefined;
  }

  function updateProgress() {
    const percentage = percentageFromUi();
    if (percentage === undefined) {
      progressValue.textContent = '—';
      progressBar.style.width = '0%';
      progressCaption.textContent = 'Save or compare a checkpoint to begin.';
      return;
    }
    const safe = Math.max(0, Math.min(100, percentage));
    progressValue.textContent = `${safe}%`;
    progressBar.style.width = `${safe}%`;
    progressCaption.textContent = safe === 100
      ? 'Deterministic checks report a complete semantic match.'
      : `${100 - safe}% of the saved physical state still needs attention.`;
  }

  function updateFlow() {
    const verifyPanel = el('verifyPanel');
    const rewindPanel = el('rewindPanel');
    const diffPanel = el('diffPanel');
    if (verifyPanel && !verifyPanel.hidden) activateFlow('verify');
    else if (rewindPanel && !rewindPanel.hidden) activateFlow('rewind');
    else if (diffPanel && !diffPanel.hidden) activateFlow('diff');
    else activateFlow('save');
  }

  function updateStatePills() {
    for (const node of [rewindState, verifyState]) {
      if (node) node.dataset.state = node.textContent.trim();
    }
  }

  function updateStream() {
    const message = statusNode?.textContent || '';
    const connected = /Live video connected|Fresh Ring|Camera ready|RESTORED|restored/i.test(message);
    const failed = /failed|error|lost|expired|could not|rejected/i.test(message);
    streamDot?.classList.toggle('live', connected && !failed);
    streamLabel.textContent = failed ? 'Needs attention' : connected ? 'Live' : 'Standby';
    overlayState.textContent = failed ? 'Connection needs attention' : connected ? 'Fresh semantic state available' : 'Waiting for live state';
  }

  function ensureAudioContext() {
    if (!soundEnabled || audioContext) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioContext = new Ctx();
  }

  function playRestoredTone() {
    if (!soundEnabled || !audioContext) return;
    const now = audioContext.currentTime;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * .09);
      gain.gain.exponentialRampToValueAtTime(.045, now + index * .09 + .025);
      gain.gain.exponentialRampToValueAtTime(.0001, now + index * .09 + .22);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(now + index * .09);
      osc.stop(now + index * .09 + .24);
    });
  }

  function maybeCelebrate() {
    const state = verifyState?.textContent?.trim();
    const summary = el('verifySummary')?.textContent || '';
    if (state !== 'RESTORED' || !/100%/.test(summary)) return;
    const key = `${state}:${summary}`;
    if (completionShownFor === key) return;
    completionShownFor = key;
    const checkpoint = el('rewindTitle')?.textContent?.replace(/^Rewind to\s+/i, '').trim();
    completionText.textContent = checkpoint
      ? `Reality matches “${checkpoint}”. All deterministic restoration checks passed.`
      : 'Reality matches the saved checkpoint. All deterministic restoration checks passed.';
    completion.classList.add('show');
    completion.setAttribute('aria-hidden', 'false');
    playRestoredTone();
  }

  function refresh() {
    updateProgress();
    updateFlow();
    updateStatePills();
    updateStream();
    maybeCelebrate();
  }

  document.addEventListener('pointerdown', ensureAudioContext, { once: true });
  soundToggle?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    soundToggle.textContent = soundEnabled ? 'Sound on' : 'Sound off';
    if (soundEnabled) ensureAudioContext();
  });
  dismissCompletion?.addEventListener('click', () => {
    completion.classList.remove('show');
    completion.setAttribute('aria-hidden', 'true');
  });
  completion?.addEventListener('click', event => {
    if (event.target === completion) dismissCompletion?.click();
  });

  const observer = new MutationObserver(refresh);
  for (const node of [statusNode, matchScore, rewindState, verifyState, el('verifySummary'), el('diffPanel'), el('rewindPanel'), el('verifyPanel')]) {
    if (node) observer.observe(node, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  }
  setInterval(updateStream, 1000);
  refresh();
})();
