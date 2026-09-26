/**
 * PsyAI — User Profile & Sessions Dashboard Controller
 */

const STORAGE_KEYS = {
  TOKEN: 'psyai_token',
  USER: 'psyai_user',
  LEGACY_TOKEN: 'token',
  LEGACY_USER: 'user',
};

function getToken() {
  try {
    return localStorage.getItem(STORAGE_KEYS.TOKEN) || localStorage.getItem(STORAGE_KEYS.LEGACY_TOKEN);
  } catch (e) {
    return null;
  }
}

function setToken(token) {
  try {
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.LEGACY_TOKEN, token);
  } catch (e) {}
}

function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.LEGACY_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.LEGACY_USER);
  } catch (e) {}
}

// Global state
let currentUser = null;
let userBookings = [];
let pendingNewPhone = '';
let activeFilter = 'all';

// Toast Notification Helper
function showToast(message, isError = false) {
  const toast = document.getElementById('profileToast');
  const icon = document.getElementById('toastIcon');
  const msg = document.getElementById('toastMsg');
  if (!toast) return;

  if (isError) {
    toast.classList.add('error');
    if (icon) icon.textContent = '✕';
  } else {
    toast.classList.remove('error');
    if (icon) icon.textContent = '✓';
  }

  if (msg) msg.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// API Fetch Helper
async function apiRequest(endpoint, method = 'GET', body = null) {
  const token = getToken();
  if (!token) {
    window.location.href = 'login.html?redirect=profile';
    return null;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(endpoint, options);
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 || res.status === 403) {
    if (data.message && data.message.includes('غير صالح')) {
      clearSession();
      window.location.href = 'login.html?redirect=profile';
      return null;
    }
  }

  return { ok: res.ok, status: res.status, data };
}

// Tab Switching
window.switchProfTab = function(tabName) {
  document.querySelectorAll('.prof-tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

  if (tabName === 'profile') {
    document.getElementById('tabBtnProfile')?.classList.add('active');
    document.getElementById('panelProfile')?.classList.add('active');
  } else if (tabName === 'sessions') {
    document.getElementById('tabBtnSessions')?.classList.add('active');
    document.getElementById('panelSessions')?.classList.add('active');
  } else if (tabName === 'security') {
    document.getElementById('tabBtnSecurity')?.classList.add('active');
    document.getElementById('panelSecurity')?.classList.add('active');
  }
};

// Toggle Password Visibility
window.toggleInputPass = function(inputId) {
  const el = document.getElementById(inputId);
  if (el) {
    el.type = el.type === 'password' ? 'text' : 'password';
  }
};

// Filter Sessions
window.filterSessions = function(filter) {
  activeFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.getAttribute('data-filter') === filter);
  });
  renderSessionsList();
};

// Render Sessions
function renderSessionsList() {
  const container = document.getElementById('sessionsList');
  if (!container) return;

  let filtered = userBookings;
  if (activeFilter === 'upcoming') {
    filtered = userBookings.filter(b => b.status === 'confirmed' || b.status === 'pending');
  } else if (activeFilter === 'pending') {
    filtered = userBookings.filter(b => b.status === 'pending');
  } else if (activeFilter === 'completed') {
    filtered = userBookings.filter(b => b.status === 'completed');
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div style="font-size:2.5rem; margin-bottom:0.8rem;">🗓️</div>
        <h3 style="color:#fff; margin-bottom:0.4rem;">لا توجد جلسات في هذا القسم</h3>
        <p style="margin-bottom:1.2rem;">يمكنك حجز موعد استشارة نفسية جديدة بكل خصوصية وسهولة.</p>
        <a href="specialists.html" class="btn-gold" style="display:inline-flex;">استعراض الأخصائيين المعتمدين</a>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(b => {
    const spec = b.specialist || {};
    const isConfirmed = b.status === 'confirmed';
    const statusText = {
      confirmed: 'مؤكدة وجاهزة',
      pending: 'بانتظار التأكيد',
      completed: 'مكتملة',
      cancelled: 'ملغاة'
    }[b.status] || b.status;

    const link = b.sessionLink || `/session.html?id=${b.id}`;

    return `
      <div class="session-card ${isConfirmed ? 'is-confirmed' : ''}">
        <div class="session-card-left">
          <img src="${spec.avatar || 'psyai.png'}" alt="${spec.name || 'الأخصائي'}" class="spec-avatar-thumb" />
          <div class="session-meta">
            <h3>${spec.name || 'أخصائي معتمد'}</h3>
            <p class="spec-title-tag">${spec.title || 'أخصائي نفسي مرخص'}</p>
            <div class="session-timing-tags">
              <span class="tag-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                <span>${b.sessionTime || 'موعد الجلسة'}</span>
              </span>
              <span class="tag-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>
                <span>جلسة فيديو (45 دقيقة)</span>
              </span>
              <span class="tag-item" style="color:var(--gold-light);">
                <strong>${spec.price || '50'} د.أ</strong>
              </span>
            </div>
          </div>
        </div>

        <div class="session-card-right">
          <span class="status-pill ${b.status}">${statusText}</span>
          ${isConfirmed ? `
            <a href="${link}" class="btn-join-session" target="_blank">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
              <span>انضم للجلسة (رابط الفيديو)</span>
            </a>
          ` : b.status === 'pending' ? `
            <a href="${link}" class="btn-gold" style="font-size:0.84rem; padding:0.55rem 1.2rem;">
              <span>تأكيد الموعد والجلسة</span>
            </a>
          ` : `
            <span style="font-size:0.8rem; color:var(--text-muted);">جلسة رقم #${b.id.slice(0, 8)}</span>
          `}
        </div>
      </div>
    `;
  }).join('');
}

// Load Profile and Bookings
async function loadUserData() {
  const res = await apiRequest('/api/user/profile');
  if (!res || !res.ok || !res.data) return;

  currentUser = res.data.user || res.data;
  userBookings = currentUser.bookings || [];

  // Populate Hero
  const fullName = `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || 'مستخدم PsyAI';
  document.getElementById('uFullName').textContent = fullName;
  document.getElementById('uEmailText').textContent = currentUser.email || '';
  document.getElementById('uPhoneText').textContent = currentUser.phone || '';
  document.getElementById('currentPhoneDisplay').textContent = currentUser.phone || 'غير مسجل';

  const initials = (currentUser.firstName?.[0] || 'P').toUpperCase();
  const avatarLetters = document.getElementById('uAvatarLetters');
  if (avatarLetters) avatarLetters.textContent = initials;

  // Populate Form
  const fName = document.getElementById('pFirstName');
  const lName = document.getElementById('pLastName');
  const email = document.getElementById('pEmail');
  const condition = document.getElementById('pCondition');
  if (fName) fName.value = currentUser.firstName || '';
  if (lName) lName.value = currentUser.lastName || '';
  if (email) email.value = currentUser.email || '';
  if (condition && currentUser.condition) condition.value = currentUser.condition;

  if (currentUser.specGenderPref) {
    const radio = document.querySelector(`input[name="pSpecGender"][value="${currentUser.specGenderPref}"]`);
    if (radio) radio.checked = true;
  }

  // Load all user bookings
  loadBookingsData();
}

async function loadBookingsData() {
  const res = await apiRequest('/api/bookings/my');
  if (res && res.ok && res.data && res.data.bookings) {
    userBookings = res.data.bookings;
  }

  // Counters
  const total = userBookings.length;
  const upcoming = userBookings.filter(b => b.status === 'confirmed' || b.status === 'pending').length;
  const pending = userBookings.filter(b => b.status === 'pending').length;
  const completed = userBookings.filter(b => b.status === 'completed').length;

  document.getElementById('uTotalSessions').textContent = total;
  document.getElementById('uUpcomingSessions').textContent = upcoming;
  document.getElementById('sessionsCountBadge').textContent = total;

  document.getElementById('countAll').textContent = total;
  document.getElementById('countUpcoming').textContent = upcoming;
  document.getElementById('countPending').textContent = pending;
  document.getElementById('countCompleted').textContent = completed;

  renderSessionsList();
}

// Phone Change Modals & Logic
window.openChangePhoneModal = function() {
  document.getElementById('phoneStep1').style.display = 'block';
  document.getElementById('phoneStep2').style.display = 'none';
  document.getElementById('newPhoneInput').value = '';
  document.getElementById('phoneModal')?.classList.add('open');
};

window.closePhoneModal = function() {
  document.getElementById('phoneModal')?.classList.remove('open');
};

window.backToPhoneStep1 = function() {
  document.getElementById('phoneStep1').style.display = 'block';
  document.getElementById('phoneStep2').style.display = 'none';
};

window.autoFillPhoneOtp = function() {
  const code = document.getElementById('phoneDevOtpCode')?.textContent || '123456';
  for (let i = 1; i <= 6; i++) {
    const box = document.getElementById(`pDigit${i}`);
    if (box) box.value = code[i - 1] || '';
  }
};

// Delete Account Modal
window.openDeleteAccountModal = function() {
  document.getElementById('deletePassInput').value = '';
  document.getElementById('deleteModal')?.classList.add('open');
};

window.closeDeleteModal = function() {
  document.getElementById('deleteModal')?.classList.remove('open');
};

// Logout
window.handleLogout = function() {
  if (confirm('هل أنت متأكد من رغبتك في تسجيل الخروج؟')) {
    clearSession();
    window.location.href = 'login.html';
  }
};

// Event Wireup
function wireEvents() {
  // Save Profile Form
  document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveProfileBtn');
    btn.disabled = true;

    const firstName = document.getElementById('pFirstName')?.value;
    const lastName = document.getElementById('pLastName')?.value;
    const email = document.getElementById('pEmail')?.value;
    const condition = document.getElementById('pCondition')?.value || null;
    const specGenderPref = document.querySelector('input[name="pSpecGender"]:checked')?.value || 'any';

    const res = await apiRequest('/api/user/profile', 'PUT', {
      firstName,
      lastName,
      email,
      condition,
      specGenderPref
    });

    btn.disabled = false;
    if (res && res.ok) {
      showToast('تم حفظ التعديلات بنجاح!');
      loadUserData();
    } else {
      showToast(res?.data?.message || 'تعذر حفظ التعديلات', true);
    }
  });

  // Send Phone OTP Form
  document.getElementById('sendPhoneOtpForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = document.getElementById('newPhoneInput')?.value.trim();
    if (!phone) return;

    const btn = document.getElementById('btnSendPhoneOtp');
    btn.disabled = true;

    const res = await apiRequest('/api/user/send-phone-otp', 'POST', { phone });
    btn.disabled = false;

    if (res && res.ok) {
      pendingNewPhone = phone;
      document.getElementById('targetPhoneLabel').textContent = phone;
      if (res.data.devCode) {
        document.getElementById('phoneDevOtpBadge').style.display = 'block';
        document.getElementById('phoneDevOtpCode').textContent = res.data.devCode;
      }
      document.getElementById('phoneStep1').style.display = 'none';
      document.getElementById('phoneStep2').style.display = 'block';

      // Focus first digit
      setupOtpInputListeners();
      document.getElementById('pDigit1')?.focus();
    } else {
      showToast(res?.data?.message || 'فشل إرسال رمز التحقق', true);
    }
  });

  // Verify Phone OTP Form
  document.getElementById('verifyPhoneOtpForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    let otpCode = '';
    for (let i = 1; i <= 6; i++) {
      otpCode += document.getElementById(`pDigit${i}`)?.value || '';
    }

    if (otpCode.length !== 6) {
      showToast('يرجى إدخال رمز التحقق المكون من 6 أرقام', true);
      return;
    }

    const btn = document.getElementById('btnConfirmPhoneOtp');
    btn.disabled = true;

    const res = await apiRequest('/api/user/update-phone', 'POST', {
      newPhone: pendingNewPhone,
      otpCode
    });

    btn.disabled = false;
    if (res && res.ok) {
      showToast('تم تحديث رقم الهاتف بنجاح!');
      window.closePhoneModal();
      loadUserData();
    } else {
      showToast(res?.data?.message || 'رمز التحقق غير صحيح', true);
    }
  });

  // Change Password Form
  document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const curr = document.getElementById('currPass')?.value;
    const next = document.getElementById('newPass')?.value;
    const confirm = document.getElementById('confirmNewPass')?.value;

    if (next !== confirm) {
      showToast('كلمة المرور الجديدة غير متطابقة', true);
      return;
    }

    const btn = document.getElementById('changePassBtn');
    btn.disabled = true;

    const res = await apiRequest('/api/user/change-password', 'PUT', {
      currentPassword: curr,
      newPassword: next
    });

    btn.disabled = false;
    if (res && res.ok) {
      if (res.data.token) setToken(res.data.token);
      showToast('تم تغيير كلمة المرور بنجاح!');
      document.getElementById('changePasswordForm').reset();
    } else {
      showToast(res?.data?.message || 'فشل تغيير كلمة المرور', true);
    }
  });

  // Delete Account Form
  document.getElementById('deleteAccountForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('deletePassInput')?.value;
    if (!password) return;

    const btn = document.getElementById('btnConfirmDelete');
    btn.disabled = true;

    const res = await apiRequest('/api/user/account', 'DELETE', { password });
    btn.disabled = false;

    if (res && res.ok) {
      alert('تم حذف الحساب بنجاح.');
      clearSession();
      window.location.href = 'index.html';
    } else {
      showToast(res?.data?.message || 'تعذر حذف الحساب', true);
    }
  });

  // Topbar logout
  document.getElementById('topLogoutBtn')?.addEventListener('click', window.handleLogout);
}

// 6-digit OTP box auto-tabbing
function setupOtpInputListeners() {
  for (let i = 1; i <= 6; i++) {
    const box = document.getElementById(`pDigit${i}`);
    if (!box) continue;

    box.addEventListener('input', (e) => {
      if (box.value.length === 1 && i < 6) {
        document.getElementById(`pDigit${i + 1}`)?.focus();
      }
    });

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 1) {
        document.getElementById(`pDigit${i - 1}`)?.focus();
      }
    });
  }
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  wireEvents();
  loadUserData();
});
