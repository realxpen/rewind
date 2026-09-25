/* Phase 12 everyday photo flow. Reuses the same Nova → PSP → deterministic REWIND services. */
(() => {
  const el = id => document.getElementById(id);
  const focusCard = el('focusCard');
  const demoMount = el('demoToolbarMount');
  const liveDetails = el('liveRingDetails');
  const advancedDetails = el('advancedDetails');
  const advancedStack = advancedDetails?.querySelector('.advanced-stack');
  const space = el('space');
  if (!focusCard || !demoMount || !advancedDetails || !advancedStack || !space || document.getElementById('consumerPhotoFlow')) return;

  let mode = 'remember';
  let selectedFile;
  let previewUrl;
  let consumerObservationId;
  let rememberCheckpointId;
  let rememberViewCount = 0;
  let savedStates = [];
  let busy = false;

  const section = document.createElement('section');
  section.id = 'consumerPhotoFlow';
  section.className = 'panel consumer-photo-flow';
  section.innerHTML = `
    <div class="consumer-head">
      <div>
        <div class="eyebrow">Everyday REWIND</div>
        <h2>Remember a space with your phone</h2>
        <p>Upload the scene you want Alexa to reason about. Analyze it once; that image becomes Alexa's current trusted scene until you analyze another photo.</p>
      </div>
      <span class="chip">Alexa-ready</span>
    </div>

    <div class="consumer-modes" role="group" aria-label="Photo workflow">
      <button type="button" class="consumer-mode active" data-consumer-mode="remember">Remember a space</button>
      <button type="button" class="consumer-mode" data-consumer-mode="rewind">Rewind a space</button>
    </div>

    <div class="consumer-grid">
      <div class="consumer-fields">
        <label class="consumer-field"><span>Space</span><input id="consumerSpaceName" value="My Room" maxlength="80" autocomplete="off"></label>
        <label class="consumer-field" id="consumerStateNameField"><span>Save this state as</span><input id="consumerStateName" value="Clean Setup" maxlength="120" autocomplete="off"></label>
        <label class="consumer-field" id="consumerSavedStateField" hidden><span>Rewind to</span><select id="consumerSavedState" aria-label="Saved state"><option value="">No saved states yet</option></select></label>
      </div>

      <div class="consumer-capture">
        <input id="consumerCameraInput" type="file" accept="image/*" capture="environment" hidden>
        <input id="consumerPhotoInput" type="file" accept="image/*" hidden>
        <button type="button" class="primary" id="consumerTakePhoto">Take a photo</button>
        <button type="button" id="consumerUploadPhoto">Upload a photo</button>
        <button type="button" class="ghost" id="consumerConnectRing">Connect Ring instead</button>
      </div>
    </div>

    <div id="consumerPreviewWrap" class="consumer-preview" hidden>
      <img id="consumerPhotoPreview" alt="Selected room or space">
      <div class="consumer-preview-copy">
        <div class="eyebrow">Ephemeral photo</div>
        <strong id="consumerPhotoName">Photo selected</strong>
        <p id="consumerPhotoStatus">Analyze this photo with Nova. REWIND keeps the semantic state, not the uploaded image.</p>
        <div class="consumer-actions">
          <button type="button" class="primary" id="consumerAnalyzePhoto">Analyze photo</button>
          <button type="button" id="consumerSaveState" hidden>Save this state</button>
          <button type="button" id="consumerCompareState" hidden>Compare with saved state</button>
        </div>
      </div>
    </div>

    <div class="consumer-foot">
      <span id="consumerFlowStatus">Start with a photo of the space exactly how you want it.</span>
      <button type="button" class="ghost" id="consumerTryDemo">Try the controlled demo</button>
    </div>
  `;

  const photoDetails = document.createElement('details');
  photoDetails.id = 'consumerPhotoDetails';
  photoDetails.className = 'utility consumer-photo-details';
  const photoSummary = document.createElement('summary');
  photoSummary.innerHTML = '1 · Image + Alexa test mode <span class="utility-sub">Upload a scene, analyze it, then talk to REWIND</span>';
  photoDetails.append(photoSummary, section);
  liveDetails?.before(photoDetails);
  photoDetails.open = true;

  const demoDetails = document.createElement('details');
  demoDetails.id = 'controlledDemoDetails';
  demoDetails.className = 'utility consumer-demo-details';
  const demoSummary = document.createElement('summary');
  demoSummary.innerHTML = 'Controlled demo <span class="utility-sub">Repeatable 25% → 63% → 100% engineering test</span>';
  demoDetails.append(demoSummary, demoMount);
  advancedStack.append(demoDetails);

  const style = document.createElement('style');
  style.textContent = `
    .consumer-photo-flow{padding:16px;margin:0;border:0;border-radius:0;box-shadow:none;background:radial-gradient(circle at 92% 0,rgba(140,244,199,.075),transparent 36%),linear-gradient(180deg,#111a24,#0d131c)}
    .consumer-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}.consumer-head h2{font-size:24px;margin:5px 0 5px;letter-spacing:-.025em}.consumer-head p{max-width:730px;margin:0;color:var(--muted);font-size:12px;line-height:1.65}
    .consumer-modes{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:5px;margin:16px 0 14px;border:1px solid var(--line);border-radius:13px;background:#0b1119}.consumer-mode{border:0;background:transparent;color:var(--muted);box-shadow:none}.consumer-mode.active{background:#17251f;color:var(--mint);border:1px solid rgba(140,244,199,.34)}
    .consumer-grid{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:end}.consumer-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.consumer-field{display:grid;gap:5px;color:var(--muted);font-size:10px}.consumer-field input,.consumer-field select{width:100%}.consumer-capture{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .consumer-preview{display:grid;grid-template-columns:180px minmax(0,1fr);gap:14px;margin-top:14px;padding:12px;border:1px solid var(--line);border-radius:14px;background:#0a1018}.consumer-preview img{display:block;width:100%;height:130px;object-fit:cover;border-radius:10px;border:1px solid var(--line)}.consumer-preview-copy{align-self:center}.consumer-preview-copy strong{display:block;margin:4px 0}.consumer-preview-copy p{margin:0 0 9px;color:var(--muted);font-size:11px}.consumer-actions{display:flex;gap:8px;flex-wrap:wrap}
    .consumer-foot{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:12px;color:var(--muted);font-size:10px}.consumer-foot .ghost{padding:7px 9px;font-size:10px}.consumer-photo-details,.consumer-demo-details{margin:0}.consumer-photo-details>.consumer-photo-flow{border-top:1px solid var(--line)}.consumer-demo-details>#demoToolbarMount{padding:0 10px 10px}.consumer-photo-flow[data-busy="true"]{opacity:.78}.consumer-photo-flow[data-busy="true"] button{pointer-events:none}
    @media(max-width:760px){.consumer-grid{grid-template-columns:1fr}.consumer-fields{grid-template-columns:1fr}.consumer-capture{justify-content:stretch}.consumer-capture button{flex:1}.consumer-preview{grid-template-columns:1fr}.consumer-preview img{height:220px}.consumer-head{display:block}.consumer-head>.chip{margin-top:10px}.consumer-foot{align-items:flex-start;flex-direction:column}}
  `;
  document.head.append(style);

  const spaceName = el('consumerSpaceName');
  const stateName = el('consumerStateName');
  const stateNameField = el('consumerStateNameField');
  const savedStateField = el('consumerSavedStateField');
  const savedState = el('consumerSavedState');
  const cameraInput = el('consumerCameraInput');
  const photoInput = el('consumerPhotoInput');
  const takePhoto = el('consumerTakePhoto');
  const uploadPhoto = el('consumerUploadPhoto');
  const connectRing = el('consumerConnectRing');
  const previewWrap = el('consumerPreviewWrap');
  const photoPreview = el('consumerPhotoPreview');
  const photoName = el('consumerPhotoName');
  const photoStatus = el('consumerPhotoStatus');
  const analyzePhoto = el('consumerAnalyzePhoto');
  const saveState = el('consumerSaveState');
  const compareState = el('consumerCompareState');
  const flowStatus = el('consumerFlowStatus');
  const tryDemo = el('consumerTryDemo');

  function setBusy(next) {
    busy = next;
    section.dataset.busy = String(next);
    analyzePhoto.disabled = next || !selectedFile;
    saveState.disabled = next || !consumerObservationId;
    compareState.disabled = next || !consumerObservationId || !savedState.value;
  }

  function spaceId() {
    const slug = (spaceName.value || 'my-space')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 65) || 'my-space';
    return `phone-${slug}`;
  }

  function syncSpace() {
    const next = spaceId();
    if (space.value === next) return;
    space.value = next;
    space.dispatchEvent(new Event('change'));
  }

  function clearObservation() {
    consumerObservationId = undefined;
    latestObservationId = undefined;
    saveState.hidden = true;
    compareState.hidden = true;
    analyzePhoto.hidden = false;
    analyzePhoto.disabled = !selectedFile;
  }

  function syncConsumerRewindState() {
    document.body.classList.toggle('consumer-rewind-active', Boolean(activeRewindSessionId));
  }

  function selectPhoto(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      flowStatus.textContent = 'Choose an image file.';
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    selectedFile = file;
    previewUrl = URL.createObjectURL(file);
    photoPreview.src = previewUrl;
    photoName.textContent = file.name || 'Camera photo';
    previewWrap.hidden = false;
    photoStatus.textContent = mode === 'remember'
      ? 'Analyze this reference photo with Nova, then save its semantic state.'
      : 'Analyze the room as it looks now, then compare it with the saved state.';
    clearObservation();
    flowStatus.textContent = 'Photo ready. Analyze it to extract physical state.';
    document.body.dataset.observationSource = 'photo';
    syncConsumerRewindState();
    document.body.classList.add('consumer-setup');
  }

  function imageBlob(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        try {
          const scale = Math.min(1, 1280 / image.naturalWidth);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => {
            URL.revokeObjectURL(url);
            blob ? resolve(blob) : reject(new Error('Could not prepare this photo.'));
          }, 'image/jpeg', .88);
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read this photo.'));
      };
      image.src = url;
    });
  }

  async function loadSavedStates(preferredId) {
    syncSpace();
    try {
      const checkpoints = await api(`checkpoints?spaceId=${encodeURIComponent(space.value)}`);
      savedStates = Array.isArray(checkpoints) ? checkpoints : [];
      const options = savedStates.length
        ? savedStates.map(checkpoint => {
            const option = document.createElement('option');
            option.value = checkpoint.id;
            const views = Number(checkpoint.viewCount || 1);
            option.textContent = `${checkpoint.name} · ${views} ${views === 1 ? 'view' : 'views'}`;
            return option;
          })
        : [Object.assign(document.createElement('option'), { value: '', textContent: 'No saved states yet' })];
      savedState.replaceChildren(...options);
      if (preferredId && savedStates.some(checkpoint => checkpoint.id === preferredId)) savedState.value = preferredId;
      compareState.disabled = busy || !consumerObservationId || !savedState.value;
      if (mode === 'rewind' && !savedStates.length) flowStatus.textContent = 'No saved state for this space yet. Choose Remember a space first.';
    } catch (error) {
      savedStates = [];
      savedState.replaceChildren(Object.assign(document.createElement('option'), { value: '', textContent: 'Could not load saved states' }));
      flowStatus.textContent = error.message || 'Could not load saved states.';
    }
  }

  function setMode(next) {
    if (mode !== next) {
      rememberCheckpointId = undefined;
      rememberViewCount = 0;
      saveState.textContent = 'Save this state';
    }
    mode = next;
    document.body.dataset.consumerIntent = next;
    document.body.dataset.observationSource = 'photo';
    syncConsumerRewindState();
    document.body.classList.add('consumer-setup');
    section.querySelectorAll('[data-consumer-mode]').forEach(button => button.classList.toggle('active', button.dataset.consumerMode === next));
    stateNameField.hidden = next !== 'remember';
    savedStateField.hidden = next !== 'rewind';
    clearObservation();
    if (selectedFile) {
      photoStatus.textContent = next === 'remember'
        ? 'Analyze this reference photo with Nova, then save its semantic state.'
        : 'Analyze the room as it looks now, then compare it with the saved state.';
    }
    flowStatus.textContent = next === 'remember'
      ? 'Start with a photo of the space exactly how you want it.'
      : savedStates.length ? 'Choose a saved state and photograph how the space looks now.' : 'Loading saved states…';
    void loadSavedStates();
  }

  section.querySelectorAll('[data-consumer-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.consumerMode)));
  takePhoto.addEventListener('click', () => cameraInput.click());
  uploadPhoto.addEventListener('click', () => photoInput.click());
  cameraInput.addEventListener('change', () => selectPhoto(cameraInput.files?.[0]));
  photoInput.addEventListener('change', () => selectPhoto(photoInput.files?.[0]));
  savedState.addEventListener('change', () => { compareState.disabled = busy || !consumerObservationId || !savedState.value; });

  stateName.addEventListener('input', () => {
    if (!rememberCheckpointId) return;
    rememberCheckpointId = undefined;
    rememberViewCount = 0;
    saveState.textContent = 'Save this state';
    flowStatus.textContent = 'Checkpoint name changed. The next analyzed photo will start a new saved state.';
  });

  spaceName.addEventListener('change', () => {
    rememberCheckpointId = undefined;
    rememberViewCount = 0;
    saveState.textContent = 'Save this state';
    syncSpace();
    clearObservation();
    syncConsumerRewindState();
    void loadSavedStates();
  });

  analyzePhoto.addEventListener('click', async () => {
    if (!selectedFile || busy) return;
    setBusy(true);
    syncSpace();
    flowStatus.textContent = 'Nova is reading the physical state from this photo…';
    photoStatus.textContent = 'Analyzing with Nova 2 Lite…';
    try {
      const blob = await imageBlob(selectedFile);
      const image = await base64Blob(blob);
      const observeInput = { image, capturedAt: new Date().toISOString(), spaceId: space.value };
      if (mode === 'rewind' && savedState.value) observeInput.checkpointId = savedState.value;
      const observation = await api('observe', observeInput);
      latestObservationId = observation.observationId;
      consumerObservationId = observation.observationId;
      analyzePhoto.hidden = true;
      if (activeRewindSessionId) {
        syncConsumerRewindState();
        photoStatus.textContent = 'Alexa is now using this photo as the current scene.';
        flowStatus.textContent = 'Photo ready for Alexa. Say “check again”, then ask for status.';
        requestAnimationFrame(() => focusCard.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      } else if (mode === 'remember') {
        saveState.hidden = false;
        saveState.textContent = rememberCheckpointId ? 'Add this angle' : 'Save this state';
        photoStatus.textContent = rememberCheckpointId
          ? 'Semantic view ready. Alexa is also using this analyzed image as the current scene.'
          : 'Alexa is now using this photo as the current scene.';
        flowStatus.textContent = rememberCheckpointId
          ? `Photo analyzed. You can add it as view ${rememberViewCount + 1}, or continue with Alexa.`
          : 'Photo ready for Alexa. Say “remember this room as desk baseline”.';
      } else {
        compareState.hidden = false;
        compareState.disabled = !savedState.value;
        photoStatus.textContent = 'Alexa is now using this changed photo as the current scene.';
        flowStatus.textContent = 'Photo ready for Alexa. Say “rewind to” the saved state, then ask for status.';
      }
      status('Phone photo observed with Nova. Semantic state is ready; the uploaded image is not persisted by REWIND.');
      updateVerifyControls();
    } catch (error) {
      photoStatus.textContent = error.message || 'Could not analyze this photo.';
      flowStatus.textContent = 'Photo analysis failed. Try another image.';
    } finally {
      setBusy(false);
    }
  });

  saveState.addEventListener('click', async () => {
    if (!consumerObservationId || busy || !stateName.value.trim()) return;
    setBusy(true);
    flowStatus.textContent = rememberCheckpointId
      ? 'Adding this semantic angle to the saved checkpoint…'
      : 'Saving semantic reference to DynamoDB…';
    try {
      const checkpoint = rememberCheckpointId
        ? await api('checkpoints/view', {
            observationId: consumerObservationId,
            spaceId: space.value,
            checkpointId: rememberCheckpointId,
          })
        : await api('checkpoints', {
            observationId: consumerObservationId,
            spaceId: space.value,
            name: stateName.value.trim(),
          });

      rememberCheckpointId = checkpoint.id;
      rememberViewCount = Number(checkpoint.viewCount || 1);
      saveState.textContent = 'Add this angle';
      await loadSavedStates(checkpoint.id);

      flowStatus.textContent = rememberViewCount < 3
        ? `Saved “${checkpoint.name}” with ${rememberViewCount} ${rememberViewCount === 1 ? 'view' : 'views'}. Take another angle for stronger coverage, or switch to Rewind a space.`
        : `Saved “${checkpoint.name}” with ${rememberViewCount} semantic views. This checkpoint is ready for cross-angle Rewind.`;
      photoStatus.textContent = 'View saved. Raw photo discarded; REWIND keeps semantic memory and a non-reversible fingerprint.';
      status(`${checkpoint.name}: ${rememberViewCount} semantic ${rememberViewCount === 1 ? 'view' : 'views'} saved.`);
    } catch (error) {
      flowStatus.textContent = error.message || 'Could not save this checkpoint view.';
    } finally {
      setBusy(false);
    }
  });

  compareState.addEventListener('click', async () => {
    if (!consumerObservationId || !savedState.value || busy) return;
    setBusy(true);
    flowStatus.textContent = 'Comparing current reality with the saved state…';
    try {
      latestObservationId = consumerObservationId;
      await compareCheckpoint(savedState.value);
      document.body.classList.remove('consumer-setup');
      document.body.classList.remove('consumer-rewind-active');
      focusCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      flowStatus.textContent = 'Comparison ready. Follow the REWIND card below.';
    } catch (error) {
      flowStatus.textContent = error.message || 'Could not compare this state.';
    } finally {
      setBusy(false);
    }
  });

  connectRing.addEventListener('click', () => {
    document.body.dataset.observationSource = 'ring';
    document.body.classList.remove('consumer-setup', 'consumer-rewind-active');
    if (liveDetails) liveDetails.open = true;
    liveDetails?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  tryDemo.addEventListener('click', () => {
    document.body.classList.remove('consumer-setup', 'consumer-rewind-active');
    demoDetails.open = true;
    demoDetails.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.querySelectorAll('[data-source]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.source !== 'ring') document.body.classList.remove('consumer-setup', 'consumer-rewind-active');
  }));

  if (advancedDetails) advancedDetails.open = false;
  if (liveDetails) liveDetails.open = false;
  photoDetails.open = true;
  demoDetails.open = false;
  document.body.dataset.observationSource = 'photo';
  document.body.dataset.consumerIntent = mode;
  syncConsumerRewindState();
  document.body.classList.add('consumer-setup');
  syncSpace();
  void loadSavedStates();

  window.addEventListener('pagehide', () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  });
})();