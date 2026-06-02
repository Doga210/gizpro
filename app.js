// ===== Gizpro Wallet - Firebase Version =====

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
const REFERRAL_BONUS = 0.05;

let currentUser = null;
let db = null;

firebase.initializeApp(firebaseConfig);
db = firebase.firestore();

function generateGIZAddress() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let address = 'GZ';
    for (let i = 0; i < 49; i++) {
        address += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return address;
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('ar-SA', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatAmount(amount) {
    return parseFloat(amount).toFixed(2);
}

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
    navigator.clipboard.writeText(text).then(() => {
        showToast('تم النسخ إلى الحافظة!');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('تم النسخ إلى الحافظة!');
    });
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function showModal(modalId) { document.getElementById(modalId).classList.add('active'); }
function hideModal(modalId) { document.getElementById(modalId).classList.remove('active'); }
function closeAllModals() { document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); }

function getReferralCode() {
    return new URLSearchParams(window.location.search).get('ref') || null;
}

function generateReferralLink(username) {
    const base = window.location.origin + window.location.pathname;
    return `${base}?ref=${username}`;
}

async function registerUser(username, password) {
    const userRef = db.collection('users').doc(username);
    const doc = await userRef.get();
    if (doc.exists) throw new Error('اسم المستخدم موجود بالفعل');

    const refCode = getReferralCode();
    const bonus = SIGNUP_BONUS + (refCode ? REFERRAL_BONUS : 0);
    const gizAddress = generateGIZAddress();

    const user = {
        username,
        password: btoa(password),
        gizAddress,
        gizBalance: bonus,
        tonBalance: 0,
        tonAddress: null,
        tonConnected: false,
        referredBy: refCode || null,
        createdAt: Date.now()
    };

    await userRef.set(user);
    await addTransaction({
        username, type: 'signup_bonus',
        fromAddress: 'SYSTEM', toAddress: gizAddress,
        amount: bonus, fee: 0,
        note: refCode ? 'هدية التسجيل + مكافأة الإحالة' : 'هدية التسجيل',
        timestamp: Date.now()
    });

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

async function connectTONWallet(tonAddress) {
    currentUser.tonAddress = tonAddress;
    currentUser.tonConnected = true;
    await updateUser(currentUser);
    await addTransaction({
        username: currentUser.username, type: 'ton_connect',
        fromAddress: 'SYSTEM', toAddress: currentUser.gizAddress,
        amount: 0, fee: 0,
        note: 'ربط محفظة TON: ' + tonAddress.substring(0, 15) + '...',
        timestamp: Date.now()
    });
    showToast('تم ربط محفظة TON بنجاح!');
    updateDashboard();
}

async function disconnectTONWallet() {
    currentUser.tonAddress = null;
    currentUser.tonConnected = false;
    currentUser.tonBalance = 0;
    await updateUser(currentUser);
    showToast('تم فصل محفظة TON');
    updateDashboard();
}

async function updateDashboard() {
    if (!currentUser) return;
    document.getElementById('total-giz').textContent = formatAmount(currentUser.gizBalance);
    document.getElementById('total-ton').textContent = `≈ ${formatAmount(currentUser.gizBalance * TON_TO_GIZ_RATE)} TON`;
    document.getElementById('user-address').textContent = currentUser.gizAddress;
    document.getElementById('receive-address').textContent = currentUser.gizAddress;
    document.getElementById('settings-username').textContent = currentUser.username;
    document.getElementById('settings-address').textContent = currentUser.gizAddress;

    const refLink = generateReferralLink(currentUser.username);
    if (document.getElementById('referral-link')) document.getElementById('referral-link').value = refLink;

    const tonStatusEl = document.getElementById('ton-status');
    const tonConnectBtn = document.getElementById('ton-connect-btn');
    const tonStatusText = document.getElementById('ton-status-text');
    const btnTonConnectMain = document.getElementById('btn-ton-connect-main');

    if (currentUser.tonConnected && currentUser.tonAddress) {
        if (tonStatusEl) tonStatusEl.innerHTML = `<span style="color:var(--accent-green)">متصل: ${currentUser.tonAddress.substring(0,15)}...</span>`;
        if (tonConnectBtn) { tonConnectBtn.innerHTML = '<i class="fas fa-unlink"></i> فصل محفظة TON'; tonConnectBtn.onclick = disconnectTONWallet; }
        if (tonStatusText) { tonStatusText.textContent = 'متصل'; tonStatusText.classList.add('connected'); }
        if (btnTonConnectMain) { btnTonConnectMain.innerHTML = '<i class="fas fa-unlink"></i> فصل محفظة TON'; btnTonConnectMain.onclick = disconnectTONWallet; }
    } else {
        if (tonStatusEl) tonStatusEl.innerHTML = '<span style="color:var(--text-muted)">غير متصل</span>';
        if (tonConnectBtn) { tonConnectBtn.innerHTML = '<i class="fas fa-link"></i> ربط محفظة TON'; tonConnectBtn.onclick = () => showModal('ton-connect-modal'); }
        if (tonStatusText) { tonStatusText.textContent = 'غير متصل'; tonStatusText.classList.remove('connected'); }
        if (btnTonConnectMain) { btnTonConnectMain.innerHTML = '<i class="fas fa-link"></i> ربط محفظة TON'; btnTonConnectMain.onclick = () => showModal('ton-connect-modal'); }
    }

    document.getElementById('ton-status-card').classList.add('active');
    await renderRecentTransactions();
}

function renderTransactionItem(tx) {
    let icon, iconClass, title, amountClass, amount;
    switch(tx.type) {
        case 'sent': icon='fa-paper-plane'; iconClass='sent'; title=`إرسال إلى ${tx.toAddress.substring(0,10)}...`; amountClass='negative'; amount=`-${formatAmount(tx.amount)}`; break;
        case 'received': icon='fa-arrow-down'; iconClass='received'; title=`استقبال من ${tx.fromAddress.substring(0,10)}...`; amountClass='positive'; amount=`+${formatAmount(tx.amount)}`; break;
        case 'swap': icon='fa-exchange-alt'; iconClass='swap'; title='تحويل TON ↔ GIZ'; amountClass='neutral'; amount=`${formatAmount(tx.amount)}`; break;
        case 'ton_connect': icon='fa-link'; iconClass='swap'; title='ربط محفظة TON'; amountClass='neutral'; amount='---'; break;
        case 'signup_bonus': icon='fa-gift'; iconClass='received'; title='هدية التسجيل'; amountClass='positive'; amount=`+${formatAmount(tx.amount)}`; break;
        default: icon='fa-circle'; iconClass='neutral'; title=tx.note||'معاملة'; amountClass='neutral'; amount=formatAmount(tx.amount);
    }
    return `<div class="transaction-item"><div class="tx-icon ${iconClass}"><i class="fas ${icon}"></i></div><div class="tx-details"><div class="tx-title">${title}</div><div class="tx-date">${formatDate(tx.timestamp)}</div></div><div class="tx-amount ${amountClass}">${amount} GIZ</div></div>`;
}

async function renderRecentTransactions() {
    const list = document.getElementById('recent-transactions');
    const transactions = await getTransactions(currentUser.username);
    const recent = transactions.slice(0, 5);
    if (recent.length === 0) { list.innerHTML = '<div class="empty-state" style="text-align:center;padding:2rem;color:var(--text-muted)"><i class="fas fa-list" style="font-size:2rem;display:block;margin-bottom:.5rem"></i><span>لا توجد معاملات</span></div>'; return; }
    list.innerHTML = recent.map(tx => renderTransactionItem(tx)).join('');
}

async function renderAllTransactions(filter = 'all') {
    const list = document.getElementById('all-transactions');
    let transactions = await getTransactions(currentUser.username);
    if (filter !== 'all') transactions = transactions.filter(tx => tx.type === filter);
    if (transactions.length === 0) { list.innerHTML = '<div class="empty-state" style="text-align:center;padding:2rem;color:var(--text-muted)"><i class="fas fa-list" style="font-size:2rem;display:block;margin-bottom:.5rem"></i><span>لا توجد معاملات</span></div>'; return; }
    list.innerHTML = transactions.map(tx => renderTransactionItem(tx)).join('');
}

function setupEventListeners() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`${tab.dataset.tab}-form`).classList.add('active');
        });
    });

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
        } catch (err) { showToast(err.message || 'خطأ في إنشاء الحساب', 'error'); }
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        try {
            await loginUser(username, password);
            showScreen('main-screen');
            updateDashboard();
            showToast(`مرحباً ${username}!`);
        } catch (err) { showToast(err.message || 'خطأ في تسجيل الدخول', 'error'); }
    });

    document.getElementById('send-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const toAddress = document.getElementById('send-address').value.trim();
        const amount = parseFloat(document.getElementById('send-amount').value);
        const note = document.getElementById('send-note').value;
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
    });

    document.getElementById('send-amount').addEventListener('input', (e) => {
        const amount = parseFloat(e.target.value) || 0;
        document.getElementById('send-total').textContent = `${formatAmount(amount + TRANSFER_FEE)} GIZ`;
    });

    document.getElementById('copy-address').addEventListener('click', () => copyToClipboard(currentUser.gizAddress));
    document.getElementById('copy-receive').addEventListener('click', () => copyToClipboard(currentUser.gizAddress));

    document.getElementById('btn-send').addEventListener('click', () => showModal('send-modal'));
    document.getElementById('btn-receive').addEventListener('click', () => showModal('receive-modal'));
    document.getElementById('btn-swap').addEventListener('click', () => showModal('swap-modal'));
    document.getElementById('btn-history').addEventListener('click', () => { showScreen('history-screen'); renderAllTransactions('all'); });

    document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', closeAllModals));
    document.querySelectorAll('.modal').forEach(modal => modal.addEventListener('click', (e) => { if (e.target === modal) closeAllModals(); }));

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            if (item.dataset.page === 'settings') showScreen('settings-screen');
            else if (item.dataset.page === 'home') showScreen('main-screen');
        });
    });

    document.getElementById('confirm-swap').addEventListener('click', async () => {
        const fromAmount = parseFloat(document.getElementById('swap-from-amount').value);
        if (!fromAmount || fromAmount <= 0) { showToast('أدخل مبلغاً صحيحاً', 'error'); return; }
        const dir = document.querySelector('.swap-dir-btn.active').dataset.dir;
        if (dir === 'ton-to-giz') {
            if (!currentUser.tonConnected) { showToast('ربط محفظة TON أولاً', 'error'); return; }
            currentUser.gizBalance += fromAmount * TON_TO_GIZ_RATE;
        } else {
            const tonAmount = fromAmount / GIZ_TO_TON_RATE;
            if (fromAmount > currentUser.gizBalance) { showToast('رصيد GIZ غير كافٍ', 'error'); return; }
            currentUser.gizBalance -= fromAmount;
        }
        await updateUser(currentUser);
        await addTransaction({ username: currentUser.username, type: 'swap', fromAddress: currentUser.gizAddress, toAddress: currentUser.gizAddress, amount: fromAmount, fee: 0, note: dir, timestamp: Date.now() });
        showToast('تم التحويل بنجاح!');
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

    document.getElementById('ton-connect-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const tonAddress = document.getElementById('ton-address-input').value.trim();
        if (!tonAddress || tonAddress.length < 10) { showToast('أدخل عنوان TON صحيح', 'error'); return; }
        await connectTONWallet(tonAddress);
        closeAllModals();
    });

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

    document.getElementById('logout-btn').addEventListener('click', () => {
        currentUser = null;
        showScreen('auth-screen');
        showToast('تم تسجيل الخروج');
    });

    document.getElementById('ton-connect-btn').addEventListener('click', () => showModal('ton-connect-modal'));

    document.getElementById('change-password').addEventListener('click', () => showToast('قريباً!', 'warning'));
    document.getElementById('export-data').addEventListener('click', exportData);
    document.getElementById('clear-data').addEventListener('click', () => {
        if (confirm('هل أنت متأكد؟')) { db.collection('users').doc(currentUser.username).delete(); currentUser = null; showScreen('auth-screen'); }
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
