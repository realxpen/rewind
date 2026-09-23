(() => {
  let completedRequestId;
  let activeRequestId;
  let stopped = false;

  async function waitForRequest() {
    const space = document.getElementById('space');
    if (!space || !space.value) {
      await new Promise(resolve => setTimeout(resolve, 250));
      return undefined;
    }

    const url = `/api/mcp-observation-wait?spaceId=${encodeURIComponent(space.value)}&waitMs=15000`;
    const response = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!response.ok) throw new Error('Could not wait for an Alexa observation request.');
    return response.json();
  }

  async function answer(request) {
    if (!request?.requested || !request.requestId) return;
    if (request.requestId === completedRequestId || request.requestId === activeRequestId) return;

    activeRequestId = request.requestId;
    const status = document.getElementById('status');
    try {
      if (status) status.textContent = 'Alexa/agent requested a fresh Ring observation…';
      if (typeof window.ensureLiveViewForObservation !== 'function') {
        throw new Error('Ring live view recovery is not available.');
      }

      if (status) status.textContent = 'Fresh observation requested. Verifying an advancing Ring live view…';
      await window.ensureLiveViewForObservation();
      await captureFreshAgentObservation();

      completedRequestId = request.requestId;
      if (status) status.textContent = 'Fresh Ring → Nova observation delivered to the requesting tool.';
    } catch (error) {
      if (status) status.textContent = `Fresh Ring observation failed; the active Alexa request will retry. ${error?.message || ''}`.trim();
    } finally {
      activeRequestId = undefined;
    }
  }

  async function loop() {
    while (!stopped) {
      try {
        const request = await waitForRequest();
        await answer(request);
      } catch (error) {
        const status = document.getElementById('status');
        if (status) status.textContent = `Alexa observation bridge reconnecting. ${error?.message || ''}`.trim();
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  window.addEventListener('beforeunload', () => { stopped = true; }, { once: true });
  void loop();
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
  const agentPrompt = el('agentPrompt');
  let completionShownFor = '';
  let soundEnabled = true;
  let audioContext;

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function activateFlow(stage) {
    const order = ['save', 'diff', 'rewind', 'verify'];
    const activeIndex = Math.max(0, order.indexOf(stage));
    flowSteps.forEach((step, index) => step.classList.toggle('active', index <= activeIndex));
  }

  function percentageFromUi() {
    const verifyPanel = el('verifyPanel');
    if (verifyPanel && !verifyPanel.hidden) {
      const verifyText = el('verifySummary')?.textContent || '';
      const verified = verifyText.match(/(\d+)%/);
      if (verified) return Number(verified[1]);
    }
    const diffPanel = el('diffPanel');
    if (diffPanel && !diffPanel.hidden) {
      const score = matchScore?.textContent?.match(/(\d+)%/);
      if (score) return Number(score[1]);
    }
    return undefined;
  }

  function updateProgress() {
    const percentage = percentageFromUi();
    if (percentage === undefined) {
      if (matchScore && el('diffPanel')?.hidden) setText(matchScore, '—');
      setText(progressValue, '—');
      if (progressBar && progressBar.style.width !== '0%') progressBar.style.width = '0%';
      setText(progressCaption, 'Compare a saved checkpoint to calculate physical match.');
      return;
    }
    const safe = Math.max(0, Math.min(100, percentage));
    setText(progressValue, `${safe}%`);
    if (progressBar && progressBar.style.width !== `${safe}%`) progressBar.style.width = `${safe}%`;
    setText(progressCaption, safe === 100
      ? 'Deterministic checks report a complete semantic match.'
      : `${100 - safe}% of the saved physical state still needs attention.`);
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
      if (!node) continue;
      const state = node.textContent.trim();
      if (node.dataset.state !== state) node.dataset.state = state;
    }
  }

  function updateStream() {
    const message = statusNode?.textContent || '';
    const connected = /Live video connected|Fresh Ring|Camera ready|RESTORED|restored/i.test(message);
    const failed = /failed|error|lost|expired|could not|rejected/i.test(message);
    streamDot?.classList.toggle('live', connected && !failed);
    setText(streamLabel, failed ? 'Needs attention' : connected ? 'Live' : 'Standby');
    setText(overlayState, failed ? 'Connection needs attention' : connected ? 'Fresh semantic state available' : 'Waiting for live state');
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
    setText(completionText, checkpoint
      ? `Reality matches “${checkpoint}”. All deterministic restoration checks passed.`
      : 'Reality matches the saved checkpoint. All deterministic restoration checks passed.');
    completion?.classList.add('show');
    completion?.setAttribute('aria-hidden', 'false');
    playRestoredTone();
  }

  function installDemoPrompts() {
    if (!agentPrompt || document.getElementById('demoPrompts')) return;
    const panel = agentPrompt.closest('.agent-panel');
    const controls = panel?.querySelector('.controls');
    if (!panel || !controls) return;

    const hint = document.createElement('div');
    hint.className = 'demo-hint';
    hint.innerHTML = '<strong>Demo flow</strong><span>Use Live Ring to prove the real camera integration. Use Controlled Demo below when you need repeatable physical-state changes the Ring Playground cannot provide.</span>';
    agentPrompt.before(hint);

    const prompts = document.createElement('div');
    prompts.id = 'demoPrompts';
    prompts.className = 'prompt-suggestions';
    const options = [
      ['Inspect', 'Inspect my studio'],
      ['Save Demo Ready', 'Save this as Demo Ready'],
      ['What changed?', 'What changed?'],
      ['Rewind', 'Rewind my studio'],
      ['Check again', 'Check again'],
    ];
    for (const [label, prompt] of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ghost prompt-chip';
      button.textContent = label;
      button.addEventListener('click', () => {
        agentPrompt.value = prompt;
        agentPrompt.focus();
      });
      prompts.append(button);
    }
    controls.before(prompts);
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
    setText(soundToggle, soundEnabled ? 'Sound on' : 'Sound off');
    if (soundEnabled) ensureAudioContext();
  });
  dismissCompletion?.addEventListener('click', () => {
    completion?.classList.remove('show');
    completion?.setAttribute('aria-hidden', 'true');
  });
  completion?.addEventListener('click', event => {
    if (event.target === completion) dismissCompletion?.click();
  });

  const observer = new MutationObserver(refresh);
  for (const node of [statusNode, matchScore, rewindState, verifyState, el('verifySummary'), el('diffPanel'), el('rewindPanel'), el('verifyPanel')]) {
    if (node) observer.observe(node, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  }
  installDemoPrompts();
  setInterval(updateStream, 1000);
  refresh();
})();

/* Phase 10 desktop refinement: presentation only, no workflow authority. */
(() => {
  const style = document.createElement('style');
  style.textContent = `
    .hero-copy{margin-top:22px;margin-bottom:24px}
    .hero-copy p{font-size:14px;line-height:1.7}
    .panel-head{padding:17px 20px}
    .camera-tools{padding:15px 20px}
    #devices{min-width:0;max-width:100%;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}
    #space{min-width:0;width:100%}
    .status-wrap{padding:14px 20px}
    .progress-card{padding:20px}
    .privacy{padding:16px 18px}
    .layout>.stack:last-child{gap:14px}
    .demo-hint{display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:start;margin:12px 0 8px;padding:11px 13px;border:1px solid rgba(140,244,199,.15);border-radius:12px;background:rgba(14,31,26,.45);color:var(--soft);font-size:12px}
    .demo-hint strong{color:var(--mint);font-size:10px;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;padding-top:2px}
    .demo-hint span{line-height:1.55}
    .prompt-suggestions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 2px}
    .prompt-chip{padding:7px 10px;border-radius:999px;font-size:11px;color:var(--soft);background:#101923}
    .prompt-chip:hover:not(:disabled){color:var(--text);border-color:rgba(140,244,199,.4)}
    @media (min-width:981px){
      .app{max-width:1540px;padding-left:30px;padding-right:30px}
      .layout{grid-template-columns:minmax(0,1.72fr) minmax(350px,.68fr);gap:20px}
      .layout>.stack:last-child{position:sticky;top:18px}
      .camera-tools{display:grid;grid-template-columns:minmax(300px,1fr) auto auto auto minmax(190px,220px);align-items:center}
      .camera-tools label:first-child{min-width:0;width:100%}
      .camera-tools label:first-child select{width:100%}
      .camera-tools label:last-child{min-width:0;width:100%}
      .video-shell,video{min-height:470px}
      .live-overlay{left:32px;right:32px;bottom:26px}
    }
    @media (min-width:1280px){
      .hero-copy h2{max-width:760px}
      .video-shell,video{min-height:500px}
    }
    @media (max-width:640px){
      .demo-hint{grid-template-columns:1fr}
      .demo-hint strong{padding-top:0}
    }
  `;
  document.head.append(style);

  const devices = document.getElementById('devices');
  if (devices) {
    const syncTitle = () => {
      const selected = devices.selectedOptions?.[0];
      devices.title = selected?.textContent || 'Ring device';
    };
    devices.addEventListener('change', syncTitle);
    new MutationObserver(syncTitle).observe(devices, { childList: true, subtree: true });
    syncTitle();
  }
})();

/* Controlled restore demo. Server-owned fixtures; never represented as live Ring truth. */
(() => {
  const space = byId('space');
  const agentPanel = document.querySelector('.agent-panel');
  if (!space || !agentPanel || document.getElementById('controlledDemoPanel')) return;

  let mode = 'ring';
  let scenario = 'demo-ready';
  let controlledCheckpointId;
  let liveSpace = space.value || 'ring-playground';
  const originalCaptureFreshAgentObservation = captureFreshAgentObservation;
  const originalControls = controls;
  const liveAgentHandler = byId('agentSend').onclick;

  const panel = document.createElement('section');
  panel.id = 'controlledDemoPanel';
  panel.className = 'panel controlled-demo-panel';
  panel.innerHTML = `
    <div class="section-head">
      <div>
        <div class="eyebrow">Observation source</div>
        <h2>Live proof + repeatable restore demo</h2>
        <p>Live Ring proves the camera integration. Controlled Demo uses server-owned validated semantic fixtures for repeatable state changes.</p>
      </div>
      <span class="chip demo-disclosure">Never presented as live camera truth</span>
    </div>
    <div class="source-switch" role="group" aria-label="Observation source">
      <button type="button" class="source-button active" data-source="ring">● Live Ring</button>
      <button type="button" class="source-button" data-source="demo">○ Controlled Demo</button>
    </div>
    <div id="controlledDemoBody" hidden>
      <div class="demo-warning"><strong>CONTROLLED DEMO</strong><span>These states are validated semantic fixtures, not frames from the Ring Playground. They still pass through the same deterministic checkpoint, diff, restore-plan, and verification endpoints.</span></div>
      <div class="scenario-grid" role="group" aria-label="Controlled demo scene">
        <button type="button" class="scenario-button active" data-scenario="demo-ready"><span>01</span><strong>Demo Ready</strong><small>Baseline</small></button>
        <button type="button" class="scenario-button" data-scenario="messy"><span>02</span><strong>Messy</strong><small>6 changes</small></button>
        <button type="button" class="scenario-button" data-scenario="partial"><span>03</span><strong>Partial</strong><small>Progress</small></button>
        <button type="button" class="scenario-button" data-scenario="restored"><span>04</span><strong>Restored</strong><small>100%</small></button>
      </div>
      <div class="demo-actions">
        <button type="button" class="primary" id="saveControlledBaseline">Save Demo Ready</button>
        <button type="button" id="compareControlledBaseline" disabled>Compare to Demo Ready</button>
        <span class="muted" id="controlledDemoStatus">Select Demo Ready and save the baseline.</span>
      </div>
      <div class="demo-route"><span>Demo Ready → Save</span><span>Messy → Compare → Start Rewind</span><span>Partial → Check Again</span><span>Restored → Check Again</span></div>
    </div>`;
  agentPanel.before(panel);

  const style = document.createElement('style');
  style.textContent = `
    .controlled-demo-panel{padding:18px}
    .controlled-demo-panel .section-head{padding:0;border:0;margin-bottom:14px}
    .source-switch{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:5px;border:1px solid var(--line);border-radius:14px;background:#0b1119}
    .source-button{border:0;background:transparent;color:var(--muted);box-shadow:none}
    .source-button.active{background:#17251f;color:var(--mint);border:1px solid rgba(140,244,199,.35)}
    #controlledDemoBody{margin-top:14px}
    .demo-warning{display:grid;grid-template-columns:auto 1fr;gap:12px;padding:12px 14px;border:1px solid rgba(255,201,112,.26);border-radius:12px;background:rgba(72,54,22,.20);font-size:12px}
    .demo-warning strong{color:var(--amber);font-size:10px;letter-spacing:.12em}
    .demo-warning span{color:var(--soft)}
    .scenario-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
    .scenario-button{display:grid;gap:2px;text-align:left;background:#101923;padding:12px}
    .scenario-button span{font-size:9px;letter-spacing:.12em;color:var(--mint)}
    .scenario-button strong{font-size:12px}
    .scenario-button small{color:var(--muted);font-size:10px}
    .scenario-button.active{border-color:rgba(140,244,199,.55);background:#17251f}
    .demo-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-top:12px}
    .demo-actions .muted{margin-left:auto}
    .demo-route{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    .demo-route span{padding:6px 8px;border-radius:8px;background:#0b1119;color:var(--muted);font-size:10px;border:1px solid var(--line)}
    body[data-observation-source="demo"] .video-shell{filter:saturate(.55) brightness(.72)}
    body[data-observation-source="demo"] .live-overlay:after{content:"CONTROLLED DEMO drives restore state · live Ring remains visual proof only";position:absolute;left:0;right:0;bottom:-18px;color:var(--amber);font-size:10px;letter-spacing:.05em}
    @media(max-width:700px){.scenario-grid{grid-template-columns:repeat(2,1fr)}.demo-warning{grid-template-columns:1fr}.demo-actions .muted{width:100%;margin-left:0}}
  `;
  document.head.append(style);

  const demoBody = document.getElementById('controlledDemoBody');
  const demoStatus = document.getElementById('controlledDemoStatus');
  const saveBaseline = document.getElementById('saveControlledBaseline');
  const compareBaseline = document.getElementById('compareControlledBaseline');

  function setDemoStatus(message) {
    if (demoStatus && demoStatus.textContent !== message) demoStatus.textContent = message;
  }

  function setScenario(next) {
    scenario = next;
    panel.querySelectorAll('[data-scenario]').forEach(button => button.classList.toggle('active', button.dataset.scenario === next));
  }

  async function captureControlledScenario(next = scenario) {
    setScenario(next);
    const result = await api('demo/observe', { scenario: next, spaceId: space.value });
    latestObservationId = result.observationId;
    latestDiffCheckpointId = undefined;
    controls();
    setDemoStatus(`${next.replace('-', ' ')} loaded as a trusted controlled observation.`);
    status(`Controlled Demo: ${next.replace('-', ' ')} state loaded. This is not live Ring camera truth.`);
    return result;
  }

  function activateMode(next) {
    if (mode === next) return;
    mode = next;
    document.body.dataset.observationSource = next;
    panel.querySelectorAll('[data-source]').forEach(button => {
      button.classList.toggle('active', button.dataset.source === next);
      button.textContent = `${button.dataset.source === next ? '●' : '○'} ${button.dataset.source === 'ring' ? 'Live Ring' : 'Controlled Demo'}`;
    });
    if (next === 'demo') {
      liveSpace = space.value || liveSpace;
      space.value = 'controlled-demo';
      demoBody.hidden = false;
      byId('agentSend').textContent = 'Run controlled demo';
      byId('capture').hidden = true;
      status('Controlled Demo selected. Fixtures are clearly separated from live Ring truth.');
    } else {
      space.value = liveSpace || 'ring-playground';
      demoBody.hidden = true;
      byId('agentSend').textContent = 'Run with live Ring';
      byId('capture').hidden = false;
      status('Live Ring selected. Fresh camera frames drive semantic observation.');
    }
    latestObservationId = undefined;
    latestDiffCheckpointId = undefined;
    hideDiff();
    space.dispatchEvent(new Event('change'));
    controls();
  }

  panel.querySelectorAll('[data-source]').forEach(button => button.addEventListener('click', () => activateMode(button.dataset.source)));
  panel.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', async () => {
    if (mode !== 'demo') activateMode('demo');
    try { await captureControlledScenario(button.dataset.scenario); }
    catch (error) { setDemoStatus(error.message || 'Could not load controlled scenario.'); }
  }));

  saveBaseline.addEventListener('click', async () => {
    try {
      if (mode !== 'demo') activateMode('demo');
      const observation = await captureControlledScenario('demo-ready');
      const checkpoint = await api('checkpoints', {
        observationId: observation.observationId,
        spaceId: space.value,
        name: 'Demo Ready (Controlled)',
      });
      controlledCheckpointId = checkpoint.id;
      compareBaseline.disabled = false;
      await refreshCheckpoints();
      setDemoStatus('Baseline saved. Choose Messy, then Compare to Demo Ready.');
      status('Controlled Demo baseline saved to DynamoDB as Demo Ready (Controlled).');
    } catch (error) {
      setDemoStatus(error.message || 'Could not save controlled baseline.');
    }
  });

  compareBaseline.addEventListener('click', async () => {
    if (!controlledCheckpointId) return;
    try {
      if (scenario === 'demo-ready') await captureControlledScenario('messy');
      await compareCheckpoint(controlledCheckpointId);
      setDemoStatus('Diff ready. Click Start Rewind below, then move to Partial and Restored.');
    } catch (error) {
      setDemoStatus(error.message || 'Could not compare controlled state.');
    }
  });

  captureFreshAgentObservation = async function () {
    return mode === 'demo' ? captureControlledScenario(scenario) : originalCaptureFreshAgentObservation();
  };

  controls = function () {
    originalControls();
    if (mode === 'demo') {
      byId('agentSend').disabled = pending || observing || agentRunning || !space.checkValidity();
      byId('capture').disabled = true;
    }
  };

  byId('agentSend').onclick = async event => {
    if (mode !== 'demo') return liveAgentHandler.call(byId('agentSend'), event);
    const prompt = byId('agentPrompt').value.trim();
    if (!prompt || agentRunning || !space.reportValidity()) return;
    agentRunning = true; controls(); byId('agentResponse').hidden = true; byId('agentSession').textContent = '';
    try {
      status(`Controlled Demo: loading ${scenario.replace('-', ' ')} semantic state…`);
      const observation = await captureControlledScenario(scenario);
      status('Controlled fixture loaded. Strands is choosing the approved REWIND tool…');
      const result = await api('agent', {
        prompt,
        spaceId: space.value,
        observationId: observation.observationId,
      });
      byId('agentResponse').textContent = result.text;
      byId('agentResponse').hidden = false;
      const session = result.session || {};
      byId('agentSession').textContent = `Session: ${session.activeSpaceId || 'no-space'} · ${session.activeCheckpointName || 'no-checkpoint'} · ${session.lastDeterministicState || 'no-state'} · controlled demo`;
      await refreshCheckpoints();
      status('REWIND agent completed against a server-owned controlled fixture.');
    } catch (error) {
      byId('agentResponse').textContent = error.message || 'REWIND controlled demo request failed.';
      byId('agentResponse').hidden = false;
      status(error.message || 'REWIND controlled demo request failed.');
    } finally { agentRunning = false; controls(); }
  };

  document.body.dataset.observationSource = 'ring';
  controls();
})();
