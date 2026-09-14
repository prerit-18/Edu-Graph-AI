/**
 * EduGraph AI - Frontend Application Core
 * Manages Auth state, API integration, and interactive view controllers.
 */

const API_BASE = '/api';

// Auth State Management
const Auth = {
  getToken() {
    return localStorage.getItem('edugraph_token');
  },
  getUser() {
    const raw = localStorage.getItem('edugraph_user');
    return raw ? JSON.parse(raw) : null;
  },
  setAuth(token, user) {
    localStorage.setItem('edugraph_token', token);
    localStorage.setItem('edugraph_user', JSON.stringify(user));
  },
  logout() {
    localStorage.removeItem('edugraph_token');
    localStorage.removeItem('edugraph_user');
    window.location.href = 'login.html';
  },
  isAuthenticated() {
    return !!this.getToken();
  }
};

// Unified API Caller
async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = Auth.getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    throw err;
  }
}

// Render Universal Navigation Header
function renderHeader(activePage = '') {
  const headerContainer = document.getElementById('main-header');
  if (!headerContainer) return;

  const user = Auth.getUser();
  const isLoggedIn = Auth.isAuthenticated() && !!user;
  const isHomePage = activePage === 'home';
  const isLoginPage = activePage === 'login';

  // Only show the app navigation links when user is logged in AND not on home/login page
  const showNavLinks = isLoggedIn && !isHomePage && !isLoginPage;

  const navLinksHtml = showNavLinks ? `
    <ul class="nav-links">
      <li><a href="dashboard.html" class="${activePage === 'dashboard' ? 'active' : ''}">Dashboard</a></li>
      <li><a href="study.html" class="${activePage === 'study' ? 'active' : ''}">Study Studio</a></li>
      <li><a href="recall.html" class="${activePage === 'recall' ? 'active' : ''}">Active Recall</a></li>
      <li><a href="mock.html" class="${activePage === 'mock' ? 'active' : ''}">Mock Tests</a></li>
      <li><a href="flashcards.html" class="${activePage === 'flashcards' ? 'active' : ''}">Flashcards</a></li>
    </ul>
  ` : '';

  const authSectionHtml = isLoggedIn ? `
    <div class="user-pill">
      <span class="streak-badge" id="nav-streak">🔥 1 Day</span>
      <span>👤 ${user.name}</span>
    </div>
    ${isHomePage ? `<a href="dashboard.html" class="btn btn-primary btn-sm">Go to Dashboard →</a>` : ''}
    <button class="btn btn-secondary btn-sm" onclick="Auth.logout()">Log Out</button>
  ` : `
    <button class="btn btn-secondary btn-sm" onclick="quickDemoLogin()">⚡ 1-Click Demo</button>
    <a href="login.html" class="btn btn-secondary btn-sm">Log In</a>
    <a href="login.html?mode=signup" class="btn btn-primary btn-sm">Get Started</a>
  `;

  const navHtml = `
    <header class="header-nav">
      <a href="index.html" class="logo-brand">
        <div class="logo-badge">⚡</div>
        <div class="logo-text">EduGraph <span>AI</span></div>
      </a>

      ${navLinksHtml}

      <div class="nav-auth">
        ${authSectionHtml}
      </div>
    </header>
  `;
  headerContainer.innerHTML = navHtml;

  // Refresh user streak if logged in
  if (user) {
    apiCall('/learner/streak').then(data => {
      const el = document.getElementById('nav-streak');
      if (el && data.streak) {
        el.textContent = `🔥 ${data.streak.currentStreak} Day${data.streak.currentStreak === 1 ? '' : 's'}`;
      }
    }).catch(() => {});
  }
}

// Quick Demo Login Helper
async function quickDemoLogin() {
  try {
    const res = await apiCall('/auth/login', 'POST', {
      email: 'demo_aspirant@edugraph.ai',
      password: 'demopassword123'
    });
    Auth.setAuth(res.token, res.user);
    window.location.href = 'dashboard.html';
  } catch (err) {
    // If not exists, signup demo user
    const res = await apiCall('/auth/signup', 'POST', {
      name: 'GATE CSE Aspirant',
      email: 'demo_aspirant@edugraph.ai',
      password: 'demopassword123'
    });
    Auth.setAuth(res.token, res.user);
    window.location.href = 'dashboard.html';
  }
}

// Format markdown bold and code blocks simply
function formatMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/^### (.*$)/gim, '<h3 style="margin: 0.8rem 0 0.4rem; color: var(--accent-mint); font-size: 1.15rem;">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 style="margin: 1rem 0 0.5rem; color: var(--text-primary); font-size: 1.3rem;">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">$1</code>')
    .replace(/\n/g, '<br/>');
}
