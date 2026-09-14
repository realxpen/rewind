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
      if (status) status.textContent = 'Alexa/MCP requested a fresh Ring observation…';
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
