const introView = document.querySelector('#introView');
const roomView = document.querySelector('#roomView');
const hostPanel = document.querySelector('#hostPanel');
const viewerPanel = document.querySelector('#viewerPanel');
const roomCodeElement = document.querySelector('#roomCode');
const roomInput = document.querySelector('#roomInput');
const shareButton = document.querySelector('#shareButton');
const screenVideo = document.querySelector('#screenVideo');
const stageEmpty = document.querySelector('.stage-empty');
const stageTitle = document.querySelector('#stageTitle');
const stageCopy = document.querySelector('#stageCopy');
const connectionStatus = document.querySelector('#connectionStatus');
const statusDot = document.querySelector('.status-dot');
const toast = document.querySelector('#toast');
const nameInput = document.querySelector('#nameInput');
const controlButton = document.querySelector('#controlButton');
const viewerList = document.querySelector('#viewerList');
const qrCode = document.querySelector('#qrCode');

let mode;
let roomCode;
let socket;
let peer;
let stream;
let viewerId;
let viewerName;
let controlGranted = false;
const viewers = new Map();

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function setStatus(message, live = false) {
  connectionStatus.textContent = message;
  statusDot.classList.toggle('live', live);
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function sendTo(message, to) {
  send({ ...message, to });
}

function createPeer() {
  peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  peer.onicecandidate = (event) => { if (event.candidate) send({ type: 'signal', data: { candidate: event.candidate } }); };
  peer.onconnectionstatechange = () => {
    if (['connected', 'completed'].includes(peer.connectionState)) setStatus('Connected', true);
    if (['failed', 'disconnected'].includes(peer.connectionState)) setStatus('Connection lost');
  };
  peer.ontrack = (event) => {
    screenVideo.srcObject = event.streams[0];
    stageEmpty.classList.add('hidden');
  };
  return peer;
}

async function negotiate() {
  if (!peer || !stream) return;
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  send({ type: 'signal', data: { description: peer.localDescription } });
}

async function handleSignal(data) {
  if (!peer) createPeer();
  if (data.description) {
    await peer.setRemoteDescription(data.description);
    if (data.description.type === 'offer') {
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      send({ type: 'signal', data: { description: peer.localDescription } });
    }
  } else if (data.candidate) {
    try { await peer.addIceCandidate(data.candidate); } catch { /* The other peer may have ended the call. */ }
  }
}

function renderViewerList() {
  viewerList.replaceChildren();
  if (!viewers.size) { viewerList.innerHTML = '<span class="helper">No viewers yet.</span>'; return; }
  viewers.forEach((viewer) => {
    const row = document.createElement('div');
    row.className = 'viewer-row';
    row.innerHTML = `<span>${viewer.name}</span><button class="access-button" data-viewer="${viewer.id}">${viewer.granted ? 'Control allowed' : 'Allow control'}</button>`;
    row.querySelector('button').addEventListener('click', () => {
      viewer.granted = !viewer.granted;
      sendTo({ type: 'control-response', granted: viewer.granted }, viewer.id);
      renderViewerList();
      showToast(viewer.granted ? `${viewer.name} can send control requests.` : `Control removed from ${viewer.name}.`);
    });
    viewerList.append(row);
  });
}

async function loadQrCode() {
  const joinUrl = `${location.origin}/?room=${roomCode}`;
  const response = await fetch(`/api/qr?text=${encodeURIComponent(joinUrl)}`);
  if (!response.ok) return;
  const result = await response.json();
  qrCode.src = result.dataUrl;
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const nameQuery = mode === 'viewer' ? `&name=${encodeURIComponent(viewerName)}` : '';
  socket = new WebSocket(`${protocol}//${location.host}/ws?room=${roomCode}&role=${mode}${nameQuery}`);
  socket.onopen = () => setStatus('Joining room');
  socket.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'joined') { viewerId = message.id; setStatus('Room open', true); return; }
    if (message.type === 'viewer-joined' && mode === 'host') {
      viewers.set(message.viewerId, { id: message.viewerId, name: message.viewerName, granted: false });
      renderViewerList();
      createPeer(); await negotiate(); return;
    }
    if (message.type === 'signal') await handleSignal(message.data);
    if (message.type === 'control-request' && mode === 'host') showToast(`${message.viewerName} requested control access. Use Viewer Access to approve.`);
    if (message.type === 'control-response' && mode === 'viewer') {
      controlGranted = message.granted;
      controlButton.textContent = controlGranted ? 'Control access allowed' : 'Request control';
      showToast(controlGranted ? 'The presenter allowed control messages.' : 'Control access was removed.');
    }
    if (message.type === 'control-event' && mode === 'host') {
      stageCopy.textContent = `Control input received from ${viewers.get(message.viewerId)?.name || 'viewer'} (browser-only).`;
    }
    if (message.type === 'error') { showToast(message.message); setStatus('Unavailable'); }
  };
  socket.onclose = () => setStatus('Offline');
}

function openRoom(selectedMode) {
  mode = selectedMode;
  roomCode = mode === 'host' ? makeRoomCode() : '';
  introView.classList.add('hidden');
  roomView.classList.remove('hidden');
  document.querySelector('#modeLabel').textContent = mode === 'host' ? 'SCREEN HOST' : 'SCREEN VIEWER';
  document.querySelector('#roomTitle').textContent = mode === 'host' ? 'Your room is ready.' : 'Join a room.';
  hostPanel.classList.toggle('hidden', mode !== 'host');
  viewerPanel.classList.toggle('hidden', mode !== 'viewer');
  if (mode === 'host') { roomCodeElement.textContent = roomCode; connect(); loadQrCode().catch(() => showToast('QR code could not be generated.')); }
}

document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => openRoom(button.dataset.mode)));
document.querySelector('#leaveButton').addEventListener('click', () => window.location.reload());
document.querySelector('#joinButton').addEventListener('click', () => {
  viewerName = nameInput.value.trim();
  if (!viewerName) { showToast('Enter your name first.'); nameInput.focus(); return; }
  roomCode = roomInput.value.trim().toUpperCase();
  if (roomCode.length < 4) { showToast('Enter the room code first.'); return; }
  roomCodeElement.textContent = roomCode;
  connect();
  controlButton.classList.remove('hidden');
  document.querySelector('#roomTitle').textContent = 'Waiting for the presenter.';
});
controlButton.addEventListener('click', () => {
  if (controlGranted) { send({ type: 'control-response', granted: false }); return; }
  send({ type: 'control-request' });
  controlButton.textContent = 'Control requested';
  showToast('Waiting for presenter approval.');
});
document.querySelector('#copyButton').addEventListener('click', async () => {
  await navigator.clipboard.writeText(roomCode);
  showToast('Room code copied.');
});
shareButton.addEventListener('click', async () => {
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    stream.getTracks().forEach((track) => track.onended = () => { shareButton.textContent = 'Start sharing'; stageTitle.textContent = 'Sharing stopped'; });
    shareButton.textContent = 'Sharing live';
    shareButton.disabled = true;
    createPeer();
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    stageEmpty.classList.remove('hidden');
    stageTitle.textContent = 'Sharing is live';
    stageCopy.textContent = 'The viewer can now see your screen.';
    await negotiate();
  } catch (error) { showToast(error.name === 'NotAllowedError' ? 'Screen sharing was cancelled.' : 'Could not start screen sharing.'); }
});

const queryRoom = new URLSearchParams(location.search).get('room');
if (queryRoom) { openRoom('viewer'); roomInput.value = queryRoom.toUpperCase(); }