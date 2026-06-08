// Импорты Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, set, push, update, onValue, query, orderByChild, equalTo, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// --- КОНФИГУРАЦИЯ FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyCWbNnlXSibndnckbY71hjRfAYqdmcIRbg",
    authDomain: "dock1-54ff9.firebaseapp.com",
    databaseURL: "https://dock1-54ff9-default-rtdb.firebaseio.com",
    projectId: "dock1-54ff9",
    storageBucket: "dock1-54ff9.firebasestorage.app",
    messagingSenderId: "209734792063",
    appId: "1:209734792063:web:b580b97eb0836955a6e04a"
};

// Инициализация
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// --- КОНФИГУРАЦИЯ EMAILJS (ТВОИ ДАННЫЕ) ---
const EMAILJS_SERVICE_ID = "service_f6c9bs4"; 
const EMAILJS_TEMPLATE_ID = "template_5h1vyki"; 

// --- Глобальные переменные ---
let currentUser = null;
let isAdmin = false;

// === ФУНКЦИИ ИНТЕРФЕЙСА ===

window.showSection = (id) => {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    
    if (id === 'news') loadNews();
    if (id === 'dashboard' && currentUser) loadUserRequests();
    if (id === 'admin' && isAdmin) loadAllRequests();
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
    document.getElementById('admin-news-view').style.display = tab === 'news' ? 'block' : 'none';
};

// === АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ ===

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

        // Проверка роли админа
        const userRef = ref(db, 'users/' + user.uid);
        onValue(userRef, (snapshot) => {
            const data = snapshot.val();
            if (data && data.role === 'admin') {
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

// Вход
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    signInWithEmailAndPassword(auth, email, pass)
        .then(() => { toggleAuthModal(); alert('Добро пожаловать!'); })
        .catch(err => alert('Ошибка входа: ' + err.message));
});

// Регистрация + Отправка письма через EmailJS
document.getElementById('register-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-password').value;
    const apt = document.getElementById('reg-apartment').value;

    createUserWithEmailAndPassword(auth, email, pass)
        .then((cred) => {
            // 1. Сохраняем данные в БД
            set(ref(db, 'users/' + cred.user.uid), {
                email: email,
                apartment: apt,
                role: 'resident',
                createdAt: Date.now()
            });

            // 2. ОТПРАВЛЯЕМ ПИСЬМО ЧЕРЕЗ EMAILJS
            const templateParams = {
                to_email: email,
                user_name: email.split('@')[0] // Берем имя до собачки
            };

            emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
                .then(() => console.log('✅ Письмо Welcome отправлено!'))
                .catch((err) => console.error('❌ Ошибка EmailJS:', err));

            toggleAuthModal();
            alert(' Регистрация успешна! Проверьте почту.');
        })
        .catch(err => alert('Ошибка регистрации: ' + err.message));
});

// Восстановление пароля (Firebase)
window.resetPassword = async () => {
    const email = prompt("Введите ваш email для сброса пароля:");
    if (!email) return;
    
    try {
        await sendPasswordResetEmail(auth, email);
        alert(`✅ Ссылка для сброса пароля отправлена на ${email}!\nПроверьте папку "Входящие" или "Спам".`);
    } catch (error) {
        alert("❌ Ошибка: " + error.message);
    }
};

window.logoutUser = () => {
    signOut(auth).then(() => location.reload());
};

// === ЛОГИКА ЖИТЕЛЯ ===

// Подать заявку
document.getElementById('request-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    // Получаем номер квартиры
    const userSnap = await get(ref(db, 'users/' + currentUser.uid));
    const userData = userSnap.val();
    const apt = userData ? userData.apartment : 'Unknown';

    push(ref(db, 'requests'), {
        userId: currentUser.uid,
        apartment: apt,
        type: document.getElementById('req-type').value,
        description: document.getElementById('req-desc').value,
        status: 'new',
        createdAt: Date.now()
    });

    alert('Заявка успешно отправлена диспетчеру!');
    document.getElementById('request-form').reset();
    loadUserRequests();
});

// Загрузить мои заявки
function loadUserRequests() {
    if (!currentUser) return;
    const list = document.getElementById('user-requests-list');
    list.innerHTML = 'Загрузка...';

    const q = query(ref(db, 'requests'), orderByChild('userId'), equalTo(currentUser.uid));
    onValue(q, (snapshot) => {
        list.innerHTML = '';
        if (!snapshot.exists()) { list.innerHTML = '<li>У вас пока нет заявок.</li>'; return; }
        
        const items = [];
        snapshot.forEach(c => items.push({id: c.key, ...c.val()}));
        items.sort((a,b) => b.createdAt - a.createdAt);

        items.forEach(req => {
            const li = document.createElement('li');
            li.style.listStyle = 'none';
            li.style.borderBottom = '1px solid #eee';
            li.style.padding = '10px 0';
            
            let statusColor = 'orange';
            let statusText = 'Новая';
            if(req.status === 'done') { statusColor = 'green'; statusText = 'Выполнено'; }
            if(req.status === 'in_progress') { statusColor = 'blue'; statusText = 'В работе'; }

            li.innerHTML = `<b>${new Date(req.createdAt).toLocaleDateString()}</b>: ${req.type} <br> <small>${req.description}</small> <br> <span style="color:${statusColor}; font-weight:bold">${statusText}</span>`;
            list.appendChild(li);
        });
    });
}

// === ЛОГИКА АДМИНА ===

function loadAllRequests() {
    const tbody = document.querySelector('#all-requests-table tbody');
    onValue(ref(db, 'requests'), (snapshot) => {
        tbody.innerHTML = '';
        if (!snapshot.exists()) { tbody.innerHTML = '<tr><td colspan="6">Заявок пока нет</td></tr>'; return; }

        const items = [];
        snapshot.forEach(c => items.push({id: c.key, ...c.val()}));
        items.sort((a,b) => b.createdAt - a.createdAt);

        items.forEach(req => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${req.id.substr(0,5)}...</td>
                <td>Кв. ${req.apartment}</td>
                <td>${req.type}</td>
                <td>${req.description}</td>
                <td style="color:${req.status==='done'?'green':'orange'}">${req.status}</td>
                <td>${req.status !== 'done' ? `<button onclick="completeReq('${req.id}')">✅ Выполнить</button>` : '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    });
}

// Выполнить заявку
window.completeReq = (id) => {
    if(confirm('Отметить заявку как выполненную?')) {
        update(ref(db, 'requests/' + id), { status: 'done' });
    }
};

// Добавить новость
document.getElementById('news-form').addEventListener('submit', (e) => {
    e.preventDefault();
    push(ref(db, 'news'), {
        title: document.getElementById('news-title').value,
        content: document.getElementById('news-content').value,
        createdAt: Date.now()
    });
    alert('Новость опубликована!');
    document.getElementById('news-form').reset();
});

// Загрузить новости
function loadNews() {
    const container = document.getElementById('news-container');
    onValue(ref(db, 'news'), (snapshot) => {
        container.innerHTML = '';
        if (!snapshot.exists()) { container.innerHTML = 'Новостей пока нет.'; return; }
        
        const items = [];
        snapshot.forEach(c => items.push(c.val()));
        items.sort((a,b) => b.createdAt - a.createdAt);

        items.forEach(n => {
            const div = document.createElement('div');
            div.className = 'card';
            div.style.marginBottom = '20px';
            div.innerHTML = `<h3>${n.title}</h3><small style="color:#777">${new Date(n.createdAt).toLocaleDateString()}</small><p style="margin-top:10px">${n.content}</p>`;
            container.appendChild(div);
        });
    });
}
