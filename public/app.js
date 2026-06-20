const state = {
  player: null,
  playerReady: false,
  channelState: null,
  loading: false
};

const els = {
  loginButton: document.querySelector("#loginButton"),
  syncButton: document.querySelector("#syncButton"),
  notifyButton: document.querySelector("#notifyButton"),
  devSeedButton: document.querySelector("#devSeedButton"),
  modePill: document.querySelector("#modePill"),
  statusText: document.querySelector("#statusText"),
  emptyState: document.querySelector("#emptyState"),
  currentThumb: document.querySelector("#currentThumb"),
  currentTitle: document.querySelector("#currentTitle"),
  currentChannel: document.querySelector("#currentChannel"),
  nextList: document.querySelector("#nextList")
};

window.onYouTubeIframeAPIReady = () => {
  state.player = new YT.Player("player", {
    width: "100%",
    height: "100%",
    playerVars: {
      rel: 0,
      modestbranding: 1,
      playsinline: 1
    },
    events: {
      onReady: () => {
        state.playerReady = true;
        loadCurrentVideo();
      },
      onStateChange: (event) => {
        if (event.data === YT.PlayerState.ENDED) {
          void handleVideoEnded();
        }
      }
    }
  });
};

els.syncButton.addEventListener("click", () => {
  void syncSubscriptions();
});

els.notifyButton.addEventListener("click", () => {
  void enableNotifications();
});

els.devSeedButton.addEventListener("click", () => {
  void seedDemo();
});

void boot();

async function boot() {
  await refreshChannelState();
  const jumpVideoId = new URLSearchParams(window.location.search).get("jumpVideoId");

  if (jumpVideoId) {
    await jumpToVideo(jumpVideoId);
    window.history.replaceState({}, "", "/");
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });

  if (response.status === 401) {
    showLoggedOut();
    throw new Error("Not signed in");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || "Request failed");
  }

  return data;
}

async function refreshChannelState() {
  setLoading("Loading");

  try {
    const data = await api("/api/channel-state");
    setChannelState(data);
    showLoggedIn();
  } catch (error) {
    if (error.message !== "Not signed in") {
      setError(error.message);
    }
  }
}

async function syncSubscriptions() {
  setLoading("Syncing");

  try {
    const data = await api("/api/sync-subscriptions", { method: "POST", body: "{}" });
    setChannelState(data);
  } catch (error) {
    setError(error.message);
  }
}

async function seedDemo() {
  setLoading("Seeding");

  try {
    const data = await api("/api/dev-seed", { method: "POST", body: "{}" });
    setChannelState(data.state);
    showLoggedIn();
  } catch (error) {
    setError(error.message);
  }
}

async function handleVideoEnded() {
  if (state.loading) return;
  setLoading("Advancing");

  try {
    const data = await api("/api/video-ended", { method: "POST", body: "{}" });
    setChannelState(data);
  } catch (error) {
    setError(error.message);
  }
}

async function jumpToVideo(videoId) {
  setLoading("Switching");

  try {
    const data = await api("/api/jump", {
      method: "POST",
      body: JSON.stringify({ videoId })
    });
    setChannelState(data);
  } catch (error) {
    setError(error.message);
  }
}

async function enableNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    setError("Notifications unavailable");
    return;
  }

  try {
    const config = await api("/api/config");
    if (!config.vapidPublicKey) {
      setError("VAPID key missing");
      return;
    }

    const registration = await navigator.serviceWorker.register("/sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setError("Notifications blocked");
      return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey)
    });

    await api("/api/notifications/register", {
      method: "POST",
      body: JSON.stringify(subscription)
    });

    els.statusText.textContent = "Notifications enabled";
  } catch (error) {
    setError(error.message);
  }
}

function setChannelState(nextState) {
  state.channelState = nextState;
  state.loading = false;
  render();
  loadCurrentVideo();
}

function render() {
  const current = state.channelState?.current;
  const next = state.channelState?.next || [];
  const mode = state.channelState?.mode || "fresh";

  els.modePill.textContent = modeLabel(mode);
  els.modePill.dataset.mode = mode;
  els.statusText.textContent = current ? "Ready" : "Empty";
  els.emptyState.classList.toggle("hidden", Boolean(current));
  els.currentThumb.classList.toggle("hidden", !current);

  if (current) {
    els.currentThumb.src = current.thumbnailUrl;
    els.currentTitle.textContent = current.title;
    els.currentChannel.textContent = current.channelTitle;
  } else {
    els.currentThumb.removeAttribute("src");
    els.currentTitle.textContent = "No videos ready";
    els.currentChannel.textContent = "Sync subscriptions or seed demo data.";
  }

  els.nextList.innerHTML = "";
  for (const video of next) {
    const item = document.createElement("li");
    item.className = "next-item";
    item.innerHTML = `
      <img src="${escapeAttribute(video.thumbnailUrl)}" alt="" />
      <div>
        <strong>${escapeHtml(video.title)}</strong>
        <span>${escapeHtml(video.channelTitle)}</span>
      </div>
    `;
    els.nextList.append(item);
  }

  if (next.length === 0) {
    const item = document.createElement("li");
    item.className = "next-empty";
    item.textContent = "Nothing queued yet.";
    els.nextList.append(item);
  }
}

function loadCurrentVideo() {
  const videoId = state.channelState?.current?.videoId;
  if (!videoId || !state.playerReady) return;

  const loadedVideoUrl = state.player.getVideoUrl?.() || "";
  if (loadedVideoUrl.includes(videoId)) return;
  state.player.loadVideoById(videoId);
}

function showLoggedIn() {
  els.loginButton.classList.add("hidden");
  els.syncButton.classList.remove("hidden");
  els.notifyButton.classList.remove("hidden");
}

function showLoggedOut() {
  state.loading = false;
  els.loginButton.classList.remove("hidden");
  els.syncButton.classList.add("hidden");
  els.notifyButton.classList.add("hidden");
  els.statusText.textContent = "Signed out";
  els.currentTitle.textContent = "DriftYT";
  els.currentChannel.textContent = "Sign in to begin.";
  els.emptyState.classList.remove("hidden");
}

function setLoading(label) {
  state.loading = true;
  els.statusText.textContent = label;
}

function setError(message) {
  state.loading = false;
  els.statusText.textContent = message;
}

function modeLabel(mode) {
  if (mode === "catch_up") return "Catch-up";
  if (mode === "replay") return "Replay";
  return "Fresh";
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }

  return output;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
