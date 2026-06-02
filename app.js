// ===== Gizpro Wallet Application - Hybrid Model =====
// TON wallet is OPTIONAL - users can use GIZ only or add TON later

const DB_NAME = 'GizproDB';
const DB_VERSION = 2;

const OWNER_TON_ADDRESS = 'UQAtucDs37OAhU3gTMUEBRxm8JhbUT2To3sxe3Qkc1mgHi3C';

const TON_TO_GIZ_RATE = 0.1;
const GIZ_TO_TON_RATE = 10;
const TRANSFER_FEE = 0.05;
const SIGNUP_BONUS = 10;

let db = null;
let currentUser = null;
let currentScreen = 'splash';

// ===== Database Initialization =====
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            
            if (!database.objectStoreNames.contains('users')) {
                const usersStore = database.createObjectStore('users', { keyPath: 'username' });
                usersStore.createIndex('gizAddress', 'gizAddress', { unique: true });
            }
            
            if (!database.objectStoreNames.contains('transactions')) {
                const txStore = database.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
                txStore.createIndex('fromAddress', 'fromAddress', { unique: false });
                txStore.createIndex('toAddress', 'toAddress', { unique: false });
                txStore.createIndex('username', 'username', { unique: false });
                txStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
            
            if (!database.objectStoreNames.contains('subwallets')) {
                const swStore = database.createObjectStore('subwallets', { keyPath: 'id', autoIncrement: true });
                swStore.createIndex('username', 'username', { unique: false });
            }
        };
    });
}

// ===== Utility Functions =====
function generateGIZAddress() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let address = 'GZ';
    for (let i = 0; i < 49; i++) {
        address += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return address;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
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
    
    if (type === 'success') {
        toast.style.background = 'var(--accent-green)';
        icon.className = 'fas fa-check-circle';
    } else if (type === 'error') {
        toast.style.background = 'var(--accent-red)';
        icon.className = 'fas fa-exclamation-circle';
    } else if (type === 'warning') {
        toast.style.background = 'var(--accent-gold)';
        icon.className = 'fas fa-info-circle';
    }
    
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

// ===== Screen Management =====
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
    currentScreen = screenId;
}

function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
}

// ===== User Management =====
async function registerUser(username, password) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['users'], 'readwrite');
        const store = transaction.objectStore('users');
        
        const checkRequest = store.get(username);
        
        checkRequest.onsuccess = () => {
            if (checkRequest.result) {
                reject('اسم المستخدم موجود بالفعل');
                return;
            }
            
            const gizAddress = generateGIZAddress();
            const user = {
                username: username,
                password: btoa(password),
                gizAddress: gizAddress,
                gizBalance: SIGNUP_BONUS,
                tonBalance: 0,
                tonAddress: null,
                tonConnected: false,
                createdAt: Date.now()
            };
            
            const addRequest = store.add(user);
            addRequest.onsuccess = () => {
                addTransaction({
                    username: username,
                    type: 'signup_bonus',
                    fromAddress: 'SYSTEM',
                    toAddress: gizAddress,
                    amount: SIGNUP_BONUS,
                    fee: 0,
                    note: 'هدية التسجيل',
                    timestamp: Date.now()
                });
                resolve(user);
            };
            addRequest.onerror = () => reject('خطأ في إنشاء الحساب');
        };
    });
}

async function loginUser(username, password) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['users'], 'readonly');
        const store = transaction.objectStore('users');
        
        const request = store.get(username);
        
        request.onsuccess = () => {
            const user = request.result;
            if (!user) {
                reject('اسم المستخدم غير موجود');
                return;
            }
            
            if (user.password !== btoa(password)) {
                reject('كلمة المرور غير صحيحة');
                return;
            }
            
            currentUser = user;
            resolve(user);
        };
        
        request.onerror = () => reject('خطأ في تسجيل الدخول');
    });
}

async function updateUser(user) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['users'], 'readwrite');
        const store = transaction.objectStore('users');
        
        const request = store.put(user);
        request.onsuccess = () => resolve(user);
        request.onerror = () => reject('خطأ في تحديث البيانات');
    });
}

async function connectTONWallet(tonAddress) {
    if (!currentUser) return;
    
    currentUser.tonAddress = tonAddress;
    currentUser.tonConnected = true;
    await updateUser(currentUser);
    
    await addTransaction({
        username: currentUser.username,
        type: 'ton_connect',
        fromAddress: 'SYSTEM',
        toAddress: currentUser.gizAddress,
        amount: 0,
        fee: 0,
        note: 'ربط محفظة TON: ' + tonAddress.substring(0, 15) + '...',
        timestamp: Date.now()
    });
    
    showToast('تم ربط محفظة TON بنجاح!');
    updateDashboard();
}

async function disconnectTONWallet() {
    if (!currentUser) return;
    
    currentUser.tonAddress = null;
    currentUser.tonConnected = false;
    currentUser.tonBalance = 0;
    await updateUser(currentUser);
    
    showToast('تم فصل محفظة TON');
    updateDashboard();
}

// ===== Transaction Management =====
async function addTransaction(tx) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['transactions'], 'readwrite');
        const store = transaction.objectStore('transactions');
        
        tx.id = generateId();
        const request = store.add(tx);
        request.onsuccess = () => resolve(tx);
        request.onerror = () => reject('خطأ في حفظ المعاملة');
    });
}

async function getTransactions(username, filter = 'all') {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['transactions'], 'readonly');
        const store = transaction.objectStore('transactions');
        const index = store.index('username');
        
        const request = index.getAll(username);
        
        request.onsuccess = () => {
            let transactions = request.result || [];
            transactions.sort((a, b) => b.timestamp - a.timestamp);
            
            if (filter !== 'all') {
                transactions = transactions.filter(tx => tx.type === filter);
            }
            
            resolve(transactions);
        };
        
        request.onerror = () => reject('خطأ في جلب المعاملات');
    });
}

// ===== Sub-wallet Management =====
async function addSubwallet(username, name, color) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['subwallets'], 'readwrite');
        const store = transaction.objectStore('subwallets');
        
        const subwallet = {
            username: username,
            name: name,
            color: color,
            balance: 0,
            createdAt: Date.now()
        };
        
        const request = store.add(subwallet);
        request.onsuccess = () => resolve(subwallet);
        request.onerror = () => reject('خطأ في إنشاء المحفظة');
    });
}

async function getSubwallets(username) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['subwallets'], 'readonly');
        const store = transaction.objectStore('subwallets');
        const index = store.index('username');
        
        const request = index.getAll(username);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject('خطأ في جلب المحافظ');
    });
}

async function updateSubwallet(subwallet) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['subwallets'], 'readwrite');
        const store = transaction.objectStore('subwallets');
        
        const request = store.put(subwallet);
        request.onsuccess = () => resolve(subwallet);
        request.onerror = () => reject('خطأ في تحديث المحفظة');
    });
}

// ===== UI Update Functions =====
async function updateDashboard() {
    if (!currentUser) return;
    
    document.getElementById('total-giz').textContent = formatAmount(currentUser.gizBalance);
    document.getElementById('total-ton').textContent = `≈ ${formatAmount(currentUser.gizBalance * TON_TO_GIZ_RATE)} TON`;
    
    document.getElementById('user-address').textContent = currentUser.gizAddress;
    document.getElementById('receive-address').textContent = currentUser.gizAddress;
    
    document.getElementById('settings-username').textContent = currentUser.username;
    document.getElementById('settings-address').textContent = currentUser.gizAddress;
    
    const tonStatusEl = document.getElementById('ton-status');
    const tonConnectBtn = document.getElementById('ton-connect-btn');
    const tonStatusCard = document.getElementById('ton-status-card');
    const tonStatusText = document.getElementById('ton-status-text');
    const btnTonConnectMain = document.getElementById('btn-ton-connect-main');
    
    if (currentUser.tonConnected && currentUser.tonAddress) {
        if (tonStatusEl) tonStatusEl.innerHTML = `<span style="color: var(--accent-green)">متصل: ${currentUser.tonAddress.substring(0, 15)}...</span>`;
        if (tonConnectBtn) {
            tonConnectBtn.innerHTML = '<i class="fas fa-unlink"></i> فصل محفظة TON';
            tonConnectBtn.onclick = disconnectTONWallet;
        }
        if (tonStatusText) {
            tonStatusText.textContent = 'متصل';
            tonStatusText.classList.add('connected');
        }
        if (btnTonConnectMain) {
            btnTonConnectMain.innerHTML = '<i class="fas fa-unlink"></i> فصل محفظة TON';
            btnTonConnectMain.onclick = disconnectTONWallet;
        }
    } else {
        if (tonStatusEl) tonStatusEl.innerHTML = '<span style="color: var(--text-muted)">غير متصل</span>';
        if (tonConnectBtn) {
            tonConnectBtn.innerHTML = '<i class="fas fa-link"></i> ربط محفظة TON';
            tonConnectBtn.onclick = () => showModal('ton-connect-modal');
        }
        if (tonStatusText) {
            tonStatusText.textContent = 'غير متصل';
            tonStatusText.classList.remove('connected');
        }
        if (btnTonConnectMain) {
            btnTonConnectMain.innerHTML = '<i class="fas fa-link"></i> ربط محفظة TON';
            btnTonConnectMain.onclick = () => showModal('ton-connect-modal');
        }
    }
    
    if (tonStatusCard) tonStatusCard.classList.add('active');
    
    await renderSubwallets();
    await renderRecentTransactions();
}

async function renderSubwallets() {
    const grid = document.getElementById('subwallets-grid');
    const subwallets = await getSubwallets(currentUser.username);
    
    const colors = {
        green: '#00D084',
        blue: '#0088CC',
        orange: '#F7931A',
        purple: '#9B59B6',
        red: '#FF4757'
    };
    
    const icons = {
        green: 'fa-shopping-bag',
        blue: 'fa-home',
        orange: 'fa-piggy-bank',
        purple: 'fa-briefcase',
        red: 'fa-heart'
    };
    
    if (subwallets.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-muted);">
                <i class="fas fa-wallet" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                <span>لا توجد محافظ فرعية</span>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = subwallets.map(sw => `
        <div class="subwallet-card" data-id="${sw.id}" style="--wallet-color: ${colors[sw.color] || colors.green}">
            <div class="subwallet-icon" style="background: ${colors[sw.color] || colors.green}">
                <i class="fas ${icons[sw.color] || icons.green}"></i>
            </div>
            <div class="subwallet-name">${sw.name}</div>
            <div class="subwallet-balance">${formatAmount(sw.balance)} GIZ</div>
        </div>
    `).join('');
    
    document.querySelectorAll('.subwallet-card').forEach(card => {
        card.addEventListener('click', () => {
            showModal('transfer-subwallet-modal');
            loadSubwalletOptions();
        });
    });
}

async function renderRecentTransactions() {
    const list = document.getElementById('recent-transactions');
    const transactions = await getTransactions(currentUser.username, 'all');
    const recent = transactions.slice(0, 5);
    
    if (recent.length === 0) {
        list.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                <i class="fas fa-list" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                <span>لا توجد معاملات</span>
            </div>
        `;
        return;
    }
    
    list.innerHTML = recent.map(tx => renderTransactionItem(tx)).join('');
}

function renderTransactionItem(tx) {
    const isSent = tx.fromAddress === currentUser.gizAddress;
    const isReceived = tx.toAddress === currentUser.gizAddress;
    
    let icon, iconClass, title, amountClass, amount;
    
    switch(tx.type) {
        case 'sent':
            icon = 'fa-paper-plane';
            iconClass = 'sent';
            title = `إرسال إلى ${tx.toAddress.substring(0, 10)}...`;
            amountClass = 'negative';
            amount = `-${formatAmount(tx.amount)}`;
            break;
        case 'received':
            icon = 'fa-arrow-down';
            iconClass = 'received';
            title = `استقبال من ${tx.fromAddress.substring(0, 10)}...`;
            amountClass = 'positive';
            amount = `+${formatAmount(tx.amount)}`;
            break;
        case 'swap':
            icon = 'fa-exchange-alt';
            iconClass = 'swap';
            title = 'تحويل TON ↔ GIZ';
            amountClass = 'neutral';
            amount = `${formatAmount(tx.amount)}`;
            break;
        case 'subwallet_transfer':
            icon = 'fa-wallet';
            iconClass = 'subwallet';
            title = `تحويل: ${tx.note || 'محفظة فرعية'}`;
            amountClass = 'neutral';
            amount = `${formatAmount(tx.amount)}`;
            break;
        case 'ton_connect':
            icon = 'fa-link';
            iconClass = 'swap';
            title = 'ربط محفظة TON';
            amountClass = 'neutral';
            amount = '---';
            break;
        case 'ton_disconnect':
            icon = 'fa-unlink';
            iconClass = 'swap';
            title = 'فصل محفظة TON';
            amountClass = 'neutral';
            amount = '---';
            break;
        case 'signup_bonus':
            icon = 'fa-gift';
            iconClass = 'received';
            title = 'هدية التسجيل';
            amountClass = 'positive';
            amount = `+${formatAmount(tx.amount)}`;
            break;
        default:
            icon = 'fa-circle';
            iconClass = 'neutral';
            title = tx.note || 'معاملة';
            amountClass = 'neutral';
            amount = formatAmount(tx.amount);
    }
    
    return `
        <div class="transaction-item" data-id="${tx.id}">
            <div class="tx-icon ${iconClass}">
                <i class="fas ${icon}"></i>
            </div>
            <div class="tx-details">
                <div class="tx-title">${title}</div>
                <div class="tx-date">${formatDate(tx.timestamp)}</div>
            </div>
            <div class="tx-amount ${amountClass}">${amount} GIZ</div>
        </div>
    `;
}

async function renderAllTransactions(filter = 'all') {
    const list = document.getElementById('all-transactions');
    const transactions = await getTransactions(currentUser.username, filter);
    
    if (transactions.length === 0) {
        list.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                <i class="fas fa-list" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                <span>لا توجد معاملات</span>
            </div>
        `;
        return;
    }
    
    list.innerHTML = transactions.map(tx => renderTransactionItem(tx)).join('');
}

async function loadSubwalletOptions() {
    const subwallets = await getSubwallets(currentUser.username);
    const fromSelect = document.getElementById('from-subwallet');
    const toSelect = document.getElementById('to-subwallet');
    
    const options = subwallets.map(sw => `<option value="${sw.id}">${sw.name} (${formatAmount(sw.balance)} GIZ)</option>`).join('');
    
    fromSelect.innerHTML = '<option value="">اختر المحفظة</option>' + options;
    toSelect.innerHTML = '<option value="">اختر المحفظة</option>' + options;
}

// ===== Event Handlers =====
function setupEventListeners() {
    // Auth Tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            document.getElementById(`${tab.dataset.tab}-form`).classList.add('active');
        });
    });
    
    // Register Form
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value.trim();
        const password = document.getElementById('reg-password').value;
        const confirm = document.getElementById('reg-confirm').value;
        
        if (password !== confirm) {
            showToast('كلمتا المرور غير متطابقتين', 'error');
            return;
        }
        
        if (password.length < 6) {
            showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
            return;
        }
        
        try {
            const user = await registerUser(username, password);
            currentUser = user;
            showToast(`تم إنشاء الحساب! هديتك: ${SIGNUP_BONUS} GIZ`);
            showScreen('main-screen');
            updateDashboard();
        } catch (error) {
            showToast(error, 'error');
        }
    });
    
    // Login Form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        
        try {
            await loginUser(username, password);
            showToast('تم تسجيل الدخول بنجاح!');
            showScreen('main-screen');
            updateDashboard();
        } catch (error) {
            showToast(error, 'error');
        }
    });
    
    // Preview GIZ Address on register
    document.getElementById('reg-username').addEventListener('input', (e) => {
        if (e.target.value.length > 2) {
            document.getElementById('preview-address').textContent = generateGIZAddress();
        }
    });
    
    // Bottom Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const page = item.dataset.page;
            if (page === 'home') {
                showScreen('main-screen');
            } else if (page === 'swap') {
                if (!currentUser.tonConnected) {
                    showToast('يجب ربط محفظة TON أولاً', 'warning');
                    showModal('ton-connect-modal');
                    return;
                }
                showModal('swap-modal');
            } else if (page === 'wallets') {
                showModal('subwallet-modal');
                document.getElementById('subwallet-form').reset();
            } else if (page === 'settings') {
                showScreen('settings-screen');
            }
        });
    });
    
    // Action Buttons
    document.getElementById('btn-send').addEventListener('click', () => {
        showModal('send-modal');
        document.getElementById('send-form').reset();
    });
    
    document.getElementById('btn-receive').addEventListener('click', () => {
        showModal('receive-modal');
    });
    
    document.getElementById('btn-swap').addEventListener('click', () => {
        if (!currentUser.tonConnected) {
            showToast('يجب ربط محفظة TON أولاً', 'warning');
            showModal('ton-connect-modal');
            return;
        }
        showModal('swap-modal');
    });
    
    document.getElementById('btn-history').addEventListener('click', () => {
        showScreen('history-screen');
        renderAllTransactions('all');
    });
    
    // Close Modals
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            closeAllModals();
        });
    });
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
    
    // Copy Address
    document.getElementById('copy-address').addEventListener('click', () => {
        if (currentUser) copyToClipboard(currentUser.gizAddress);
    });
    
    document.getElementById('copy-receive').addEventListener('click', () => {
        if (currentUser) copyToClipboard(currentUser.gizAddress);
    });
    
    // Toggle Balance
    let balanceVisible = true;
    document.getElementById('toggle-balance').addEventListener('click', () => {
        balanceVisible = !balanceVisible;
        const balanceEl = document.getElementById('total-giz');
        const icon = document.querySelector('#toggle-balance i');
        
        if (balanceVisible) {
            balanceEl.textContent = formatAmount(currentUser.gizBalance);
            icon.className = 'fas fa-eye';
        } else {
            balanceEl.textContent = '****';
            icon.className = 'fas fa-eye-slash';
        }
    });
    
    // Send Form
    document.getElementById('send-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const toAddress = document.getElementById('send-address').value.trim();
        const amount = parseFloat(document.getElementById('send-amount').value);
        const note = document.getElementById('send-note').value;
        
        if (amount <= 0) {
            showToast('المبلغ يجب أن يكون أكبر من صفر', 'error');
            return;
        }
        
        if (amount + TRANSFER_FEE > currentUser.gizBalance) {
            showToast('رصيد غير كافٍ', 'error');
            return;
        }
        
        if (toAddress === currentUser.gizAddress) {
            showToast('لا يمكن الإرسال لنفسك', 'error');
            return;
        }
        
        const recipient = await findUserByAddress(toAddress);
        if (!recipient) {
            showToast('عنوان GIZ غير موجود', 'error');
            return;
        }
        
        currentUser.gizBalance -= (amount + TRANSFER_FEE);
        await updateUser(currentUser);
        
        recipient.gizBalance += amount;
        await updateUser(recipient);
        
        await addTransaction({
            username: currentUser.username,
            type: 'sent',
            fromAddress: currentUser.gizAddress,
            toAddress: toAddress,
            amount: amount,
            fee: TRANSFER_FEE,
            note: note,
            timestamp: Date.now()
        });
        
        await addTransaction({
            username: recipient.username,
            type: 'received',
            fromAddress: currentUser.gizAddress,
            toAddress: toAddress,
            amount: amount,
            fee: 0,
            note: note,
            timestamp: Date.now()
        });
        
        await addTransaction({
            username: currentUser.username,
            type: 'fee',
            fromAddress: currentUser.gizAddress,
            toAddress: OWNER_TON_ADDRESS,
            amount: TRANSFER_FEE,
            fee: 0,
            note: 'رسوم التحويل',
            timestamp: Date.now()
        });
        
        showToast(`تم الإرسال! الرسوم: ${TRANSFER_FEE} GIZ`);
        closeAllModals();
        updateDashboard();
    });
    
    document.getElementById('send-amount').addEventListener('input', (e) => {
        const amount = parseFloat(e.target.value) || 0;
        document.getElementById('send-total').textContent = formatAmount(amount + TRANSFER_FEE) + ' GIZ';
    });
    
    // Swap Direction
    document.querySelectorAll('.swap-dir-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.swap-dir-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const dir = btn.dataset.dir;
            const fromCurrency = document.getElementById('swap-from-currency');
            const toCurrency = document.getElementById('swap-to-currency');
            const rate = document.getElementById('swap-rate');
            
            if (dir === 'ton-to-giz') {
                fromCurrency.textContent = 'TON';
                toCurrency.textContent = 'GIZ';
                rate.textContent = `1 TON = ${TON_TO_GIZ_RATE} GIZ`;
            } else {
                fromCurrency.textContent = 'GIZ';
                toCurrency.textContent = 'TON';
                rate.textContent = `10 GIZ = 1 TON`;
            }
            
            document.getElementById('swap-from-amount').value = '';
            document.getElementById('swap-to-amount').value = '';
        });
    });
    
    document.getElementById('swap-from-amount').addEventListener('input', (e) => {
        const amount = parseFloat(e.target.value) || 0;
        const dir = document.querySelector('.swap-dir-btn.active').dataset.dir;
        let result;
        
        if (dir === 'ton-to-giz') {
            result = amount * TON_TO_GIZ_RATE;
        } else {
            result = amount / GIZ_TO_TON_RATE;
        }
        
        document.getElementById('swap-to-amount').value = formatAmount(result);
    });
    
    document.getElementById('confirm-swap').addEventListener('click', async () => {
        const amount = parseFloat(document.getElementById('swap-from-amount').value);
        const dir = document.querySelector('.swap-dir-btn.active').dataset.dir;
        
        if (!amount || amount <= 0) {
            showToast('أدخل مبلغ صحيح', 'error');
            return;
        }
        
        if (dir === 'ton-to-giz') {
            if (amount > currentUser.tonBalance) {
                showToast('رصيد TON غير كافٍ', 'error');
                return;
            }
            currentUser.tonBalance -= amount;
            currentUser.gizBalance += amount * TON_TO_GIZ_RATE;
        } else {
            if (amount > currentUser.gizBalance) {
                showToast('رصيد GIZ غير كافٍ', 'error');
                return;
            }
            currentUser.gizBalance -= amount;
            currentUser.tonBalance += amount / GIZ_TO_TON_RATE;
        }
        
        await updateUser(currentUser);
        
        await addTransaction({
            username: currentUser.username,
            type: 'swap',
            fromAddress: currentUser.gizAddress,
            toAddress: currentUser.gizAddress,
            amount: amount,
            fee: 0,
            note: dir === 'ton-to-giz' ? 'TON → GIZ' : 'GIZ → TON',
            timestamp: Date.now()
        });
        
        showToast('تم التحويل بنجاح!');
        closeAllModals();
        updateDashboard();
    });
    
    // Sub-wallet Form
    document.getElementById('subwallet-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('subwallet-name').value.trim();
        const color = document.querySelector('.color-btn.active').dataset.color;
        
        try {
            await addSubwallet(currentUser.username, name, color);
            showToast('تم إنشاء المحفظة الفرعية!');
            closeAllModals();
            updateDashboard();
        } catch (error) {
            showToast(error, 'error');
        }
    });
    
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    document.getElementById('add-subwallet').addEventListener('click', () => {
        showModal('subwallet-modal');
        document.getElementById('subwallet-form').reset();
    });
    
    document.getElementById('transfer-subwallet-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fromId = parseInt(document.getElementById('from-subwallet').value);
        const toId = parseInt(document.getElementById('to-subwallet').value);
        const amount = parseFloat(document.getElementById('transfer-subwallet-amount').value);
        
        if (fromId === toId) {
            showToast('لا يمكن التحويل لنفس المحفظة', 'error');
            return;
        }
        
        const subwallets = await getSubwallets(currentUser.username);
        const fromWallet = subwallets.find(sw => sw.id === fromId);
        const toWallet = subwallets.find(sw => sw.id === toId);
        
        if (!fromWallet || !toWallet) {
            showToast('المحفظة غير موجودة', 'error');
            return;
        }
        
        if (amount > fromWallet.balance) {
            showToast('رصيد المحفظة غير كافٍ', 'error');
            return;
        }
        
        fromWallet.balance -= amount;
        toWallet.balance += amount;
        
        await updateSubwallet(fromWallet);
        await updateSubwallet(toWallet);
        
        await addTransaction({
            username: currentUser.username,
            type: 'subwallet_transfer',
            fromAddress: currentUser.gizAddress,
            toAddress: currentUser.gizAddress,
            amount: amount,
            fee: 0,
            note: `${fromWallet.name} → ${toWallet.name}`,
            timestamp: Date.now()
        });
        
        showToast('تم التحويل بين المحافظ!');
        closeAllModals();
        updateDashboard();
    });
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderAllTransactions(btn.dataset.filter);
        });
    });
    
    document.getElementById('back-from-history').addEventListener('click', () => {
        showScreen('main-screen');
    });
    
    document.getElementById('back-from-settings').addEventListener('click', () => {
        showScreen('main-screen');
    });
    
    document.getElementById('view-all-tx').addEventListener('click', () => {
        showScreen('history-screen');
        renderAllTransactions('all');
    });
    
    // Settings Actions
    document.getElementById('change-password').addEventListener('click', () => {
        showToast('قريباً!', 'warning');
    });
    
    document.getElementById('export-data').addEventListener('click', () => {
        exportData();
    });
    
    document.getElementById('import-data').addEventListener('click', () => {
        importData();
    });
    
    document.getElementById('clear-data').addEventListener('click', () => {
        if (confirm('هل أنت متأكد من مسح جميع البيانات؟ لا يمكن التراجع!')) {
            clearAllData();
        }
    });
    
    document.getElementById('logout-btn').addEventListener('click', () => {
        currentUser = null;
        showScreen('auth-screen');
        showToast('تم تسجيل الخروج');
    });
    
    // TON Connect Modal
    document.getElementById('ton-connect-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const tonAddress = document.getElementById('ton-address-input').value.trim();
        
        if (!tonAddress || tonAddress.length < 10) {
            showToast('أدخل عنوان TON صحيح', 'error');
            return;
        }
        
        await connectTONWallet(tonAddress);
        closeAllModals();
    });
}

// ===== Helper Functions =====
async function findUserByAddress(address) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['users'], 'readonly');
        const store = transaction.objectStore('users');
        const index = store.index('gizAddress');
        
        const request = index.get(address);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(null);
    });
}

function exportData() {
    const data = {
        user: currentUser,
        exportDate: new Date().toISOString(),
        version: '1.0.0'
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gizpro-backup-${currentUser.username}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('تم تصدير البيانات!');
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            if (data.user) {
                await updateUser(data.user);
                currentUser = data.user;
                updateDashboard();
                showToast('تم استيراد البيانات بنجاح!');
            }
        } catch (error) {
            showToast('خطأ في استيراد الملف', 'error');
        }
    };
    
    input.click();
}

async function clearAllData() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = () => {
            showToast('تم مسح جميع البيانات');
            location.reload();
        };
        request.onerror = () => showToast('خطأ في مسح البيانات', 'error');
    });
}

// ===== Initialization =====
async function init() {
    try {
        await initDB();
        setupEventListeners();
        
        setTimeout(() => {
            showScreen('auth-screen');
        }, 2500);
        
    } catch (error) {
        console.error('Initialization error:', error);
        showToast('خطأ في تحميل التطبيق', 'error');
    }
}

document.addEventListener('DOMContentLoaded', init);
