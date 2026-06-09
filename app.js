import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, set, push, update, onValue, query, orderByChild, equalTo, get, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCWbNnlXSibndnckbY71hjRfAYqdmcIRbg",
    authDomain: "dock1-54ff9.firebaseapp.com",
    databaseURL: "https://dock1-54ff9-default-rtdb.firebaseio.com",
    projectId: "dock1-54ff9",
    storageBucket: "dock1-54ff9.firebasestorage.app",
    messagingSenderId: "209734792063",
    appId: "1:209734792063:web:b580b97eb0836955a6e04a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const EMAILJS_SERVICE_ID = "service_f6c9bs4"; 
const EMAILJS_TEMPLATE_ID = "template_5h1vyki"; 

let currentUser = null;
let isAdmin = false;

// === ИНТЕРФЕЙС ===
window.showSection = (id) => {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    if (id === 'news') loadNews();
    if (id === 'dashboard' && currentUser) loadDashboardData();
    if (id === 'admin' && isAdmin) { loadAllRequests(); loadPayments(); }
};

window.toggleAuthModal = () => {
    const m = document.getElementById('auth-modal');
    m.style.display = m.style.display === 'block' ? 'none' : 'block';
};

window.toggleRegisterMode = (isReg) => {
    document.getElementById('login-form').style.display = isReg ? 'none' : 'block';
    document.getElementById('register-form').style.display = isReg ? 'block' : 'none';
    document.getElementById('modal-title').innerText = isReg ? 'Регистрация' : 'Вход';
};

window.switchAdminTab = (tab) => {
    document.getElementById('admin-requests-view').style.display = tab === 'requests' ? 'block' : 'none';
    document.getElementById('admin-payments-view').style.display = tab === 'payments' ? 'block' : 'none';
    document.getElementById('admin-news-view').style.display = tab === 'news' ? 'block' : 'none';
};

// === АВТОРИЗАЦИЯ ===
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    const navAuth = document.getElementById('nav-auth');
    const navDash = document.getElementById('nav-dashboard');
    const navAdmin = document.getElementById('nav-admin');
    const btnLogout = document.getElementById('logout-btn');

    if (user) {
        navAuth.style.display = 'none';
        navDash.style.display = 'block';
        btnLogout.style.display = 'block';

        const userRef = ref(db, 'users/' + user.uid);
        onValue(userRef, (snapshot) => {
            const data = snapshot.val();
            // Проверка на админа (учитываем регистр)
            if (data && data.role && data.role.toLowerCase() === 'admin') {
                isAdmin = true;
                navAdmin.style.display = 'block';
            } else {
                isAdmin = false;
                navAdmin.style.display = 'none';
            }
        });
    } else {
        currentUser = null;
        isAdmin = false;
        navAuth.style.display = 'block';
        navDash.style.display = 'none';
        navAdmin.style.display = 'none';
        btnLogout.style.display = 'none';
        showSection('home');
    }
});

document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value)
        .then(() => toggleAuthModal())
        .catch(err => alert('Ошибка: ' + err.message));
});

document.getElementById('register-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-password').value;
    const apt = document.getElementById('reg-apartment').value;

    createUserWithEmailAndPassword(auth, email, pass)
        .then((cred) => {
            set(ref(db, 'users/' + cred.user.uid), {
                email, apartment: apt, role: 'resident', balance: 0, createdAt: Date.now()
            });
            emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, { to_email: email, user_name: email.split('@')[0] });
            toggleAuthModal();
            alert('Регистрация успешна!');
        })
        .catch(err => alert('Ошибка: ' + err.message));
});

window.resetPassword = async () => {
    const email = prompt("Введите email:");
    if(email) {
        try { await sendPasswordResetEmail(auth, email); alert('Письмо отправлено!'); } 
        catch(e) { alert(e.message); }
    }
};

window.logoutUser = () => signOut(auth).then(() => location.reload());

// === ФИНАНСЫ И ПЛАТЕЖИ ===

// Открыть модалку оплаты
window.openPaymentModal = () => document.getElementById('payment-modal').style.display = 'block';
window.closePaymentModal = () => document.getElementById('payment-modal').style.display = 'none';

// Житель создает запрос на пополнение
window.submitPaymentRequest = async () => {
    const amount = parseFloat(document.getElementById('pay-amount').value);
    if (!amount || amount <= 0) return alert('Введите корректную сумму!');

    const userSnap = await get(ref(db, 'users/' + currentUser.uid));
    const userData = userSnap.val();

    // Создаем запись о платеже со статусом 'pending'
    push(ref(db, 'payments'), {
        userId: currentUser.uid,
        apartment: userData.apartment,
        amount: amount,
        status: 'pending', // pending, approved, rejected
        createdAt: Date.now()
    });

    closePaymentModal();
    alert('Запрос на пополнение отправлен! Ожидайте подтверждения администратора.');
    document.getElementById('pay-amount').value = '';
};

// Загрузка данных в ЛК (Баланс + История)
function loadDashboardData() {
    if(!currentUser) return;

    // 1. Слушаем баланс
    onValue(ref(db, 'users/' + currentUser.uid + '/balance'), (snap) => {
        const bal = snap.val() || 0;
        document.getElementById('user-balance-display').innerText = bal.toFixed(2) + ' ₽';
    });

    // 2. Слушаем историю операций (платежи этого юзера)
    const q = query(ref(db, 'payments'), orderByChild('userId'), equalTo(currentUser.uid));
    onValue(q, (snapshot) => {
        const list = document.getElementById('transactions-list');
        list.innerHTML = '';
        if(!snapshot.exists()) { list.innerHTML = '<li>История пуста</li>'; return; }

        const txs = [];
        snapshot.forEach(c => txs.push({id: c.key, ...c.val()}));
        txs.sort((a,b) => b.createdAt - a.createdAt);

        txs.forEach(tx => {
            const li = document.createElement('li');
            const date = new Date(tx.createdAt).toLocaleDateString();
            let statusHtml = '';
            
            if(tx.status === 'approved') statusHtml = `<span class="tx-plus">+${tx.amount} ₽ (Принято)</span>`;
            else if(tx.status === 'rejected') statusHtml = `<span class="tx-minus">Отклонено</span>`;
            else statusHtml = `<span style="color:orange"> В обработке (${tx.amount} ₽)</span>`;

            li.innerHTML = `<span>${date}</span> ${statusHtml}`;
            list.appendChild(li);
        });
    });
}

// === АДМИНКА: ПЛАТЕЖИ ===

function loadPayments() {
    const tbody = document.querySelector('#payments-table tbody');
    onValue(ref(db, 'payments'), (snapshot) => {
        tbody.innerHTML = '';
        if(!snapshot.exists()) { tbody.innerHTML = '<tr><td colspan="5">Нет запросов</td></tr>'; return; }

        const payments = [];
        snapshot.forEach(c => payments.push({id: c.key, ...c.val()}));
        payments.sort((a,b) => b.createdAt - a.createdAt);

        payments.forEach(p => {
            if(p.status !== 'pending') return; // Показываем только ожидающие

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(p.createdAt).toLocaleString()}</td>
                <td>Кв. ${p.apartment}</td>
                <td><b>${p.amount} ₽</b></td>
                <td style="color:orange">Ожидание</td>
                <td>
                    <button onclick="approvePayment('${p.id}', '${p.userId}', ${p.amount})" style="background:#27ae60; color:white; border:none; padding:5px; cursor:pointer;">✅ Принять</button>
                    <button onclick="rejectPayment('${p.id}')" style="background:#e74c3c; color:white; border:none; padding:5px; cursor:pointer; margin-left:5px;">❌ Отклонить</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    });
}

// Админ принимает платеж (ТРАНЗАКЦИЯ для безопасности баланса)
window.approvePayment = async (payId, userId, amount) => {
    if(!confirm('Подтвердить получение денег и зачислить на баланс?')) return;

    const updates = {};
    updates['payments/' + payId + '/status'] = 'approved';
    
    // Безопасное обновление баланса через транзакцию
    const userBalanceRef = ref(db, 'users/' + userId + '/balance');
    
    try {
        await runTransaction(userBalanceRef, (currentBalance) => {
            return (currentBalance || 0) + amount;
        });
        await update(ref(db), updates);
        alert('Платеж принят! Баланс пользователя обновлен.');
    } catch (e) {
        alert('Ошибка при обновлении баланса: ' + e.message);
    }
};

window.rejectPayment = (id) => {
    if(confirm('Отклонить этот платеж?')) {
        update(ref(db, 'payments/' + id), { status: 'rejected' });
    }
};

// === ЗАЯВКИ (Старый функционал) ===
document.getElementById('request-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!currentUser) return;
    const userSnap = await get(ref(db, 'users/' + currentUser.uid));
    const apt = userSnap.val()?.apartment || '?';
    
    push(ref(db, 'requests'), {
        userId: currentUser.uid, apartment: apt,
        type: document.getElementById('req-type').value,
        description: document.getElementById('req-desc').value,
        status: 'new', createdAt: Date.now()
    });
    alert('Заявка отправлена!');
    document.getElementById('request-form').reset();
});

function loadAllRequests() {
    const tbody = document.querySelector('#all-requests-table tbody');
    onValue(ref(db, 'requests'), (snap) => {
        tbody.innerHTML = '';
        if(!snap.exists()) return;
        const items = []; snap.forEach(c => items.push({id:c.key, ...c.val()}));
        items.sort((a,b) => b.createdAt - a.createdAt);
        
        items.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${r.id.substr(0,5)}</td><td>${r.apartment}</td><td>${r.type}</td><td>${r.description}</td>
                <td style="color:${r.status==='done'?'green':'orange'}">${r.status}</td>
                <td>${r.status!=='done' ? `<button onclick="update(ref(db,'requests/${r.id}'),{status:'done'})">✅</button>` : '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    });
}

function loadNews() {
    const c = document.getElementById('news-container');
    onValue(ref(db, 'news'), (snap) => {
        c.innerHTML = '';
        if(!snap.exists()) { c.innerHTML = 'Нет новостей'; return; }
        const items = []; snap.forEach(x => items.push(x.val()));
        items.sort((a,b) => b.createdAt - a.createdAt);
        items.forEach(n => {
            c.innerHTML += `<div class="card" style="margin-bottom:10px"><h3>${n.title}</h3><p>${n.content}</p></div>`;
        });
    });
}
