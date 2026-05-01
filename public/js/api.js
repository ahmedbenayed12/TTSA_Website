const BASE = '/api';

function getToken() { return localStorage.getItem('ttsa_token'); }
function getRole()  { return localStorage.getItem('ttsa_role'); }
function getName()  { return localStorage.getItem('ttsa_name'); }

function setAuth(token, role, name) {
  localStorage.setItem('ttsa_token', token);
  localStorage.setItem('ttsa_role', role);
  localStorage.setItem('ttsa_name', name);
}

function clearAuth() {
  localStorage.removeItem('ttsa_token');
  localStorage.removeItem('ttsa_role');
  localStorage.removeItem('ttsa_name');
}

function logout() {
  clearAuth();
  window.location.href = '/login.html';
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { ...options, headers });
  if ((res.status === 401 || res.status === 403) && !window.location.pathname.includes('/login.html')) { logout(); return; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function apiUpload(path, formData, method = 'POST') {
  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function requireAuth(allowedRoles) {
  const token = getToken();
  const role = getRole();
  if (!token) { window.location.href = '/login.html'; return false; }
  if (allowedRoles && !allowedRoles.includes(role)) {
    window.location.href = '/login.html'; return false;
  }
  return true;
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  // Allow clicking to dismiss
  t.style.cursor = 'pointer';
  t.onclick = () => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); };
  
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  
  // Success messages disappear after 3.5 seconds
  if (type === 'success') {
    setTimeout(() => { 
      if (document.body.contains(t)) {
        t.classList.remove('show'); 
        setTimeout(() => t.remove(), 400); 
      }
    }, 3500);
  }
  // Error messages stay permanently until the user clicks them
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
