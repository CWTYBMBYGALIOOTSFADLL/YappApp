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
  appId: "1:221465604909:web:4fddfa24a0620986ab59a4",
  measurementId: "G-32CR99JJQ4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// State Variables
let currentUser = "";
let currentChatType = "global"; // "global" or "dm"
let currentChatTarget = "general"; // Default channel
let unsubscribeChat = null; 

// DOM Elements
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

// 1. Handle Login & Passwords
loginBtn.addEventListener('click', async () => {
  const name = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (name && password) {
    loginBtn.innerText = "loading..."; 
    
    try {
      const userRef = doc(db, "users", name);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        // ACCOUNT EXISTS: Check password
        if (userSnap.data().password === password) {
          currentUser = name;
          enterChatApp();
        } else {
          alert("❌ Wrong password for this username!");
          loginBtn.innerText = "join Chat"; 
        }
      } else {
        // NO ACCOUNT: Create new
        await setDoc(userRef, { 
          username: name,
          password: password, 
          joinedAt: serverTimestamp() 
        });
        currentUser = name;
        enterChatApp();
      }
    } catch (error) {
      console.error("Login error: ", error);
      alert("Error connecting to database.");
      loginBtn.innerText = "join Chat";
    }
  } else {
    alert("Please enter both a username and a password.");
  }
});

function enterChatApp() {
  loginScreen.classList.remove('active');
  chatScreen.classList.add('active');
  loadUsersSidebar();
  switchChat('global', 'general'); // Default to general channel
}

// 2. Load Sidebar Users (DMs)
function loadUsersSidebar() {
  const q = query(collection(db, "users"), orderBy("username", "asc"));
  
  onSnapshot(q, (snapshot) => {
    userList.innerHTML = ''; 
    
    snapshot.forEach((doc) => {
      const user = doc.data();
      if (user.username !== currentUser) {
        const userEl = document.createElement('div');
        userEl.classList.add('channel');
        userEl.innerText = `@${user.username}`;
        
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

// 3. Global Channel Clicks
globalChannels.forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    
    const channelName = tab.getAttribute('data-channel');
    switchChat('global', channelName);
  });
});

// 4. The Chat Switcher
function switchChat(type, target) {
  currentChatType = type;
  currentChatTarget = target;
  
  currentChatTitle.innerText = `@${target}`;
  
  messagesContainer.innerHTML = `
    <div class="loader-wrapper" id="chat-loader">
      <div class="spinner">
        <div class="spinnerin"></div>
      </div>
      <img src="YappApp.png" class="spinner-logo" alt="">
    </div>
  `;

  if (unsubscribeChat) unsubscribeChat();

  let q;
  if (type === 'global') {
    q = query(
      collection(db, "global_messages"), 
      where("channel", "==", target), 
      orderBy("createdAt", "asc")
    );
  } else {
    const chatId = [currentUser, target].sort().join('_');
    q = query(
      collection(db, "private_messages"), 
      where("chatId", "==", chatId), 
      orderBy("createdAt", "asc")
    );
  }
  
  unsubscribeChat = onSnapshot(q, (snapshot) => {
    messagesContainer.innerHTML = ''; 
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      displayMessage(data.sender, data.text);
    });
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

// 5. Display Message
function displayMessage(sender, text) {
  const isYours = sender === currentUser;
  
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message');
  if (isYours) msgDiv.classList.add('yours');
  
  msgDiv.innerHTML = `
    <div class="sender">${isYours ? 'you' : sender}</div>
    <div class="bubble">${text}</div>
  `;
  
  messagesContainer.appendChild(msgDiv);
}

// 6. Send Message Router
messageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  
  if (text) {
    messageInput.value = ''; 
    
    try {
      if (currentChatType === 'global') {
        await addDoc(collection(db, "global_messages"), {
          channel: currentChatTarget,
          text: text,
          sender: currentUser,
          createdAt: serverTimestamp()
        });
      } else if (currentChatType === 'dm') {
        const chatId = [currentUser, currentChatTarget].sort().join('_');
        await addDoc(collection(db, "private_messages"), {
          chatId: chatId,
          text: text,
          sender: currentUser,
          receiver: currentChatTarget,
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Error sending message: ", error);
      alert("Uh oh, failed to send. Check the console.");
    }
  }
});

// ==========================================
// 🛠️ DEVELOPER UTILITIES (DANGER ZONE)
// ==========================================

const ADMIN_PASSWORD = "yappmaster3000"; 

window.nukeAllDMs = async () => {
  const pass = prompt("enter the admin password to wipe all DMs:");
  if (pass !== ADMIN_PASSWORD) {
      console.error("incorrect admin password.");
      return; 
  }

  if (!confirm("are you ABSOLUTELY sure you want to delete ALL private messages?")) return;
  
  console.log("Fetching all DMs...");
  const q = collection(db, "private_messages");
  const snapshot = await getDocs(q);
  
  let count = 0;
  snapshot.forEach((docSnap) => {
      deleteDoc(docSnap.ref); 
      count++;
  });
  
  console.log(`💥 BOOM! Deleted ${count} private messages.`);
};

window.nukeUserMessages = async (usernameTarget) => {
  if (!usernameTarget) {
      console.error("please provide a username.. example: nukeUserMessages('Vexi')");
      return;
  }

  const pass = prompt(`enter password to delete all messages from @${usernameTarget}:`);
  if (pass !== ADMIN_PASSWORD) {
      console.error("incorrect admin password");
      return; 
  }
  
  console.log(`searching messages sent by @${usernameTarget}...`);
  
  const globalQuery = query(collection(db, "global_messages"), where("sender", "==", usernameTarget));
  const dmQuery = query(collection(db, "private_messages"), where("sender", "==", usernameTarget));
  
  let count = 0;

  const globalSnap = await getDocs(globalQuery);
  globalSnap.forEach((docSnap) => {
      deleteDoc(docSnap.ref);
      count++;
  });

  const dmSnap = await getDocs(dmQuery);
  dmSnap.forEach((docSnap) => {
      deleteDoc(docSnap.ref);
      count++;
  });
  
  console.log(`deleted ${count} messages sent by @${usernameTarget} from the database`);
};