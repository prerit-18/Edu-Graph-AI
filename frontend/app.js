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
      <span class="streak-badge" id="nav-streak">${user.name ? 'Active' : ''}</span>
      <span>${user.name || 'Student'}</span>
    </div>
    ${isHomePage ? `<a href="dashboard.html" class="btn btn-primary btn-sm">Dashboard</a>` : ''}
    <button class="btn btn-secondary btn-sm" onclick="Auth.logout()">Log Out</button>
  ` : `
    <button class="btn btn-secondary btn-sm" onclick="quickDemoLogin()">Demo Login</button>
    <a href="login.html" class="btn btn-secondary btn-sm">Log In</a>
    <a href="login.html?mode=signup" class="btn btn-primary btn-sm">Sign Up</a>
  `;

  const navHtml = `
    <header class="header-nav">
      <a href="index.html" class="logo-brand">
        <div class="logo-badge">E</div>
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
        el.textContent = `${data.streak.currentStreak} Day${data.streak.currentStreak === 1 ? '' : 's'} Streak`;
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

// Format markdown headings, lists, tables, callouts, bold, and code blocks
function formatInlineMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>');
}

function formatMarkdown(text) {
  if (!text) return '';

  // 1. Extract and preserve code blocks
  const codeBlocks = [];
  let processed = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const id = `___CODE_BLOCK_${codeBlocks.length}___`;
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    codeBlocks.push(`<pre class="code-block" data-lang="${lang || 'text'}"><code>${escapedCode.trim()}</code></pre>`);
    return id;
  });

  // 2. Extract and format tables
  processed = processed.replace(/((?:\|[^\n]+\|\n?)+)/g, (match) => {
    const rawLines = match.trim().split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
    if (rawLines.length < 2) return match;

    const isDelimiter = /^\|[\s\-:|]+\|$/.test(rawLines[1]);
    if (!isDelimiter) return match;

    const headers = rawLines[0].split('|').slice(1, -1).map(h => h.trim());
    const rows = rawLines.slice(2).map(line => line.split('|').slice(1, -1).map(c => c.trim()));

    let tableHtml = '<div class="table-responsive"><table class="markdown-table"><thead><tr>';
    headers.forEach(h => {
      tableHtml += `<th>${formatInlineMarkdown(h)}</th>`;
    });
    tableHtml += '</tr></thead><tbody>';

    rows.forEach(row => {
      if (row.length > 0 && row.some(cell => cell.length > 0)) {
        tableHtml += '<tr>';
        row.forEach(cell => {
          tableHtml += `<td>${formatInlineMarkdown(cell || '')}</td>`;
        });
        tableHtml += '</tr>';
      }
    });
    tableHtml += '</tbody></table></div>';
    return tableHtml;
  });

  // 3. Process line-by-line elements: Headings, Callouts, Lists, Dividers
  const lines = processed.split('\n');
  const resultLines = [];
  let inUl = false;
  let inOl = false;
  let inBlockquote = false;
  let blockquoteContent = [];

  const flushBlockquote = () => {
    if (inBlockquote) {
      const bqText = blockquoteContent.join('<br/>');
      let calloutClass = 'callout-default';
      if (bqText.includes('⚠️') || bqText.toLowerCase().includes('trap') || bqText.toLowerCase().includes('warning') || bqText.toLowerCase().includes('pitfall')) {
        calloutClass = 'callout-warning';
      } else if (bqText.includes('🎯') || bqText.toLowerCase().includes('gate') || bqText.toLowerCase().includes('exam') || bqText.toLowerCase().includes('target')) {
        calloutClass = 'callout-exam';
      } else if (bqText.includes('⚡') || bqText.includes('💡') || bqText.toLowerCase().includes('pro-tip') || bqText.toLowerCase().includes('formula') || bqText.toLowerCase().includes('insight')) {
        calloutClass = 'callout-tip';
      }
      resultLines.push(`<div class="markdown-callout ${calloutClass}"><div class="callout-content">${bqText}</div></div>`);
      blockquoteContent = [];
      inBlockquote = false;
    }
  };

  const flushLists = () => {
    if (inUl) {
      resultLines.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      resultLines.push('</ol>');
      inOl = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check code block placeholder or table
    if (trimmed.startsWith('___CODE_BLOCK_') || trimmed.startsWith('<div class="table-responsive">')) {
      flushBlockquote();
      flushLists();
      resultLines.push(line);
      continue;
    }

    // Horizontal Rule
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushBlockquote();
      flushLists();
      resultLines.push('<hr class="markdown-divider"/>');
      continue;
    }

    // Blockquote / Callout
    if (trimmed.startsWith('>')) {
      flushLists();
      inBlockquote = true;
      const cleanQuote = trimmed.replace(/^>\s?/, '');
      blockquoteContent.push(formatInlineMarkdown(cleanQuote));
      continue;
    } else {
      flushBlockquote();
    }

    // Headings
    if (trimmed.startsWith('#### ')) {
      flushLists();
      resultLines.push(`<h4 class="md-h4">${formatInlineMarkdown(trimmed.substring(5))}</h4>`);
      continue;
    }
    if (trimmed.startsWith('### ')) {
      flushLists();
      resultLines.push(`<h3 class="md-h3">${formatInlineMarkdown(trimmed.substring(4))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushLists();
      resultLines.push(`<h2 class="md-h2">${formatInlineMarkdown(trimmed.substring(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      flushLists();
      resultLines.push(`<h1 class="md-h1">${formatInlineMarkdown(trimmed.substring(2))}</h1>`);
      continue;
    }

    // Unordered list: - item or * item
    if (/^[-*•]\s+(.*)$/.test(trimmed)) {
      if (inOl) { resultLines.push('</ol>'); inOl = false; }
      if (!inUl) { resultLines.push('<ul class="markdown-list">'); inUl = true; }
      const match = trimmed.match(/^[-*•]\s+(.*)$/);
      resultLines.push(`<li>${formatInlineMarkdown(match[1])}</li>`);
      continue;
    }

    // Ordered list: 1. item
    if (/^\d+\.\s+(.*)$/.test(trimmed)) {
      if (inUl) { resultLines.push('</ul>'); inUl = false; }
      if (!inOl) { resultLines.push('<ol class="markdown-list ordered">'); inOl = true; }
      const match = trimmed.match(/^\d+\.\s+(.*)$/);
      resultLines.push(`<li>${formatInlineMarkdown(match[1])}</li>`);
      continue;
    }

    // End of list if blank line or regular text
    flushLists();

    if (trimmed === '') {
      resultLines.push('<div class="md-spacer"></div>');
    } else {
      resultLines.push(`<p class="md-paragraph">${formatInlineMarkdown(trimmed)}</p>`);
    }
  }

  flushBlockquote();
  flushLists();

  let finalHtml = resultLines.join('\n');

  // Restore code blocks
  codeBlocks.forEach((cb, idx) => {
    finalHtml = finalHtml.replace(`___CODE_BLOCK_${idx}___`, cb);
  });

  return finalHtml;
}
