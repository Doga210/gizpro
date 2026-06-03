cat > ~/Gizpro/app.js << 'ENDOFFILE'
// ===== Gizpro Wallet - Full System =====

const firebaseConfig = {
  apiKey: "AIzaSyCKMyhYwAn8yvlY-_5VEPfwZD4-pVVDcHc",
  authDomain: "gizpro.firebaseapp.com",
  projectId: "gizpro",
  storageBucket: "gizpro.firebasestorage.app",
  messagingSenderId: "867107128011",
  appId: "1:867107128011:web:9ba38e66db554469b2514e"
};

// ===== Constants =====
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

firebase.initializeApp(firebaseConfig);
db = firebase.firestore();

// ===== Utility Functions =====
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

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  const icon = toast.querySelector('i');
  toastMessage.textContent = message;
  if (type === 'success') { toast.style.background = 'var(--accent-green)'; icon.className = 'fas fa-check-circle'; }
  else if (type === 'error') { toast.style.background = 'var(--accent-red)'; icon.className = 'fas fa-exclamation-circle'; }
  else if (type === 'warning') { toast.style.background = 'var(--accent-gold)'; icon.className = 'fas fa-info-circle'; }
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
  document.getElementById(id).classList.add('active');
}

function showModal(id) { document.getElementById(id).classList.add('active'); }
function hideModal(id) { document.getElementById(id).classList.remove('active'); }
function closeAllModals() { document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); }

function getReferralCode() {
  return new URLSearchParams(window.location.search).get('ref') || null;
}

function generateReferralLink(username) {
  return `${window.location.origin}${window.location.pathname}?ref=${username}`;
}

// ===== User Management =====
async function registerUser(username, password) {
  const userRef = db.collection('users').doc(username);
  const doc = await userRef.get();
  if (doc.exists) throw new Error('اسم المستخدم موجود بالفعل');

  const refCode = getReferralCode();
  const gizAddress = generateGIZAddress();
  const now = Date.now();

  const user = {
    username,
    password: btoa(password),
    gizAddress,
    gizBalance: SIGNUP_BONUS + (refCode ? REFERRAL_REWARDS.register : 0),
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
    username, type: 'signup_bonus',
    fromAddress: 'SYSTEM', toAddress: gizAddress,
    amount: user.gizBalance, fee: 0,
    note: refCode ? 'هدية التسجيل + مكافأة الإحالة' : 'هدية التسجيل',
    timestamp: now
  });

  // مكافأة المُحيل
  if (refCode) {
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
        note: `مكافأة إحالة: ${username}`,
        timestamp: now
      });
    }
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
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ===== Click System =====
async function handleClick() {
  if (!currentUser) return;

  const today = new Date().toDateString();
  const level = LEVELS[currentUser.level || 1];

  // تجديد يومي
  if (currentUser.lastClickDate !== today) {
    currentUser.todayClicks = 0;
    currentUser.todayEarned = 0;
    currentUser.lastClickDate = today;
  }

  // التحقق من انتهاء المستوى
  if (currentUser.level > 1 && Date.now() > currentUser.levelExpiry) {
    currentUser.level = 1;
    showToast('انتهت مدة مستواك! تم الرجوع للمستوى 1', 'warning');
  }

  // التحقق من الحد اليومي
  if (currentUser.todayEarned >= level.dailyLimit) {
    showToast(`وصلت للحد اليومي ${level.dailyLimit} GIZ`, 'warning');
    return;
  }

  // إضافة المكافأة
  const reward = level.clickReward;
  currentUser.gizBalance += reward;
  currentUser.todayClicks = (currentUser.todayClicks || 0) + 1;
  currentUser.todayEarned = (currentUser.todayEarned || 0) + reward;
  currentUser.totalEarned = (currentUser.totalEarned || 0) + reward;

  await updateUser(currentUser);
  updateDashboard();

  // تأثير النقر
  const btn = document.getElementById('click-btn');
  if (btn) {
    btn.classList.add('clicked');
    setTimeout(() => btn.classList.remove('clicked'), 200);
  }

  // عرض المكافأة
  showFloatingReward(reward);
}

function showFloatingReward(amount) {
  const el = document.createElement('div');
  el.className = 'floating-reward';
  el.textContent = `+${amount} GIZ`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

// ===== Level System =====
async function buyLevel(levelNum) {
  const level = LEVELS[levelNum];
  if (!level || levelNum === 1) return;

  if (currentUser.gizBalance < level.price) {
    showToast(`رصيد غير كافٍ، تحتاج ${level.price} GIZ`, 'error');
    return;
  }

  currentUser.gizBalance -= level.price;
  currentUser.level = levelNum;
  currentUser.levelExpiry = Date.now() + (10 * 24 * 60 * 60 * 1000);
  currentUser.todayClicks = 0;
  currentUser.todayEarned = 0;

  await updateUser(currentUser);

  // مكافأة المُحيل عند شراء مستوى
  if (currentUser.referredBy) {
    const rewardKey = `level${levelNum}`;
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
          note: `مكافأة إحالة: شراء مستوى ${levelNum}`,
          timestamp: Date.now()
        });
      }
    }
  }

  await addTransaction({
    username: currentUser.username, type: 'level_purchase',
    fromAddress: currentUser.gizAddress, toAddress: 'SYSTEM',
    amount: level.price, fee: 0,
    note: `شراء مستوى ${levelNum} لمدة 10 أيام`,
    timestamp: Date.now()
  });

  showToast(`تم شراء المستوى ${levelNum} بنجاح! صالح 10 أيام`);
  closeAllModals();
  updateDashboard();
}

// ===== Withdrawal System =====
async function requestWithdrawal(amount) {
  if (amount < MIN_WITHDRAWAL) {
    showToast(`الحد الأدنى للسحب ${MIN_WITHDRAWAL} GIZ`, 'error');
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
    gizAmount: amount,
    fee: fee,
    netGiz: netAmount,
    tonAmount: tonAmount,
    tonAddress: currentUser.tonAddress,
    status: 'pending',
    timestamp: Date.now()
  });

  await addTransaction({
    username: currentUser.username, type: 'withdrawal',
    fromAddress: currentUser.gizAddress, toAddress: currentUser.tonAddress,
    amount: amount, fee: fee,
    note: `سحب ${tonAmount.toFixed(4)} TON`,
    timestamp: Date.now()
  });

  showToast(`طلب السحب مُرسل! ستستلم ${tonAmount.toFixed(4)} TON خلال 24 ساعة`);
  closeAllModals();
  updateDashboard();
}

// ===== Send GIZ =====
async function sendGIZ(toAddress, amount, note) {
  const total = amount + TRANSFER_FEE;
  if (total > currentUser.gizBalance) { showToast('رصيد غير كافٍ', 'error'); return; }
  if (toAddress === currentUser.gizAddress) { showToast('لا يمكن الإرسال لنفسك', 'error'); return; }

  const snap = await db.collection('users').where('gizAddress', '==', toAddress).get();
  if (snap.empty) { showToast('العنوان غير موجود', 'error'); return; }

  const recipient = snap.docs[0].data();
  currentUser.gizBalance -= total;
  await updateUser(currentUser);

  recipient.gizBalance += amount;
  await db.collection('users').doc(recipient.username).set(recipient);

  await addTransaction({ username: currentUser.username, type: 'sent', fromAddress: currentUser.gizAddress, toAddress, amount, fee: TRANSFER_FEE, note, timestamp: Date.now() });
  await addTransaction({ username: recipient.username, type: 'received', fromAddress: currentUser.gizAddress, toAddress, amount, fee: 0, note, timestamp: Date.now() });

  showToast(`تم إرسال ${amount} GIZ`);
  closeAllModals();
  updateDashboard();
}

// ===== TON Connect =====
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

// ===== Dashboard =====
async function updateDashboard() {
  if (!currentUser) return;

  const level = LEVELS[currentUser.level || 1];
  const today = new Date().toDateString();
  if (currentUser.lastClickDate !== today) {
    currentUser.todayEarned = 0;
    currentUser.todayClicks = 0;
  }

  // الرصيد
  document.getElementById('total-giz').textContent = formatAmount(currentUser.gizBalance);
  document.getElementById('total-ton').textContent = `≈ ${formatAmount(currentUser.gizBalance / GIZ_TO_TON_RATE)} TON`;
  document.getElementById('user-address').textContent = currentUser.gizAddress;
  document.getElementById('receive-address').textContent = currentUser.gizAddress;
  document.getElementById('settings-username').textContent = currentUser.username;
  document.getElementById('settings-address').textContent = currentUser.gizAddress;

  // رابط الإحالة
  if (document.getElementById('referral-link'))
    document.getElementById('referral-link').value = generateReferralLink(currentUser.username);

  // نظام النقر
  const clickBtn = document.getElementById('click-btn');
  if (clickBtn) {
    const dailyProgress = ((currentUser.todayEarned || 0) / level.dailyLimit * 100).toFixed(0);
    document.getElementById('click-level').textContent = `المستوى ${currentUser.level || 1}`;
    document.getElementById('click-earned').textContent = `${formatAmount(currentUser.todayEarned || 0)} / ${level.dailyLimit} GIZ`;
    document.getElementById('click-progress').style.width = `${dailyProgress}%`;

    // انتهاء المستوى
    if (currentUser.level > 1) {
      const remaining = currentUser.levelExpiry - Date.now();
      const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
      document.getElementById('level-expiry').textContent = days > 0 ? `ينتهي بعد ${days} أيام` : 'انتهى المستوى!';
    } else {
      document.getElementById('level-expiry').textContent = 'مجاني';
    }
  }

  // TON Status
  const tonStatusEl = document.getElementById('ton-status');
  const tonConnectBtn = document.getElementById('ton-connect-btn');
  const tonStatusText = document.getElementById('ton-status-text');
  const btnTonConnectMain = document.getElementById('btn-ton-connect-main');

  if (currentUser.tonConnected && currentUser.tonAddress) {
    if (tonStatusEl) tonStatusEl.innerHTML = `<span style="color:var(--accent-green)">متصل: ${currentUser.tonAddress.substring(0,15)}...</span>`;
    if (tonConnectBtn) { tonConnectBtn.innerHTML = '<i class="fas fa-unlink"></i> فصل محفظة TON'; tonConnectBtn.onclick = disconnectTONWallet; }
    if (tonStatusText) { tonStatusText.textContent = 'متصل'; tonStatusText.classList.add('connected'); }
    if (btnTonConnectMain) { btnTonConnectMain.innerHTML = '<i class="fas fa-unlink"></i> فصل'; btnTonConnectMain.onclick = disconnectTONWallet; }
  } else {
    if (tonStatusEl) tonStatusEl.innerHTML = '<span style="color:var(--text-muted)">غير متصل</span>';
    if (tonConnectBtn) { tonConnectBtn.innerHTML = '<i class="fas fa-link"></i> ربط محفظة TON'; tonConnectBtn.onclick = () => showModal('ton-connect-modal'); }
    if (tonStatusText) { tonStatusText.textContent = 'غير متصل'; tonStatusText.classList.remove('connected'); }
    if (btnTonConnectMain) { btnTonConnectMain.innerHTML = '<i class="fas fa-link"></i> ربط TON'; btnTonConnectMain.onclick = () => showModal('ton-connect-modal'); }
  }

  document.getElementById('ton-status-card').classList.add('active');
  await renderRecentTransactions();
  renderLevelsUI();
}

// ===== Levels UI =====
function renderLevelsUI() {
  const container = document.getElementById('levels-container');
  if (!container) return;

  container.innerHTML = Object.entries(LEVELS).map(([num, level]) => {
    const isActive = parseInt(num) === (currentUser.level || 1);
    const isExpired = parseInt(num) > 1 && Date.now() > currentUser.levelExpiry && isActive;
    return `
      <div class="level-card ${isActive ? 'active-level' : ''}">
        <div class="level-header">
          <span class="level-num">المستوى ${num}</span>
          ${isActive ? '<span class="level-badge">نشط</span>' : ''}
        </div>
        <div class="level-info">
          <div>نقرة: <strong>${level.clickReward} GIZ</strong></div>
          <div>يومياً: <strong>${level.dailyLimit} GIZ</strong></div>
          <div>10 أيام: <strong>${level.dailyLimit * 10} GIZ</strong></div>
        </div>
        ${parseInt(num) === 1 ? '<div class="level-price">مجاني</div>' :
          `<button class="btn-buy-level" onclick="buyLevel(${num})">
            شراء - ${level.price} GIZ
           </button>`
        }
      </div>
    `;
  }).join('');
}

// ===== Transactions =====
function renderTransactionItem(tx) {
  let icon, iconClass, title, amountClass, amount;
  switch(tx.type) {
    case 'sent': icon='fa-paper-plane'; iconClass='sent'; title=`إرسال إلى ${tx.toAddress.substring(0,10)}...`; amountClass='negative'; amount=`-${formatAmount(tx.amount)}`; break;
    case 'received': icon='fa-arrow-down'; iconClass='received'; title=`استقبال من ${tx.fromAddress.substring(0,10)}...`; amountClass='positive'; amount=`+${formatAmount(tx.amount)}`; break;
    case 'swap': icon='fa-exchange-alt'; iconClass='swap'; title='تحويل TON ↔ GIZ'; amountClass='neutral'; amount=formatAmount(tx.amount); break;
    case 'level_purchase': icon='fa-star'; iconClass='sent'; title=tx.note||'شراء مستوى'; amountClass='negative'; amount=`-${formatAmount(tx.amount)}`; break;
    case 'withdrawal': icon='fa-money-bill'; iconClass='sent'; title=tx.note||'سحب'; amountClass='negative'; amount=`-${formatAmount(tx.amount)}`; break;
    case 'referral_reward': icon='fa-users'; iconClass='received'; title=tx.note||'مكافأة إحالة'; amountClass='positive'; amount=`+${formatAmount(tx.amount)}`; break;
    case 'signup_bonus': icon='fa-gift'; iconClass='received'; title='هدية التسجيل'; amountClass='positive'; amount=`+${formatAmount(tx.amount)}`; break;
    default: icon='fa-circle'; iconClass='neutral'; title=tx.note||'معاملة'; amountClass='neutral'; amount=formatAmount(tx.amount);
  }
  return `<div class="transaction-item"><div class="tx-icon ${iconClass}"><i class="fas ${icon}"></i></div><div class="tx-details"><div class="tx-title">${title}</div><div class="tx-date">${formatDate(tx.timestamp)}</div></div><div class="tx-amount ${amountClass}">${amount} GIZ</div></div>`;
}

async function renderRecentTransactions() {
  const list = document.getElementById('recent-transactions');
  if (!list) return;
  const transactions = await getTransactions(currentUser.username);
  const recent = transactions.slice(0, 5);
  if (recent.length === 0) { list.innerHTML = '<div class="empty-state" style="text-align:center;padding:2rem;color:var(--text-muted)"><i class="fas fa-list" style="font-size:2rem;display:block;margin-bottom:.5rem"></i><span>لا توجد معاملات</span></div>'; return; }
  list.innerHTML = recent.map(tx => renderTransactionItem(tx)).join('');
}

async function renderAllTransactions(filter = 'all') {
  const list = document.getElementById('all-transactions');
  if (!list) return;
  let transactions = await getTransactions(currentUser.username);
  if (filter !== 'all') transactions = transactions.filter(tx => tx.type === filter);
  if (transactions.length === 0) { list.innerHTML = '<div class="empty-state" style="text-align:center;padding:2rem;color:var(--text-muted)"><i class="fas fa-list" style="font-size:2rem;display:block;margin-bottom:.5rem"></i><span>لا توجد معاملات</span></div>'; return; }
  list.innerHTML = transactions.map(tx => renderTransactionItem(tx)).join('');
}

// ===== Event Listeners =====
function setupEventListeners() {
  // Auth tabs
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tab.dataset.tab}-form`).classList.add('active');
    });
  });

  // Register
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    if (password !== confirm) { showToast('كلمات المرور غير متطابقة', 'error'); return; }
    try {
      const user = await registerUser(username, password);
      currentUser = user;
      showScreen('main-screen');
      updateDashboard();
      showToast(`مرحباً ${username}! رصيدك ${user.gizBalance} GIZ`);
    } catch (err) { showToast(err.message || 'خطأ', 'error'); }
  });

  // Login
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    try {
      await loginUser(username, password);
      showScreen('main-screen');
      updateDashboard();
      showToast(`مرحباً ${username}!`);
    } catch (err) { showToast(err.message || 'خطأ', 'error'); }
  });

  // Click button
  const clickBtn = document.getElementById('click-btn');
  if (clickBtn) clickBtn.addEventListener('click', handleClick);

  // Send
  document.getElementById('send-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const toAddress = document.getElementById('send-address').value.trim();
    const amount = parseFloat(document.getElementById('send-amount').value);
    const note = document.getElementById('send-note').value;
    await sendGIZ(toAddress, amount, note);
  });

  document.getElementById('send-amount').addEventListener('input', (e) => {
    const amount = parseFloat(e.target.value) || 0;
    document.getElementById('send-total').textContent = `${formatAmount(amount + TRANSFER_FEE)} GIZ`;
  });

  // Withdrawal
  const withdrawForm = document.getElementById('withdraw-form');
  if (withdrawForm) {
    withdrawForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('withdraw-amount').value);
      await requestWithdrawal(amount);
    });
  }

  // Buttons
  document.getElementById('btn-send').addEventListener('click', () => showModal('send-modal'));
  document.getElementById('btn-receive').addEventListener('click', () => showModal('receive-modal'));
  document.getElementById('btn-swap').addEventListener('click', () => showModal('swap-modal'));
  document.getElementById('btn-history').addEventListener('click', () => { showScreen('history-screen'); renderAllTransactions('all'); });

  document.getElementById('copy-address').addEventListener('click', () => copyToClipboard(currentUser.gizAddress));
  document.getElementById('copy-receive').addEventListener('click', () => copyToClipboard(currentUser.gizAddress));

  document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', closeAllModals));
  document.querySelectorAll('.modal').forEach(modal => modal.addEventListener('click', (e) => { if (e.target === modal) closeAllModals(); }));

  // Nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      if (item.dataset.page === 'settings') showScreen('settings-screen');
      else if (item.dataset.page === 'home') showScreen('main-screen');
      else if (item.dataset.page === 'earn') showScreen('earn-screen');
      else if (item.dataset.page === 'levels') showScreen('levels-screen');
    });
  });

  // TON Connect
  document.getElementById('ton-connect-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tonAddress = document.getElementById('ton-address-input').value.trim();
    if (!tonAddress || tonAddress.length < 10) { showToast('أدخل عنوان TON صحيح', 'error'); return; }
    await connectTONWallet(tonAddress);
    closeAllModals();
  });

  // History
  document.getElementById('back-from-history').addEventListener('click', () => showScreen('main-screen'));
  document.getElementById('back-from-settings').addEventListener('click', () => showScreen('main-screen'));
  document.getElementById('view-all-tx').addEventListener('click', () => { showScreen('history-screen'); renderAllTransactions('all'); });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderAllTransactions(btn.dataset.filter);
    });
  });

  // Settings
  document.getElementById('logout-btn').addEventListener('click', () => {
    currentUser = null;
    showScreen('auth-screen');
    showToast('تم تسجيل الخروج');
  });

  document.getElementById('ton-connect-btn').addEventListener('click', () => showModal('ton-connect-modal'));
  document.getElementById('change-password').addEventListener('click', () => showToast('قريباً!', 'warning'));
  document.getElementById('export-data').addEventListener('click', exportData);
  document.getElementById('clear-data').addEventListener('click', () => {
    if (confirm('هل أنت متأكد؟')) {
      db.collection('users').doc(currentUser.username).delete();
      currentUser = null;
      showScreen('auth-screen');
    }
  });

  // Swap
  document.getElementById('confirm-swap').addEventListener('click', async () => {
    const fromAmount = parseFloat(document.getElementById('swap-from-amount').value);
    if (!fromAmount || fromAmount <= 0) { showToast('أدخل مبلغاً صحيحاً', 'error'); return; }
    const dir = document.querySelector('.swap-dir-btn.active').dataset.dir;
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

  document.querySelectorAll('.swap-dir-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.swap-dir-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const dir = btn.dataset.dir;
      document.getElementById('swap-from-currency').textContent = dir === 'ton-to-giz' ? 'TON' : 'GIZ';
      document.getElementById('swap-to-currency').textContent = dir === 'ton-to-giz' ? 'GIZ' : 'TON';
      document.getElementById('swap-rate').textContent = dir === 'ton-to-giz' ? '1 TON = 0.1 GIZ' : '10 GIZ = 1 TON';
    });
  });

  document.getElementById('swap-from-amount').addEventListener('input', (e) => {
    const amount = parseFloat(e.target.value) || 0;
    const dir = document.querySelector('.swap-dir-btn.active').dataset.dir;
    document.getElementById('swap-to-amount').value = dir === 'ton-to-giz' ? formatAmount(amount * TON_TO_GIZ_RATE) : formatAmount(amount / GIZ_TO_TON_RATE);
  });
}

function exportData() {
  const blob = new Blob([JSON.stringify(currentUser, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `gizpro-${currentUser.username}.json`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('تم التصدير!');
}

async function init() {
  try {
    setupEventListeners();
    setTimeout(() => showScreen('auth-screen'), 2500);
  } catch (error) {
    showToast('خطأ في تحميل التطبيق', 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
ENDOFFILE
