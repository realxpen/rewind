const $ = id => document.getElementById(id);
let mode = "remember";
let selectedFile;
let previewUrl;
let checkpoints = [];
let busy = false;
let voiceBusy = false;
let recognition;
let listening = false;

const voiceSessionId = (() => {
  const key = "rewind.voice.session";
  let value = localStorage.getItem(key);
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, value);
  }
  return value;
})();

function setStatus(title, text, kind = "") {
  const box = $("status");
  box.className = `status ${kind}`.trim();
  box.innerHTML = "<strong></strong><span></span>";
  box.querySelector("strong").textContent = title;
  box.querySelector("span").textContent = text;
}

function setVoiceState(text) {
  $("voiceState").textContent = text;
}

function addVoiceBubble(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  bubble.textContent = text;
  $("voiceLog").append(bubble);
  $("voiceLog").scrollTop = $("voiceLog").scrollHeight;
}

function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed with HTTP ${response.status}`);
  return data;
}

async function health() {
  try {
    const data = await api("health", { method: "GET" });
    $("healthLabel").textContent = data.storageConfigured ? "Vercel ready" : "Needs AWS env";
    if (data.defaultSpaceId) $("spaceId").value = data.defaultSpaceId;
    await loadCheckpoints();
  } catch (error) {
    $("healthLabel").textContent = "Unavailable";
    setStatus("Deployment unavailable", error.message, "bad");
  }
}

async function loadCheckpoints() {
  const spaceId = $("spaceId").value.trim();
  if (!spaceId) return;
  try {
    checkpoints = await api(`checkpoints?spaceId=${encodeURIComponent(spaceId)}`, { method: "GET" });
    const select = $("checkpoint");
    if (!checkpoints.length) {
      select.replaceChildren(Object.assign(document.createElement("option"), { value: "", textContent: "No saved state yet" }));
      return;
    }
    const current = select.value;
    select.replaceChildren(...checkpoints.map(item => Object.assign(document.createElement("option"), {
      value: item.id,
      textContent: item.name,
    })));
    if (checkpoints.some(item => item.id === current)) select.value = current;
  } catch (error) {
    checkpoints = [];
    setStatus("Could not load saved states", error.message, "bad");
  }
}

function setMode(next) {
  mode = next;
  document.querySelectorAll("[data-mode]").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
  $("checkpointField").hidden = mode !== "rewind";
  $("sceneBox").hidden = true;
  if (mode === "rewind") void loadCheckpoints();
  setStatus(mode === "remember" ? "Remember mode" : "Rewind mode",
    mode === "remember"
      ? "Analyze the clean reference scene, then tell REWIND Voice what to call it."
      : "Choose the saved state, analyze the changed or restored scene, then talk to REWIND Voice.");
}

function selectFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setStatus("Choose an image", "The selected file is not an image.", "bad");
    return;
  }
  selectedFile = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  $("previewImage").src = previewUrl;
  $("photoName").textContent = file.name || "Camera photo";
  $("preview").hidden = false;
  $("analyze").disabled = false;
  $("sceneBox").hidden = true;
  setStatus("Photo selected", "Analyze it with Nova to make it REWIND's current semantic scene.");
}

function imageBlob(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      try {
        const scale = Math.min(1, 1280 / image.naturalWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          URL.revokeObjectURL(url);
          blob ? resolve(blob) : reject(new Error("Could not prepare this photo."));
        }, "image/jpeg", .86);
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image."));
    };
    image.src = url;
  });
}

function base64Blob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not encode this photo."));
    reader.readAsDataURL(blob);
  });
}

async function runVoiceCommand(raw) {
  const transcript = String(raw || "").trim();
  if (!transcript || voiceBusy) return;
  voiceBusy = true;
  $("voiceSend").disabled = true;
  $("voiceMic").disabled = true;
  setVoiceState("Thinking…");
  addVoiceBubble("user", transcript);
  $("voiceInput").value = "";

  try {
    const chosen = checkpoints.find(item => item.id === $("checkpoint").value);
    const data = await api("voice", {
      method: "POST",
      body: JSON.stringify({
        sessionId: voiceSessionId,
        spaceId: $("spaceId").value.trim(),
        transcript,
        ...(mode === "rewind" && $("checkpoint").value ? { checkpointId: $("checkpoint").value } : {}),
        ...(mode === "rewind" && chosen?.name ? { checkpointName: chosen.name } : {}),
      }),
    });
    addVoiceBubble("assistant", data.text);
    speak(data.text);
    setVoiceState(data.state ? data.state.replaceAll("_", " ") : "Ready");
    if (data.command === "remember") await loadCheckpoints();
    if (typeof data.pendingActions === "number") {
      setStatus(
        data.state === "RESTORED" ? "RESTORED" : "REWIND Voice ready",
        data.state === "RESTORED"
          ? "The deterministic engine verified the saved state."
          : `${data.pendingActions} restore action${data.pendingActions === 1 ? "" : "s"} pending.`,
        data.state === "RESTORED" ? "good" : "",
      );
    }
  } catch (error) {
    addVoiceBubble("assistant", `I couldn't complete that command: ${error.message}`);
    setVoiceState("Error");
  } finally {
    voiceBusy = false;
    $("voiceSend").disabled = false;
    $("voiceMic").disabled = false;
  }
}

function setupSpeechRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    $("voiceMic").disabled = true;
    $("voiceMic").textContent = "Mic unavailable";
    $("voiceNote").textContent = "This browser does not expose speech recognition. Type a command instead—the same REWIND Voice backend is used.";
    return;
  }

  recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    listening = true;
    $("voiceMic").classList.add("listening");
    $("voiceOrb").classList.add("listening");
    $("voiceMic").textContent = "Listening…";
    setVoiceState("Listening");
  };

  recognition.onresult = event => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();
    if (transcript) void runVoiceCommand(transcript);
  };

  recognition.onerror = event => {
    if (event.error !== "no-speech") {
      addVoiceBubble("assistant", `Microphone recognition error: ${event.error}. You can type the command instead.`);
    }
  };

  recognition.onend = () => {
    listening = false;
    $("voiceMic").classList.remove("listening");
    $("voiceOrb").classList.remove("listening");
    $("voiceMic").textContent = "🎙 Talk";
    if (!voiceBusy) setVoiceState("Ready");
  };
}

$("analyze").onclick = async () => {
  if (!selectedFile || busy) return;
  busy = true;
  $("analyze").disabled = true;
  setStatus("Nova is analyzing…", "Extracting semantic physical state. This can take several seconds.");
  try {
    const blob = await imageBlob(selectedFile);
    const image = await base64Blob(blob);
    const body = {
      image,
      capturedAt: new Date().toISOString(),
      spaceId: $("spaceId").value.trim(),
    };
    if (mode === "rewind") {
      const checkpointId = $("checkpoint").value;
      if (!checkpointId) throw new Error("Choose the saved state you want to rewind to.");
      body.checkpointId = checkpointId;
    }
    const observation = await api("observe", { method: "POST", body: JSON.stringify(body) });
    const entities = Array.isArray(observation.state?.entities) ? observation.state.entities : [];
    $("entities").replaceChildren(...entities.slice(0, 12).map(entity => Object.assign(document.createElement("span"), {
      className: "entity",
      textContent: entity.key,
    })));
    $("sceneBox").hidden = false;
    if (mode === "remember") {
      $("sceneText").textContent = "The clean reference scene is analyzed and ready for REWIND Voice.";
      $("sceneCommand").textContent = "Say: remember this room as desk baseline";
    } else {
      const chosen = checkpoints.find(item => item.id === $("checkpoint").value);
      $("sceneText").textContent = "The latest changed/restored scene is now the semantic state REWIND Voice will compare.";
      $("sceneCommand").textContent = `Say: rewind this room to ${chosen?.name || "desk baseline"}`;
    }
    setStatus("REWIND scene ready", `${entities.length} semantic entities · ${observation.latencyMs ?? "—"} ms Nova latency.`, "good");
  } catch (error) {
    setStatus("Analysis failed", error.message, "bad");
  } finally {
    busy = false;
    $("analyze").disabled = !selectedFile;
  }
};

document.querySelectorAll("[data-mode]").forEach(button => button.onclick = () => setMode(button.dataset.mode));
document.querySelectorAll("[data-voice]").forEach(button => button.onclick = () => void runVoiceCommand(button.dataset.voice));
$("takePhoto").onclick = () => $("cameraInput").click();
$("uploadPhoto").onclick = () => $("uploadInput").click();
$("cameraInput").onchange = () => selectFile($("cameraInput").files?.[0]);
$("uploadInput").onchange = () => selectFile($("uploadInput").files?.[0]);
$("refresh").onclick = () => void loadCheckpoints();
$("spaceId").onchange = () => void loadCheckpoints();
$("voiceSend").onclick = () => void runVoiceCommand($("voiceInput").value);
$("voiceInput").onkeydown = event => {
  if (event.key === "Enter") void runVoiceCommand($("voiceInput").value);
};
$("voiceMic").onclick = () => {
  if (!recognition || voiceBusy) return;
  try {
    if (listening) recognition.stop();
    else recognition.start();
  } catch {
    // Some browsers throw if start/stop is called during a transition.
  }
};
window.addEventListener("beforeunload", () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  window.speechSynthesis?.cancel?.();
});

setupSpeechRecognition();
void health();
