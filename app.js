import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
  getFirestore, collection, addDoc, onSnapshot, query, orderBy, 
  serverTimestamp, doc, setDoc, where, getDocs, deleteDoc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

const IMGBB_API_KEY = "54f9963d526d01ed942d9a92b00bf05f"; 

// AUDIO ENGINE (Using local files as requested)
const notifSound = new Audio('./notif.mp3'); 
const pingSound = new Audio('./notif.mp3');
notifSound.volume = 0.5;
pingSound.volume = 0.6;

let currentUser = "";
let currentDisplayName = ""; 
let currentChatType = "global"; 
let currentChatTarget = "general"; 
let unsubscribeChat = null; 
let replyingTo = null; 

let mutedChannels = JSON.parse(localStorage.getItem('yapp_muted_channels') || '[]');

const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const loginBtn = document.getElementById('login-btn');
const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
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

let recentMessages = [];
let isSpamBlocked = false;

const DEFAULT_ACCENT = "#a3b3ff";
const DEFAULT_TEXT = "#D4D4D4";
const DEFAULT_FONT = "'Roboto Mono', monospace";
// Map your channels to their specific images
// Map your channels to their specific images
const channelImages = {
  "general": "general.png",
  "coding": "hacker.png",
  "gaming": "gaming.png"
};

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

settingsOpenBtn.addEventListener('click', () => {
  displayNameInput.value = currentDisplayName; 
  settingsOverlay.classList.add('active');
});
closeSettingsBtn.addEventListener('click', () => settingsOverlay.classList.remove('active'));

saveSettingsBtn.addEventListener('click', async () => {
  const newAccent = accentColorInput.value;
  const newText = textColorInput.value;
  const newFont = fontInput.value;
  
  document.documentElement.style.setProperty('--golden', newAccent);
  document.documentElement.style.setProperty('--text-color', newText);
  document.documentElement.style.setProperty('--app-font', newFont);
  
  localStorage.setItem('yapp_accent', newAccent);
  localStorage.setItem('yapp_text', newText);
  localStorage.setItem('yapp_font', newFont);

  const newName = displayNameInput.value.trim() || currentUser;
  currentDisplayName = newName;
  
  try {
    await setDoc(doc(db, "users", currentUser), { displayName: newName }, { merge: true });
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

// Emoji Picker
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

// File Upload
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

// Login
// Login
loginBtn.addEventListener('click', async () => {
  const name = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (name && password) {
    loginBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`; 
    try {
      const userRef = doc(db, "users", name);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const userData = userSnap.data();
        
        // 🚨 LEGACY ACCOUNT FIX: If they have no password on file, save this one!
        if (!userData.password) {
          await setDoc(userRef, { password: password }, { merge: true });
          currentDisplayName = userData.displayName || name;
        } 
        // Otherwise, do the normal password check
        else if (userData.password !== password) {
          alert("incorrect password for this user!");
          loginBtn.innerText = "join Chat";
          return;
        } else {
          currentDisplayName = userData.displayName || name;
        }
      } else {
        // Completely new user registration
        currentDisplayName = name;
        await setDoc(userRef, { username: name, password: password, displayName: name, joinedAt: serverTimestamp() });
      }

      await setDoc(userRef, { lastLogin: serverTimestamp() }, { merge: true });
      currentUser = name;
      enterChatApp();
      
    } catch (error) {
      alert("Database error.");
      loginBtn.innerText = "join Chat";
    }
  } else {
    alert("please enter both username and password.");
  }
});

function enterChatApp() {
  loginScreen.classList.remove('active');
  chatScreen.classList.add('active');
  
  addDoc(collection(db, "global_messages"), {
    channel: "general", type: "system", text: `<i class="fa-solid fa-arrow-right-to-bracket"></i> <strong>${currentDisplayName}</strong> joined the server!`,
    sender: currentUser, createdAt: serverTimestamp()
  });

  loadUsersSidebar();
  switchChat('global', 'general'); 
}

window.addEventListener('beforeunload', () => {
  if(currentUser) {
    addDoc(collection(db, "global_messages"), {
      channel: "general", type: "system", text: `<i class="fa-solid fa-arrow-right-from-bracket"></i> <strong>${currentDisplayName}</strong> disconnected.`,
      sender: currentUser, createdAt: serverTimestamp()
    });
  }
});

function loadUsersSidebar() {
  const q = query(collection(db, "users"), orderBy("username", "asc"));
  onSnapshot(q, (snapshot) => {
    userList.innerHTML = ''; 
    snapshot.forEach((docSnap) => {
      const user = docSnap.data();
      if (user.username !== currentUser) {
        const userEl = document.createElement('div');
        userEl.classList.add('channel');
        userEl.innerHTML = `<i class="fa-solid fa-at" style="margin-right: 5px; opacity: 0.6;"></i>${user.displayName || user.username}`;
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
    // Look up the image from our dictionary, fallback to a default if it doesn't exist
    const imgSrc = channelImages[currentChatTarget] || "https://via.placeholder.com/20/ffffff/000000";
    currentChatTitle.innerHTML = `<img src="${imgSrc}" class="channel-img"> ${currentChatTarget}`;
  } else {
    // Keep the @ icon for Direct Messages
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
  
  replyingTo = null;
  replyBanner.style.display = 'none';
  
  messagesContainer.innerHTML = `
    <div class="loader-wrapper" id="chat-loader">
      <div class="spinner"></div>
    </div>
  `;
  
  if (unsubscribeChat) unsubscribeChat();

  let q;
  const collectionName = type === 'global' ? "global_messages" : "private_messages";
  if (type === 'global') q = query(collection(db, collectionName), where("channel", "==", target), orderBy("createdAt", "asc"));
  else {
    const chatId = [currentUser, target].sort().join('_');
    q = query(collection(db, collectionName), where("chatId", "==", chatId), orderBy("createdAt", "asc"));
  }
  
  let initialLoad = true;

  unsubscribeChat = onSnapshot(q, (snapshot) => {
    messagesContainer.innerHTML = ''; 
    let newMessagesCount = 0;
    let hasPing = false;

    snapshot.docChanges().forEach(change => {
      if (change.type === 'added' && !initialLoad) {
        const data = change.doc.data();
        if (data.sender !== currentUser && data.type !== 'system') {
          newMessagesCount++;
          if (data.text && (data.text.includes(`@${currentUser}`) || data.text.includes(`@${currentDisplayName}`))) {
            hasPing = true;
          }
        }
      }
    });

    snapshot.forEach((docSnap) => {
      displayMessage(docSnap.data(), docSnap.id, collectionName);
    });
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Fire audio engine if not muted
    if (!initialLoad && !mutedChannels.includes(currentChatTarget)) {
      if (hasPing) {
        // Reset the ping sound to the absolute beginning instantly
        pingSound.currentTime = 0; 
        pingSound.play().catch(()=>{});
      }
      else if (newMessagesCount > 0) {
        // Reset the pop sound to the absolute beginning instantly
        notifSound.currentTime = 0; 
        notifSound.play().catch(()=>{});
      }
    }
    initialLoad = false;
  });
}

function displayMessage(data, docId, collectionName) {
  if (data.type === 'system') {
    const sysDiv = document.createElement('div');
    sysDiv.classList.add('system-message');
    sysDiv.innerHTML = data.text;
    messagesContainer.appendChild(sysDiv);
    return;
  }

  const isYours = data.sender === currentUser;
  const senderName = data.senderDisplayName || data.sender;
  const isPing = !isYours && data.text && (data.text.includes(`@${currentUser}`) || data.text.includes(`@${currentDisplayName}`));
  
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
    const replySnippet = data.replyTo.type === 'image' ? '[Image]' : data.replyTo.text;
    quotedHtml = `<div class="quoted-reply"><i class="fa-solid fa-reply" style="margin-right: 4px;"></i> Replying to <strong>@${data.replyTo.senderName}</strong>: ${replySnippet}</div>`;
  }

  let contentHtml = "";
  if (data.type === 'image') contentHtml = `<img src="${data.imageUrl}" alt="image">`;
  else contentHtml = `<span>${data.text}</span>`;

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
    <div class="sender-row">
      <span class="sender-name">${senderName}</span>
      <span class="timestamp">${timeString}</span>
    </div>
    ${wrapperHtml}
  `;
  
  msgDiv.querySelector('.reply-btn').addEventListener('click', () => {
    replyingTo = { messageId: docId, senderName: senderName, text: data.text || "", type: data.type };
    replyToName.innerText = senderName;
    replyToText.innerText = data.type === 'image' ? '[Image attached]' : data.text;
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

  messagesContainer.appendChild(msgDiv);
}

async function sendPayloadToDatabase(textContent, imageUrlContent, payloadType) {
  const payload = {
    type: payloadType, text: textContent, imageUrl: imageUrlContent, sender: currentUser,
    senderDisplayName: currentDisplayName, createdAt: serverTimestamp(), reactions: {}
  };
  if (replyingTo) payload.replyTo = replyingTo;

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

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (isSpamBlocked) return;
  const text = messageInput.value.trim();
  if (!text) return;

  const now = Date.now();
  recentMessages = recentMessages.filter(time => now - time < 5000);
  recentMessages.push(now);

  if (recentMessages.length >= 5) {
    isSpamBlocked = true;
    const originalPlaceholder = messageInput.placeholder;
    messageInput.disabled = true; document.getElementById('send-btn').disabled = true; attachBtn.style.pointerEvents = "none";
    messageInput.value = ""; messageInput.placeholder = "wait 10 seconds...";
    
    let timeLeft = 10;
    const jailTimer = setInterval(() => {
      timeLeft--; if (timeLeft > 0) messageInput.placeholder = `wait ${timeLeft} seconds...`;
    }, 1000);

    setTimeout(() => {
      clearInterval(jailTimer); isSpamBlocked = false; messageInput.disabled = false;
      document.getElementById('send-btn').disabled = false; attachBtn.style.pointerEvents = "auto";
      messageInput.placeholder = originalPlaceholder; recentMessages = []; 
    }, 10000);
    return; 
  }
  messageInput.value = ''; 
  sendPayloadToDatabase(text, null, "text");
});

const ADMIN_PASSWORD = "yappmaster3000"; 
window.nukeAllMessages = async () => {
  const pass = prompt("enter the admin password to wipe ALL messages:");
  if (pass !== ADMIN_PASSWORD) return; 
  if (!confirm("are you ABSOLUTELY sure you want to delete EVERY message?")) return;
  
  const globalSnap = await getDocs(collection(db, "global_messages"));
  globalSnap.forEach((docSnap) => { deleteDoc(docSnap.ref); });
  const dmSnap = await getDocs(collection(db, "private_messages"));
  dmSnap.forEach((docSnap) => { deleteDoc(docSnap.ref); });
};