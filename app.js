cd ~/Gizpro
cat > app.js << 'ENDOFFILE'
const firebaseConfig = {
  apiKey: "AIzaSyCKMyhYwAn8yvlY-_5VEPfwZD4-pVVDcHc",
  authDomain: "gizpro.firebaseapp.com",
  projectId: "gizpro",
  storageBucket: "gizpro.firebasestorage.app",
  messagingSenderId: "867107128011",
  appId: "1:867107128011:web:9ba38e66db554469b2514e"
};

const TON_TO_GIZ_RATE = 0.1;
const GIZ_TO_TON_RATE = 10;
const TRANSFER_FEE = 0.05;
const SIGNUP_BONUS = 10;
const MIN_WITHDRAWAL = 250;
const WITHDRAWAL_FEE = 0.05;

const LEVELS = {
  1: { price: 0,   clickReward: 0.001, dailyLimit: 1,   duration: 10 },
  2: { price: 10,  clickReward: 0.005, dailyLimit: 5,   duration: 10 },
  3: { price: 40,  clickReward: 0.015, dailyLimit: 15,  duration: 10 },
  4: { price: 100, clickReward: 0.04,  dailyLimit: 40,  duration: 10 },
  5: { price: 250, clickReward: 0.10,  dailyLimit: 100, duration: 10 }
};

const REFERRAL_REWARDS = {
  register: 5,
  level2: 1,
  level3: 4,
  level4: 10,
  level5: 25
};

let currentUser = null;
let db = null;

try { firebase.initializeApp(firebaseConfig); console.log("firebase ok"); } catch(e) { console.log("firebase error", e); }
db = firebase.firestore();

function generateGIZAddress() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let address = 'GZ';
  for (let i = 0; i < 49; i++) address += chars.charAt(Math.floor(Math.random() * chars.length));
  return address;
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('ar-SA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatAmount(amount) {
  return parseFloat(amount).toFixed(3);
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  const icon = toast.querySelector('i');
  toastMessage.textContent = message;
  if (type === 'success') { toast.style.background = '#00D084'; icon.className = 'fas fa-check-circle'; }
  else if (type === 'error') { toast.style.background = '#FF4757'; icon.className = 'fas fa-exclamation-circle'; }
  else { toast.style.background = '#F7931A'; icon.className = 'fas fa-info-circle'; }
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => showToast('تم النسخ!')).catch(() => {
    const t = document.createElement('textarea');
    t.value = text; document.body.appendChild(t); t.select();
    document.execCommand('copy'); document.body.removeChild(t);
    showToast('تم النسخ!');
  });
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function showModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

function getReferralCode() {
  return new URLSearchParams(window.location.search).get('ref') || null;
}

function generateReferralLink(username) {
  return window.location.origin + window.location.pathname + '?ref=' + username;
}

async function registerUser(username, password) {
  const userRef = db.collection('users').doc(username);
  const doc = await userRef.get();
  if (doc.exists) throw new Error('اسم المستخدم موجود بالفعل');

  const refCode = getReferralCode();
  const gizAddress = generateGIZAddress();
  const now = Date.now();
  const bonus = SIGNUP_BONUS + (refCode ? REFERRAL_REWARDS.register : 0);

  const user = {
    username: username,
    password: btoa(password),
    gizAddress: gizAddress,
    gizBalance: bonus,
    tonAddress: null,
    tonConnected: false,
    referredBy: refCode || null,
    level: 1,
    levelExpiry: now + (10 * 24 * 60 * 60 * 1000),
    todayClicks: 0,
    todayEarned: 0,
    lastClickDate: new Date().toDateString(),
    totalEarned: 0,
    referralCount: 0,
    createdAt: now
  };

  await userRef.set(user);

  await addTransaction({
    username: username, type: 'signup_bonus',
    fromAddress: 'SYSTEM', toAddress: gizAddress,
    amount: bonus, fee: 0,
    note: refCode ? 'هدية التسجيل + مكافأة الإحالة' : 'هدية التسجيل',
    timestamp: now
  });

  if (refCode) {
    try {
      const refDoc = await db.collection('users').doc(refCode).get();
      if (refDoc.exists) {
        const refUser = refDoc.data();
        refUser.gizBalance += REFERRAL_REWARDS.register;
        refUser.referralCount = (refUser.referralCount || 0) + 1;
        await db.collection('users').doc(refCode).set(refUser);
        await addTransaction({
          username: refCode, type: 'referral_reward',
          fromAddress: 'SYSTEM', toAddress: refUser.gizAddress,
          amount: REFERRAL_REWARDS.register, fee: 0,
          note: 'مكافأة إحالة: ' + username,
          timestamp: now
        });
      }
    } catch(e) {}
  }

  return user;
}

async function loginUser(username, password) {
  const doc = await db.collection('users').doc(username).get();
  if (!doc.exists) throw new Error('اسم المستخدم غير موجود');
  const user = doc.data();
  if (user.password !== btoa(password)) throw new Error('كلمة المرور غير صحيحة');
  currentUser = user;
  return user;
}

async function updateUser(user) {
  await db.collection('users').doc(user.username).set(user);
  currentUser = user;
}

async function addTransaction(tx) {
  await db.collection('transactions').add(tx);
}

async function getTransactions(username) {
  const snap = await db.collection('transactions')
    .where('username', '==', username)
    .orderBy('timestamp', 'desc')
    .limit(50)
    .get();
  return snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
}

async function handleClick() {
  if (!currentUser) return;

  const today = new Date().toDateString();
  if (currentUser.lastClickDate !== today) {
    currentUser.todayClicks = 0;
    currentUser.todayEarned = 0;
    currentUser.lastClickDate = today;
  }

  if (currentUser.level > 1 && Date.now() > currentUser.levelExpiry) {
    currentUser.level = 1;
    showToast('انتهت مدة مستواك!', 'warning');
  }

  const level = LEVELS[currentUser.level || 1];

  if ((currentUser.todayEarned || 0) >= level.dailyLimit) {
    showToast('وصلت للحد اليومي ' + level.dailyLimit + ' GIZ', 'warning');
    return;
  }

  const reward = level.clickReward;
  currentUser.gizBalance += reward;
  currentUser.todayClicks = (currentUser.todayClicks || 0) + 1;
  currentUser.todayEarned = (currentUser.todayEarned || 0) + reward;
  currentUser.totalEarned = (currentUser.totalEarned || 0) + reward;

  await updateUser(currentUser);
  updateDashboard();

  const btn = document.getElementById('click-btn');
  if (btn) {
    btn.classList.add('clicked');
    setTimeout(function() { btn.classList.remove('clicked'); }, 200);
  }

  const el = document.createElement('div');
  el.className = 'floating-reward';
  el.textContent = '+' + reward + ' GIZ';
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 1000);
}

async function buyLevel(levelNum) {
  const level = LEVELS[levelNum];
  if (!level || levelNum === 1) return;

  if (currentUser.gizBalance < level.price) {
    showToast('رصيد غير كافٍ، تحتاج ' + level.price + ' GIZ', 'error');
    return;
  }

  currentUser.gizBalance -= level.price;
  currentUser.level = levelNum;
  currentUser.levelExpiry = Date.now() + (10 * 24 * 60 * 60 * 1000);
  currentUser.todayClicks = 0;
  currentUser.todayEarned = 0;

  await updateUser(currentUser);

  if (currentUser.referredBy) {
    try {
      const rewardKey = 'level' + levelNum;
      const reward = REFERRAL_REWARDS[rewardKey];
      if (reward) {
        const refDoc = await db.collection('users').doc(currentUser.referredBy).get();
        if (refDoc.exists) {
          const refUser = refDoc.data();
          refUser.gizBalance += reward;
          await db.collection('users').doc(currentUser.referredBy).set(refUser);
          await addTransaction({
            username: currentUser.referredBy, type: 'referral_reward',
            fromAddress: 'SYSTEM', toAddress: refUser.gizAddress,
            amount: reward, fee: 0,
            note: 'مكافأة إحالة: شراء مستوى ' + levelNum,
            timestamp: Date.now()
          });
        }
      }
    } catch(e) {}
  }

  await addTransaction({
    username: currentUser.username, type: 'level_purchase',
    fromAddress: currentUser.gizAddress, toAddress: 'SYSTEM',
    amount: level.price, fee: 0,
    note: 'شراء مستوى ' + levelNum + ' لمدة 10 أيام',
    timestamp: Date.now()
  });

  showToast('تم شراء المستوى ' + levelNum + ' بنجاح!');
  closeAllModals();
  updateDashboard();
  renderLevelsUI();
}

async function requestWithdrawal(amount) {
  if (amount < MIN_WITHDRAWAL) {
    showToast('الحد الأدنى للسحب ' + MIN_WITHDRAWAL + ' GIZ', 'error');
    return;
  }
  if (amount > currentUser.gizBalance) {
    showToast('رصيد غير كافٍ', 'error');
    return;
  }
  if (!currentUser.tonConnected || !currentUser.tonAddress) {
    showToast('يجب ربط محفظة TON أولاً', 'error');
    return;
  }

  const fee = amount * WITHDRAWAL_FEE;
  const netAmount = amount - fee;
  const tonAmount = netAmount / GIZ_TO_TON_RATE;

  currentUser.gizBalance -= amount;
  await updateUser(currentUser);

  await db.collection('withdrawals').add({
    username: currentUser.username,
    gizAmount: amount, fee: fee,
    netGiz: netAmount, tonAmount: tonAmount,
    tonAddress: currentUser.tonAddress,
    status: 'pending',
    timestamp: Date.now()
  });

  await addTransaction({
    username: currentUser.username, type: 'withdrawal',
    fromAddress: currentUser.gizAddress, toAddress: currentUser.tonAddress,
    amount: amount, fee: fee,
    note: 'سحب ' + tonAmount.toFixed(4) + ' TON',
    timestamp: Date.now()
  });

  showToast('طلب السحب مُرسل! ستستلم ' + tonAmount.toFixed(4) + ' TON خلال 24 ساعة');
  closeAllModals();
  updateDashboard();
}

async function connectTONWallet(tonAddress) {
  currentUser.tonAddress = tonAddress;
  currentUser.tonConnected = true;
  await updateUser(currentUser);
  showToast('تم ربط محفظة TON!');
  updateDashboard();
}

async function disconnectTONWallet() {
  currentUser.tonAddress = null;
  currentUser.tonConnected = false;
  await updateUser(currentUser);
  showToast('تم فصل محفظة TON');
  updateDashboard();
}

function renderLevelsUI() {
  const container = document.getElementById('levels-container');
  if (!container || !currentUser) return;

  container.innerHTML = Object.keys(LEVELS).map(function(num) {
    const level = LEVELS[num];
    const isActive = parseInt(num) === (currentUser.level || 1);
    const remaining = currentUser.level > 1 && isActive ?
      Math.ceil((currentUser.levelExpiry - Date.now()) / (24*60*60*1000)) : 0;

    return '<div class="level-card ' + (isActive ? 'active-level' : '') + '">' +
      '<div class="level-header">' +
      '<span class="level-num">المستوى ' + num + '</span>' +
      (isActive ? '<span class="level-badge">نشط' + (remaining > 0 ? ' - ' + remaining + ' أيام' : '') + '</span>' : '') +
      '</div>' +
      '<div class="level-info">' +
      '<div>نقرة: <strong>' + level.clickReward + ' GIZ</strong></div>' +
      '<div>يومياً: <strong>' + level.dailyLimit + ' GIZ</strong></div>' +
      '<div>10 أيام: <strong>' + (level.dailyLimit * 10) + ' GIZ</strong></div>' +
      '</div>' +
      (parseInt(num) === 1 ?
        '<div class="level-price">مجاني</div>' :
        '<button class="btn-buy-level" onclick="buyLevel(' + num + ')">شراء - ' + level.price + ' GIZ</button>'
      ) +
      '</div>';
  }).join('');
}

function renderTransactionItem(tx) {
  let icon, iconClass, title, amountClass, amount;
  switch(tx.type) {
    case 'sent': icon='fa-paper-plane'; iconClass='sent'; title='إرسال إلى ' + tx.toAddress.substring(0,10) + '...'; amountClass='negative'; amount='-' + formatAmount(tx.amount); break;
    case 'received': icon='fa-arrow-down'; iconClass='received'; title='استقبال من ' + tx.fromAddress.substring(0,10) + '...'; amountClass='positive'; amount='+' + formatAmount(tx.amount); break;
    case 'level_purchase': icon='fa-star'; iconClass='sent'; title=tx.note||'شراء مستوى'; amountClass='negative'; amount='-' + formatAmount(tx.amount); break;
    case 'withdrawal': icon='fa-money-bill'; iconClass='sent'; title=tx.note||'سحب'; amountClass='negative'; amount='-' + formatAmount(tx.amount); break;
    case 'referral_reward': icon='fa-users'; iconClass='received'; title=tx.note||'مكافأة إحالة'; amountClass='positive'; amount='+' + formatAmount(tx.amount); break;
    case 'signup_bonus': icon='fa-gift'; iconClass='received'; title='هدية التسجيل'; amountClass='positive'; amount='+' + formatAmount(tx.amount); break;
    default: icon='fa-circle'; iconClass='neutral'; title=tx.note||'معاملة'; amountClass='neutral'; amount=formatAmount(tx.amount);
  }
  return '<div class="transaction-item"><div class="tx-icon ' + iconClass + '"><i class="fas ' + icon + '"></i></div><div class="tx-details"><div class="tx-title">' + title + '</div><div class="tx-date">' + formatDate(tx.timestamp) + '</div></div><div class="tx-amount ' + amountClass + '">' + amount + ' GIZ</div></div>';
}

async function renderRecentTransactions() {
  const list = document.getElementById('recent-transactions');
  if (!list || !currentUser) return;
  try {
    const transactions = await getTransactions(currentUser.username);
    const recent = transactions.slice(0, 5);
    if (recent.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:2rem;color:#888"><i class="fas fa-list" style="font-size:2rem;display:block;margin-bottom:.5rem"></i>لا توجد معاملات</div>';
      return;
    }
    list.innerHTML = recent.map(renderTransactionItem).join('');
  } catch(e) {}
}

async function renderAllTransactions(filter) {
  const list = document.getElementById('all-transactions');
  if (!list || !currentUser) return;
  try {
    let transactions = await getTransactions(currentUser.username);
    if (filter && filter !== 'all') transactions = transactions.filter(function(tx) { return tx.type === filter; });
    if (transactions.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:2rem;color:#888"><i class="fas fa-list" style="font-size:2rem;display:block;margin-bottom:.5rem"></i>لا توجد معاملات</div>';
      return;
    }
    list.innerHTML = transactions.map(renderTransactionItem).join('');
  } catch(e) {}
}

async function updateDashboard() {
  if (!currentUser) return;

  const today = new Date().toDateString();
  if (currentUser.lastClickDate !== today) {
    currentUser.todayEarned = 0;
    currentUser.todayClicks = 0;
  }

  const level = LEVELS[currentUser.level || 1];

  const totalGiz = document.getElementById('total-giz');
  const totalTon = document.getElementById('total-ton');
  const userAddress = document.getElementById('user-address');
  const receiveAddress = document.getElementById('receive-address');
  const settingsUsername = document.getElementById('settings-username');
  const settingsAddress = document.getElementById('settings-address');
  const referralLink = document.getElementById('referral-link');
  const clickLevel = document.getElementById('click-level');
  const levelExpiry = document.getElementById('level-expiry');
  const clickEarned = document.getElementById('click-earned');
  const clickProgress = document.getElementById('click-progress');

  if (totalGiz) totalGiz.textContent = formatAmount(currentUser.gizBalance);
  if (totalTon) totalTon.textContent = '≈ ' + formatAmount(currentUser.gizBalance / GIZ_TO_TON_RATE) + ' TON';
  if (userAddress) userAddress.textContent = currentUser.gizAddress;
  if (receiveAddress) receiveAddress.textContent = currentUser.gizAddress;
  if (settingsUsername) settingsUsername.textContent = currentUser.username;
  if (settingsAddress) settingsAddress.textContent = currentUser.gizAddress;
  if (referralLink) referralLink.value = generateReferralLink(currentUser.username);
  if (clickLevel) clickLevel.textContent = 'المستوى ' + (currentUser.level || 1);

  if (levelExpiry) {
    if (currentUser.level > 1) {
      const days = Math.ceil((currentUser.levelExpiry - Date.now()) / (24*60*60*1000));
      levelExpiry.textContent = days > 0 ? 'ينتهي بعد ' + days + ' أيام' : 'انتهى!';
    } else {
      levelExpiry.textContent = 'مجاني';
    }
  }

  if (clickEarned) clickEarned.textContent = formatAmount(currentUser.todayEarned || 0) + ' / ' + level.dailyLimit + ' GIZ';
  if (clickProgress) clickProgress.style.width = (((currentUser.todayEarned || 0) / level.dailyLimit) * 100) + '%';

  const tonStatusEl = document.getElementById('ton-status');
  const tonConnectBtn = document.getElementById('ton-connect-btn');
  const tonStatusText = document.getElementById('ton-status-text');
  const btnTonConnectMain = document.getElementById('btn-ton-connect-main');
  const tonStatusCard = document.getElementById('ton-status-card');

  if (currentUser.tonConnected && currentUser.tonAddress) {
    if (tonStatusEl) tonStatusEl.innerHTML = '<span style="color:#00D084">متصل: ' + currentUser.tonAddress.substring(0,15) + '...</span>';
    if (tonConnectBtn) { tonConnectBtn.innerHTML = '<i class="fas fa-unlink"></i> فصل محفظة TON'; tonConnectBtn.onclick = disconnectTONWallet; }
    if (tonStatusText) { tonStatusText.textContent = 'متصل'; tonStatusText.classList.add('connected'); }
    if (btnTonConnectMain) { btnTonConnectMain.innerHTML = '<i class="fas fa-unlink"></i> فصل'; btnTonConnectMain.onclick = disconnectTONWallet; }
  } else {
    if (tonStatusEl) tonStatusEl.innerHTML = '<span style="color:#888">غير متصل</span>';
    if (tonConnectBtn) { tonConnectBtn.innerHTML = '<i class="fas fa-link"></i> ربط محفظة TON'; tonConnectBtn.onclick = function() { showModal('ton-connect-modal'); }; }
    if (tonStatusText) { tonStatusText.textContent = 'غير متصل'; tonStatusText.classList.remove('connected'); }
    if (btnTonConnectMain) { btnTonConnectMain.innerHTML = '<i class="fas fa-link"></i> ربط TON'; btnTonConnectMain.onclick = function() { showModal('ton-connect-modal'); }; }
  }

  if (tonStatusCard) tonStatusCard.classList.add('active');
  await renderRecentTransactions();
}

function setupEventListeners() {
  document.querySelectorAll('.auth-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.auth-tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.auth-form').forEach(function(f) { f.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab + '-form').classList.add('active');
    });
  });

  document.getElementById('register-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    if (password !== confirm) { showToast('كلمات المرور غير متطابقة', 'error'); return; }
    try {
      const user = await registerUser(username, password);
      currentUser = user;
      localStorage.setItem('gizpro_user', JSON.stringify({ username: username }));
      showScreen('main-screen');
      updateDashboard();
      showToast('مرحباً ' + username + '! رصيدك ' + user.gizBalance + ' GIZ');
    } catch(err) { showToast(err.message || 'خطأ', 'error'); }
  });

  document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    try {
      await loginUser(username, password);
      localStorage.setItem('gizpro_user', JSON.stringify({ username: username }));
      showScreen('main-screen');
      updateDashboard();
      showToast('مرحباً ' + username + '!');
    } catch(err) { showToast(err.message || 'خطأ', 'error'); }
  });

  const clickBtn = document.getElementById('click-btn');
  if (clickBtn) clickBtn.addEventListener('click', handleClick);

  document.getElementById('send-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const toAddress = document.getElementById('send-address').value.trim();
    const amount = parseFloat(document.getElementById('send-amount').value);
    const note = document.getElementById('send-note').value;
    const total = amount + TRANSFER_FEE;
    if (total > currentUser.gizBalance) { showToast('رصيد غير كافٍ', 'error'); return; }
    if (toAddress === currentUser.gizAddress) { showToast('لا يمكن الإرسال لنفسك', 'error'); return; }
    try {
      const snap = await db.collection('users').where('gizAddress', '==', toAddress).get();
      if (snap.empty) { showToast('العنوان غير موجود', 'error'); return; }
      const recipient = snap.docs[0].data();
      currentUser.gizBalance -= total;
      await updateUser(currentUser);
      recipient.gizBalance += amount;
      await db.collection('users').doc(recipient.username).set(recipient);
      await addTransaction({ username: currentUser.username, type: 'sent', fromAddress: currentUser.gizAddress, toAddress: toAddress, amount: amount, fee: TRANSFER_FEE, note: note, timestamp: Date.now() });
      await addTransaction({ username: recipient.username, type: 'received', fromAddress: currentUser.gizAddress, toAddress: toAddress, amount: amount, fee: 0, note: note, timestamp: Date.now() });
      showToast('تم إرسال ' + amount + ' GIZ');
      closeAllModals();
      updateDashboard();
    } catch(err) { showToast('خطأ في الإرسال', 'error'); }
  });

  const sendAmount = document.getElementById('send-amount');
  if (sendAmount) sendAmount.addEventListener('input', function(e) {
    const amount = parseFloat(e.target.value) || 0;
    const sendTotal = document.getElementById('send-total');
    if (sendTotal) sendTotal.textContent = formatAmount(amount + TRANSFER_FEE) + ' GIZ';
  });

  const withdrawForm = document.getElementById('withdraw-form');
  if (withdrawForm) withdrawForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('withdraw-amount').value);
    await requestWithdrawal(amount);
  });

  const btnSend = document.getElementById('btn-send');
  const btnReceive = document.getElementById('btn-receive');
  const btnSwap = document.getElementById('btn-swap');
  const btnHistory = document.getElementById('btn-history');
  const btnWithdraw = document.getElementById('btn-withdraw');

  if (btnSend) btnSend.addEventListener('click', function() { showModal('send-modal'); });
  if (btnReceive) btnReceive.addEventListener('click', function() { showModal('receive-modal'); });
  if (btnSwap) btnSwap.addEventListener('click', function() { showModal('swap-modal'); });
  if (btnHistory) btnHistory.addEventListener('click', function() { showScreen('history-screen'); renderAllTransactions('all'); });
  if (btnWithdraw) btnWithdraw.addEventListener('click', function() { showModal('withdraw-modal'); });

  const copyAddress = document.getElementById('copy-address');
  const copyReceive = document.getElementById('copy-receive');
  if (copyAddress) copyAddress.addEventListener('click', function() { copyToClipboard(currentUser.gizAddress); });
  if (copyReceive) copyReceive.addEventListener('click', function() { copyToClipboard(currentUser.gizAddress); });

  document.querySelectorAll('.close-modal').forEach(function(btn) {
    btn.addEventListener('click', closeAllModals);
  });

  document.querySelectorAll('.modal').forEach(function(modal) {
    modal.addEventListener('click', function(e) { if (e.target === modal) closeAllModals(); });
  });

  document.querySelectorAll('.nav-item').forEach(function(item) {
    item.addEventListener('click', function() {
      document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
      item.classList.add('active');
      const page = item.dataset.page;
      if (page === 'home') showScreen('main-screen');
      else if (page === 'swap') showModal('swap-modal');
      else if (page === 'wallets') showScreen('main-screen');
      else if (page === 'levels') { showScreen('levels-screen'); renderLevelsUI(); }
      else if (page === 'settings') showScreen('settings-screen');
    });
  });

  const tonConnectForm = document.getElementById('ton-connect-form');
  if (tonConnectForm) tonConnectForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const tonAddress = document.getElementById('ton-address-input').value.trim();
    if (!tonAddress || tonAddress.length < 10) { showToast('أدخل عنوان TON صحيح', 'error'); return; }
    await connectTONWallet(tonAddress);
    closeAllModals();
  });

  const backHistory = document.getElementById('back-from-history');
  const backSettings = document.getElementById('back-from-settings');
  const viewAllTx = document.getElementById('view-all-tx');
  const logoutBtn = document.getElementById('logout-btn');
  const tonConnectBtn = document.getElementById('ton-connect-btn');
  const changePassword = document.getElementById('change-password');
  const exportDataBtn = document.getElementById('export-data');
  const clearDataBtn = document.getElementById('clear-data');

  if (backHistory) backHistory.addEventListener('click', function() { showScreen('main-screen'); });
  if (backSettings) backSettings.addEventListener('click', function() { showScreen('main-screen'); });
  if (viewAllTx) viewAllTx.addEventListener('click', function() { showScreen('history-screen'); renderAllTransactions('all'); });
  if (logoutBtn) logoutBtn.addEventListener('click', function() {
    currentUser = null;
    localStorage.removeItem('gizpro_user');
    showScreen('auth-screen');
    showToast('تم تسجيل الخروج');
  });
  if (tonConnectBtn) tonConnectBtn.addEventListener('click', function() { showModal('ton-connect-modal'); });
  if (changePassword) changePassword.addEventListener('click', function() { showToast('قريباً!', 'warning'); });
  if (exportDataBtn) exportDataBtn.addEventListener('click', function() {
    const blob = new Blob([JSON.stringify(currentUser, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'gizpro-' + currentUser.username + '.json';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast('تم التصدير!');
  });
  if (clearDataBtn) clearDataBtn.addEventListener('click', function() {
    if (confirm('هل أنت متأكد؟')) {
      db.collection('users').doc(currentUser.username).delete();
      currentUser = null;
      localStorage.removeItem('gizpro_user');
      showScreen('auth-screen');
    }
  });

  document.querySelectorAll('.filter-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderAllTransactions(btn.dataset.filter);
    });
  });

  const confirmSwap = document.getElementById('confirm-swap');
  if (confirmSwap) confirmSwap.addEventListener('click', async function() {
    const fromAmount = parseFloat(document.getElementById('swap-from-amount').value);
    if (!fromAmount || fromAmount <= 0) { showToast('أدخل مبلغاً صحيحاً', 'error'); return; }
    const activeBtn = document.querySelector('.swap-dir-btn.active');
    const dir = activeBtn ? activeBtn.dataset.dir : 'ton-to-giz';
    if (dir === 'giz-to-ton') {
      if (fromAmount > currentUser.gizBalance) { showToast('رصيد GIZ غير كافٍ', 'error'); return; }
      currentUser.gizBalance -= fromAmount;
    } else {
      currentUser.gizBalance += fromAmount * TON_TO_GIZ_RATE;
    }
    await updateUser(currentUser);
    await addTransaction({ username: currentUser.username, type: 'swap', fromAddress: currentUser.gizAddress, toAddress: currentUser.gizAddress, amount: fromAmount, fee: 0, note: dir, timestamp: Date.now() });
    showToast('تم التحويل!');
    closeAllModals();
    updateDashboard();
  });

  document.querySelectorAll('.swap-dir-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.swap-dir-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      const dir = btn.dataset.dir;
      const fromCur = document.getElementById('swap-from-currency');
      const toCur = document.getElementById('swap-to-currency');
      const rateEl = document.getElementById('swap-rate');
      if (fromCur) fromCur.textContent = dir === 'ton-to-giz' ? 'TON' : 'GIZ';
      if (toCur) toCur.textContent = dir === 'ton-to-giz' ? 'GIZ' : 'TON';
      if (rateEl) rateEl.textContent = dir === 'ton-to-giz' ? '1 TON = 0.1 GIZ' : '10 GIZ = 1 TON';
    });
  });

  const swapFrom = document.getElementById('swap-from-amount');
  if (swapFrom) swapFrom.addEventListener('input', function(e) {
    const amount = parseFloat(e.target.value) || 0;
    const activeBtn = document.querySelector('.swap-dir-btn.active');
    const dir = activeBtn ? activeBtn.dataset.dir : 'ton-to-giz';
    const toEl = document.getElementById('swap-to-amount');
    if (toEl) toEl.value = dir === 'ton-to-giz' ? formatAmount(amount * TON_TO_GIZ_RATE) : formatAmount(amount / GIZ_TO_TON_RATE);
  });
}

async function init() {
  console.log("init started");
  setupEventListeners();
  try {
    const savedUser = localStorage.getItem('gizpro_user');
    if (savedUser) {
      const userData = JSON.parse(savedUser);
      const doc = await db.collection('users').doc(userData.username).get();
      if (doc.exists) {
        currentUser = doc.data();
        alert("before showScreen"); setTimeout(function() { showScreen('main-screen'); updateDashboard(); }, 2500);
        return;
      }
    }
  } catch(e) {}
  alert("before showScreen"); setTimeout(function() { showScreen('auth-screen'); }, 2500);
}

document.addEventListener('DOMContentLoaded', init);
ENDOFFILE
