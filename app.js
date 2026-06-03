const firebaseConfig = {
  apiKey: "AIzaSyCKMyhYwAn8yvlY-_5VEPfwZD4-pVVDcHc",
  authDomain: "gizpro.firebaseapp.com",
  projectId: "gizpro",
  storageBucket: "gizpro.firebasestorage.app",
  messagingSenderId: "867107128011",
  appId: "1:867107128011:web:9ba38e66db554469b2514e"
};

const TON_TO_GIZ_RATE = 10;
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

const REFERRAL_REWARDS = { register: 5, level2: 1, level3: 4, level4: 10, level5: 25 };

let currentUser = null;
let db = null;

firebase.initializeApp(firebaseConfig);
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

function formatAmount(amount) { return parseFloat(amount).toFixed(3); }

function showToast(message, type) {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  const icon = toast.querySelector('i');
  toastMessage.textContent = message;
  if (type === 'error') { toast.style.background = '#FF4757'; icon.className = 'fas fa-exclamation-circle'; }
  else if (type === 'warning') { toast.style.background = '#F7931A'; icon.className = 'fas fa-info-circle'; }
  else { toast.style.background = '#00D084'; icon.className = 'fas fa-check-circle'; }
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 3000);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(function() { showToast('تم النسخ!'); });
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  var el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function showModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(function(m) { m.classList.remove('active'); });
}

function getReferralCode() {
  return new URLSearchParams(window.location.search).get('ref') || null;
}

function generateReferralLink(username) {
  return window.location.origin + window.location.pathname + '?ref=' + username;
}

async function registerUser(username, password) {
  var userRef = db.collection('users').doc(username);
  var doc = await userRef.get();
  if (doc.exists) throw new Error('اسم المستخدم موجود بالفعل');
  var refCode = getReferralCode();
  var gizAddress = generateGIZAddress();
  var now = Date.now();
  var bonus = SIGNUP_BONUS + (refCode ? REFERRAL_REWARDS.register : 0);
  var user = {
    username: username, password: btoa(password),
    gizAddress: gizAddress, gizBalance: bonus,
    tonAddress: null, tonConnected: false,
    referredBy: refCode || null, level: 1,
    levelExpiry: now + (10 * 24 * 60 * 60 * 1000),
    todayClicks: 0, todayEarned: 0,
    lastClickDate: new Date().toDateString(),
    totalEarned: 0, referralCount: 0, createdAt: now
  };
  await userRef.set(user);
  await addTransaction({ username: username, type: 'signup_bonus', fromAddress: 'SYSTEM', toAddress: gizAddress, amount: bonus, fee: 0, note: 'هدية التسجيل', timestamp: now });
  if (refCode) {
    try {
      var refDoc = await db.collection('users').doc(refCode).get();
      if (refDoc.exists) {
        var refUser = refDoc.data();
        refUser.gizBalance += REFERRAL_REWARDS.register;
        refUser.referralCount = (refUser.referralCount || 0) + 1;
        await db.collection('users').doc(refCode).set(refUser);
        await addTransaction({ username: refCode, type: 'referral_reward', fromAddress: 'SYSTEM', toAddress: refUser.gizAddress, amount: REFERRAL_REWARDS.register, fee: 0, note: 'مكافأة إحالة: ' + username, timestamp: now });
      }
    } catch(e) {}
  }
  return user;
}

async function loginUser(username, password) {
  var doc = await db.collection('users').doc(username).get();
  if (!doc.exists) throw new Error('اسم المستخدم غير موجود');
  var user = doc.data();
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
  var snap = await db.collection('transactions').where('username', '==', username).orderBy('timestamp', 'desc').limit(50).get();
  return snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
}

async function handleClick() {
  if (!currentUser) return;
  var today = new Date().toDateString();
  if (currentUser.lastClickDate !== today) {
    currentUser.todayClicks = 0;
    currentUser.todayEarned = 0;
    currentUser.lastClickDate = today;
  }
  if (currentUser.level > 1 && Date.now() > currentUser.levelExpiry) {
    currentUser.level = 1;
    showToast('انتهت مدة مستواك!', 'warning');
  }
  var level = LEVELS[currentUser.level || 1];
  if ((currentUser.todayEarned || 0) >= level.dailyLimit) {
    showToast('وصلت للحد اليومي ' + level.dailyLimit + ' GIZ', 'warning');
    return;
  }
  var reward = level.clickReward;
  currentUser.gizBalance += reward;
  currentUser.todayClicks = (currentUser.todayClicks || 0) + 1;
  currentUser.todayEarned = (currentUser.todayEarned || 0) + reward;
  currentUser.totalEarned = (currentUser.totalEarned || 0) + reward;
  await updateUser(currentUser);
  updateDashboard();
  var btn = document.getElementById('click-btn');
  if (btn) { btn.classList.add('clicked'); setTimeout(function() { btn.classList.remove('clicked'); }, 200); }
  var el = document.createElement('div');
  el.className = 'floating-reward';
  el.textContent = '+' + reward + ' GIZ';
  document.body.appendChild(el);
  setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 1000);
}

async function buyLevel(levelNum) {
  var level = LEVELS[levelNum];
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
  await addTransaction({ username: currentUser.username, type: 'level_purchase', fromAddress: currentUser.gizAddress, toAddress: 'SYSTEM', amount: level.price, fee: 0, note: 'شراء مستوى ' + levelNum + ' لمدة 10 أيام', timestamp: Date.now() });
  showToast('تم شراء المستوى ' + levelNum + ' بنجاح!');
  updateDashboard();
  renderLevelsUI();
}

async function requestWithdrawal(amount) {
  if (amount < MIN_WITHDRAWAL) { showToast('الحد الأدنى ' + MIN_WITHDRAWAL + ' GIZ', 'error'); return; }
  if (amount > currentUser.gizBalance) { showToast('رصيد غير كافٍ', 'error'); return; }
  if (!currentUser.tonConnected) { showToast('يجب ربط محفظة TON أولاً', 'error'); return; }
  var fee = amount * WITHDRAWAL_FEE;
  var tonAmount = (amount - fee) / GIZ_TO_TON_RATE;
  currentUser.gizBalance -= amount;
  await updateUser(currentUser);
  await db.collection('withdrawals').add({ username: currentUser.username, gizAmount: amount, fee: fee, tonAmount: tonAmount, tonAddress: currentUser.tonAddress, status: 'pending', timestamp: Date.now() });
  await addTransaction({ username: currentUser.username, type: 'withdrawal', fromAddress: currentUser.gizAddress, toAddress: currentUser.tonAddress, amount: amount, fee: fee, note: 'سحب ' + tonAmount.toFixed(4) + ' TON', timestamp: Date.now() });
  showToast('طلب السحب مُرسل! ستستلم ' + tonAmount.toFixed(4) + ' TON');
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
  var container = document.getElementById('levels-container');
  if (!container || !currentUser) return;
  container.innerHTML = Object.keys(LEVELS).map(function(num) {
    var level = LEVELS[num];
    var isActive = parseInt(num) === (currentUser.level || 1);
    var days = 0;
    if (isActive && currentUser.level > 1) days = Math.ceil((currentUser.levelExpiry - Date.now()) / (24*60*60*1000));
    return '<div class="level-card ' + (isActive ? 'active-level' : '') + '">' +
      '<div class="level-header"><span class="level-num">المستوى ' + num + '</span>' +
      (isActive ? '<span class="level-badge">نشط ' + (days > 0 ? days + ' أيام' : '') + '</span>' : '') +
      '</div><div class="level-info">' +
      '<div>نقرة: <strong>' + level.clickReward + ' GIZ</strong></div>' +
      '<div>يومياً: <strong>' + level.dailyLimit + ' GIZ</strong></div>' +
      '<div>10 أيام: <strong>' + (level.dailyLimit * 10) + ' GIZ</strong></div>' +
      '</div>' +
      (parseInt(num) === 1 ? '<div class="level-price">مجاني</div>' :
      '<button class="btn-buy-level" onclick="buyLevel(' + num + ')">شراء - ' + level.price + ' GIZ</button>') +
      '</div>';
  }).join('');
}

function renderTransactionItem(tx) {
  var icon, iconClass, title, amountClass, amount;
  switch(tx.type) {
    case 'sent': icon='fa-paper-plane'; iconClass='sent'; title='إرسال'; amountClass='negative'; amount='-'+formatAmount(tx.amount); break;
    case 'received': icon='fa-arrow-down'; iconClass='received'; title='استقبال'; amountClass='positive'; amount='+'+formatAmount(tx.amount); break;
    case 'level_purchase': icon='fa-star'; iconClass='sent'; title=tx.note||'شراء مستوى'; amountClass='negative'; amount='-'+formatAmount(tx.amount); break;
    case 'withdrawal': icon='fa-money-bill'; iconClass='sent'; title='سحب'; amountClass='negative'; amount='-'+formatAmount(tx.amount); break;
    case 'referral_reward': icon='fa-users'; iconClass='received'; title=tx.note||'إحالة'; amountClass='positive'; amount='+'+formatAmount(tx.amount); break;
    case 'signup_bonus': icon='fa-gift'; iconClass='received'; title='هدية التسجيل'; amountClass='positive'; amount='+'+formatAmount(tx.amount); break;
    default: icon='fa-circle'; iconClass='neutral'; title=tx.note||'معاملة'; amountClass='neutral'; amount=formatAmount(tx.amount);
  }
  return '<div class="transaction-item"><div class="tx-icon '+iconClass+'"><i class="fas '+icon+'"></i></div><div class="tx-details"><div class="tx-title">'+title+'</div><div class="tx-date">'+formatDate(tx.timestamp)+'</div></div><div class="tx-amount '+amountClass+'">'+amount+' GIZ</div></div>';
}

async function renderRecentTransactions() {
  var list = document.getElementById('recent-transactions');
  if (!list || !currentUser) return;
  try {
    var transactions = await getTransactions(currentUser.username);
    if (transactions.length === 0) { list.innerHTML = '<div style="text-align:center;padding:2rem;color:#888">لا توجد معاملات</div>'; return; }
    list.innerHTML = transactions.slice(0,5).map(renderTransactionItem).join('');
  } catch(e) {}
}

async function renderAllTransactions(filter) {
  var list = document.getElementById('all-transactions');
  if (!list || !currentUser) return;
  try {
    var transactions = await getTransactions(currentUser.username);
    if (filter && filter !== 'all') transactions = transactions.filter(function(tx) { return tx.type === filter; });
    if (transactions.length === 0) { list.innerHTML = '<div style="text-align:center;padding:2rem;color:#888">لا توجد معاملات</div>'; return; }
    list.innerHTML = transactions.map(renderTransactionItem).join('');
  } catch(e) {}
}

async function updateDashboard() {
  if (!currentUser) return;
  var today = new Date().toDateString();
  if (currentUser.lastClickDate !== today) { currentUser.todayEarned = 0; currentUser.todayClicks = 0; }
  var level = LEVELS[currentUser.level || 1];
  var el;
  el = document.getElementById('total-giz'); if (el) el.textContent = formatAmount(currentUser.gizBalance);
  el = document.getElementById('total-ton'); if (el) el.textContent = '≈ ' + formatAmount(currentUser.gizBalance / GIZ_TO_TON_RATE) + ' TON';
  el = document.getElementById('user-address'); if (el) el.textContent = currentUser.gizAddress;
  el = document.getElementById('receive-address'); if (el) el.textContent = currentUser.gizAddress;
  el = document.getElementById('settings-username'); if (el) el.textContent = currentUser.username;
  el = document.getElementById('settings-address'); if (el) el.textContent = currentUser.gizAddress;
  el = document.getElementById('referral-link'); if (el) el.value = generateReferralLink(currentUser.username);
  el = document.getElementById('click-level'); if (el) el.textContent = 'المستوى ' + (currentUser.level || 1);
  el = document.getElementById('click-earned'); if (el) el.textContent = formatAmount(currentUser.todayEarned || 0) + ' / ' + level.dailyLimit + ' GIZ';
  el = document.getElementById('click-progress'); if (el) el.style.width = (((currentUser.todayEarned||0)/level.dailyLimit)*100)+'%';
  el = document.getElementById('level-expiry');
  if (el) {
    if (currentUser.level > 1) {
      var days = Math.ceil((currentUser.levelExpiry - Date.now()) / (24*60*60*1000));
      el.textContent = days > 0 ? 'ينتهي بعد ' + days + ' أيام' : 'انتهى!';
    } else { el.textContent = 'مجاني'; }
  }
  var tonStatusEl = document.getElementById('ton-status');
  var tonConnectBtn = document.getElementById('ton-connect-btn');
  var tonStatusText = document.getElementById('ton-status-text');
  var btnTonConnectMain = document.getElementById('btn-ton-connect-main');
  var tonStatusCard = document.getElementById('ton-status-card');
  if (currentUser.tonConnected && currentUser.tonAddress) {
    if (tonStatusEl) tonStatusEl.innerHTML = '<span style="color:#00D084">متصل</span>';
    if (tonConnectBtn) { tonConnectBtn.innerHTML = '<i class="fas fa-unlink"></i> فصل TON'; tonConnectBtn.onclick = disconnectTONWallet; }
    if (tonStatusText) { tonStatusText.textContent = 'متصل'; tonStatusText.classList.add('connected'); }
    if (btnTonConnectMain) { btnTonConnectMain.innerHTML = '<i class="fas fa-unlink"></i> فصل'; btnTonConnectMain.onclick = disconnectTONWallet; }
  } else {
    if (tonStatusEl) tonStatusEl.innerHTML = '<span style="color:#888">غير متصل</span>';
    if (tonConnectBtn) { tonConnectBtn.innerHTML = '<i class="fas fa-link"></i> ربط TON'; tonConnectBtn.onclick = function() { showModal('ton-connect-modal'); }; }
    if (tonStatusText) { tonStatusText.textContent = 'غير متصل'; if (tonStatusText.classList) tonStatusText.classList.remove('connected'); }
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
    var username = document.getElementById('reg-username').value.trim();
    var password = document.getElementById('reg-password').value;
    var confirm = document.getElementById('reg-confirm').value;
    if (password !== confirm) { showToast('كلمات المرور غير متطابقة', 'error'); return; }
    try {
      var user = await registerUser(username, password);
      currentUser = user;
      localStorage.setItem('gizpro_user', JSON.stringify({ username: username }));
      showScreen('main-screen');
      updateDashboard();
      showToast('مرحباً ' + username + '!');
    } catch(err) { showToast(err.message || 'خطأ', 'error'); }
  });

  document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    var username = document.getElementById('login-username').value.trim();
    var password = document.getElementById('login-password').value;
    try {
      await loginUser(username, password);
      localStorage.setItem('gizpro_user', JSON.stringify({ username: username }));
      showScreen('main-screen');
      updateDashboard();
      showToast('مرحباً ' + username + '!');
    } catch(err) { showToast(err.message || 'خطأ', 'error'); }
  });

  var clickBtn = document.getElementById('click-btn');
  if (clickBtn) clickBtn.addEventListener('click', handleClick);

  var btnSend = document.getElementById('btn-send');
  var btnReceive = document.getElementById('btn-receive');
  var btnSwap = document.getElementById('btn-swap');
  var btnHistory = document.getElementById('btn-history');
  var btnWithdraw = document.getElementById('btn-withdraw');
  if (btnSend) btnSend.addEventListener('click', function() { showModal('send-modal'); });
  if (btnReceive) btnReceive.addEventListener('click', function() { showModal('receive-modal'); });
  if (btnSwap) btnSwap.addEventListener('click', function() { showModal('swap-modal'); });
  if (btnHistory) btnHistory.addEventListener('click', function() { showScreen('history-screen'); renderAllTransactions('all'); });
  if (btnWithdraw) btnWithdraw.addEventListener('click', function() { showModal('withdraw-modal'); });

  var copyAddress = document.getElementById('copy-address');
  var copyReceive = document.getElementById('copy-receive');
  if (copyAddress) copyAddress.addEventListener('click', function() { copyToClipboard(currentUser.gizAddress); });
  if (copyReceive) copyReceive.addEventListener('click', function() { copyToClipboard(currentUser.gizAddress); });

  document.querySelectorAll('.close-modal').forEach(function(btn) { btn.addEventListener('click', closeAllModals); });
  document.querySelectorAll('.modal').forEach(function(modal) {
    modal.addEventListener('click', function(e) { if (e.target === modal) closeAllModals(); });
  });

  document.querySelectorAll('.nav-item').forEach(function(item) {
    item.addEventListener('click', function() {
      document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
      item.classList.add('active');
      var page = item.dataset.page;
      if (page === 'home') showScreen('main-screen');
      else if (page === 'swap') showModal('swap-modal');
      else if (page === "wallets") { showScreen("wallets-screen"); renderSubwallets(); }
      else if (page === "levels") { showScreen("levels-screen"); setTimeout(function() { if (currentUser) renderLevelsUI(); }, 300); }
      else if (page === 'settings') showScreen('settings-screen');
    });
  });

  var sendForm = document.getElementById('send-form');
  if (sendForm) sendForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    var toAddress = document.getElementById('send-address').value.trim();
    var amount = parseFloat(document.getElementById('send-amount').value);
    var note = document.getElementById('send-note').value;
    var total = amount + TRANSFER_FEE;
    if (total > currentUser.gizBalance) { showToast('رصيد غير كافٍ', 'error'); return; }
    if (toAddress === currentUser.gizAddress) { showToast('لا يمكن الإرسال لنفسك', 'error'); return; }
    try {
      var snap = await db.collection('users').where('gizAddress', '==', toAddress).get();
      if (snap.empty) { showToast('العنوان غير موجود', 'error'); return; }
      var recipient = snap.docs[0].data();
      currentUser.gizBalance -= total;
      await updateUser(currentUser);
      recipient.gizBalance += amount;
      await db.collection('users').doc(recipient.username).set(recipient);
      await addTransaction({ username: currentUser.username, type: 'sent', fromAddress: currentUser.gizAddress, toAddress: toAddress, amount: amount, fee: TRANSFER_FEE, note: note, timestamp: Date.now() });
      await addTransaction({ username: recipient.username, type: 'received', fromAddress: currentUser.gizAddress, toAddress: toAddress, amount: amount, fee: 0, note: note, timestamp: Date.now() });
      showToast('تم الإرسال!'); closeAllModals(); updateDashboard();
    } catch(err) { showToast('خطأ', 'error'); }
  });

  var sendAmount = document.getElementById('send-amount');
  if (sendAmount) sendAmount.addEventListener('input', function(e) {
    var el = document.getElementById('send-total');
    if (el) el.textContent = formatAmount((parseFloat(e.target.value)||0) + TRANSFER_FEE) + ' GIZ';
  });

  var withdrawForm = document.getElementById('withdraw-form');
  if (withdrawForm) withdrawForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    await requestWithdrawal(parseFloat(document.getElementById('withdraw-amount').value));
  });

  var tonConnectForm = document.getElementById('ton-connect-form');
  if (tonConnectForm) tonConnectForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    var addr = document.getElementById('ton-address-input').value.trim();
    if (!addr || addr.length < 10) { showToast('أدخل عنوان TON صحيح', 'error'); return; }
    await connectTONWallet(addr); closeAllModals();
  });

  var backHistory = document.getElementById('back-from-history');
  var backSettings = document.getElementById('back-from-settings');
  var viewAllTx = document.getElementById('view-all-tx');
  var logoutBtn = document.getElementById('logout-btn');
  var tonConnectBtn = document.getElementById('ton-connect-btn');
  var changePassword = document.getElementById('change-password');
  var exportDataBtn = document.getElementById('export-data');
  var clearDataBtn = document.getElementById('clear-data');

  if (backHistory) backHistory.addEventListener('click', function() { showScreen('main-screen'); });
  if (backSettings) backSettings.addEventListener('click', function() { showScreen('main-screen'); });
  if (viewAllTx) viewAllTx.addEventListener('click', function() { showScreen('history-screen'); renderAllTransactions('all'); });
  if (logoutBtn) logoutBtn.addEventListener('click', function() {
    currentUser = null; localStorage.removeItem('gizpro_user');
    showScreen('auth-screen'); showToast('تم تسجيل الخروج');
  });
  if (tonConnectBtn) tonConnectBtn.addEventListener('click', function() { showModal('ton-connect-modal'); });
  if (changePassword) changePassword.addEventListener('click', function() { showToast('قريباً!', 'warning'); });
  if (exportDataBtn) exportDataBtn.addEventListener('click', function() {
    var blob = new Blob([JSON.stringify(currentUser, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'gizpro-' + currentUser.username + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url); showToast('تم التصدير!');
  });
  if (clearDataBtn) clearDataBtn.addEventListener('click', function() {
    if (confirm('هل أنت متأكد؟')) {
      db.collection('users').doc(currentUser.username).delete();
      currentUser = null; localStorage.removeItem('gizpro_user');
      showScreen('auth-screen');
    }
  });

  var subwalletForm = document.getElementById("subwallet-form");
  if (subwalletForm) subwalletForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    var name = document.getElementById("subwallet-name").value.trim();
    var color = document.querySelector(".color-btn.active");
    var colorVal = color ? color.dataset.color : "green";
    await addSubwallet(name, colorVal);
    closeAllModals();
    e.target.reset();
  });

  document.querySelectorAll(".color-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      document.querySelectorAll(".color-btn").forEach(function(b) { b.classList.remove("active"); });
      btn.classList.add("active");
    });
  });

  document.querySelectorAll(".filter-btn").forEach(function(btn) {
    btn.addEventListener('click', function() {
      var subwalletForm = document.getElementById("subwallet-form");
  if (subwalletForm) subwalletForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    var name = document.getElementById("subwallet-name").value.trim();
    var color = document.querySelector(".color-btn.active");
    var colorVal = color ? color.dataset.color : "green";
    await addSubwallet(name, colorVal);
    closeAllModals();
    e.target.reset();
  });

  document.querySelectorAll(".color-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      document.querySelectorAll(".color-btn").forEach(function(b) { b.classList.remove("active"); });
      btn.classList.add("active");
    });
  });

  document.querySelectorAll(".filter-btn").forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active'); renderAllTransactions(btn.dataset.filter);
    });
  });

  var confirmSwap = document.getElementById('confirm-swap');
  if (confirmSwap) confirmSwap.addEventListener('click', async function() {
    var fromAmount = parseFloat(document.getElementById('swap-from-amount').value);
    if (!fromAmount || fromAmount <= 0) { showToast('أدخل مبلغاً', 'error'); return; }
    var activeBtn = document.querySelector('.swap-dir-btn.active');
    var dir = activeBtn ? activeBtn.dataset.dir : 'ton-to-giz';
    if (dir === 'giz-to-ton') {
      if (fromAmount > currentUser.gizBalance) { showToast('رصيد غير كافٍ', 'error'); return; }
      currentUser.gizBalance -= fromAmount;
    } else { currentUser.gizBalance += fromAmount * TON_TO_GIZ_RATE; }
    await updateUser(currentUser);
    await addTransaction({ username: currentUser.username, type: 'swap', fromAddress: currentUser.gizAddress, toAddress: currentUser.gizAddress, amount: fromAmount, fee: 0, note: dir, timestamp: Date.now() });
    showToast('تم التحويل!'); closeAllModals(); updateDashboard();
  });

  document.querySelectorAll('.swap-dir-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.swap-dir-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var dir = btn.dataset.dir;
      var fc = document.getElementById('swap-from-currency');
      var tc = document.getElementById('swap-to-currency');
      var re = document.getElementById('swap-rate');
      if (fc) fc.textContent = dir === 'ton-to-giz' ? 'TON' : 'GIZ';
      if (tc) tc.textContent = dir === 'ton-to-giz' ? 'GIZ' : 'TON';
      if (re) re.textContent = dir === 'ton-to-giz' ? '1 TON = 10 GIZ' : '10 GIZ = 1 TON';
    });
  });

  var swapFrom = document.getElementById('swap-from-amount');
  if (swapFrom) swapFrom.addEventListener('input', function(e) {
    var amount = parseFloat(e.target.value) || 0;
    var activeBtn = document.querySelector('.swap-dir-btn.active');
    var dir = activeBtn ? activeBtn.dataset.dir : 'ton-to-giz';
    var toEl = document.getElementById('swap-to-amount');
    if (toEl) toEl.value = dir === 'ton-to-giz' ? formatAmount(amount * TON_TO_GIZ_RATE) : formatAmount(amount / GIZ_TO_TON_RATE);
  });
}

async function init() {
  setupEventListeners();
  try {
    var savedUser = localStorage.getItem('gizpro_user');
    if (savedUser) {
      var userData = JSON.parse(savedUser);
      var doc = await db.collection('users').doc(userData.username).get();
      if (doc.exists) {
        currentUser = doc.data();
        setTimeout(function() { showScreen('main-screen'); updateDashboard(); }, 2500);
        return;
      }
    }
  } catch(e) {}
  setTimeout(function() { showScreen('auth-screen'); }, 2500);
}

document.addEventListener('DOMContentLoaded', init);

function showTonDepositAddress() {
  var address = 'UQAtucDs37OAhU3gTMUEBRxm8JhbUT2To3sxe3Qkc1mgHi3C';
  var msg = 'أرسل TON لهذا العنوان:\n' + address + '\n\nسيتم إضافة GIZ تلقائياً بعد التأكيد';
  alert(msg);
}

function copyReferral() {
  if (!currentUser) return;
  var link = generateReferralLink(currentUser.username);
  copyToClipboard(link);
  showToast('تم نسخ رابط الإحالة!');
}

async function renderSubwallets() {
  var list = document.getElementById('subwallets-list');
  if (!list || !currentUser) return;
  try {
    var snap = await db.collection('subwallets').where('username', '==', currentUser.username).get();
    var subwallets = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    if (subwallets.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:2rem;color:#888"><i class="fas fa-wallet" style="font-size:2rem;display:block;margin-bottom:.5rem"></i>لا توجد محافظ فرعية</div>';
      return;
    }
    var colors = { green: '#00D084', blue: '#0088CC', orange: '#F7931A', purple: '#9B59B6', red: '#FF4757' };
    list.innerHTML = subwallets.map(function(sw) {
      return '<div class="subwallet-card" style="--wallet-color:' + (colors[sw.color]||colors.green) + '">' +
        '<div class="subwallet-icon" style="background:' + (colors[sw.color]||colors.green) + '"><i class="fas fa-wallet"></i></div>' +
        '<div class="subwallet-name">' + sw.name + '</div>' +
        '<div class="subwallet-balance">' + (sw.balance||0).toFixed(2) + ' GIZ</div>' +
        '</div>';
    }).join('');
  } catch(e) {}
}

async function addSubwallet(name, color) {
  if (!currentUser || !name) return;
  await db.collection('subwallets').add({
    username: currentUser.username,
    name: name, color: color || 'green',
    balance: 0, createdAt: Date.now()
  });
  showToast('تم إنشاء المحفظة!');
  renderSubwallets();
}
