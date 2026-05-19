const DOMAIN = 'vitsmail.sryze.cc';
const API_BASE_URL = 'https://vitsmail.sryze.cc';

let currentAddress = null;
let expiryInterval = null;
let pollInterval = null;
let emailsCache = [];

function showSection(sectionId) {
  document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
  document.getElementById(sectionId).classList.remove('hidden');
}

function showMailboxView() {
  showSection('mailbox-section');
}

function showEmailDetail() {
  showSection('email-detail');
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
      alert(err.error || 'Failed to create mailbox');
      return;
    }
    
    const data = await response.json();
    currentAddress = data.address;
    document.getElementById('display-address').textContent = currentAddress;
    showMailboxView();
    startExpiryTimer(data.expiresAt);
    startPolling();
  } catch (error) {
    alert('Error creating mailbox: ' + error.message);
  }
}

function startExpiryTimer(expiresAt) {
  if (expiryInterval) clearInterval(expiryInterval);
  
  const expiryEl = document.getElementById('expiry-time');
  expiryEl.dataset.expiresAt = expiresAt;
  
  function update() {
    const remaining = Math.max(0, expiresAt - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    expiryEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    if (remaining <= 0) {
      alert('Mailbox expired!');
      clearInterval(expiryInterval);
      clearInterval(pollInterval);
      currentAddress = null;
      showSection('create-mailbox');
    }
  }
  
  update();
  expiryInterval = setInterval(update, 1000);
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(fetchEmails, 3000);
  fetchEmails();
}

async function fetchEmails() {
  if (!currentAddress) return;
  
  try {
    const response = await fetch(API_BASE_URL + `/api/mailbox/${encodeURIComponent(currentAddress)}`);
    
    if (response.status === 404) {
      alert('Mailbox expired or deleted');
      clearInterval(expiryInterval);
      clearInterval(pollInterval);
      currentAddress = null;
      showSection('create-mailbox');
      return;
    }
    
    const data = await response.json();
    renderEmails(data.emails);
    
    if (data.expiresAt !== document.getElementById('expiry-time').dataset.expiresAt) {
      startExpiryTimer(data.expiresAt);
    }
  } catch (error) {
    console.error('Error fetching emails:', error);
  }
}

function renderEmails(emails) {
  const container = document.getElementById('emails-list');
  const oldCount = emailsCache.length;
  emailsCache = emails;
  
  if (!emails || emails.length === 0) {
    container.innerHTML = '<p class="empty-state">No emails yet. Waiting for incoming mail...</p>';
    return;
  }
  
  if (emails.length > oldCount) {
    const newEmails = emails.slice(oldCount);
    newEmails.forEach(email => {
      showNotification(`New email: ${email.subject}`);
    });
  }
  
  container.innerHTML = emails.map((email, index) => `
    <div class="email-item" onclick="showEmailByIndex(${index})">
      <h4>${escapeHtml(email.subject)}</h4>
      <p class="meta">From: ${escapeHtml(email.from)}</p>
      <p class="meta">${new Date(email.receivedAt).toLocaleString()}</p>
    </div>
  `).join('');
}

function showNotification(message) {
  const notif = document.createElement('div');
  notif.className = 'notification';
  notif.textContent = message;
  notif.style.cssText = 'position:fixed;top:20px;right:20px;background:#4a9eff;color:#fff;padding:12px 20px;border-radius:8px;z-index:1000;animation:slideIn 0.3s ease;';
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.showEmail = function(email) {
  document.getElementById('email-subject').textContent = email.subject;
  document.getElementById('email-from').textContent = email.from;
  document.getElementById('email-time').textContent = new Date(email.receivedAt).toLocaleString();
  
  const bodyEl = document.getElementById('email-body');
  if (email.html) {
    bodyEl.innerHTML = email.html;
  } else {
    bodyEl.textContent = email.text || '';
  }
  
  showEmailDetail();
};

window.showEmailByIndex = function(index) {
  const email = emailsCache[index];
  if (email) {
    showEmail(email);
  }
};

document.getElementById('random-btn').addEventListener('click', () => createMailbox(null));

document.getElementById('custom-btn').addEventListener('click', () => {
  const username = document.getElementById('custom-username').value.trim();
  if (!username) {
    alert('Please enter a username');
    return;
  }
  const address = `${username}@${DOMAIN}`;
  createMailbox(address);
});

document.getElementById('copy-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(currentAddress).then(() => {
    alert('Email address copied!');
  });
});

document.getElementById('delete-btn').addEventListener('click', async () => {
  if (!currentAddress) return;
  
  try {
    await fetch(API_BASE_URL + `/api/mailbox/${encodeURIComponent(currentAddress)}`, { method: 'DELETE' });
    clearInterval(expiryInterval);
    clearInterval(pollInterval);
    currentAddress = null;
    showSection('create-mailbox');
  } catch (error) {
    alert('Error deleting mailbox: ' + error.message);
  }
});

document.getElementById('back-btn').addEventListener('click', showMailboxView);