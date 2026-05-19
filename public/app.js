const DOMAIN = 'vitsmail.sryze.cc';
const API_BASE_URL = 'https://vitsmail.sryze.cc';

let currentAddress = null;
let expiryInterval = null;
let pollInterval = null;
let emailsCache = [];
let activityLog = [];
let currentEmailId = null;

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
  showSection('create-mailbox');
  updateUrl('/');
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
      currentAddress = null;
      showSection('create-mailbox');
      updateUrl('/');
      return;
    }
    
    const data = await response.json();
    renderEmails(data.emails);
    
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
    <div class="email-item" onclick="openEmailModal(${index})">
      <div class="email-item-content">
        <h4>${escapeHtml(email.subject)}</h4>
        <p class="meta">From: ${escapeHtml(email.from)}</p>
        <p class="meta">${formatTime(email.receivedAt)}</p>
      </div>
      <span class="email-arrow">›</span>
    </div>
  `).join('');
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return date.toLocaleString();
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
  } else {
    bodyEl.innerHTML = email.text ? email.text.replace(/\n/g, '<br>') : '';
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

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('random-btn').addEventListener('click', () => createMailbox(null));
  
  document.getElementById('custom-btn').addEventListener('click', () => {
    const username = document.getElementById('custom-username').value.trim();
    if (!username) {
      showNotification('Please enter a username', 'error');
      return;
    }
    createMailbox(`${username}@${DOMAIN}`);
  });
  
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
    currentAddress = null;
    emailsCache = [];
    activityLog = [];
    showSection('create-mailbox');
    updateUrl('/');
  });
  
  document.getElementById('delete-btn').addEventListener('click', async () => {
    if (!currentAddress) return;
    try {
      await fetch(API_BASE_URL + `/api/mailbox/${encodeURIComponent(currentAddress)}`, { method: 'DELETE' });
      clearInterval(expiryInterval);
      clearInterval(pollInterval);
      currentAddress = null;
      emailsCache = [];
      activityLog = [];
      showSection('create-mailbox');
      updateUrl('/');
      showNotification('Deleted', 'success');
    } catch (e) {
      showNotification('Error deleting', 'error');
    }
  });
  
  handleRoute(window.location.pathname);
});

window.addEventListener('popstate', (e) => {
  if (e.state && e.state.path) {
    handleRoute(e.state.path);
  }
});

function handleRoute(path) {
  if (!path || path === '/') {
    showSection('create-mailbox');
  } else if (path.startsWith('/vitsmail/mail/receipt/')) {
    const emailId = path.split('/').pop();
    const email = emailsCache.find(e => e.id === emailId);
    if (email) {
      const index = emailsCache.indexOf(email);
      openEmailModal(index);
    } else {
      showMailboxView();
    }
  } else if (path.startsWith('/vitsmail/mail/')) {
    const address = decodeURIComponent(path.split('/vitsmail/mail/')[1]);
    if (address && address !== currentAddress) {
      currentAddress = address;
      document.getElementById('display-address').textContent = address;
      showMailboxView();
      startPolling();
    } else {
      showMailboxView();
    }
  } else {
    showSection('create-mailbox');
  }
}