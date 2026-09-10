let activeRewindSessionId;
let lastVerifiedObservationId;

function updateVerifyControls() {
  const panel = byId('verifyPanel');
  const button = byId('checkAgain');
  if (!panel || !button) return;
  panel.hidden = !activeRewindSessionId;
  button.disabled = !activeRewindSessionId || !latestObservationId || latestObservationId === lastVerifiedObservationId || observing || rewinding;
}

const originalStartRewind = byId('startRewind').onclick;
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
      : 'Follow one or more guidance steps, capture a fresh Ring frame, observe it with Nova, then Check Again.';
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
    const result = await api('rewind/verify', {
      spaceId: byId('space').value,
      observationId: latestObservationId,
      rewindSessionId: activeRewindSessionId,
    });
    lastVerifiedObservationId = latestObservationId;
    renderRewind(result);
    byId('verifyState').textContent = result.state;
    byId('verifySummary').textContent = result.progress.restored
      ? '100% RESTORED — the current physical state matches the saved checkpoint.'
      : `${result.progress.percentage}% restored · ${result.progress.remainingChanges} semantic difference(s) remain${result.progress.unknownChanges ? ` · ${result.progress.unknownChanges} uncertain` : ''}. Follow the remaining PENDING guidance, capture a fresh frame, observe with Nova, then Check Again.`;
    status(result.progress.restored
      ? `${result.checkpoint.name}: 100% RESTORED.`
      : `${result.progress.percentage}% restored. ${result.progress.remainingChanges} difference(s) remain.`);
  } catch (error) {
    status(error.message || 'Could not verify Rewind progress.');
  } finally {
    rewinding = false;
    controls();
    updateVerifyControls();
  }
};

byId('space').addEventListener('change', () => {
  activeRewindSessionId = undefined;
  lastVerifiedObservationId = undefined;
  byId('verifyPanel').hidden = true;
});

setInterval(updateVerifyControls, 250);
updateVerifyControls();
