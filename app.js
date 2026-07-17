import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, query, orderBy,
  serverTimestamp, doc, setDoc, where, getDocs, deleteDoc, getDoc, updateDoc,
  limit, startAfter
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { 
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, signInWithCredential 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// 1. FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyB8pyL9d6X0j1D0vHLhi0lWNID9K8jpVnU",
  authDomain: "yappapp-8031b.firebaseapp.com",
  projectId: "yappapp-8031b",
  storageBucket: "yappapp-8031b.firebasestorage.app",
  messagingSenderId: "221465604909",
  appId: "1:221465604909:web:4fddfa24a0620986ab59a4"
};

// 2. INITIALIZE FIREBASE FIRST
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// 🛑 REALTIME EMERGENCY KILL SWITCH LISTENER
onSnapshot(doc(db, "system", "config"), (docSnap) => {
  if (docSnap.exists() && docSnap.data().maintenanceMode === true) {
    const reason = docSnap.data().maintenanceReason || "";

    const loginLoader = document.getElementById('login-loader');
    const loginScreen = document.getElementById('login-screen');
    const chatScreen = document.getElementById('chat-screen');
    const modalOverlays = document.querySelectorAll('.modal-overlay');

    if (loginLoader) loginLoader.remove();
    if (loginScreen) loginScreen.remove();
    if (chatScreen) chatScreen.remove();
    modalOverlays.forEach(overlay => overlay.remove());

    document.body.innerHTML = `
      <div style="width: 100vw; height: 100vh; background: var(--dark-bg); position: fixed; top: 0; left: 0; z-index: 99999; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 15px;">
        <h1 style="
          margin: 0;
          text-align: center;
          font-family: 'Roboto Mono', sans-serif;
          font-weight: 100;
          color: var(--text-color);
          font-size: 1.8rem;
          padding: 0 20px;
          line-height: 1.5;
        ">
          YappApp has been temporarily shut down...
        </h1>
        ${reason ? `
          <p style="
            margin: 0;
            text-align: center;
            font-family: 'Roboto Mono', sans-serif;
            font-weight: 300;
            color: var(--golden);
            font-size: 1rem;
            padding: 0 20px;
            max-width: 600px;
            line-height: 1.6;
            opacity: 0.8;
          ">
            ${reason}
          </p>
        ` : ''}
      </div>
    `;
  }
});

// 4. CONFIG CONSTANTS
const IMGBB_API_KEY = "54f9963d526d01ed942d9a92b00bf05f";
const DEFAULT_AVATAR = "defaultuser.png";
const DEFAULT_AVATAR_LARGE = "defaultuser.png";

// ==========================================
// 🔊 AUDIO ENGINE
// ==========================================
const notifSound = new Audio('./notif.mp3');
const pingSound = new Audio('./notif.mp3');
notifSound.volume = 0.5;
pingSound.volume = 0.6;

const callingSound = new Audio('./calling.mp3');
const beingCalledSound = new Audio('./ringtone.mp3');
const joinSound = new Audio('./join.mp3');
const endCallSound = new Audio('./endcall.mp3');

callingSound.volume = 0.5;
callingSound.loop = true;
beingCalledSound.volume = 0.5;
beingCalledSound.loop = true;
joinSound.volume = 0.5;
endCallSound.volume = 0.5;

let chatMessagesCache = {};

// ==========================================
// 🧠 STATE MANAGEMENT & LISTENERS
// ==========================================
let currentUser = "";
let currentEmail = "";
let currentDisplayName = "";
let currentChatType = "global";
let currentChatTarget = "general";
let replyingTo = null;

let isInputEmojiTarget = false;

let unsubscribeChat = null;
let unsubscribeUserCheck = null;
let unsubscribeSidebar = null;
let unsubscribeBgGlobal = null;
let unsubscribeBgDM = null;
let unsubscribeIncomingCalls = null;
let unsubscribeSystem = null;

let mutedChannels = JSON.parse(localStorage.getItem('yapp_muted_channels') || '[]');
let unreadCounts = {};
let loginSessionTime = 0;
let userSelectedStatus = "online"; 

const MESSAGES_PER_PAGE = 15;
let oldestLoadedDoc = null;
let hasMoreMessages = true;
let isFirstPageLoaded = false;
const loginLoader = document.getElementById('login-loader');

let lastSentMessageText = "";
let duplicateMessageCount = 0;
let recentMessageTimestamps = [];
let isSpamBlocked = false;

let cachedUserData = null;
let userListCache = {};

let isDoNotDisturb = localStorage.getItem('yapp_dnd') === 'true';
let showShorts = localStorage.getItem('yapp_show_shorts') === 'true';

// ==========================================
// 📞 WEBRTC VOICE, VIDEO & SCREENSHARE STATE
// ==========================================
let localStream = null;
let screenStream = null;
let peerConnection = null;
let currentCallId = null;
let unsubscribeCallSession = null;
let callTimeoutTimer = null;
let isCameraOn = true;
let isMicOn = true;
let isSharingScreen = false;

function encryptText(text) { return text ? CryptoJS.AES.encrypt(text, "YAPPMASTER!.!").toString() : ""; }
function decryptText(ciphertext) {
  if (!ciphertext) return "";
  try { return CryptoJS.AES.decrypt(ciphertext, "YAPPMASTER!.!").toString(CryptoJS.enc.Utf8) || "[Encrypted Message!!]"; } catch (err) { return "[Encrypted Message!!]"; }
}

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

// ==========================================
// 🏗️ DOM ELEMENTS
// ==========================================
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const googleLoginBtn = document.getElementById('google-login-btn');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const messagesContainer = document.getElementById('messages');
const userList = document.getElementById('user-list');
const currentChatTitle = document.getElementById('current-chat-title');
const globalChannels = document.querySelectorAll('.global-channel');
const muteBtn = document.getElementById('mute-btn');
const dndBtn = document.getElementById('dnd-btn');

const replyBanner = document.getElementById('reply-banner');
const replyToName = document.getElementById('reply-to-name');
const replyToText = document.getElementById('reply-to-text');
const cancelReplyBtn = document.getElementById('cancel-reply-btn');

const settingsOverlay = document.getElementById('settings-overlay');
const settingsOpenBtn = document.getElementById('settings-open');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const resetSettingsBtn = document.getElementById('reset-settings-btn');
const displayNameInput = document.getElementById('display-name-input');
const accentColorInput = document.getElementById('accent-color-input');
const textColorInput = document.getElementById('text-color-input');
const fontInput = document.getElementById('font-input');
const hideShortsCheckbox = document.getElementById('hide-shorts-checkbox');

const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-input');
const emojiPickerWrapper = document.getElementById('emoji-picker-wrapper');
const emojiPicker = document.querySelector('emoji-picker');
let targetReactionMessageId = null;
let targetReactionCollection = null;

const userProfileName = document.getElementById('user-profile-name');
const userAvatar = document.getElementById('user-avatar');
const headerStatusDot = document.getElementById('header-status-dot');
const profileBadge = document.getElementById('user-profile-badge');
const statusDropdown = document.getElementById('status-dropdown');

const uploadPfpBtn = document.getElementById('upload-pfp-btn');
const pfpFileInput = document.getElementById('pfp-file-input');
const settingsAvatarPreview = document.getElementById('settings-avatar-preview');
let pendingPfpUrl = "";

const customUsernameInput = document.getElementById('custom-username-input');
const scrollBottomBtn = document.getElementById('scroll-bottom-btn');

const callBtn = document.getElementById('call-btn');
const callOverlay = document.getElementById('call-overlay');
const callStatusTitle = document.getElementById('call-status-title');
const callUserName = document.getElementById('call-user-name');
const callUserAvatar = document.getElementById('call-user-avatar');
const acceptCallBtn = document.getElementById('accept-call-btn');
const hangupCallBtn = document.getElementById('hangup-call-btn');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const callAvatarContainer = document.getElementById('call-avatar-container');

const toggleCamBtn = document.getElementById('toggle-cam-btn');
const toggleMicBtn = document.getElementById('toggle-mic-btn');
const screenshareBtn = document.getElementById('screenshare-btn');

const TEMP_EMAIL_DOMAINS = [
  "mailinator.com", "yopmail.com", "tempmail.com", "10minutemail.com",
  "dispostable.com", "guerrillamail.com", "sharklasers.com", "getairmail.com",
  "burnermail.io", "maildrop.cc", "temp-mail.org", "generator.email", "trashmail.com"
];
const channelImages = { "general": "general.png", "coding": "hacker.png", "gooning": "gooning.png" };
const DEFAULT_ACCENT = "#a3b3ff";
const DEFAULT_TEXT = "#D4D4D4";
const DEFAULT_FONT = "'Roboto Mono', monospace";

messageInput.addEventListener('input', function() {
  this.style.height = '50px'; 
  const newHeight = Math.min(this.scrollHeight, 150); 
  this.style.height = `${newHeight}px`;
});

messageInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); 
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) sendBtn.click(); 
  }
});

// ==========================================
// ⌨️ SPRINGY TYPING EFFECT
// ==========================================
if (messageInput) {
  messageInput.addEventListener('input', () => {
    messageInput.classList.remove('bounce-typing');
    void messageInput.offsetWidth;
    messageInput.classList.add('bounce-typing');
  });

  messageInput.addEventListener('animationend', () => {
    messageInput.classList.remove('bounce-typing');
  });
}

// ==========================================
// 🎨 THEME & UI CONTROLS
// ==========================================
function loadLocalSettings() {
  const savedAccent = localStorage.getItem('yapp_accent') || DEFAULT_ACCENT;
  const savedText = localStorage.getItem('yapp_text') || DEFAULT_TEXT;
  const savedFont = localStorage.getItem('yapp_font') || DEFAULT_FONT;

  document.documentElement.style.setProperty('--golden', savedAccent);
  document.documentElement.style.setProperty('--text-color', savedText);
  document.documentElement.style.setProperty('--app-font', savedFont);

  accentColorInput.value = savedAccent;
  textColorInput.value = savedText;
  fontInput.value = savedFont;

  applyShortsVisibility();
}
loadLocalSettings();

function updateMuteUI() {
  if (mutedChannels.includes(currentChatTarget)) {
    muteBtn.innerHTML = '<i class="fa-solid fa-bell-slash"></i>';
    muteBtn.classList.add('muted');
  } else {
    muteBtn.innerHTML = '<i class="fa-solid fa-bell"></i>';
    muteBtn.classList.remove('muted');
  }
}

muteBtn.addEventListener('click', () => {
  if (mutedChannels.includes(currentChatTarget)) {
    mutedChannels = mutedChannels.filter(c => c !== currentChatTarget);
  } else {
    mutedChannels.push(currentChatTarget);
  }
  localStorage.setItem('yapp_muted_channels', JSON.stringify(mutedChannels));
  updateMuteUI();
});

function updateDndUI() {
  if (isDoNotDisturb) {
    dndBtn.innerHTML = '<i class="fa-solid fa-circle-minus" style="color: #e74c3c; opacity: 1;"></i>';
    dndBtn.title = "Do Not Disturb: ON";
  } else {
    dndBtn.innerHTML = '<i class="fa-solid fa-circle-minus" style="opacity: 0.4;"></i>';
    dndBtn.title = "Do Not Disturb: OFF";
  }
}
updateDndUI();

dndBtn.addEventListener('click', () => {
  isDoNotDisturb = !isDoNotDisturb;
  localStorage.setItem('yapp_dnd', isDoNotDisturb);
  updateDndUI();
});

function applyShortsVisibility() {
  const leftPanel = document.getElementById('shorts-left');
  const rightPanel = document.getElementById('shorts-right');

  if (showShorts) {
    if (leftPanel) leftPanel.style.display = 'flex';
    if (rightPanel) rightPanel.style.display = 'flex';
  } else {
    if (leftPanel) leftPanel.style.display = 'none';
    if (rightPanel) rightPanel.style.display = 'none';
  }
}

// ==========================================
// 💡 HEADER STATUS DROPDOWN & PRESENCE LOGIC
// ==========================================
function updateHeaderStatusDot(statusStr) {
  if (statusStr === "idle") {
    headerStatusDot.style.background = "#f1c40f";
  } else if (statusStr === "offline") {
    headerStatusDot.style.background = "#95a5a6";
  } else {
    headerStatusDot.style.background = "#2ecc71";
  }
}

profileBadge.addEventListener('click', (e) => {
  statusDropdown.classList.toggle('active');
});

document.addEventListener('click', (e) => {
  if (!profileBadge.contains(e.target)) {
    statusDropdown.classList.remove('active');
  }
});

document.querySelectorAll('.status-option').forEach(opt => {
  opt.addEventListener('click', async (e) => {
    e.stopPropagation();
    const newStatus = opt.getAttribute('data-status');
    userSelectedStatus = newStatus;

    updateHeaderStatusDot(newStatus);
    statusDropdown.classList.remove('active');

    if (currentUser) {
      try {
        await updateDoc(doc(db, "users", currentUser), { status: newStatus });
      } catch(err) { console.error(err); }
    }
  });
});

window.addEventListener('beforeunload', () => {
  if (currentUser) {
    updateDoc(doc(db, "users", currentUser), { status: "offline" }).catch(()=>{});
  }
});

// ==========================================
// 💤 SMART INACTIVITY TIMEOUT ENGINE
// ==========================================
let idleTimer = null;
let offlineTimer = null;
let currentPresenceState = "online"; 

function resetPresenceTimers() {
  if (!currentUser) return;

  // 1. If we are currently marked Idle or Offline on the client, bring us back online instantly
  if (currentPresenceState !== "online") {
    currentPresenceState = "online";
    updateDoc(doc(db, "users", currentUser), { status: userSelectedStatus }).catch(()=>{});
  }

  // 2. Clear existing timeouts
  if (idleTimer) clearTimeout(idleTimer);
  if (offlineTimer) clearTimeout(offlineTimer);

  // 3. Mark "idle" after 5 Minutes of zero viewport interaction
  idleTimer = setTimeout(() => {
    currentPresenceState = "idle";
    updateDoc(doc(db, "users", currentUser), { status: "idle" }).catch(()=>{});
  }, 300000); 

  // 4. Mark completely "offline" after 1 Hour (3,600,000 ms) of total inactivity
  offlineTimer = setTimeout(() => {
    currentPresenceState = "offline";
    updateDoc(doc(db, "users", currentUser), { status: "offline" }).catch(()=>{});
  }, 3600000);
}

// Attach listeners across all logical user interaction interfaces
['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
  document.addEventListener(evt, resetPresenceTimers, true);
});

// ==========================================
// ⚙️ SETTINGS OVERLAY LOGIC
// ==========================================
settingsOpenBtn.addEventListener('click', () => {
  displayNameInput.value = currentDisplayName;
  if (cachedUserData) {
    settingsAvatarPreview.src = cachedUserData.photoURL || auth.currentUser.photoURL || DEFAULT_AVATAR;
  } else {
    settingsAvatarPreview.src = auth.currentUser.photoURL || DEFAULT_AVATAR;
  }

  if (hideShortsCheckbox) hideShortsCheckbox.checked = showShorts;

  pendingPfpUrl = "";
  settingsOverlay.classList.add('active');
});

closeSettingsBtn.addEventListener('click', () => settingsOverlay.classList.remove('active'));

saveSettingsBtn.addEventListener('click', async () => {
  const newAccent = accentColorInput.value;
  const newText = textColorInput.value;
  const newFont = fontInput.value;
  const newName = displayNameInput.value.trim() || currentUser;

  if (newName !== currentDisplayName) {
    const nameClaimed = await isDisplayNameTaken(newName, currentUser);
    if (nameClaimed) {
      alert("❌ That display name is already taken by another user!");
      return;
    }
  }

  const shouldShowShorts = hideShortsCheckbox ? hideShortsCheckbox.checked : false;
  showShorts = shouldShowShorts;
  localStorage.setItem('yapp_show_shorts', shouldShowShorts);

  applyShortsVisibility();

  document.documentElement.style.setProperty('--golden', newAccent);
  document.documentElement.style.setProperty('--text-color', newText);
  document.documentElement.style.setProperty('--app-font', newFont);

  localStorage.setItem('yapp_accent', newAccent);
  localStorage.setItem('yapp_text', newText);
  localStorage.setItem('yapp_font', newFont);

  currentDisplayName = newName;

  try {
    const updates = { displayName: newName };
    if (pendingPfpUrl) {
      updates.photoURL = pendingPfpUrl;
      userAvatar.src = pendingPfpUrl;
    }
    await setDoc(doc(db, "users", currentUser), updates, { merge: true });
    updateHeaderUI();
  } catch (error) { console.error(error); }
  settingsOverlay.classList.remove('active');
});

resetSettingsBtn.addEventListener('click', () => {
  localStorage.removeItem('yapp_accent');
  localStorage.removeItem('yapp_text');
  localStorage.removeItem('yapp_font');
  localStorage.removeItem('yapp_show_shorts');
  showShorts = false; 
  loadLocalSettings();
  settingsOverlay.classList.remove('active');
});

// ==========================================
// 🎨 PASTE LOGIC & MULTI-FILE Uploader
// ==========================================
async function processFilesForUpload(files) {
  if (files.length === 0) return;

  if (files.length > 10) {
    alert("❌ You can only upload a maximum of 10 images at once!");
    return;
  }

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      alert(`❌ "${file.name}" is not a valid image file.`);
      return;
    }
    if (file.size > 33554432) {
      alert(`❌ "${file.name}" is too big. 32MB max per image.`);
      return;
    }
  }

  const attachIcon = document.getElementById('attach-icon');
  attachBtn.style.pointerEvents = "none";

  const totalFiles = files.length;
  let successfulUploads = 0;

  try {
    for (let i = 0; i < totalFiles; i++) {
      const file = files[i];
      const currentNumber = i + 1;

      attachIcon.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: 600;">
          <div class="btn-spinner"></div>
          <span>(${currentNumber}/${totalFiles})</span>
        </div>
      `;

      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
      const data = await response.json();

      if (data.success) {
        await sendPayloadToDatabase("", data.data.url, "image");
        successfulUploads++;
      }
    }

    if (successfulUploads < totalFiles) {
      alert(`⚠️ Only ${successfulUploads} out of ${totalFiles} images uploaded successfully.`);
    }

  } catch (err) {
    console.error("Upload error: ", err);
    alert("An error occurred during upload.");
  } finally {
    attachIcon.innerHTML = `<i class="fa-solid fa-plus"></i>`;
    attachBtn.style.pointerEvents = "auto";
    fileInput.value = "";
  }
}

attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  processFilesForUpload(files);
});

messageInput.addEventListener('paste', async (e) => {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  const filesToUpload = [];

  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      const file = item.getAsFile();
      if (file) {
        const renamedFile = new File([file], `clipboard_pasted_${Date.now()}.png`, { type: file.type });
        filesToUpload.push(renamedFile);
      }
    }
  }

  if (filesToUpload.length > 0) {
    e.preventDefault();
    await processFilesForUpload(filesToUpload);
  }
});

// ==========================================
// 📦 DRAG & DROP FILE LOGIC
// ==========================================
const dropZone = document.querySelector('.chat-area');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault(); e.stopPropagation();
  }, false);
});

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => {
    dropZone.style.boxShadow = "inset 0 0 25px var(--golden)";
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => { dropZone.style.boxShadow = "none"; }, false);
});

dropZone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = Array.from(dt.files);
  if (files.length > 0) processFilesForUpload(files);
});

// ==========================================
// 🎭 EMOJIS
// ==========================================
emojiPicker.addEventListener('emoji-click', async (event) => {
  const selectedEmoji = event.detail.unicode;

  if (isInputEmojiTarget) {
    messageInput.value += selectedEmoji;
    emojiPickerWrapper.style.display = 'none';
    isInputEmojiTarget = false; 
    
    messageInput.dispatchEvent(new Event('input'));
    messageInput.focus();
    return;
  }

  if (!targetReactionMessageId) return;
  emojiPickerWrapper.style.display = 'none';

  try {
    const docRef = doc(db, targetReactionCollection, targetReactionMessageId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const currentReactions = data.reactions || {};

      if (currentReactions[currentUser] === selectedEmoji) delete currentReactions[currentUser];
      else currentReactions[currentUser] = selectedEmoji;

      await updateDoc(docRef, { reactions: currentReactions });
    }
  } catch (err) {
    console.error("Reaction error:", err);
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#emoji-picker-wrapper') && !e.target.closest('.msg-action-btn')) {
    emojiPickerWrapper.style.display = 'none';
  }
});

// ==========================================
// 🛡️ NAME CLONING PREVENTION
// ==========================================
async function isDisplayNameTaken(targetName, excludeUsername = "") {
  const q = query(collection(db, "users"), where("displayName", "==", targetName));
  const querySnapshot = await getDocs(q);
  let taken = false;
  querySnapshot.forEach((docSnap) => {
    if (docSnap.id !== excludeUsername) taken = true;
  });
  return taken;
}

async function isUsernameTaken(targetUsername) {
  const q = query(collection(db, "users"), where("username", "==", targetUsername));
  const querySnapshot = await getDocs(q);
  return !querySnapshot.empty;
}

// ========================================================
// 🔑 AUTHENTICATION & PERSISTENCE
// ========================================================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user.uid;
    currentEmail = user.email;

    const loaderText = document.querySelector('#login-loader h2');
    if (loaderText) loaderText.innerText = "loading YappApp...";

    const userRef = doc(db, "users", currentUser);

    try {
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        currentDisplayName = userSnap.data().displayName || "Yapper";
        const photoURL = user.photoURL || "";

        userSelectedStatus = "online";

        try {
          await updateDoc(doc(db, "users", currentUser), { status: userSelectedStatus });
        } catch (err) {
          console.warn("Status update skipped:", err);
        }

        const urlParams = new URLSearchParams(window.location.search);
        const isDesktop = urlParams.get('platform') === 'desktop';

        if (isDesktop) {
          const loaderText = document.querySelector('#login-loader h2');
          if (loaderText) {
            loaderText.innerHTML = `
              <span style="color: #2ecc71; font-size: 1.5rem;"><i class="fa-solid fa-circle-check"></i></span><br>
              Successfully authenticated!<br>
              <span style="color: gray; font-size: 0.85rem;">Returning to YappApp Desktop...</span>
            `;
          }
          
          const idToken = await user.getIdToken();
          window.location.href = `yappapp://auth-callback?token=${idToken}`;

          setTimeout(() => {
            window.close();
          }, 1500);
          
          return; 
        }

        enterChatApp(photoURL);
        hideLoaderWhenFullyLoaded();
      } else {
        const rawUsername = customUsernameInput.value.trim().toLowerCase().replace(/\s+/g, '');
        if (!rawUsername || rawUsername.length < 3) {
          alert("❌ Choose a username below and click login again to complete setup!");
          await signOut(auth);
          resetLoginButton();
          loginLoader.classList.remove('active');
          loginScreen.classList.add('active');
          return;
        }

        const usernameTaken = await isUsernameTaken(rawUsername);
        if (usernameTaken) {
          alert("❌ That username is already taken! Pick a different one and log in again.");
          await signOut(auth);
          resetLoginButton();
          loginLoader.classList.remove('active');
          loginScreen.classList.add('active');
          return;
        }

        currentDisplayName = rawUsername;
        await setDoc(userRef, {
          username: rawUsername,
          email: currentEmail,
          displayName: rawUsername,
          joinedAt: serverTimestamp(),
          status: "online",
          lastLogin: serverTimestamp()
        });

        const urlParams = new URLSearchParams(window.location.search);
        const isDesktop = urlParams.get('platform') === 'desktop';

        if (isDesktop) {
          const idToken = await auth.currentUser.getIdToken();
          window.location.href = `yappapp://auth-callback?token=${idToken}`;
          setTimeout(() => window.close(), 1000);
          return;
        }

        enterChatApp(user.photoURL || "");
        hideLoaderWhenFullyLoaded();
      }
    } catch (error) {
      console.error("Failed to load user:", error);
      alert("Error loading profile. Please refresh.");
    }
  } else {
    killAllListeners();
    loginLoader.classList.remove('active');
    loginScreen.classList.add('active');
    chatScreen.classList.remove('active');
  }
});

googleLoginBtn.addEventListener('click', async () => {
  const rawUsername = customUsernameInput.value.trim().toLowerCase().replace(/\s+/g, '');
  const userDocs = await getDocs(query(collection(db, "users"), where("username", "==", rawUsername)));

  if (rawUsername && rawUsername.length >= 3 && !userDocs.empty) {
    alert("❌ That username is already taken! Please pick a different one before signing in.");
    return;
  }

  const loaderText = document.querySelector('#login-loader h2');
  if (loaderText) loaderText.innerText = "Redirecting to Google...";

  loginScreen.classList.remove('active');
  loginLoader.classList.add('active');

  try {
    const result = await signInWithPopup(auth, provider);
    console.log("✅ Popup login successful:", result.user.uid);
  } catch (error) {
    alert("Google Sign-In Failed.");
    resetLoginButton();
    loginLoader.classList.remove('active');
    loginScreen.classList.add('active');
  }
});

function enterChatApp(photoURL = "") {
  loginScreen.classList.remove('active');
  chatScreen.classList.add('active');
  loginSessionTime = Date.now();

  resetPresenceTimers();

  const isElectron = navigator.userAgent.toLowerCase().includes('electron');

  if (isElectron) {
    const downloadBtn = document.getElementById('desktop-download-btn');
    if (downloadBtn) {
      downloadBtn.remove();
    }
  } else {
    const downloadBtn = document.getElementById('desktop-download-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        window.location.href = "https://store-eu-par-4.gofile.io/download/web/f7c1e65b-b4f4-4e04-9ce6-f0b79d10cfff/YappApp%20Desktop%20Installer.exe";
      });
    }
  }

  userProfileName.innerText = `@${currentDisplayName}`;
  if (photoURL) {
    userAvatar.src = photoURL;
    userAvatar.style.display = "block";
  } else {
    userAvatar.style.display = "none";
  }

  killAllListeners();

  unsubscribeUserCheck = onSnapshot(doc(db, "users", currentUser), async (docSnap) => {
    if (!docSnap.exists()) {
      alert("your account has been deleted! logging out...");
      signOut(auth).then(() => { window.location.reload(); });
      return;
    }

    const userData = docSnap.data();
    cachedUserData = userData;

    if (userData.status) {
      updateHeaderStatusDot(userData.status);
    }

    if (userData && userData.isKicked === true) {
      alert("you have been kicked out of the chat session by an admin");
      await updateDoc(doc(db, "users", currentUser), { isKicked: false });
      killAllListeners();
      await signOut(auth);
      window.location.reload();
      return;
    }

    if (userData && userData.isBanned === true) {
      alert("you have been permanently banned from YappApp!");
      killAllListeners();
      await signOut(auth);
      window.location.reload();
      return;
    }
  });

  loadUsersSidebar();
  switchChat('global', 'general');

  let isFirstConfigLoad = true;

  unsubscribeSystem = onSnapshot(doc(db, "system", "config"), (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.forceRefreshSignal) {
        if (isFirstConfigLoad) {
          isFirstConfigLoad = false;
        } else {
          console.log("♻️ Admin triggered a global refresh!");
          window.location.reload();
        }
      }
    }
  });

  const backgroundGlobalQuery = query(collection(db, "global_messages"), orderBy("createdAt", "desc"), limit(5));
  unsubscribeBgGlobal = onSnapshot(backgroundGlobalQuery, (snapshot) => {
     snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
           const data = change.doc.data();
           const msgTime = data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().getTime() : new Date(data.createdAt).getTime()) : Date.now();

           if (msgTime > loginSessionTime && data.sender !== currentUser && data.type !== 'system') {
               if (currentChatTarget !== data.channel) {
                   addUnreadBadge(data.channel);

                   if (!mutedChannels.includes(data.channel) && !isDoNotDisturb && !document.hasFocus()) {
                       if (data.text && (data.text.includes(`@${currentUser}`) || data.text.includes(`@${currentDisplayName}`))) {
                           pingSound.currentTime = 0; pingSound.play().catch(() => {});
                       } else {
                           notifSound.currentTime = 0; notifSound.play().catch(() => {});
                       }
                   }
               }
           }
        }
     });
  });

  const dmQuery = query(collection(db, "private_messages"), where("receiver", "==", currentUser), orderBy("createdAt", "desc"), limit(5));
  unsubscribeBgDM = onSnapshot(dmQuery, (snapshot) => {
     snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
           const data = change.doc.data();
           const msgTime = data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().getTime() : new Date(data.createdAt).getTime()) : Date.now();

           if (msgTime > loginSessionTime && data.sender !== currentUser) {
               if (currentChatTarget !== data.sender) {
                   addUnreadBadge(data.sender);
                   
                   if (!mutedChannels.includes(data.sender) && !isDoNotDisturb && !document.hasFocus()) {
                       notifSound.currentTime = 0; notifSound.play().catch(() => {});
                   }
               }
           }
        }
     });
  });

  const incomingCallsQuery = query(collection(db, "calls"), where("receiverId", "==", currentUser), where("status", "==", "incoming"));
  unsubscribeIncomingCalls = onSnapshot(incomingCallsQuery, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const callData = change.doc.data();
        if (callData && !peerConnection && !isDoNotDisturb) {
          triggerIncomingCallUI(change.doc.id, callData);
        }
      }
    });
  });
}

function killAllListeners() {
  if (unsubscribeChat) { unsubscribeChat(); unsubscribeChat = null; }
  if (unsubscribeUserCheck) { unsubscribeUserCheck(); unsubscribeUserCheck = null; }
  if (unsubscribeSidebar) { unsubscribeSidebar(); unsubscribeSidebar = null; }
  if (unsubscribeBgGlobal) { unsubscribeBgGlobal(); unsubscribeBgGlobal = null; }
  if (unsubscribeBgDM) { unsubscribeBgDM(); unsubscribeBgDM = null; }
  if (unsubscribeSystem) { unsubscribeSystem(); unsubscribeSystem = null; }
  if (unsubscribeIncomingCalls) { unsubscribeIncomingCalls(); unsubscribeIncomingCalls = null; }
}

function resetLoginButton() { googleLoginBtn.innerHTML = `<i class="fa-brands fa-google"></i> Sign in with Google`; }

// ==========================================
// 📞 WEBRTC VOICE, VIDEO & SCREENSHARE ENGINE
// ==========================================
function resetMediaStateFlags() {
  isCameraOn = true; isMicOn = true; isSharingScreen = false;
  toggleCamBtn.classList.add('active-state'); toggleCamBtn.innerHTML = '<i class="fa-solid fa-video"></i>';
  toggleMicBtn.classList.add('active-state'); toggleMicBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
  screenshareBtn.classList.remove('active-state'); screenshareBtn.style.color = "var(--text-color)";
}

callBtn.addEventListener('click', async () => {
  if (currentChatType !== 'dm') return;
  const targetUserId = currentChatTarget;

  if (targetUserId === currentUser) return alert("❌ You cannot call yourself!");

  try {
    const receiverSnap = await getDoc(doc(db, "users", targetUserId));
    const receiverData = receiverSnap.exists() ? receiverSnap.data() : {};
    const senderSnap = await getDoc(doc(db, "users", currentUser));
    const senderData = senderSnap.exists() ? senderSnap.data() : {};

    callStatusTitle.innerText = "Calling...";
    callUserName.innerText = `@${receiverData.displayName || targetUserId}`;
    callUserAvatar.src = receiverData.photoURL || DEFAULT_AVATAR_LARGE;

    callAvatarContainer.style.display = "block";
    acceptCallBtn.style.display = "none";
    hangupCallBtn.style.display = "block";

    toggleCamBtn.style.display = "flex"; toggleMicBtn.style.display = "flex"; screenshareBtn.style.display = "none";
    resetMediaStateFlags();
    callOverlay.classList.add('active');

    callingSound.currentTime = 0; callingSound.play().catch(() => {});

    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch (mediaErr) {
      console.warn("Could not start video stream. Checking if audio-only is possible...", mediaErr);
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        isCameraOn = false;
        toggleCamBtn.classList.remove('active-state');
        toggleCamBtn.innerHTML = '<i class="fa-solid fa-video-slash"></i>';
      } catch (audioErr) {
        console.error("Mic and Camera completely blocked or missing:", audioErr);
        alert("❌ Call failed: No microphone found, or microphone permissions have been denied.");
        terminateVoiceCall(false);
        return;
      }
    }

    localVideo.srcObject = localStream;

    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
      remoteVideo.srcObject = event.streams[0];
      callAvatarContainer.style.display = "none";
    };

    const callRef = doc(collection(db, "calls"));
    currentCallId = callRef.id;

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) updateDoc(callRef, { callerIceCandidates: event.candidate.toJSON() });
    };

    const offerDescription = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offerDescription);

    const callPayload = {
      callerId: currentUser, callerName: currentDisplayName, callerPhoto: senderData.photoURL || "",
      receiverId: targetUserId, status: "incoming", offer: { type: offerDescription.type, sdp: offerDescription.sdp }
    };

    await setDoc(callRef, callPayload);

    callTimeoutTimer = setTimeout(async () => { await declineIncomingCall(); }, 15000);

    unsubscribeCallSession = onSnapshot(callRef, async (snapshot) => {
      const data = snapshot.data();
      if (!data) return;

      if (data.answer && !peerConnection.currentRemoteDescription) {
        if (callTimeoutTimer) { clearTimeout(callTimeoutTimer); callTimeoutTimer = null; }
        const answerDescription = new RTCSessionDescription(data.answer);
        await peerConnection.setRemoteDescription(answerDescription);
        callingSound.pause(); joinSound.currentTime = 0; joinSound.play().catch(() => {});
        callStatusTitle.innerText = "In Video Call"; screenshareBtn.style.display = "flex";
      }

      if (data.receiverIceCandidates) {
        const candidate = new RTCIceCandidate(data.receiverIceCandidates);
        await peerConnection.addIceCandidate(candidate);
      }
      if (data.status === "ended" || data.status === "declined") terminateVoiceCall(false);
    });

  } catch (err) {
    console.error(err);
    alert(`❌ Outgoing Call Setup Crash: ${err.name} - ${err.message}`);
    terminateVoiceCall(false);
  }
});

async function triggerIncomingCallUI(callId, callData) {
  currentCallId = callId;
  callStatusTitle.innerText = "Incoming Call...";
  callUserName.innerText = `@${callData.callerName}`;
  callUserAvatar.src = callData.callerPhoto || DEFAULT_AVATAR_LARGE;

  callAvatarContainer.style.display = "block";
  acceptCallBtn.style.display = "block"; hangupCallBtn.style.display = "block";
  toggleCamBtn.style.display = "none"; toggleMicBtn.style.display = "none"; screenshareBtn.style.display = "none";
  callOverlay.classList.add('active');

  beingCalledSound.currentTime = 0; beingCalledSound.play().catch(() => {});

  unsubscribeCallSession = onSnapshot(doc(db, "calls", currentCallId), (snapshot) => {
    const data = snapshot.data();
    if (data && (data.status === "ended" || data.status === "declined")) terminateVoiceCall(false);
  });
}

acceptCallBtn.addEventListener('click', async () => {
  if (!currentCallId) return;

  try {
    acceptCallBtn.style.display = "none"; callStatusTitle.innerText = "Connecting...";
    toggleCamBtn.style.display = "flex"; toggleMicBtn.style.display = "flex"; screenshareBtn.style.display = "flex";
    resetMediaStateFlags();

    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch (mediaErr) {
      console.warn("Could not start video stream on answer. Checking if audio-only is possible...", mediaErr);
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        isCameraOn = false;
        toggleCamBtn.classList.remove('active-state');
        toggleCamBtn.innerHTML = '<i class="fa-solid fa-video-slash"></i>';
      } catch (audioErr) {
        console.error("Mic and Camera completely blocked or missing:", audioErr);
        alert("❌ Answer failed: No microphone found, or microphone permissions have been denied.");
        declineIncomingCall();
        return;
      }
    }

    localVideo.srcObject = localStream;
    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
      remoteVideo.srcObject = event.streams[0]; callAvatarContainer.style.display = "none";
    };

    const callRef = doc(db, "calls", currentCallId);
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) updateDoc(callRef, { receiverIceCandidates: event.candidate.toJSON() });
    };

    const callSnap = await getDoc(callRef);
    const callData = callSnap.data();
    const offerDescription = new RTCSessionDescription(callData.offer);
    await peerConnection.setRemoteDescription(offerDescription);

    const answerDescription = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answerDescription);
    await updateDoc(callRef, { status: "active", answer: { type: answerDescription.type, sdp: answerDescription.sdp } });

    if (callData.callerIceCandidates) {
      const candidate = new RTCIceCandidate(callData.callerIceCandidates);
      await peerConnection.addIceCandidate(candidate);
    }

    beingCalledSound.pause(); joinSound.currentTime = 0; joinSound.play().catch(() => {});
    callStatusTitle.innerText = "In Video Call";

  } catch (err) {
    console.error(err);
    alert(`❌ Answer Call Setup Crash: ${err.name} - ${err.message}`);
    declineIncomingCall();
  }
});

hangupCallBtn.addEventListener('click', () => {
  if (callStatusTitle.innerText === "Incoming Call...") declineIncomingCall();
  else terminateVoiceCall(true);
});

async function declineIncomingCall() {
  if (currentCallId) {
    try { await updateDoc(doc(db, "calls", currentCallId), { status: "declined" }); } catch (err) {}
  }
  terminateVoiceCall(true);
}

async function terminateVoiceCall(triggerDatabaseUpdate) {
  callOverlay.classList.remove('active');
  if (callTimeoutTimer) { clearTimeout(callTimeoutTimer); callTimeoutTimer = null; }

  callingSound.pause(); beingCalledSound.pause();
  endCallSound.currentTime = 0; endCallSound.play().catch(() => {});

  const tempCallId = currentCallId; currentCallId = null;

  if (tempCallId) {
    try {
      const callSnap = await getDoc(doc(db, "calls", tempCallId));
      if (callSnap.exists()) {
        const callData = callSnap.data();
        if (callData.status === "incoming" || callData.status === "declined") {
          if (callData.callerId === currentUser) {
            const receiverSnap = await getDoc(doc(db, "users", callData.receiverId));
            const receiverName = receiverSnap.exists() ? (receiverSnap.data().displayName || callData.receiverId) : callData.receiverId;
            const missedCallPayload = {
              type: "system", text: `<i class="fa-solid fa-phone-slash" style="color: #e74c3c; margin-right: 8px;"></i> <strong>@${receiverName}</strong> missed a call from <strong>@${callData.callerName}</strong>`,
              sender: callData.callerId, senderDisplayName: callData.callerName, senderPhotoURL: callData.callerPhoto || "", receiver: callData.receiverId,
              chatId: [callData.callerId, callData.receiverId].sort().join('_'), createdAt: serverTimestamp()
            };
            await addDoc(collection(db, "private_messages"), missedCallPayload);
          }
        }
      }
    } catch (err) {}
  }

  if (triggerDatabaseUpdate && tempCallId) { try { await updateDoc(doc(db, "calls", tempCallId), { status: "ended" }); } catch (err) {} }
  if (localStream) { localStream.getTracks().forEach(track => track.stop()); localStream = null; }
  if (screenStream) { screenStream.getTracks().forEach(track => track.stop()); screenStream = null; }
  if (peerConnection) { peerConnection.close(); peerConnection = null; }
  localVideo.srcObject = null; remoteVideo.srcObject = null;
  if (unsubscribeCallSession) { unsubscribeCallSession(); unsubscribeCallSession = null; }
  if (tempCallId && triggerDatabaseUpdate) { try { await deleteDoc(doc(db, "calls", tempCallId)); } catch (err) {} }
}

toggleMicBtn.addEventListener('click', () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    isMicOn = !isMicOn; audioTrack.enabled = isMicOn;
    if (isMicOn) { toggleMicBtn.classList.add('active-state'); toggleMicBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>'; }
    else { toggleMicBtn.classList.remove('active-state'); toggleMicBtn.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>'; }
  }
});

toggleCamBtn.addEventListener('click', () => {
  if (!localStream) return;
  if (isSharingScreen) return alert("❌ Turn off screen sharing before enabling your camera!");
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    isCameraOn = !isCameraOn; videoTrack.enabled = isCameraOn;
    if (isCameraOn) { toggleCamBtn.classList.add('active-state'); toggleCamBtn.innerHTML = '<i class="fa-solid fa-video"></i>'; localVideo.style.display = "block"; }
    else { toggleCamBtn.classList.remove('active-state'); toggleCamBtn.innerHTML = '<i class="fa-solid fa-video-slash"></i>'; localVideo.style.display = "none"; }
  }
});

screenshareBtn.addEventListener('click', async () => {
  if (!peerConnection) return;
  if (!isSharingScreen) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenVideoTrack = screenStream.getVideoTracks()[0];
      localVideo.srcObject = screenStream; localVideo.style.display = "block";
      const videoSender = peerConnection.getSenders().find(sender => sender.track && sender.track.kind === 'video');
      if (videoSender) await videoSender.replaceTrack(screenVideoTrack);
      isSharingScreen = true; screenshareBtn.classList.add('active-state'); screenshareBtn.style.color = "var(--darker-bg)";
      screenVideoTrack.onended = () => { stopScreenShare(); };
    } catch (err) {}
  } else { stopScreenShare(); }
});

async function stopScreenShare() {
  if (!peerConnection || !isSharingScreen) return;
  try {
    if (screenStream) { screenStream.getTracks().forEach(track => track.stop()); screenStream = null; }
    const originalVideoTrack = localStream.getVideoTracks()[0];
    localVideo.srcObject = localStream; localVideo.style.display = isCameraOn ? "block" : "none";
    const videoSender = peerConnection.getSenders().find(sender => sender.track && sender.track.kind === 'video');
    if (videoSender && originalVideoTrack) await videoSender.replaceTrack(originalVideoTrack);
    isSharingScreen = false; screenshareBtn.classList.remove('active-state'); screenshareBtn.style.color = "var(--text-color)";
  } catch (err) {}
}

// ==========================================
// 🚨 NOTIFICATIONS & CHAT UI
// ==========================================
function addUnreadBadge(channelId) {
  if (currentChatTarget === channelId) return;
  unreadCounts[channelId] = (unreadCounts[channelId] || 0) + 1;
  const count = unreadCounts[channelId];
  const badge = document.getElementById(`badge-${channelId}`);
  if (badge) { badge.innerHTML = `<img src="${count >= 10 ? '10plus.png' : count + '.png'}" alt="Unread">`; badge.classList.add('active'); }
}
function clearUnreadBadge(channelId) {
  unreadCounts[channelId] = 0;
  const badge = document.getElementById(`badge-${channelId}`);
  if (badge) { badge.innerHTML = ''; badge.classList.remove('active'); }
}

function loadUsersSidebar() {
  const q = query(collection(db, "users"), orderBy("username", "asc"));
  
  getDocs(q).then((snapshot) => {
    userList.innerHTML = ''; 
    userListCache = {};
    
    snapshot.forEach((docSnap) => {
      const user = docSnap.data();
      const userId = docSnap.id;
      const status = user.status || "online";
      
      userListCache[userId] = { 
        displayName: user.displayName || user.username, 
        photoURL: user.photoURL || DEFAULT_AVATAR, 
        status: status 
      };

      if (userId !== currentUser) {
        const userEl = document.createElement('div');
        userEl.classList.add('channel');
        userEl.setAttribute('data-user-id', userId); 

        let statusDotColor = "#2ecc71";
        if (status === "idle") statusDotColor = "#f1c40f";
        else if (status === "offline") statusDotColor = "#95a5a6";

        userEl.innerHTML = `
          <div style="position: relative; display: flex; align-items: center;">
            <img src="${user.photoURL || DEFAULT_AVATAR}" class="sidebar-avatar" alt="avatar">
            <span class="sidebar-status-dot" style="position: absolute; bottom: -2px; right: -2px; width: 15px; height: 15px; border-radius: 50%; background: ${statusDotColor}; border: 2px solid var(--darker-bg);"></span>
          </div>
          <span style="flex: 1; margin-left: 8px;">${user.displayName || user.username}</span>
          <span class="notif-badge" id="badge-${userId}"></span>
        `;

        userEl.addEventListener('click', () => {
          document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
          userEl.classList.add('active'); 
          switchChat('dm', userId);
        });
        userList.appendChild(userEl);
      }
    });

    if (unsubscribeSidebar) unsubscribeSidebar();
    unsubscribeSidebar = onSnapshot(q, (liveSnapshot) => {
      liveSnapshot.docChanges().forEach((change) => {
        if (change.type === "modified") {
          const userId = change.doc.id;
          const updatedUserData = change.doc.data();
          const newStatus = updatedUserData.status || "online";

          if (userListCache[userId]) {
            userListCache[userId].status = newStatus;
          }

          const userElement = document.querySelector(`.channel[data-user-id="${userId}"]`);
          if (userElement) {
            const statusDot = userElement.querySelector('.sidebar-status-dot');
            if (statusDot) {
              let statusDotColor = "#2ecc71";
              if (newStatus === "idle") statusDotColor = "#f1c40f";
              else if (newStatus === "offline") statusDotColor = "#95a5a6";
              statusDot.style.background = statusDotColor;
            }
          }
        }
      });
    });
  }).catch((err) => {
    console.error("Error loading sidebar users:", err);
  });
}

globalChannels.forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
    tab.classList.add('active'); switchChat('global', tab.getAttribute('data-channel'));
  });
});

async function updateHeaderUI() {
  updateMuteUI();
  if (currentChatType === 'global') {
    callBtn.style.display = "none";
    currentChatTitle.innerHTML = `<img src="${channelImages[currentChatTarget] || 'https://via.placeholder.com/20/ffffff/000000'}" class="channel-img"> ${currentChatTarget}`;
  } else {
    callBtn.style.display = "block";
    if (userListCache[currentChatTarget]) {
      currentChatTitle.innerHTML = `<i class="fa-solid fa-at" style="margin-right: 8px;"></i>${userListCache[currentChatTarget].displayName}`;
    } else {
      currentChatTitle.innerHTML = `<i class="fa-solid fa-at" style="margin-right: 8px;"></i>${currentChatTarget}`;
    }
  }
}

cancelReplyBtn.addEventListener('click', () => { replyingTo = null; replyBanner.style.display = 'none'; });

function switchChat(type, target) {
  currentChatType = type; 
  currentChatTarget = target;
  
  updateHeaderUI(); 
  clearUnreadBadge(target);
  replyingTo = null; 
  replyBanner.style.display = 'none';

  if (!chatMessagesCache[target]) {
    chatMessagesCache[target] = [];
  }

  // 🟢 STEP 1: Render cached messages immediately
  messagesContainer.innerHTML = '';
  if (chatMessagesCache[target].length > 0) {
    renderLoadMoreButton(type === 'global' ? "global_messages" : "private_messages");
    
    let lastSender = null;
    let lastMsgTime = null;

    chatMessagesCache[target].forEach(msg => {
      const data = msg.data;
      const senderId = data.sender;
      const msgTime = data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().getTime() : new Date(data.createdAt).getTime()) : Date.now();
      
      // Determine if consecutive: same sender AND within 3 minutes (180,000ms) AND not a system status message
      const isConsecutive = (lastSender === senderId) && (lastMsgTime && (msgTime - lastMsgTime < 180000)) && (data.type !== 'system');

      displayMessage(msg.data, msg.id, type === 'global' ? "global_messages" : "private_messages", false, isConsecutive);
      
      if (data.type !== 'system') {
        lastSender = senderId;
        lastMsgTime = msgTime;
      }
    });

    const lastMsg = messagesContainer.lastElementChild;
    if (lastMsg) lastMsg.scrollIntoView({ behavior: 'auto', block: 'end' });
  } else {
    messagesContainer.innerHTML = `<div class="loader-wrapper" id="chat-loader"><div class="spinner"></div></div>`;
  }

  if (unsubscribeChat) unsubscribeChat();
  oldestLoadedDoc = null; 
  hasMoreMessages = true; 
  isFirstPageLoaded = false;

  const chatOpenedTime = Date.now();
  const collectionName = type === 'global' ? "global_messages" : "private_messages";

  let q;
  if (type === 'global') {
    q = query(
      collection(db, collectionName), 
      where("channel", "==", target), 
      orderBy("createdAt", "desc"), 
      limit(MESSAGES_PER_PAGE)
    );
  } else {
    q = query(
      collection(db, collectionName), 
      where("chatId", "==", [currentUser, target].sort().join('_')), 
      orderBy("createdAt", "desc"), 
      limit(MESSAGES_PER_PAGE)
    );
  }

  unsubscribeChat = onSnapshot(q, (snapshot) => {
    const docsArray = [];
    snapshot.forEach(docSnap => { 
      docsArray.push({ id: docSnap.id, ref: docSnap, data: docSnap.data() }); 
    });
    docsArray.reverse();

    if (docsArray.length > 0) { 
      oldestLoadedDoc = docsArray[0].ref; 
      hasMoreMessages = docsArray.length >= MESSAGES_PER_PAGE; 
    } else { 
      hasMoreMessages = false; 
    }

    chatMessagesCache[target] = docsArray;

    const isAtBottom = (messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight) < 150;
    messagesContainer.innerHTML = ''; 
    renderLoadMoreButton(collectionName);

    let hasPing = false, newMessagesCount = 0, lastMessageElement = null;

    // 🟢 Track consecutive senders dynamically during full draw
    let lastSender = null;
    let lastMsgTime = null;

    docsArray.forEach(item => {
      const data = item.data;
      const senderId = data.sender;
      const msgTime = data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().getTime() : new Date(data.createdAt).getTime()) : Date.now();

      const isConsecutive = (lastSender === senderId) && (lastMsgTime && (msgTime - lastMsgTime < 180000)) && (data.type !== 'system');

      const msgEl = displayMessage(item.data, item.id, collectionName, false, isConsecutive);
      lastMessageElement = msgEl;

      if (data.type !== 'system') {
        lastSender = senderId;
        lastMsgTime = msgTime;
      }

      if (isFirstPageLoaded && item.data.sender !== currentUser && item.data.type !== 'system') {
        const msgTime = item.data.createdAt ? (typeof item.data.createdAt.toDate === 'function' ? item.data.createdAt.toDate().getTime() : new Date(item.data.createdAt).getTime()) : Date.now();
        if (msgTime > chatOpenedTime) {
          newMessagesCount++;
          if (item.data.text && (item.data.text.includes(`@${currentUser}`) || item.data.text.includes(`@${currentDisplayName}`))) hasPing = true;
        }
      }
    });

    if (lastMessageElement) {
      if ((docsArray[docsArray.length - 1]?.data.sender === currentUser) || isAtBottom || !isFirstPageLoaded) {
        lastMessageElement.scrollIntoView({ behavior: isFirstPageLoaded ? 'smooth' : 'auto', block: 'end' });
      }
    }

    if (isFirstPageLoaded && !mutedChannels.includes(currentChatTarget) && !isDoNotDisturb) {
      if (!document.hasFocus()) {
        if (hasPing) { pingSound.currentTime = 0; pingSound.play().catch(()=>{}); }
        else if (newMessagesCount > 0) { notifSound.currentTime = 0; notifSound.play().catch(()=>{}); }
      }
    }
    isFirstPageLoaded = true;
  });
}

async function loadMorePreviousMessages(collectionName) {
  if (!oldestLoadedDoc || !hasMoreMessages) return;
  const loadBtn = document.getElementById('load-more-btn');
  if (loadBtn) { loadBtn.disabled = true; loadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...'; }

  let q = (currentChatType === 'global') ?
    query(collection(db, collectionName), where("channel", "==", currentChatTarget), orderBy("createdAt", "desc"), startAfter(oldestLoadedDoc), limit(MESSAGES_PER_PAGE)) :
    query(collection(db, collectionName), where("chatId", "==", [currentUser, currentChatTarget].sort().join('_')), orderBy("createdAt", "desc"), startAfter(oldestLoadedDoc), limit(MESSAGES_PER_PAGE));

  try {
    const snapshot = await getDocs(q);
    const docsArray = [];
    snapshot.forEach(docSnap => { docsArray.push({ id: docSnap.id, ref: docSnap, data: docSnap.data() }); });

    if (docsArray.length > 0) { oldestLoadedDoc = docsArray[docsArray.length - 1].ref; hasMoreMessages = docsArray.length >= MESSAGES_PER_PAGE; }
    else { hasMoreMessages = false; }

    const previousScrollHeight = messagesContainer.scrollHeight;
    const existingBtn = document.getElementById('load-more-btn'); if (existingBtn) existingBtn.remove();
    renderLoadMoreButton(collectionName);
    docsArray.forEach(item => { displayMessage(item.data, item.id, collectionName, true); });
    messagesContainer.scrollTop = messagesContainer.scrollHeight - previousScrollHeight;
  } catch (err) {}
}

function renderLoadMoreButton(collectionName) {
  if (!hasMoreMessages) return;
  const btn = document.createElement('button');
  btn.id = 'load-more-btn';
  btn.style.cssText = `width: 90%; margin: 15px auto; padding: 10px; background: var(--darker-bg); color: var(--golden); border: 1.5px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; font-weight: 500; font-size: 0.9rem; display: block; transition: 0.2s; text-align: center;`;
  btn.innerHTML = '<i class="fa-solid fa-clock-rotate-left" style="margin-right:8px;"></i> Load Older Messages';
  btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'var(--golden)'; });
  btn.addEventListener('mouseleave', () => { btn.style.borderColor = 'var(--border)'; });
  btn.addEventListener('click', () => loadMorePreviousMessages(collectionName));
  messagesContainer.insertBefore(btn, messagesContainer.firstChild);
}

function displayMessage(data, docId, collectionName, prepend = false, isConsecutive = false) {
  if (data.type === 'system') {
    const sysDiv = document.createElement('div'); sysDiv.classList.add('system-message'); sysDiv.innerHTML = data.text;
    if (prepend) {
      const loadBtn = document.getElementById('load-more-btn');
      if (loadBtn && loadBtn.nextSibling) messagesContainer.insertBefore(sysDiv, loadBtn.nextSibling);
      else messagesContainer.insertBefore(sysDiv, messagesContainer.firstChild);
    } else messagesContainer.appendChild(sysDiv);
    return sysDiv;
  }

  const isYours = data.sender === currentUser;
  const senderName = data.senderDisplayName || data.sender;
  const isPing = !isYours && data.text && (data.text.includes(`@${currentUser}`) || data.text.includes(`@${currentDisplayName}`));

  // 🟢 MERGE LOGIC: If consecutive, merge into the previous bubble box
  if (isConsecutive && !prepend) {
    const lastMessageElement = messagesContainer.lastElementChild;
    if (lastMessageElement && lastMessageElement.classList.contains('message')) {
      const bubbleContainer = lastMessageElement.querySelector('.bubble');
      if (bubbleContainer) {
        const lineItem = document.createElement('div');
        lineItem.classList.add('bubble-line-item');
        
        if (data.type === 'image') {
          lineItem.innerHTML = `<img src="${data.imageUrl}" alt="uploaded image" style="cursor: zoom-in;">`;
        } else {
          // 🟢 Pass text into Markdown Parser
          const plainText = decryptText(data.text);
          lineItem.innerHTML = `<span>${parseMarkdown(plainText)}</span>`;
          
          // 🟢 Scan and process links right onto the line layout
          setTimeout(() => appendLinkPreviews(plainText, lineItem), 10);
        }
        
        bubbleContainer.appendChild(lineItem);
        return lastMessageElement;
      }
    }
  }

  // 🟢 DEFAULT LOGIC: Render a normal, fresh message bubble
  let timeString = "Sending...";
  if (data.createdAt) {
    const dateObj = typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate() : new Date(data.createdAt);
    timeString = dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message');
  if (isYours) msgDiv.classList.add('yours');
  if (data.type === 'image') msgDiv.classList.add('image-message'); 

  let quotedHtml = "";
  if (data.replyTo) {
    let replySnippet = "";
    if (data.replyTo.type === 'image') {
      replySnippet = '[Image]';
    } else {
      replySnippet = decryptText(data.replyTo.text) || data.replyTo.text;
    }
    quotedHtml = `<div class="quoted-reply"><i class="fa-solid fa-reply" style="margin-right: 4px;"></i> Replying to <strong>@${data.replyTo.senderName}</strong>: ${replySnippet}</div>`;
  }

  let contentHtml = "";
  if (data.type === 'image') contentHtml = `<img src="${data.imageUrl}" alt="image">`;
  else contentHtml = `<span>${decryptText(data.text)}</span>`;

  let reactionsDisplayHtml = `<div class="reactions-display">`;
  const emojiCounts = {}; const userReactedObj = {};
  Object.entries(data.reactions || {}).forEach(([uid, emoji]) => {
    emojiCounts[emoji] = (emojiCounts[emoji] || 0) + 1;
    if (uid === currentUser) userReactedObj[emoji] = true;
  });

  Object.entries(emojiCounts).forEach(([emoji, count]) => {
    reactionsDisplayHtml += `<div class="reaction-badge ${userReactedObj[emoji] ? 'active' : ''}" data-emoji="${emoji}">${emoji} <span style="margin-left: 2px;">${count}</span></div>`;
  });
  reactionsDisplayHtml += `</div>`;

  const decryptedMsg = decryptText(data.text);

  msgDiv.innerHTML = `
    <div class="message-content-wrapper">
      <div class="sender-row" style="${isYours ? 'margin-right: 4px;' : 'margin-left: 4px;'}">
        <span class="sender-name">${senderName}</span><span class="timestamp">${timeString}</span>
      </div>
      <div class="message-bubble-wrapper">
        <div class="avatar-box">
          <img src="${data.senderPhotoURL || DEFAULT_AVATAR}" class="message-avatar" alt="avatar">
        </div>

        <div class="bubble ${isPing ? 'mentioned' : ''}">
          ${quotedHtml}
          ${data.type === 'image' ? `<img src="${data.imageUrl}" alt="uploaded image">` : `<span class="text-content-node">${parseMarkdown(decryptedMsg)}</span>`}
        </div>

        <div class="msg-actions">
          <div class="msg-action-btn reply-btn" title="Reply"><i class="fa-solid fa-reply"></i></div>
          <div class="msg-action-btn add-reaction-btn" title="React"><i class="fa-regular fa-face-smile"></i></div>
          ${isYours ? `<button class="msg-action-btn delete-btn" data-id="${docId}" title="Delete" style="border:none;"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
      </div>
      <div class="reactions-container" style="${isYours ? 'margin-right: 48px;' : 'margin-left: 48px;'}">${reactionsDisplayHtml}</div>
    </div>
  `;

  msgDiv.querySelector('.reply-btn').addEventListener('click', () => {
    replyingTo = { messageId: docId, senderName: senderName, text: data.text || "", type: data.type };
    replyToName.innerText = senderName;
    replyToText.innerText = data.type === 'image' ? '[Image attached]' : (data.type === 'image' ? "" : decryptText(data.text));
    replyBanner.style.display = 'flex'; messageInput.focus();
  });

  const addReactionBtn = msgDiv.querySelector('.add-reaction-btn');
  addReactionBtn.addEventListener('click', (e) => {
    isInputEmojiTarget = false; 
    targetReactionMessageId = docId; 
    targetReactionCollection = collectionName;
    
    const rect = addReactionBtn.getBoundingClientRect();
    emojiPickerWrapper.style.display = 'block';
    emojiPickerWrapper.style.top = `${(rect.top - 350 < 0) ? rect.bottom + 10 : rect.top - 350}px`;
    emojiPickerWrapper.style.left = `${Math.max(10, rect.left - 150)}px`;
  });

  msgDiv.querySelectorAll('.reaction-badge').forEach(badge => {
    badge.addEventListener('click', async () => {
      const selectedEmoji = badge.getAttribute('data-emoji');
      const currentReactions = data.reactions || {};
      if (currentReactions[currentUser] === selectedEmoji) delete currentReactions[currentUser]; else currentReactions[currentUser] = selectedEmoji;
      try { await updateDoc(doc(db, collectionName, docId), { reactions: currentReactions }); } catch (err) {}
    });
  });

  if (isYours) {
    msgDiv.querySelector('.delete-btn').addEventListener('click', async () => {
      try { await deleteDoc(doc(db, collectionName, docId)); } catch (err) {}
    });
  }

  // 🟢 Append preview cards if an external link URL matches inside text content
  if (data.type !== 'image') {
    const targetBubble = msgDiv.querySelector('.bubble');
    if (targetBubble) {
      setTimeout(() => appendLinkPreviews(decryptedMsg, targetBubble), 10);
    }
  }

  if (prepend) {
    const loadBtn = document.getElementById('load-more-btn');
    if (loadBtn && loadBtn.nextSibling) messagesContainer.insertBefore(msgDiv, loadBtn.nextSibling);
    else messagesContainer.insertBefore(msgDiv, messagesContainer.firstChild);
  } else {
    messagesContainer.appendChild(msgDiv);
  }

  return msgDiv;
}

async function sendPayloadToDatabase(textContent, imageUrlContent, payloadType) {
  let senderPhoto = cachedUserData ? (cachedUserData.photoURL || "") : (auth.currentUser.photoURL || "");
  
  const payload = {
    type: payloadType, 
    text: (payloadType === "text" && textContent) ? encryptText(textContent) : textContent,
    imageUrl: imageUrlContent, 
    sender: currentUser, 
    senderDisplayName: currentDisplayName,
    senderPhotoURL: senderPhoto, 
    createdAt: serverTimestamp(), 
    reactions: {}
  };

  if (replyingTo) {
    payload.replyTo = {
      messageId: replyingTo.messageId,
      senderName: replyingTo.senderName,
      text: replyingTo.text,
      type: replyingTo.type
    };
  }

  try {
    if (currentChatType === 'global') {
      payload.channel = currentChatTarget;
      await addDoc(collection(db, "global_messages"), payload);
    } else if (currentChatType === 'dm') {
      payload.chatId = [currentUser, currentChatTarget].sort().join('_');
      payload.receiver = currentChatTarget;
      await addDoc(collection(db, "private_messages"), payload);
    }
  } catch (error) {
    console.error("Error sending message payload:", error);
  } finally { 
    replyingTo = null; 
    replyBanner.style.display = 'none'; 
  }
}

// Brainrot feed logic
const brainrotLinks = [ "https://www.youtube.com/shorts/UEYUozZ0Jtw", "https://www.youtube.com/shorts/8MJrB_ZhLWg", "https://www.youtube.com/shorts/zW7z4w118QU", "https://www.youtube.com/shorts/utmdQfyaAO0", "https://www.youtube.com/shorts/kksKRA5_To8", "https://www.youtube.com/shorts/N70unL6_UU8", "https://www.youtube.com/shorts/iczoCkbrO9k", "https://www.youtube.com/shorts/__3mSAgclmk", "https://www.youtube.com/shorts/mmUUsE3NfcM" ];
function extractYouTubeID(url) {
  if (url.length === 11) return url;
  const match = url.match(/^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/);
  return (match && match[2].length === 11) ? match[2] : null;
}
function loadBrainrotFeed() {
  const leftPanel = document.getElementById('shorts-left'); const rightPanel = document.getElementById('shorts-right');
  if (!leftPanel || !rightPanel) return;
  brainrotLinks.forEach((link, index) => {
    const videoId = extractYouTubeID(link);
    if (!videoId) return;
    const iframeHtml = `<div class="short-wrapper"><iframe width="100%" height="100%" src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe></div>`;
    if (index % 2 === 0) leftPanel.insertAdjacentHTML('beforeend', iframeHtml);
    else rightPanel.insertAdjacentHTML('beforeend', iframeHtml);
  });
}
loadBrainrotFeed();

messageForm.addEventListener('submit', async (e) => {
  e.preventDefault(); 

  const submitBtn = messageForm.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.classList.add('active-click');
    setTimeout(() => submitBtn.classList.remove('active-click'), 150);
  }

  if (isSpamBlocked) return;
  const text = messageInput.value.trim(); 
  if (!text) return;

  const now = Date.now();
  recentMessageTimestamps = recentMessageTimestamps.filter(time => now - time < 5000);
  recentMessageTimestamps.push(now);

  if (text.toLowerCase() === lastSentMessageText.toLowerCase()) duplicateMessageCount++; else duplicateMessageCount = 1;
  lastSentMessageText = text;

  let penalizeTime = 0, penaltyReason = "";
  if (duplicateMessageCount >= 5) { penalizeTime = 30000; penaltyReason = "stop repeating messages!"; }
  else if (recentMessageTimestamps.length >= 5) { penalizeTime = 10000; penaltyReason = "slow down..."; }

  if (penalizeTime > 0) {
    isSpamBlocked = true;
    const originalPlaceholder = messageInput.placeholder;
    messageInput.disabled = true; document.getElementById('send-btn').disabled = true; attachBtn.style.pointerEvents = "none"; messageInput.value = "";
    let secondsLeft = penalizeTime / 1000;
    messageInput.placeholder = `You're muted: ${penaltyReason} (${secondsLeft}s left)`;
    const jailTimer = setInterval(() => { secondsLeft--; if (secondsLeft > 0) messageInput.placeholder = `You're muted: ${penaltyReason} (${secondsLeft}s left)`; }, 1000);
    setTimeout(() => {
      clearInterval(jailTimer); isSpamBlocked = false; messageInput.disabled = false; document.getElementById('send-btn').disabled = false; attachBtn.style.pointerEvents = "auto";
      messageInput.placeholder = originalPlaceholder; recentMessageTimestamps = []; duplicateMessageCount = 0; lastSentMessageText = "";
    }, penalizeTime);
    return;
  }
  messageInput.value = '';
  messageInput.style.height = '50px'; 
  sendPayloadToDatabase(text, null, "text");
});

uploadPfpBtn.addEventListener('click', () => pfpFileInput.click());
pfpFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  if (file.size > 10485760) return alert("Avatar file must be under 10MB.");
  uploadPfpBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Uploading...`; uploadPfpBtn.disabled = true;
  try {
    const formData = new FormData(); formData.append("image", file);
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
    const data = await response.json();
    if (data.success) { pendingPfpUrl = data.data.url; settingsAvatarPreview.src = pendingPfpUrl; } else throw new Error(data.error.message);
  } catch (err) { alert("Profile picture upload failed."); }
  finally { uploadPfpBtn.innerHTML = `Choose Image`; uploadPfpBtn.disabled = false; pfpFileInput.value = ""; }
});

messagesContainer.addEventListener('scroll', () => {
  if (messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight > 300) {
    scrollBottomBtn.style.opacity = "1"; scrollBottomBtn.style.pointerEvents = "auto"; scrollBottomBtn.style.transform = "translateX(-50%) translateY(0)";
  } else {
    scrollBottomBtn.style.opacity = "0"; scrollBottomBtn.style.pointerEvents = "none"; scrollBottomBtn.style.transform = "translateX(-50%) translateY(15px)";
  }
});

scrollBottomBtn.addEventListener('click', () => {
  const lastMsg = messagesContainer.lastElementChild;
  if (lastMsg) lastMsg.scrollIntoView({ behavior: 'smooth', block: 'end' });
});

function unlockBrowserAudio() {
  const silentUnlock1 = notifSound.play(); const silentUnlock2 = pingSound.play();
  if (silentUnlock1 !== undefined) silentUnlock1.then(() => { notifSound.pause(); }).catch(() => {});
  if (silentUnlock2 !== undefined) silentUnlock2.then(() => { pingSound.pause(); }).catch(() => {});
  document.removeEventListener('click', unlockBrowserAudio); document.removeEventListener('keydown', unlockBrowserAudio);
}
document.addEventListener('click', unlockBrowserAudio); document.addEventListener('keydown', unlockBrowserAudio);

function hideLoaderWhenFullyLoaded() {
  const performHide = () => { setTimeout(() => { loginLoader.classList.remove('active'); }, 300); };
  if (document.readyState === 'complete') performHide(); else window.addEventListener('load', performHide);
}

// ==========================================
// 🔍 INTERACTIVE IMAGE VIEWER (ZOOM & PAN)
// ==========================================
const viewerOverlay = document.getElementById('image-viewer-overlay');
const viewerImg = document.getElementById('viewer-img');
const viewerContainer = document.getElementById('viewer-container');
const closeViewerBtn = document.getElementById('close-viewer');

let zoomScale = 1;
let isPanning = false;
let startX = 0, startY = 0;
let panX = 0, panY = 0;

document.addEventListener('click', (e) => {
  if (e.target.closest('.message.image-message img') || e.target.closest('.quoted-reply img')) {
    const clickedImgSrc = e.target.src;
    viewerImg.src = clickedImgSrc;

    zoomScale = 1;
    panX = 0;
    panY = 0;
    updateViewerTransform();

    viewerOverlay.style.display = 'flex';
  }
});

const closeViewer = () => {
  viewerOverlay.style.display = 'none';
};
closeViewerBtn.addEventListener('click', closeViewer);
viewerOverlay.addEventListener('click', (e) => {
  if (e.target === viewerOverlay) closeViewer();
});

function updateViewerTransform() {
  viewerContainer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
}

viewerOverlay.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomIntensity = 0.1;
  if (e.deltaY < 0) {
    zoomScale = Math.min(zoomScale + zoomIntensity, 5); 
  } else {
    zoomScale = Math.max(zoomScale - zoomIntensity, 0.5); 
  }
  updateViewerTransform();
}, { passive: false });

viewerOverlay.addEventListener('mousedown', (e) => {
  if (e.target === closeViewerBtn || e.target.closest('#close-viewer')) return;
  isPanning = true;
  viewerOverlay.style.cursor = 'grabbing';
  startX = e.clientX - panX;
  startY = e.clientY - panY;
});

window.addEventListener('mousemove', (e) => {
  if (!isPanning) return;
  panX = e.clientX - startX;
  panY = e.clientY - startY;
  updateViewerTransform();
});

window.addEventListener('mouseup', () => {
  isPanning = false;
  viewerOverlay.style.cursor = 'grab';
});

const desktopDownloadBtn = document.getElementById('desktop-download-btn');
if (desktopDownloadBtn) {
  desktopDownloadBtn.addEventListener('click', () => {
    window.location.href = "https://store-eu-par-4.gofile.io/download/web/f7c1e65b-b4f4-4e04-9ce6-f0b79d10cfff/YappApp%20Desktop%20Installer.exe";
  });
}

const inputEmojiBtn = document.getElementById('input-emoji-btn');

if (inputEmojiBtn) {
  inputEmojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isInputEmojiTarget = true; 
    targetReactionMessageId = null; 

    const rect = inputEmojiBtn.getBoundingClientRect();
    emojiPickerWrapper.style.display = 'block';
    
    emojiPickerWrapper.style.top = `${rect.top - 350}px`;
    emojiPickerWrapper.style.left = `${rect.left}px`;
  });
}

if (window.electronAPI) {
  window.electronAPI.onDeepLink(async (url) => {
    try {
      const parsedUrl = new URL(url);
      const token = parsedUrl.searchParams.get('token');
      
      if (token) {
        console.log("Deep link payload received. Attempting login...");
        
        const credential = GoogleAuthProvider.credential(null, token);
        await signInWithCredential(auth, credential);
        
        console.log("Logged in successfully via Deep Link!");
      }
    } catch (e) {
      console.error("Failed to parse deep link URL", e);
    }
  });
}

const logoutBtn = document.getElementById('logout-btn');

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    if (!confirm("Are you sure you want to log out? Your settings (colors/fonts) will be saved!")) return;

    try {
      if (currentUser) {
        await updateDoc(doc(db, "users", currentUser), { status: "offline" }).catch(()=>{});
      }

      killAllListeners();

      chatMessagesCache = {};

      await signOut(auth);

      settingsOverlay.classList.remove('active');
      
      console.log("Logged out successfully. Custom local settings preserved.");
    } catch (err) {
      console.error("Logout failed:", err);
      alert("Error logging out: " + err.message);
    }
  });
}

// 📑 1. Rich Text Markdown Parser Engine
function parseMarkdown(text) {
  if (!text) return "";
  
  // Escape HTML tags to protect against injection exploits
  let safeText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Regex rules targeting Markdown formatting markers
  // ***text*** -> Bold + Italic
  safeText = safeText.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  
  // **text** -> Bold
  safeText = safeText.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // *text* -> Italic
  safeText = safeText.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  return safeText;
}

// 🔗 Rich Link Preview Fetcher Engine (Fetches Metadata & Images)
async function appendLinkPreviews(text, containerElement) {
  if (!text) return;

  // Regex scan for http/https links
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const matches = text.match(urlRegex);
  if (!matches) return;

  const targetUrl = matches[0];

  try {
    const urlObj = new URL(targetUrl);
    const fallbackDomain = urlObj.hostname.replace('www.', '');

    // Create a temporary container layout shell
    const card = document.createElement('a');
    card.className = 'link-preview-card';
    card.href = targetUrl;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    containerElement.appendChild(card);

    // Fetch official Open Graph tags using Microlink's free public tier
    const response = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(targetUrl)}`);
    const json = await response.json();

    if (json.status === 'success' && json.data) {
      const metadata = json.data;
      
      const title = metadata.title || `${fallbackDomain} Resource`;
      const description = metadata.description || "Click to visit this web link endpoint destination securely.";
      const imageUrl = metadata.image ? metadata.image.url : "";

      card.innerHTML = `
        ${imageUrl ? `
          <div class="preview-image-container">
            <img src="${imageUrl}" alt="link preview preview banner">
          </div>
        ` : ''}
        <div class="preview-text-content">
          <span class="preview-title">${title}</span>
          <span class="preview-domain"><i class="fa-solid fa-link" style="font-size:0.7rem; margin-right:4px;"></i>${fallbackDomain}</span>
          <span class="preview-description">${description}</span>
        </div>
      `;
    } else {
      throw new Error("Metadata request missing structural payload");
    }

  } catch (err) {
    console.warn("Rich preview fetch failure, drawing local safety card fallback structure:", err);
    
    // Safety Minimal Layout Fallback structure if site actively blocks scraping bots
    const card = containerElement.querySelector('.link-preview-card');
    if (card) {
      const urlObj = new URL(targetUrl);
      const fallbackDomain = urlObj.hostname.replace('www.', '');
      card.innerHTML = `
        <div class="preview-text-content">
          <span class="preview-title">Visit External Resource Link</span>
          <span class="preview-domain"><i class="fa-solid fa-link" style="font-size:0.7rem; margin-right:4px;"></i>${fallbackDomain}</span>
          <span class="preview-description">Click path details: ${targetUrl}</span>
        </div>
      `;
    }
  }
}