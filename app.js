import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
  getFirestore, collection, addDoc, onSnapshot, query, orderBy, 
  serverTimestamp, doc, setDoc, where, getDocs, deleteDoc, getDoc 
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

let currentUser = "";
let currentDisplayName = ""; 
let currentChatType = "global"; 
let currentChatTarget = "general"; 
let unsubscribeChat = null; 

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const loginBtn = document.getElementById('login-btn');
const usernameInput = document.getElementById('username-input');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const messagesContainer = document.getElementById('messages');
const userList = document.getElementById('user-list');
const currentChatTitle = document.getElementById('current-chat-title');
const globalChannels = document.querySelectorAll('.global-channel');

// Settings DOM
const settingsOverlay = document.getElementById('settings-overlay');
const settingsOpenBtn = document.getElementById('settings-open');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const resetSettingsBtn = document.getElementById('reset-settings-btn'); 
const displayNameInput = document.getElementById('display-name-input');
const accentColorInput = document.getElementById('accent-color-input');
const textColorInput = document.getElementById('text-color-input');
const fontInput = document.getElementById('font-input');

// Attachment DOM
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-input');

// Anti-Spam State Variables
let recentMessages = [];
let isSpamBlocked = false;

// ==========================================
// 🎨 THEME & SETTINGS LOGIC
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
  } catch (error) {
    console.error("Failed to save display name:", error);
  }
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
// 📁 MEDIA: IMGBB FREE FILE HOSTING
// ==========================================
attachBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 33554432) {
    alert("Bro! File is too big. ImgBB's free tier limits images to 32MB.");
    fileInput.value = ""; 
    return;
  }

  const attachIcon = document.getElementById('attach-icon');
  attachIcon.innerHTML = `<div class="btn-spinner"></div>`;
  attachBtn.style.pointerEvents = "none"; 

  try {
    const formData = new FormData();
    formData.append("image", file);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (data.success) {
      const publicUrl = data.data.url;
      await sendPayloadToDatabase("", publicUrl, "image");
    } else {
      throw new Error(data.error.message);
    }

  } catch (err) {
    console.error("Upload failed:", err);
    alert("Failed to upload image. Make sure your API key is correct!");
  } finally {
    attachIcon.innerHTML = "+";
    attachBtn.style.pointerEvents = "auto";
    fileInput.value = ""; 
  }
});

// ==========================================
// 🔑 LOGIN LOGIC
// ==========================================
loginBtn.addEventListener('click', async () => {
  const name = usernameInput.value.trim();
  if (name) {
    loginBtn.innerText = "loading..."; 
    try {
      const userRef = doc(db, "users", name);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists() && userSnap.data().displayName) {
        currentDisplayName = userSnap.data().displayName;
      } else {
        currentDisplayName = name;
      }

      await setDoc(userRef, { 
        username: name,
        displayName: currentDisplayName,
        lastLogin: serverTimestamp() 
      }, { merge: true });
      
      currentUser = name;
      enterChatApp();
      
    } catch (error) {
      console.error(error);
      alert("Error connecting to database.");
      loginBtn.innerText = "join Chat";
    }
  }
});

function enterChatApp() {
  loginScreen.classList.remove('active');
  chatScreen.classList.add('active');
  loadUsersSidebar();
  switchChat('global', 'general'); 
}

// ==========================================
// 💬 CORE CHAT LOGIC
// ==========================================
function loadUsersSidebar() {
  const q = query(collection(db, "users"), orderBy("username", "asc"));
  onSnapshot(q, (snapshot) => {
    userList.innerHTML = ''; 
    snapshot.forEach((docSnap) => {
      const user = docSnap.data();
      if (user.username !== currentUser) {
        const userEl = document.createElement('div');
        userEl.classList.add('channel');
        userEl.innerText = `@${user.displayName || user.username}`;
        
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

function switchChat(type, target) {
  currentChatType = type;
  currentChatTarget = target;
  currentChatTitle.innerText = `@${target}`;
  
  if (unsubscribeChat) unsubscribeChat();

  let q;
  const collectionName = type === 'global' ? "global_messages" : "private_messages";
  
  if (type === 'global') {
    q = query(collection(db, collectionName), where("channel", "==", target), orderBy("createdAt", "asc"));
  } else {
    const chatId = [currentUser, target].sort().join('_');
    q = query(collection(db, collectionName), where("chatId", "==", chatId), orderBy("createdAt", "asc"));
  }
  
  unsubscribeChat = onSnapshot(q, (snapshot) => {
    messagesContainer.innerHTML = ''; 
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      displayMessage(data, docSnap.id, collectionName);
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

function displayMessage(data, docId, collectionName) {
  const isYours = data.sender === currentUser;
  
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message');
  if (isYours) msgDiv.classList.add('yours');
  
  let contentHtml = "";
  if (data.type === 'image') {
    contentHtml = `<img src="${data.imageUrl}" alt="image">`;
  } else {
    contentHtml = `<div class="bubble">${data.text}</div>`;
  }

  const wrapperHtml = `
    <div class="message-bubble-wrapper">
      ${contentHtml}
      ${isYours ? `<button class="delete-btn" data-id="${docId}">🗑️</button>` : ''}
    </div>
  `;

  msgDiv.innerHTML = `
    <div class="sender">${isYours ? 'you' : (data.senderDisplayName || data.sender)}</div>
    ${wrapperHtml}
  `;
  
  if (isYours) {
    const delBtn = msgDiv.querySelector('.delete-btn');
    delBtn.addEventListener('click', async () => {
      try {
        await deleteDoc(doc(db, collectionName, docId));
      } catch (err) {
        console.error("Failed to delete message:", err);
      }
    });
  }

  messagesContainer.appendChild(msgDiv);
}

// ==========================================
// 🛡️ ANTI-SPAM & MESSAGE SENDING (UNIFIED)
// ==========================================
async function sendPayloadToDatabase(textContent, imageUrlContent, payloadType) {
  try {
    if (currentChatType === 'global') {
      await addDoc(collection(db, "global_messages"), {
        channel: currentChatTarget,
        type: payloadType, 
        text: textContent,
        imageUrl: imageUrlContent,
        sender: currentUser,
        senderDisplayName: currentDisplayName,
        createdAt: serverTimestamp()
      });
    } else if (currentChatType === 'dm') {
      const chatId = [currentUser, currentChatTarget].sort().join('_');
      await addDoc(collection(db, "private_messages"), {
        chatId: chatId,
        type: payloadType,
        text: textContent,
        imageUrl: imageUrlContent,
        sender: currentUser,
        senderDisplayName: currentDisplayName,
        receiver: currentChatTarget,
        createdAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error("Send error:", error);
  }
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
    messageInput.disabled = true;
    document.getElementById('send-btn').disabled = true;
    attachBtn.style.pointerEvents = "none";
    
    messageInput.value = "";
    messageInput.placeholder = "wait 10 seconds...";
    
    let timeLeft = 10;
    const jailTimer = setInterval(() => {
      timeLeft--;
      if (timeLeft > 0) {
        messageInput.placeholder = `wait ${timeLeft} seconds...`;
      }
    }, 1000);

    setTimeout(() => {
      clearInterval(jailTimer);
      isSpamBlocked = false;
      messageInput.disabled = false;
      document.getElementById('send-btn').disabled = false;
      attachBtn.style.pointerEvents = "auto";
      messageInput.placeholder = originalPlaceholder;
      recentMessages = []; 
    }, 10000); // Set to match your 10 seconds timeout

    return; 
  }

  messageInput.value = ''; 
  sendPayloadToDatabase(text, null, "text");
});

// ==========================================
// 🛠️ DEVELOPER UTILITIES (DANGER ZONE)
// ==========================================
const ADMIN_PASSWORD = "yappmaster3000"; 

window.nukeAllDMs = async () => {
  const pass = prompt("enter the admin password to wipe all DMs:");
  if (pass !== ADMIN_PASSWORD) return; 

  if (!confirm("are you ABSOLUTELY sure you want to delete ALL private messages?")) return;
  
  const q = collection(db, "private_messages");
  const snapshot = await getDocs(q);
  
  snapshot.forEach((docSnap) => {
      deleteDoc(docSnap.ref); 
  });
};

window.nukeUserMessages = async (usernameTarget) => {
  if (!usernameTarget) return;

  const pass = prompt(`enter password to delete all messages from @${usernameTarget}:`);
  if (pass !== ADMIN_PASSWORD) return; 
  
  const globalQuery = query(collection(db, "global_messages"), where("sender", "==", usernameTarget));
  const dmQuery = query(collection(db, "private_messages"), where("sender", "==", usernameTarget));
  
  const globalSnap = await getDocs(globalQuery);
  globalSnap.forEach((docSnap) => {
      deleteDoc(docSnap.ref);
  });

  const dmSnap = await getDocs(dmQuery);
  dmSnap.forEach((docSnap) => {
      deleteDoc(docSnap.ref);
  });
};

window.nukeAllMessages = async () => {
  const pass = prompt("enter the admin password to wipe ALL messages (Global & DMs):");
  if (pass !== ADMIN_PASSWORD) return; 

  if (!confirm("are you ABSOLUTELY sure you want to delete EVERY message in the app?")) return;
  
  console.log("Cleaning global messages...");
  const globalSnap = await getDocs(collection(db, "global_messages"));
  globalSnap.forEach((docSnap) => {
    deleteDoc(docSnap.ref); 
  });

  console.log("Cleaning private messages...");
  const dmSnap = await getDocs(collection(db, "private_messages"));
  dmSnap.forEach((docSnap) => {
    deleteDoc(docSnap.ref); 
  });

  console.log("💥 Database wiped clean!");
};