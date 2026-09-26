const $ = id => document.getElementById(id);
let mode = "remember";
let selectedFile;
let previewUrl;
let checkpoints = [];
let busy = false;

function setStatus(title, text, kind = "") {
  const box = $("status");
  box.className = `status ${kind}`.trim();
  box.innerHTML = `<strong></strong><span></span>`;
  box.querySelector("strong").textContent = title;
  box.querySelector("span").textContent = text;
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
    select.replaceChildren(...checkpoints.map(item => Object.assign(document.createElement("option"), {
      value: item.id,
      textContent: item.name,
    })));
  } catch (error) {
    checkpoints = [];
    setStatus("Could not load saved states", error.message, "bad");
  }
}

function setMode(next) {
  mode = next;
  document.querySelectorAll("[data-mode]").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
  $("checkpointField").hidden = mode !== "rewind";
  $("alexaBox").hidden = true;
  if (mode === "rewind") void loadCheckpoints();
  setStatus(mode === "remember" ? "Remember mode" : "Rewind mode",
    mode === "remember"
      ? "Analyze the clean reference scene, then ask Alexa to remember it."
      : "Choose the saved state, analyze the changed or restored scene, then talk to Alexa.");
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
  $("alexaBox").hidden = true;
  setStatus("Photo selected", "Analyze it with Nova to make it Alexa's current semantic scene.");
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
    $("alexaBox").hidden = false;
    if (mode === "remember") {
      $("alexaText").textContent = "The clean reference scene is analyzed and stored as semantic state.";
      $("alexaCommand").textContent = "ask rewind memory to remember this room as desk baseline";
    } else {
      const chosen = checkpoints.find(item => item.id === $("checkpoint").value);
      $("alexaText").textContent = "The latest changed/restored scene is now the exact semantic state Alexa will compare.";
      $("alexaCommand").textContent = `ask rewind memory to rewind to ${chosen?.name || "desk baseline"}`;
    }
    setStatus("Alexa scene ready", `${entities.length} semantic entities · ${observation.latencyMs ?? "—"} ms Nova latency.`, "good");
  } catch (error) {
    setStatus("Analysis failed", error.message, "bad");
  } finally {
    busy = false;
    $("analyze").disabled = !selectedFile;
  }
};

document.querySelectorAll("[data-mode]").forEach(button => button.onclick = () => setMode(button.dataset.mode));
$("takePhoto").onclick = () => $("cameraInput").click();
$("uploadPhoto").onclick = () => $("uploadInput").click();
$("cameraInput").onchange = () => selectFile($("cameraInput").files?.[0]);
$("uploadInput").onchange = () => selectFile($("uploadInput").files?.[0]);
$("refresh").onclick = () => void loadCheckpoints();
$("spaceId").onchange = () => void loadCheckpoints();
window.addEventListener("beforeunload", () => { if (previewUrl) URL.revokeObjectURL(previewUrl); });

void health();
