const verifyCopy = {
  zh: {
    pageTitle: '邮箱验证 · 寰宇志',
    back: '返回注册',
    title: '邮箱验证',
    verificationCode: '验证码',
    submit: '验证邮箱',
    note: '请输入发送到 {email} 的验证码。',
    fallbackEmail: '你的邮箱',
    codePlaceholder: '输入 6 位验证码',
    codeRequired: '请输入 6 位验证码。',
    missingEmail: '未找到待验证邮箱，请返回注册页重新提交。',
    missingRegistration: '未找到注册资料，请返回注册页重新提交。',
    verifying: '正在验证...',
    verified: '注册成功。',
    verifyFailed: '验证码错误，请重新输入。',
    registeredMessages: [
      '山河已为你留名。',
      '行囊备好，出发吧。',
      '寰宇志已经记住你。'
    ],
    backToMap: '返回地图'
  },
  en: {
    pageTitle: 'Email verification · Huanyuzhi',
    back: 'Back to register',
    title: 'Email verification',
    verificationCode: 'Verification code',
    submit: 'Verify email',
    note: 'Enter the verification code sent to {email}.',
    fallbackEmail: 'your email',
    codePlaceholder: 'Enter 6-digit code',
    codeRequired: 'Enter the 6-digit verification code.',
    missingEmail: 'No pending email was found. Please return to registration and submit again.',
    missingRegistration: 'No pending registration was found. Please return to registration and submit again.',
    verifying: 'Verifying...',
    verified: 'Registration complete.',
    verifyFailed: 'Verification code is incorrect. Please try again.',
    registeredMessages: [
      'Your name is on the map.',
      'Your journey is ready.',
      'Huanyuzhi has saved your account.'
    ],
    backToMap: 'Back to map'
  }
};

const languageSelect = document.getElementById('verify-language');
const noteEl = document.getElementById('verify-email-note');
const statusEl = document.getElementById('verify-email-status');
const verifyForm = document.getElementById('verify-email-form');
const codeInput = document.getElementById('verify-email-code');
const toolbar = document.querySelector('.register-toolbar');
const submitButton = verifyForm ? verifyForm.querySelector('button[type="submit"]') : null;
const legacyLanguage = localStorage.getItem('touringGuideLanguage');
const previousProjectLanguage = localStorage.getItem('yuanyuzhiLanguage');

if (localStorage.getItem('huanyuzhiLanguage') === null && legacyLanguage !== null) {
  localStorage.setItem('huanyuzhiLanguage', legacyLanguage);
}
if (localStorage.getItem('huanyuzhiLanguage') === null && localStorage.getItem('yuanyuzhiLanguage') !== null) {
  localStorage.setItem('huanyuzhiLanguage', previousProjectLanguage);
}
if (sessionStorage.getItem('huanyuzhiPendingVerificationEmail') === null && sessionStorage.getItem('yuanyuzhiPendingVerificationEmail') !== null) {
  sessionStorage.setItem('huanyuzhiPendingVerificationEmail', sessionStorage.getItem('yuanyuzhiPendingVerificationEmail'));
}
const initialLanguage = localStorage.getItem('huanyuzhiLanguage') || document.documentElement.lang || 'zh';
const apiBase = window.location.protocol.startsWith('http')
  ? window.location.origin
  : 'http://localhost:3000';

function getPendingEmail() {
  return sessionStorage.getItem('huanyuzhiPendingVerificationEmail') || '';
}

function getPendingRegistration() {
  try {
    return JSON.parse(sessionStorage.getItem('huanyuzhiPendingRegistration') || 'null');
  } catch (error) {
    return null;
  }
}

function applyVerifyLanguage(language) {
  const lang = verifyCopy[language] ? language : 'zh';
  const copy = verifyCopy[lang];
  const email = getPendingEmail() || copy.fallbackEmail;
  document.documentElement.lang = lang;
  document.title = copy.pageTitle;
  document.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = copy[element.dataset.i18n] || '';
  });
  if (noteEl) noteEl.textContent = copy.note.replace('{email}', email);
  if (codeInput) {
    codeInput.placeholder = copy.codePlaceholder;
    codeInput.setCustomValidity('');
  }
  if (statusEl && statusEl.dataset.statusKey) {
    statusEl.textContent = copy[statusEl.dataset.statusKey] || '';
  }
  localStorage.setItem('huanyuzhiLanguage', lang);
  if (languageSelect) languageSelect.value = lang;
}

function getCurrentCopy() {
  return verifyCopy[document.documentElement.lang] || verifyCopy.zh;
}

function setStatus(statusKey) {
  if (!statusEl) return;
  statusEl.dataset.statusKey = statusKey || '';
  statusEl.textContent = statusKey ? (getCurrentCopy()[statusKey] || '') : '';
}

function showRegisteredState() {
  if (!verifyForm) return;
  const copy = getCurrentCopy();
  const messages = Array.isArray(copy.registeredMessages) ? copy.registeredMessages : [];
  const randomMessage = messages.length > 0
    ? messages[Math.floor(Math.random() * messages.length)]
    : copy.verified;

  if (toolbar) toolbar.hidden = true;
  verifyForm.textContent = '';

  const title = document.createElement('h1');
  title.textContent = copy.verified;

  const note = document.createElement('p');
  note.className = 'register-note';
  note.textContent = randomMessage;

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.textContent = copy.backToMap;
  backButton.addEventListener('click', () => {
    sessionStorage.setItem('huanyuzhiDirectExplore', 'true');
    window.location.href = 'index.html';
  });

  verifyForm.append(title, note, backButton);
}

if (languageSelect) {
  languageSelect.addEventListener('change', () => {
    applyVerifyLanguage(languageSelect.value);
  });
}

if (verifyForm) {
  verifyForm.addEventListener('submit', async event => {
    event.preventDefault();
    const copy = getCurrentCopy();
    const email = getPendingEmail();
    const registration = getPendingRegistration();
    const code = codeInput ? codeInput.value.trim() : '';

    if (!email) {
      setStatus('missingEmail');
      return;
    }

    if (!registration || registration.email !== email) {
      setStatus('missingRegistration');
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      if (codeInput) {
        codeInput.setCustomValidity(copy.codeRequired);
        codeInput.reportValidity();
      }
      return;
    }

    if (codeInput) codeInput.setCustomValidity('');
    if (submitButton) submitButton.disabled = true;
    setStatus('verifying');

    try {
      const response = await fetch(`${apiBase}/api/email-verification/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          email,
          code,
          language: document.documentElement.lang,
          registration
        })
      });

      if (!response.ok) {
        setStatus('verifyFailed');
        if (codeInput) {
          codeInput.value = '';
          codeInput.focus();
        }
        return;
      }

      sessionStorage.removeItem('huanyuzhiPendingVerificationEmail');
      sessionStorage.removeItem('huanyuzhiPendingRegistration');
      showRegisteredState();
    } catch (error) {
      setStatus('verifyFailed');
      if (codeInput) {
        codeInput.value = '';
        codeInput.focus();
      }
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

applyVerifyLanguage(initialLanguage);
if (codeInput) codeInput.focus();
