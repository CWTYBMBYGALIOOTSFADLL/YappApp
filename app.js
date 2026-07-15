import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
  getFirestore, collection, addDoc, onSnapshot, query, orderBy, 
  serverTimestamp, doc, setDoc, where, getDocs, deleteDoc, getDoc, updateDoc,
  limit, startAfter
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { 
  getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB8pyL9d6X0j1D0vHLhi0lWNID9K8jpVnU",
  authDomain: "yappapp-8031b.firebaseapp.com",
  projectId: "yappapp-8031b",
  storageBucket: "yappapp-8031b.firebasestorage.app",
  messagingSenderId: "221465604909",
  appId: "1:221465604909:web:4fddfa24a0620986ab59a4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const IMGBB_API_KEY = "54f9963d526d01ed942d9a92b00bf05f"; 

// ==========================================
// 🔊 AUDIO ENGINE 
// ==========================================
const notifSound = new Audio('./notif.mp3'); 
const pingSound = new Audio('./notif.mp3');
notifSound.volume = 0.5;
pingSound.volume = 0.6;

// ==========================================
// 🧠 STATE MANAGEMENT
// ==========================================
let currentUser = ""; // Will be set to user's UID
let currentEmail = "";
let currentDisplayName = ""; 
let currentChatType = "global"; 
let currentChatTarget = "general"; 
let replyingTo = null; 

// Listeners tracking for strict lazy loading and clean sign-outs
let unsubscribeChat = null; 
let unsubscribeUserCheck = null; 
let unsubscribeSidebar = null;
let unsubscribeBgGlobal = null;
let unsubscribeBgDM = null;

let mutedChannels = JSON.parse(localStorage.getItem('yapp_muted_channels') || '[]');
let unreadCounts = {};
let loginSessionTime = 0; 

// Pagination State
const MESSAGES_PER_PAGE = 50;
let oldestLoadedDoc = null; 
let hasMoreMessages = true; 
let isFirstPageLoaded = false;

// Spam Tracker
let lastSentMessageText = "";
let duplicateMessageCount = 0;
let recentMessageTimestamps = [];
let isSpamBlocked = false;

const userProfileName = document.getElementById('user-profile-name');
const userAvatar = document.getElementById('user-avatar');

const uploadPfpBtn = document.getElementById('upload-pfp-btn');
const pfpFileInput = document.getElementById('pfp-file-input');
const settingsAvatarPreview = document.getElementById('settings-avatar-preview');
let pendingPfpUrl = ""; // Holds the newly uploaded ImgBB URL before saving

const customUsernameInput = document.getElementById('custom-username-input');

// Temp/Disposable Email Blacklist
const TEMP_EMAIL_DOMAINS = [
  "mailinator.com", "yopmail.com", "tempmail.com", "10minutemail.com", 
  "dispostable.com", "guerrillamail.com", "sharklasers.com", "getairmail.com",
  "burnermail.io", "maildrop.cc", "temp-mail.org", "generator.email", "trashmail.com"
];

const channelImages = {
  "general": "general.png",
  "coding": "hacker.png",
  "gooning": "gooning.png"
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

const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-input');

const emojiPickerWrapper = document.getElementById('emoji-picker-wrapper');
const emojiPicker = document.querySelector('emoji-picker');
let targetReactionMessageId = null; 
let targetReactionCollection = null; 

// ==========================================
// 🎨 THEME & SETTINGS
// ==========================================
const DEFAULT_ACCENT = "#a3b3ff";
const DEFAULT_TEXT = "#D4D4D4";
const DEFAULT_FONT = "'Roboto Mono', monospace";

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

settingsOpenBtn.addEventListener('click', async () => {
  displayNameInput.value = currentDisplayName; 
  
  // Get latest user data to show correct preview
  const userSnap = await getDoc(doc(db, "users", currentUser));
  if (userSnap.exists()) {
    settingsAvatarPreview.src = userSnap.data().photoURL || auth.currentUser.photoURL || "https://via.placeholder.com/40";
  }
  pendingPfpUrl = ""; // Reset pending uploads
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
      // Also sync top right UI avatar
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
  loadLocalSettings(); 
  settingsOverlay.classList.remove('active');
});

// ==========================================
// 🎭 EMOJIS & UPLOADS
// ==========================================
emojiPicker.addEventListener('emoji-click', async (event) => {
  if (!targetReactionMessageId) return;
  const selectedEmoji = event.detail.unicode;
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
  } catch (err) { console.error(err); }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#emoji-picker-wrapper') && !e.target.closest('.msg-action-btn')) {
    emojiPickerWrapper.style.display = 'none';
  }
});

attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 33554432) return alert("File is too big. 32MB max.");

  const attachIcon = document.getElementById('attach-icon');
  attachIcon.innerHTML = `<div class="btn-spinner"></div>`;
  attachBtn.style.pointerEvents = "none"; 

  try {
    const formData = new FormData();
    formData.append("image", file);
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
    const data = await response.json();

    if (data.success) await sendPayloadToDatabase("", data.data.url, "image");
    else throw new Error(data.error.message);
  } catch (err) {
    alert("Upload failed.");
  } finally {
    attachIcon.innerHTML = `<i class="fa-solid fa-plus"></i>`;
    attachBtn.style.pointerEvents = "auto";
    fileInput.value = ""; 
  }
});

// ==========================================
// 🛡️ NAME CLONING PREVENTION (Security)
// ==========================================
async function isDisplayNameTaken(targetName, excludeUsername = "") {
  const q = query(collection(db, "users"), where("displayName", "==", targetName));
  const querySnapshot = await getDocs(q);
  let taken = false;
  querySnapshot.forEach((docSnap) => {
    if (docSnap.id !== excludeUsername) {
      taken = true;
    }
  });
  return taken;
}

// ==========================================
// 🔑 AUTHENTICATION & LAZY-LOADED PERSISTENCE (Google Auth)
// ==========================================

// 1. PERSISTENCE OBSERVER: Automatically logs users back in on load safely
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user.uid;
    currentEmail = user.email;

    const userRef = doc(db, "users", currentUser);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      // User already exists in DB, fetch details and go straight to chat
      currentDisplayName = userSnap.data().displayName || "Yapper";
      const photoURL = user.photoURL || "";
      enterChatApp(photoURL); // Trigger queries and active listeners ONLY here
    } else {
      // If the user signed in but didn't finish setting up their username, sign them out
      await signOut(auth);
      resetLoginButton();
    }
  } else {
    // No user is signed in, strictly kill active listeners to stop background operations
    killAllListeners();
    loginScreen.classList.add('active');
    chatScreen.classList.remove('active');
  }
});

// 2. Google Login Button Click
googleLoginBtn.addEventListener('click', async () => {
  const rawUsername = customUsernameInput.value.trim().toLowerCase().replace(/\s+/g, '');
  
  googleLoginBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...`; 
  
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const emailDomain = user.email.split('@')[1].toLowerCase();

    // STRICT DETECT: Temp/Disposable Domain Block
    if (TEMP_EMAIL_DOMAINS.includes(emailDomain)) {
      alert("❌ Temporary email addresses are not permitted on YappApp!");
      await signOut(auth);
      resetLoginButton();
      return;
    }

    currentUser = user.uid;
    currentEmail = user.email;

    const userRef = doc(db, "users", currentUser);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      // Returning user: onAuthStateChanged handles the transition
      currentDisplayName = userSnap.data().displayName || "Yapper";
    } else {
      // New User Setup: They MUST provide a valid username in the HTML box
      if (!rawUsername || rawUsername.length < 3) {
        alert("❌ New users must choose a username (at least 3 characters long) before signing in!");
        await signOut(auth);
        resetLoginButton();
        return;
      }

      googleLoginBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Checking username...`;
      
      const usernameTaken = await isUsernameTaken(rawUsername);
      if (usernameTaken) {
        alert("❌ That username is already taken! Please pick a different one in the box.");
        await signOut(auth);
        resetLoginButton();
        return;
      }

      // Save their new custom username and setup their profile
      currentDisplayName = rawUsername;
      await setDoc(userRef, {
        username: rawUsername,
        email: currentEmail,
        displayName: rawUsername,
        joinedAt: serverTimestamp()
      });

      await setDoc(userRef, { lastLogin: serverTimestamp() }, { merge: true });
    }

  } catch (error) {
    console.error(error);
    alert("Google Sign-In Failed.");
    resetLoginButton();
  }
});

// 3. Enter Chat App (Initializes active listeners strictly upon successful authentication)
function enterChatApp(photoURL = "") {
  loginScreen.classList.remove('active');
  chatScreen.classList.add('active');
  loginSessionTime = Date.now();
  
  // Update top right header with Google Profile Info
  userProfileName.innerText = `@${currentDisplayName}`;
  if (photoURL) {
    userAvatar.src = photoURL;
    userAvatar.style.display = "block";
  } else {
    userAvatar.style.display = "none";
  }
  
  // Clean up any dangling listeners before executing new queries
  killAllListeners();

  // Active user presence observer
  unsubscribeUserCheck = onSnapshot(doc(db, "users", currentUser), (docSnap) => {
    if (!docSnap.exists()) {
      alert("⚠️ Your account has been deleted! Logging out...");
      signOut(auth).then(() => { window.location.reload(); });
    }
  });

  // Load sidebar and default chat space
  loadUsersSidebar();
  switchChat('global', 'general'); 

  // LAZY BACKGROUND BADGE LISTENERS: Tracks changes dynamically with strict query limit boundaries
  const backgroundGlobalQuery = query(
    collection(db, "global_messages"), 
    orderBy("createdAt", "desc"), 
    limit(5)
  );
  
  unsubscribeBgGlobal = onSnapshot(backgroundGlobalQuery, (snapshot) => {
     snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
           const data = change.doc.data();
           const msgTime = data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().getTime() : new Date(data.createdAt).getTime()) : Date.now();
           if (msgTime > loginSessionTime && data.sender !== currentUser && data.type !== 'system') {
               addUnreadBadge(data.channel);
           }
        }
     });
  });

  const dmQuery = query(
    collection(db, "private_messages"), 
    where("receiver", "==", currentUser), 
    orderBy("createdAt", "desc"), 
    limit(5)
  );
  
  unsubscribeBgDM = onSnapshot(dmQuery, (snapshot) => {
     snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
           const data = change.doc.data();
           const msgTime = data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().getTime() : new Date(data.createdAt).getTime()) : Date.now();
           if (msgTime > loginSessionTime && data.sender !== currentUser) {
               addUnreadBadge(data.sender);
           }
        }
     });
  });

  addDoc(collection(db, "global_messages"), {
    channel: "general", type: "system", text: `<i class="fa-solid fa-arrow-right-to-bracket"></i> <strong>${currentDisplayName}</strong> joined the server!`,
    sender: currentUser, createdAt: serverTimestamp()
  });
}

// 4. Teardown utility to cancel all open listeners to save query quotas
function killAllListeners() {
  if (unsubscribeChat) { unsubscribeChat(); unsubscribeChat = null; }
  if (unsubscribeUserCheck) { unsubscribeUserCheck(); unsubscribeUserCheck = null; }
  if (unsubscribeSidebar) { unsubscribeSidebar(); unsubscribeSidebar = null; }
  if (unsubscribeBgGlobal) { unsubscribeBgGlobal(); unsubscribeBgGlobal = null; }
  if (unsubscribeBgDM) { unsubscribeBgDM(); unsubscribeBgDM = null; }
}

function resetLoginButton() {
  googleLoginBtn.innerHTML = `<i class="fa-brands fa-google"></i> Sign in with Google`;
}

async function isUsernameTaken(targetUsername) {
  const q = query(collection(db, "users"), where("username", "==", targetUsername));
  const querySnapshot = await getDocs(q);
  return !querySnapshot.empty;
}

// ==========================================
// 🚨 NOTIFICATIONS & BADGES
// ==========================================
function addUnreadBadge(channelId) {
  if (currentChatTarget === channelId) return; 
  
  unreadCounts[channelId] = (unreadCounts[channelId] || 0) + 1;
  const count = unreadCounts[channelId];
  const badge = document.getElementById(`badge-${channelId}`);
  
  if (badge) {
    let imgName = count >= 10 ? '10plus.png' : `${count}.png`;
    badge.innerHTML = `<img src="${imgName}" alt="Unread">`;
    badge.classList.add('active');
  }
}

function clearUnreadBadge(channelId) {
  unreadCounts[channelId] = 0;
  const badge = document.getElementById(`badge-${channelId}`);
  if (badge) {
    badge.innerHTML = '';
    badge.classList.remove('active');
  }
}

// ==========================================
// 💬 CHAT UI & LOGIC
// ==========================================
function loadUsersSidebar() {
  const q = query(collection(db, "users"), orderBy("username", "asc"));
  unsubscribeSidebar = onSnapshot(q, (snapshot) => {
    userList.innerHTML = ''; 
    snapshot.forEach((docSnap) => {
      const user = docSnap.data();
      if (user.username !== currentUser) {
        const userEl = document.createElement('div');
        userEl.classList.add('channel');
        
        userEl.innerHTML = `
          <i class="fa-solid fa-at" style="opacity: 0.6;"></i> ${user.displayName || user.username}
          <span class="notif-badge" id="badge-${user.username}"></span>
        `;
        
        userEl.addEventListener('click', () => {
          document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
          userEl.classList.add('active');
          switchChat('dm', user.username);
        });
        userList.appendChild(userEl);
      }
    });
  });
}

globalChannels.forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    switchChat('global', tab.getAttribute('data-channel'));
  });
});

async function updateHeaderUI() {
  updateMuteUI();
  
  if (currentChatType === 'global') {
    const imgSrc = channelImages[currentChatTarget] || "https://via.placeholder.com/20/ffffff/000000";
    currentChatTitle.innerHTML = `<img src="${imgSrc}" class="channel-img"> ${currentChatTarget}`;
  } else {
    try {
      const targetSnap = await getDoc(doc(db, "users", currentChatTarget));
      if (targetSnap.exists()) {
        currentChatTitle.innerHTML = `<i class="fa-solid fa-at" style="margin-right: 8px;"></i>${targetSnap.data().displayName || currentChatTarget}`;
      } else {
        currentChatTitle.innerHTML = `<i class="fa-solid fa-at" style="margin-right: 8px;"></i>${currentChatTarget}`;
      }
    } catch (err) {
      currentChatTitle.innerHTML = `<i class="fa-solid fa-at" style="margin-right: 8px;"></i>${currentChatTarget}`;
    }
  }
}

cancelReplyBtn.addEventListener('click', () => {
  replyingTo = null;
  replyBanner.style.display = 'none';
});

function switchChat(type, target) {
  currentChatType = type;
  currentChatTarget = target;
  updateHeaderUI();
  clearUnreadBadge(target); 
  
  replyingTo = null;
  replyBanner.style.display = 'none';
  
  messagesContainer.innerHTML = `
    <div class="loader-wrapper" id="chat-loader">
      <div class="spinner"></div>
    </div>
  `;
  
  if (unsubscribeChat) unsubscribeChat();

  oldestLoadedDoc = null;
  hasMoreMessages = true;
  isFirstPageLoaded = false;

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
    const chatId = [currentUser, target].sort().join('_');
    q = query(
      collection(db, collectionName), 
      where("chatId", "==", chatId), 
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

    messagesContainer.innerHTML = '';
    renderLoadMoreButton(collectionName);

    let hasPing = false;
    let newMessagesCount = 0;

    docsArray.forEach(item => {
      displayMessage(item.data, item.id, collectionName);
      if (isFirstPageLoaded && item.data.sender !== currentUser && item.data.type !== 'system') {
        newMessagesCount++;
        if (item.data.text && (item.data.text.includes(`@${currentUser}`) || item.data.text.includes(`@${currentDisplayName}`))) {
          hasPing = true;
        }
      }
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    if (isFirstPageLoaded && !mutedChannels.includes(currentChatTarget)) {
      if (hasPing) {
        pingSound.currentTime = 0; 
        pingSound.play().catch(()=>{});
      } else if (newMessagesCount > 0) {
        notifSound.currentTime = 0; 
        notifSound.play().catch(()=>{});
      }
    }
    isFirstPageLoaded = true;
  });
}

async function loadMorePreviousMessages(collectionName) {
  if (!oldestLoadedDoc || !hasMoreMessages) return;

  const loadBtn = document.getElementById('load-more-btn');
  if (loadBtn) {
    loadBtn.disabled = true;
    loadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';
  }

  let q;
  if (currentChatType === 'global') {
    q = query(
      collection(db, collectionName),
      where("channel", "==", currentChatTarget),
      orderBy("createdAt", "desc"),
      startAfter(oldestLoadedDoc),
      limit(MESSAGES_PER_PAGE)
    );
  } else {
    const chatId = [currentUser, currentChatTarget].sort().join('_');
    q = query(
      collection(db, collectionName),
      where("chatId", "==", chatId),
      orderBy("createdAt", "desc"),
      startAfter(oldestLoadedDoc),
      limit(MESSAGES_PER_PAGE)
    );
  }

  try {
    const snapshot = await getDocs(q);
    const docsArray = [];
    snapshot.forEach(docSnap => {
      docsArray.push({ id: docSnap.id, ref: docSnap, data: docSnap.data() });
    });

    if (docsArray.length > 0) {
      oldestLoadedDoc = docsArray[docsArray.length - 1].ref; 
      hasMoreMessages = docsArray.length >= MESSAGES_PER_PAGE;
    } else {
      hasMoreMessages = false;
    }

    const previousScrollHeight = messagesContainer.scrollHeight;

    const existingBtn = document.getElementById('load-more-btn');
    if (existingBtn) existingBtn.remove();

    renderLoadMoreButton(collectionName);

    docsArray.forEach(item => {
      displayMessage(item.data, item.id, collectionName, true); 
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight - previousScrollHeight;

  } catch (err) {
    console.error("Error loading more messages: ", err);
  }
}

function renderLoadMoreButton(collectionName) {
  if (!hasMoreMessages) return;

  const btn = document.createElement('button');
  btn.id = 'load-more-btn';
  btn.style.cssText = `
    width: 90%;
    margin: 15px auto;
    padding: 10px;
    background: var(--darker-bg);
    color: var(--golden);
    border: 1.5px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-weight: 500;
    font-size: 0.9rem;
    display: block;
    transition: 0.2s;
    text-align: center;
  `;
  btn.innerHTML = '<i class="fa-solid fa-clock-rotate-left" style="margin-right:8px;"></i> Load Older Messages';
  btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'var(--golden)'; });
  btn.addEventListener('mouseleave', () => { btn.style.borderColor = 'var(--border)'; });

  btn.addEventListener('click', () => loadMorePreviousMessages(collectionName));

  messagesContainer.insertBefore(btn, messagesContainer.firstChild);
}

function displayMessage(data, docId, collectionName, prepend = false) {
  if (data.type === 'system') {
    const sysDiv = document.createElement('div');
    sysDiv.classList.add('system-message');
    sysDiv.innerHTML = data.text;
    if (prepend) {
      const loadBtn = document.getElementById('load-more-btn');
      if (loadBtn && loadBtn.nextSibling) {
        messagesContainer.insertBefore(sysDiv, loadBtn.nextSibling);
      } else {
        messagesContainer.insertBefore(sysDiv, messagesContainer.firstChild);
      }
    } else {
      messagesContainer.appendChild(sysDiv);
    }
    return sysDiv;
  }

  const isYours = data.sender === currentUser;
  const senderName = data.senderDisplayName || data.sender;
  const isPing = !isYours && data.text && (data.text.includes(`@${currentUser}`) || data.text.includes(`@${currentDisplayName}`));
  const senderPhoto = data.senderPhotoURL || "https://via.placeholder.com/36"; 
  
  let timeString = "Sending...";
  if (data.createdAt) {
    const dateObj = typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate() : new Date(data.createdAt);
    timeString = dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message');
  if (isYours) msgDiv.classList.add('yours');
  
  let quotedHtml = "";
  if (data.replyTo) {
    let replySnippet = data.replyTo.type === 'image' ? '[Image]' : decryptText(data.replyTo.text);
    quotedHtml = `<div class="quoted-reply"><i class="fa-solid fa-reply" style="margin-right: 4px;"></i> Replying to <strong>@${data.replyTo.senderName}</strong>: ${replySnippet}</div>`;
  }

  let contentHtml = "";
  if (data.type === 'image') {
    contentHtml = `<img src="${data.imageUrl}" alt="image">`;
  } else {
    const readableText = decryptText(data.text);
    contentHtml = `<span>${readableText}</span>`;
  }

  let reactionsDisplayHtml = `<div class="reactions-display">`;
  const reactionsMap = data.reactions || {};
  const emojiCounts = {};
  const userReactedObj = {};

  Object.entries(reactionsMap).forEach(([uid, emoji]) => {
    emojiCounts[emoji] = (emojiCounts[emoji] || 0) + 1;
    if (uid === currentUser) userReactedObj[emoji] = true;
  });

  Object.entries(emojiCounts).forEach(([emoji, count]) => {
    const hasReacted = userReactedObj[emoji] ? 'active' : '';
    reactionsDisplayHtml += `<div class="reaction-badge ${hasReacted}" data-emoji="${emoji}">${emoji} <span style="margin-left: 2px;">${count}</span></div>`;
  });
  reactionsDisplayHtml += `</div>`;

  const actionBarHtml = `
    <div class="msg-actions">
      <div class="msg-action-btn reply-btn" title="Reply"><i class="fa-solid fa-reply"></i></div>
      <div class="msg-action-btn add-reaction-btn" title="React"><i class="fa-regular fa-face-smile"></i></div>
      ${isYours ? `<button class="msg-action-btn delete-btn" data-id="${docId}" title="Delete" style="border:none;"><i class="fa-solid fa-trash"></i></button>` : ''}
    </div>
  `;

  const wrapperHtml = `
    <div class="message-bubble-wrapper">
      <div class="bubble ${isPing ? 'mentioned' : ''}">${quotedHtml}${contentHtml}</div>
      ${actionBarHtml}
    </div>
    ${reactionsDisplayHtml}
  `;

  msgDiv.innerHTML = `
    <div class="message-content-wrapper">
      <div class="sender-row" style="${isYours ? 'margin-right: 48px;' : 'margin-left: 48px;'}">
        <span class="sender-name">${senderName}</span>
        <span class="timestamp">${timeString}</span>
      </div>
      <div class="message-bubble-wrapper">
        <img src="${senderPhoto}" class="message-avatar" alt="avatar">
        <div class="bubble ${isPing ? 'mentioned' : ''}">${quotedHtml}${contentHtml}</div>
        ${actionBarHtml}
      </div>
      <div class="reactions-container" style="${isYours ? 'margin-right: 48px;' : 'margin-left: 48px;'}">
        ${reactionsDisplayHtml}
      </div>
    </div>
  `;
  
  msgDiv.querySelector('.reply-btn').addEventListener('click', () => {
    const decryptedReplyText = data.type === 'image' ? "" : decryptText(data.text);
    
    replyingTo = { messageId: docId, senderName: senderName, text: data.text || "", type: data.type };
    replyToName.innerText = senderName;
    replyToText.innerText = data.type === 'image' ? '[Image attached]' : decryptedReplyText;
    replyBanner.style.display = 'flex';
    messageInput.focus();
  });

  const addReactionBtn = msgDiv.querySelector('.add-reaction-btn');
  addReactionBtn.addEventListener('click', (e) => {
    targetReactionMessageId = docId;
    targetReactionCollection = collectionName;
    const rect = addReactionBtn.getBoundingClientRect();
    emojiPickerWrapper.style.display = 'block';
    let topPos = rect.top - 350; 
    if (topPos < 0) topPos = rect.bottom + 10; 
    emojiPickerWrapper.style.top = `${topPos}px`;
    emojiPickerWrapper.style.left = `${Math.max(10, rect.left - 150)}px`;
  });

  msgDiv.querySelectorAll('.reaction-badge').forEach(badge => {
    badge.addEventListener('click', async () => {
      const selectedEmoji = badge.getAttribute('data-emoji');
      const currentReactions = data.reactions || {};
      if (currentReactions[currentUser] === selectedEmoji) delete currentReactions[currentUser];
      else currentReactions[currentUser] = selectedEmoji;
      try { await updateDoc(doc(db, collectionName, docId), { reactions: currentReactions }); } catch (err) {}
    });
  });

  if (isYours) {
    msgDiv.querySelector('.delete-btn').addEventListener('click', async () => {
      try { await deleteDoc(doc(db, collectionName, docId)); } catch (err) {}
    });
  }

  if (prepend) {
    const loadBtn = document.getElementById('load-more-btn');
    if (loadBtn && loadBtn.nextSibling) {
      messagesContainer.insertBefore(msgDiv, loadBtn.nextSibling);
    } else {
      messagesContainer.insertBefore(msgDiv, messagesContainer.firstChild);
    }
  } else {
    messagesContainer.appendChild(msgDiv);
  }

  return msgDiv;
}

async function sendPayloadToDatabase(textContent, imageUrlContent, payloadType) {
  const userCheck = await getDoc(doc(db, "users", currentUser));
  if (!userCheck.exists()) {
    alert("⚠️ Your account has been deleted! Logging out...");
    window.location.reload();
    return;
  }

  const userData = userCheck.data();
  const senderPhoto = userData.photoURL || auth.currentUser.photoURL || "";

  let safeText = textContent;
  if (payloadType === "text" && textContent) {
    safeText = encryptText(textContent);
  }

  const payload = {
    type: payloadType, 
    text: safeText, 
    imageUrl: imageUrlContent, 
    sender: currentUser,
    senderDisplayName: currentDisplayName, 
    senderPhotoURL: senderPhoto, 
    createdAt: serverTimestamp(), 
    reactions: {}
  };

  try {
    if (currentChatType === 'global') {
      payload.channel = currentChatTarget;
      await addDoc(collection(db, "global_messages"), payload);
    } else if (currentChatType === 'dm') {
      payload.chatId = [currentUser, currentChatTarget].sort().join('_');
      payload.receiver = currentChatTarget;
      await addDoc(collection(db, "private_messages"), payload);
    }
  } catch (error) { console.error(error); } 
  finally { replyingTo = null; replyBanner.style.display = 'none'; }
}

// ==========================================
// 🔐 ENCRYPTION ENGINE (AES)
// ==========================================
const SECRET_KEY = "YAPPMASTER!.!"; 

function encryptText(text) {
  if (!text) return "";
  return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
}

function decryptText(ciphertext) {
  if (!ciphertext) return "";
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    return originalText || "[Encrypted Message!!]";
  } catch (err) {
    return "[Encrypted Message!!]";
  }
}

// ==========================================
// 🧠 BRAINROT FEED CONFIGURATION
// ==========================================
const brainrotLinks = [
  "https://www.youtube.com/shorts/UEYUozZ0Jtw", 
  "https://www.youtube.com/shorts/8MJrB_ZhLWg", 
  "https://www.youtube.com/shorts/zW7z4w118QU", 
  "https://www.youtube.com/shorts/utmdQfyaAO0", 
  "https://www.youtube.com/shorts/kksKRA5_To8", 
  "https://www.youtube.com/shorts/N70unL6_UU8", 
  "https://www.youtube.com/shorts/iczoCkbrO9k", 
  "https://www.youtube.com/shorts/__3mSAgclmk", 
  "https://www.youtube.com/shorts/mmUUsE3NfcM"  
];

function extractYouTubeID(url) {
  if (url.length === 11) return url; 
  const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

function loadBrainrotFeed() {
  const leftPanel = document.getElementById('shorts-left');
  const rightPanel = document.getElementById('shorts-right');
  if (!leftPanel || !rightPanel) return;

  brainrotLinks.forEach((link, index) => {
    const videoId = extractYouTubeID(link);
    if (!videoId) return;

    const iframeHtml = `
      <div class="short-wrapper">
        <iframe width="100%" height="100%" src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
      </div>
    `;

    if (index % 2 === 0) {
      leftPanel.insertAdjacentHTML('beforeend', iframeHtml);
    } else {
      rightPanel.insertAdjacentHTML('beforeend', iframeHtml);
    }
  });
}

loadBrainrotFeed();

// ==========================================
// 🚨 ANTI-SPAM LOGIC
// ==========================================
messageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isSpamBlocked) return;
  const text = messageInput.value.trim();
  if (!text) return;

  const now = Date.now();

  recentMessageTimestamps = recentMessageTimestamps.filter(time => now - time < 5000);
  recentMessageTimestamps.push(now);

  if (text.toLowerCase() === lastSentMessageText.toLowerCase()) {
    duplicateMessageCount++;
  } else {
    duplicateMessageCount = 1; 
  }
  lastSentMessageText = text;

  let penalizeTime = 0;
  let penaltyReason = "";

  if (duplicateMessageCount >= 5) {
    penalizeTime = 30000; 
    penaltyReason = "stop repeating messages!";
  } 
  else if (recentMessageTimestamps.length >= 5) {
    penalizeTime = 10000; 
    penaltyReason = "slow down...";
  }

  if (penalizeTime > 0) {
    isSpamBlocked = true;
    const originalPlaceholder = messageInput.placeholder;
    messageInput.disabled = true; 
    document.getElementById('send-btn').disabled = true; 
    attachBtn.style.pointerEvents = "none";
    messageInput.value = ""; 
    
    let secondsLeft = penalizeTime / 1000;
    messageInput.placeholder = `You're muted: ${penaltyReason} (${secondsLeft}s left)`;

    const jailTimer = setInterval(() => {
      secondsLeft--; 
      if (secondsLeft > 0) {
        messageInput.placeholder = `You're muted: ${penaltyReason} (${secondsLeft}s left)`;
      }
    }, 1000);

    setTimeout(() => {
      clearInterval(jailTimer); 
      isSpamBlocked = false; 
      messageInput.disabled = false;
      document.getElementById('send-btn').disabled = false; 
      attachBtn.style.pointerEvents = "auto";
      messageInput.placeholder = originalPlaceholder; 
      recentMessageTimestamps = []; 
      duplicateMessageCount = 0;
      lastSentMessageText = "";
    }, penalizeTime);
    return; 
  }

  messageInput.value = ''; 
  sendPayloadToDatabase(text, null, "text");
});

// Open settings avatar upload
uploadPfpBtn.addEventListener('click', () => pfpFileInput.click());

pfpFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 10485760) return alert("Avatar file must be under 10MB.");

  uploadPfpBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Uploading...`;
  uploadPfpBtn.disabled = true;

  try {
    const formData = new FormData();
    formData.append("image", file);
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
    const data = await response.json();

    if (data.success) {
      pendingPfpUrl = data.data.url;
      settingsAvatarPreview.src = pendingPfpUrl;
    } else {
      throw new Error(data.error.message);
    }
  } catch (err) {
    alert("Profile picture upload failed.");
  } finally {
    uploadPfpBtn.innerHTML = `Choose Image`;
    uploadPfpBtn.disabled = false;
    pfpFileInput.value = "";
  }
});

// ==========================================
// 🛠️ UPGRADED ADMIN NUKE UTILITIES
// ==========================================
const ADMIN_PASSWORD = "yappmaster3000"; 

window.nukeAllMessages = async () => {
  const pass = prompt("Enter the admin password:");
  if (pass !== ADMIN_PASSWORD) {
    alert("❌ Incorrect password!");
    return;
  }

  const choice = prompt(
    "What do you want to nuke?\n" +
    "1 - Wipe absolutely EVERYTHING (All chats, DMs, Channels)\n" +
    "2 - Wipe a specific channel's messages (e.g. general, coding, gooning)\n" +
    "3 - Wipe messages from a specific user (global and DMs)"
  );

  if (!choice) return;

  const globalRef = collection(db, "global_messages");
  const privateRef = collection(db, "private_messages");

  if (choice === "1") {
    if (!confirm("⚠️ Are you ABSOLUTELY sure you want to delete EVERY message in the database?")) return;
    
    const globalSnap = await getDocs(globalRef);
    globalSnap.forEach((docSnap) => deleteDoc(docSnap.ref));
    
    const dmSnap = await getDocs(privateRef);
    dmSnap.forEach((docSnap) => deleteDoc(docSnap.ref));
    
    alert("🔥 Database wiped successfully!");
  } 
  else if (choice === "2") {
    const targetChannel = prompt("Enter the exact name of the channel to wipe (e.g. general, coding, gooning):")?.trim().toLowerCase();
    if (!targetChannel) return;

    if (!confirm(`⚠️ Delete all messages in #${targetChannel}?`)) return;

    const q = query(globalRef, where("channel", "==", targetChannel));
    const querySnapshot = await getDocs(q);
    
    let count = 0;
    querySnapshot.forEach((docSnap) => {
      deleteDoc(docSnap.ref);
      count++;
    });

    alert(`🔥 Deleted ${count} messages from #${targetChannel}!`);
  } 
  else if (choice === "3") {
    const targetUser = prompt("Enter the username of the person whose messages you want to delete:")?.trim();
    if (!targetUser) return;

    if (!confirm(`⚠️ Delete all messages sent by @${targetUser} across all channels and DMs?`)) return;

    const qGlobal = query(globalRef, where("sender", "==", targetUser));
    const globalSnap = await getDocs(qGlobal);
    let globalCount = 0;
    globalSnap.forEach((docSnap) => {
      deleteDoc(docSnap.ref);
      globalCount++;
    });

    const qPrivate = query(privateRef, where("sender", "==", targetUser));
    const privateSnap = await getDocs(qPrivate);
    let privateCount = 0;
    privateSnap.forEach((docSnap) => {
      deleteDoc(docSnap.ref);
      privateCount++;
    });

    alert(`🔥 Deleted ${globalCount} global messages and ${privateCount} DMs sent by @${targetUser}!`);
  } 
  else {
    alert("❌ Invalid option choice.");
  }
};