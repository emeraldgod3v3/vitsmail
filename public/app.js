const DOMAIN = 'vitsmail.sryze.cc';
const API_BASE_URL = 'https://vitsmail.sryze.cc';

let currentAddress = null;
let expiryInterval = null;
let pollInterval = null;
let emailsCache = [];
let activityLog = [];
let currentEmailId = null;

function saveSession(address, expiresAt) {
  if (address) {
    localStorage.setItem('vm_addr', address);
    localStorage.setItem('vm_exp', String(expiresAt || 0));
    sessionStorage.setItem('vm_addr', address);
    sessionStorage.setItem('vm_exp', String(expiresAt || 0));
  }
}

function clearSession() {
  localStorage.removeItem('vm_addr');
  localStorage.removeItem('vm_exp');
  sessionStorage.removeItem('vm_addr');
  sessionStorage.removeItem('vm_exp');
}

function getMailboxFromUrl() {
  const path = window.location.pathname;
  const match = path.match(/^\/vitsmail\/mail\/([^/]+)$/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch (e) {
      return match[1];
    }
  }
  return null;
}

function restoreSession() {
  // Priority 1: Get from URL (most reliable for refresh)
  const urlAddr = getMailboxFromUrl();
  if (urlAddr) {
    return urlAddr;
  }
  
  // Priority 2: Check localStorage
  const localAddr = localStorage.getItem('vm_addr');
  const localExp = parseInt(localStorage.getItem('vm_exp') || '0', 10);
  if (localAddr && localExp > Date.now()) {
    return localAddr;
  }
  
  // Priority 3: Check sessionStorage (for tab persistence)
  const sessionAddr = sessionStorage.getItem('vm_addr');
  const sessionExp = parseInt(sessionStorage.getItem('vm_exp') || '0', 10);
  if (sessionAddr && sessionExp > Date.now()) {
    return sessionAddr;
  }
  
  return null;
}

function logActivity(action, details = '') {
  const entry = { timestamp: Date.now(), action, details };
  activityLog.push(entry);
}

function showSection(sectionId) {
  document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
  const section = document.getElementById(sectionId);
  if (section) section.classList.remove('hidden');
}

function showMailboxView() {
  showSection('mailbox-section');
  updateUrl(`/vitsmail/mail/${encodeURIComponent(currentAddress || '')}`);
}

function updateUrl(path) {
  if (window.location.pathname !== path) {
    window.history.pushState({ path }, '', path);
  }
}

async function createMailbox(address) {
  try {
    const response = await fetch(API_BASE_URL + '/api/mailbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address })
    });
    
    if (!response.ok) {
      const err = await response.json();
      showNotification(err.error || 'Failed to create mailbox', 'error');
      return;
    }
    
    const data = await response.json();
    currentAddress = data.address;
    document.getElementById('display-address').textContent = currentAddress;
    saveSession(currentAddress, data.expiresAt);
    showMailboxView();
    startExpiryTimer(data.expiresAt);
    startPolling();
    logActivity('mailbox_created', currentAddress);
  } catch (error) {
    showNotification('Error creating mailbox', 'error');
  }
}

function startExpiryTimer(expiresAt) {
  if (expiryInterval) clearInterval(expiryInterval);
  
  const expiryEl = document.getElementById('expiry-time');
  if (!expiryEl) return;
  expiryEl.dataset.expiresAt = expiresAt;
  
  function update() {
    const remaining = Math.max(0, expiresAt - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    expiryEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    if (remaining <= 0) {
      clearInterval(expiryInterval);
      clearInterval(pollInterval);
      clearSession();
      logActivity('mailbox_expired', currentAddress);
      showExpiryModal();
    }
  }
  
  update();
  expiryInterval = setInterval(update, 1000);
}

function showExpiryModal() {
  const modal = document.getElementById('expiry-modal');
  const summary = document.getElementById('activity-summary');
  if (!modal || !summary) return;
  
  const totalEmails = emailsCache.length;
  const duration = activityLog.length > 0 
    ? Math.round((activityLog[activityLog.length - 1].timestamp - activityLog[0].timestamp) / 60000) 
    : 0;
  
  summary.innerHTML = `
    <div class="summary-item">
      <span class="summary-label">Total emails received:</span>
      <span class="summary-value">${totalEmails}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">Session duration:</span>
      <span class="summary-value">${duration} minutes</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">Email address:</span>
      <span class="summary-value">${currentAddress || 'N/A'}</span>
    </div>
  `;
  
  modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

function generateNewMailbox() {
  closeModal('expiry-modal');
  currentAddress = null;
  emailsCache = [];
  activityLog = [];
  clearSession();
  showSection('create-mailbox');
  updateUrl('/app');
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(fetchEmails, 2000);
  fetchEmails();
}

async function fetchEmails() {
  if (!currentAddress) return;
  
  try {
    const response = await fetch(API_BASE_URL + `/api/mailbox/${encodeURIComponent(currentAddress)}`);
    
    if (response.status === 404) {
      showNotification('Mailbox expired or deleted', 'error');
      clearInterval(expiryInterval);
      clearInterval(pollInterval);
      clearSession();
      currentAddress = null;
      showSection('create-mailbox');
      updateUrl('/app');
      return;
    }
    
    const data = await response.json();
    renderEmails(data.emails);
    saveSession(currentAddress, data.expiresAt);
    
    if (data.expiresAt !== document.getElementById('expiry-time')?.dataset?.expiresAt) {
      startExpiryTimer(data.expiresAt);
    }
  } catch (error) {
    console.error('Error fetching emails:', error);
  }
}

function renderEmails(emails) {
  const container = document.getElementById('emails-list');
  if (!container) return;
  
  const oldCount = emailsCache.length;
  emailsCache = emails;
  
  if (!emails || emails.length === 0) {
    container.innerHTML = '<p class="empty-state">No emails yet. Waiting for incoming mail...</p>';
    return;
  }
  
  if (emails.length > oldCount) {
    const newEmails = emails.slice(oldCount);
    newEmails.forEach(email => {
      showNotification(`New email: ${email.subject}`, 'success');
      logActivity('email_received', email.subject);
    });
  }
  
  container.innerHTML = emails.map((email, index) => `
    <div class="email-item" data-index="${index}">
      <div class="email-item-content">
        <h4>${escapeHtml(email.subject)}</h4>
        <p class="meta">From: ${escapeHtml(email.from)}</p>
        <p class="meta">${formatTime(email.receivedAt)}</p>
      </div>
      <button class="email-view-btn" data-index="${index}" title="View email">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </button>
    </div>
  `).join('');

  container.querySelectorAll('.email-item, .email-view-btn').forEach(el => {
    el.addEventListener('click', (e) => {
      const idx = parseInt(el.dataset.index || el.closest('.email-item').dataset.index, 10);
      openEmailModal(idx);
    });
  });
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return date.toLocaleString();
}

function formatPlainText(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let html = '';
  let inParagraph = false;
  
  for (let line of lines) {
    line = line.trim();
    if (!line) {
      if (inParagraph) {
        html += '</p>';
        inParagraph = false;
      }
      continue;
    }
    if (line.startsWith('>')) {
      html += `<blockquote>${escapeHtml(line.substring(1).trim())}</blockquote>`;
      continue;
    }
    if (line.match(/^[-*•]\s/)) {
      if (!inParagraph) {
        html += '<p>';
        inParagraph = true;
      }
      html += `<li>${escapeHtml(line.substring(2).trim())}</li>`;
      continue;
    }
    if (line.match(/^\d+\.\s/)) {
      if (!inParagraph) {
        html += '<p>';
        inParagraph = true;
      }
      html += `<li>${escapeHtml(line.replace(/^\d+\.\s/, '').trim())}</li>`;
      continue;
    }
    if (line.match(/^https?:\/\//i)) {
      html += `<p><a href="${escapeHtml(line)}" target="_blank" rel="noopener noreferrer">${escapeHtml(line)}</a></p>`;
      continue;
    }
    if (!inParagraph) {
      html += '<p>';
      inParagraph = true;
    }
    html += escapeHtml(line) + '<br>';
  }
  if (inParagraph) html += '</p>';
  return html || text.replace(/\n/g, '<br>');
}

window.openEmailModal = function(index) {
  const email = emailsCache[index];
  if (!email) return;
  
  currentEmailId = email.id;
  logActivity('email_opened', email.subject);
  updateUrl(`/vitsmail/mail/receipt/${email.id}`);
  
  const modal = document.getElementById('email-modal');
  if (!modal) return;
  
  document.getElementById('modal-subject').textContent = email.subject;
  document.getElementById('modal-from').textContent = email.from;
  document.getElementById('modal-time').textContent = new Date(email.receivedAt).toLocaleString();
  
  const bodyEl = document.getElementById('modal-body');
  if (email.html) {
    bodyEl.innerHTML = email.html;
    bodyEl.querySelectorAll('a').forEach(a => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
  } else if (email.text) {
    const formatted = formatPlainText(email.text);
    bodyEl.innerHTML = formatted;
  } else {
    bodyEl.innerHTML = '';
  }
  
  modal.classList.add('active');
};

window.closeEmailModal = function() {
  closeModal('email-modal');
  currentEmailId = null;
  if (currentAddress) {
    updateUrl(`/vitsmail/mail/${encodeURIComponent(currentAddress)}`);
  }
};

function showNotification(message, type = 'info') {
  const notif = document.createElement('div');
  notif.className = `notification notification-${type}`;
  notif.innerHTML = `<span class="notif-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span><span>${message}</span>`;
  document.body.appendChild(notif);
  setTimeout(() => notif.classList.add('show'), 10);
  setTimeout(() => {
    notif.classList.remove('show');
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function restoreMailbox(address) {
  try {
    currentAddress = address;
    emailsCache = [];
    
    // Update display immediately
    const displayEl = document.getElementById('display-address');
    if (displayEl) displayEl.textContent = address;
    
    // Show mailbox section
    showMailboxView();
    
    // Try to load from sessionStorage for immediate timer
    const sessionExp = parseInt(sessionStorage.getItem('vm_exp') || localStorage.getItem('vm_exp') || '0', 10);
    if (sessionExp > Date.now()) {
      startExpiryTimer(sessionExp);
    }
    
    // Call API to validate and sync
    const response = await fetch(API_BASE_URL + `/api/mailbox/${encodeURIComponent(address)}`);
    if (response.status === 404) {
      showNotification('Mailbox expired', 'error');
      clearSession();
      currentAddress = null;
      clearInterval(expiryInterval);
      showSection('create-mailbox');
      updateUrl('/app');
      return;
    }
    const data = await response.json();
    renderEmails(data.emails);
    saveSession(currentAddress, data.expiresAt);
    startExpiryTimer(data.expiresAt);
    startPolling();
  } catch (error) {
    console.error('[vitsmail] Restore error:', error);
    startPolling(); // Try polling anyway
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[vitsmail] App loaded, checking for session...');
  
  document.getElementById('random-btn').addEventListener('click', () => createMailbox(null));
  
  document.getElementById('copy-btn').addEventListener('click', () => {
    if (!currentAddress) return;
    navigator.clipboard.writeText(currentAddress).then(() => {
      showNotification('Copied!', 'success');
    });
  });
  
  document.getElementById('refresh-btn').addEventListener('click', () => {
    if (currentAddress) fetchEmails();
  });
  
  document.getElementById('new-btn').addEventListener('click', () => {
    if (currentAddress) {
      fetch(API_BASE_URL + `/api/mailbox/${encodeURIComponent(currentAddress)}`, { method: 'DELETE' });
    }
    clearInterval(expiryInterval);
    clearInterval(pollInterval);
    clearSession();
    currentAddress = null;
    emailsCache = [];
    activityLog = [];
    showSection('create-mailbox');
    updateUrl('/app');
  });
  
  document.getElementById('delete-btn').addEventListener('click', async () => {
    if (!currentAddress) return;
    try {
      await fetch(API_BASE_URL + `/api/mailbox/${encodeURIComponent(currentAddress)}`, { method: 'DELETE' });
      clearInterval(expiryInterval);
      clearInterval(pollInterval);
      clearSession();
      currentAddress = null;
      emailsCache = [];
      activityLog = [];
      showSection('create-mailbox');
      updateUrl('/app');
      showNotification('Deleted', 'success');
    } catch (e) {
      showNotification('Error deleting', 'error');
    }
  });
  
  const path = window.location.pathname;
  console.log('[vitsmail] Current path:', path);
  
  // Check for saved session in localStorage first (backup)
  const savedAddr = localStorage.getItem('vm_addr');
  const savedExp = parseInt(localStorage.getItem('vm_exp') || '0', 10);
  console.log('[vitsmail] localStorage addr:', savedAddr, 'expiry:', savedExp > Date.now() ? 'valid' : 'expired');
  
  const saved = restoreSession();
  console.log('[vitsmail] restoreSession returned:', saved);
  
  if (saved) {
    console.log('[vitsmail] Restoring mailbox:', saved);
    restoreMailbox(saved);
  } else {
    console.log('[vitsmail] No session, using route handler');
    handleRoute(path);
  }
});

window.addEventListener('popstate', (e) => {
  if (e.state && e.state.path) {
    handleRoute(e.state.path);
  }
});

function handleRoute(path) {
  if (!path || path === '/' || path === '/app') {
    showSection('create-mailbox');
  } else if (path.startsWith('/vitsmail/mail/receipt/')) {
    const emailId = path.split('/').pop();
    const email = emailsCache.find(e => e.id === emailId);
    if (email) {
      const index = emailsCache.indexOf(email);
      openEmailModal(index);
    } else {
      window.location.href = '/app';
    }
  } else if (path.startsWith('/vitsmail/mail/')) {
    const address = decodeURIComponent(path.split('/vitsmail/mail/')[1]);
    if (address && address !== currentAddress) {
      restoreMailbox(address);
    } else {
      showMailboxView();
    }
  } else {
    showSection('create-mailbox');
  }
}