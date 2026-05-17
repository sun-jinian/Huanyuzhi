const registerCopy = {
  zh: {
    pageTitle: '注册 · 寰宇志',
    back: '返回地图',
    title: '注册账号',
    username: '用户名',
    email: '邮箱',
    password: '密码',
    confirmPassword: '确认密码',
    firstName: '名字（选填）',
    lastName: '姓氏（选填）',
    fromCountry: '来自（选填）',
    countryPlaceholder: '选择国家/地区',
    birthday: '生日（选填）',
    preferredCountry: '偏好国家/地区（选填）',
    submit: '创建账号',
    passwordMismatch: '两次输入的密码不一致',
    sendingCode: '正在发送验证码...',
    codeSent: '验证码已发送，请查收邮箱。',
    sendCodeFailed: '验证码发送失败，请稍后再试。',
    resendCooldown: '请等待 {seconds} 秒后再重新发送验证码。'
  },
  en: {
    pageTitle: 'Register · Huanyuzhi',
    back: 'Back to map',
    title: 'Create account',
    username: 'Username',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm password',
    firstName: 'First name (optional)',
    lastName: 'Last name (optional)',
    fromCountry: 'From (optional)',
    countryPlaceholder: 'Select country/region',
    birthday: 'Birthday (optional)',
    preferredCountry: 'Preferred country/region (optional)',
    submit: 'Create account',
    passwordMismatch: 'Passwords do not match',
    sendingCode: 'Sending verification code...',
    codeSent: 'Verification code sent. Please check your inbox.',
    sendCodeFailed: 'Failed to send verification code. Please try again later.',
    resendCooldown: 'Please wait {seconds} seconds before requesting another code.'
  }
};

const SEND_CODE_COOLDOWN_MS = 60 * 1000;
const registerForm = document.getElementById('register-form');
const backMapLink = document.getElementById('register-back-map');
const languageSelect = document.getElementById('register-language');
const birthdayInput = document.getElementById('register-birthday');
const fromCountrySelect = document.getElementById('register-from-country');
const preferredCountrySelect = document.getElementById('register-preferred-country');
const emailInput = document.getElementById('register-email');
const passwordInput = document.getElementById('register-password');
const confirmPasswordInput = document.getElementById('register-confirm-password');
const usernameInput = document.getElementById('register-username');
const firstNameInput = document.getElementById('register-first-name');
const lastNameInput = document.getElementById('register-last-name');
const statusEl = document.getElementById('register-status');
const submitButton = registerForm ? registerForm.querySelector('button[type="submit"]') : null;
const legacyLanguage = localStorage.getItem('touringGuideLanguage');
const previousProjectLanguage = localStorage.getItem('yuanyuzhiLanguage');

if (localStorage.getItem('huanyuzhiLanguage') === null && legacyLanguage !== null) {
  localStorage.setItem('huanyuzhiLanguage', legacyLanguage);
}

if (localStorage.getItem('huanyuzhiLanguage') === null && previousProjectLanguage !== null) {
  localStorage.setItem('huanyuzhiLanguage', previousProjectLanguage);
}

const initialLanguage = localStorage.getItem('huanyuzhiLanguage') || document.documentElement.lang || 'zh';
const apiBase = window.location.protocol.startsWith('http')
  ? window.location.origin
  : 'http://localhost:3000';

if (birthdayInput) {
  birthdayInput.max = new Date().toISOString().slice(0, 10);
}

function applyRegisterLanguage(language) {
  const lang = registerCopy[language] ? language : 'zh';
  const copy = registerCopy[lang];
  document.documentElement.lang = lang;
  document.title = copy.pageTitle;
  document.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = copy[element.dataset.i18n] || '';
  });
  if (statusEl && statusEl.dataset.statusKey) {
    const replacements = statusEl.dataset.statusSeconds
      ? { seconds: statusEl.dataset.statusSeconds }
      : {};
    setRegisterStatus(statusEl.dataset.statusKey, replacements);
  }
  localStorage.setItem('huanyuzhiLanguage', lang);
  languageSelect.value = lang;
  loadCountries(lang);
}

function getCurrentCopy() {
  return registerCopy[document.documentElement.lang] || registerCopy.zh;
}

function setRegisterStatus(statusKey, replacements = {}) {
  if (!statusEl) return;
  statusEl.dataset.statusKey = statusKey || '';
  statusEl.dataset.statusSeconds = replacements.seconds || '';
  const copy = getCurrentCopy();
  let text = statusKey ? (copy[statusKey] || '') : '';
  Object.entries(replacements).forEach(([key, value]) => {
    text = text.replace(`{${key}}`, value);
  });
  statusEl.textContent = text;
}

function getCooldownKey(email) {
  return `huanyuzhiEmailVerificationLastSentAt:${email.toLowerCase()}`;
}

function getRemainingCooldownSeconds(email) {
  const sentAt = Number(localStorage.getItem(getCooldownKey(email)) || 0);
  const remainingMs = SEND_CODE_COOLDOWN_MS - (Date.now() - sentAt);
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

async function sendVerificationCode(email) {
  const remainingSeconds = getRemainingCooldownSeconds(email);
  if (remainingSeconds > 0) {
    setRegisterStatus('resendCooldown', { seconds: String(remainingSeconds) });
    return false;
  }

  setRegisterStatus('sendingCode');
  if (submitButton) submitButton.disabled = true;

  try {
    const response = await fetch(`${apiBase}/api/email-verification/send-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        email,
        language: document.documentElement.lang
      })
    });

    if (!response.ok) {
      setRegisterStatus('sendCodeFailed');
      return false;
    }

    localStorage.setItem(getCooldownKey(email), String(Date.now()));
    setRegisterStatus('codeSent');
    return true;
  } catch (error) {
    setRegisterStatus('sendCodeFailed');
    return false;
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function validatePasswordMatch() {
  if (!passwordInput || !confirmPasswordInput) return true;
  const copy = getCurrentCopy();
  const mismatch = passwordInput.value && confirmPasswordInput.value && passwordInput.value !== confirmPasswordInput.value;
  confirmPasswordInput.setCustomValidity(mismatch ? copy.passwordMismatch : '');
  confirmPasswordInput.classList.toggle('is-password-mismatch', Boolean(mismatch));
  return !mismatch;
}

function getPendingRegistration(email) {
  return {
    email,
    username: usernameInput ? usernameInput.value.trim() : '',
    password: passwordInput ? passwordInput.value : '',
    firstName: firstNameInput ? firstNameInput.value.trim() : '',
    lastName: lastNameInput ? lastNameInput.value.trim() : '',
    originCountry: fromCountrySelect ? fromCountrySelect.value : '',
    birthdate: birthdayInput ? birthdayInput.value : '',
    preferredCountry: preferredCountrySelect ? preferredCountrySelect.value : ''
  };
}

function resetCountrySelect(select, placeholder) {
  if (!select) return;
  select.textContent = '';
  const option = document.createElement('option');
  option.value = '';
  option.textContent = placeholder;
  select.appendChild(option);
  select.disabled = true;
}

async function loadCountries(language) {
  const copy = registerCopy[language] || registerCopy.zh;
  const selects = [fromCountrySelect, preferredCountrySelect].filter(Boolean);
  if (selects.length === 0) return;
  selects.forEach(select => resetCountrySelect(select, copy.countryPlaceholder));
  try {
    const response = await fetch(`${apiBase}/api/countries?lang=${encodeURIComponent(language)}`, {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('Failed to load countries');
    const data = await response.json();
    selects.forEach(select => {
      (data.countries || []).forEach(country => {
        const countryName = (country.countryName || country.name || '').trim();
        if (!countryName) return;
        const option = document.createElement('option');
        option.value = country.countryCode || countryName;
        option.textContent = countryName;
        select.appendChild(option);
      });
      select.disabled = false;
    });
  } catch (error) {
    selects.forEach(select => {
      select.disabled = true;
    });
  }
}

languageSelect.addEventListener('change', () => {
  applyRegisterLanguage(languageSelect.value);
});

if (confirmPasswordInput) {
  confirmPasswordInput.addEventListener('input', validatePasswordMatch);
}

if (passwordInput) {
  passwordInput.addEventListener('input', validatePasswordMatch);
}

if (backMapLink) {
  backMapLink.addEventListener('click', () => {
    sessionStorage.setItem('huanyuzhiDirectExplore', 'true');
  });
}

if (registerForm) {
  registerForm.addEventListener('submit', async event => {
    event.preventDefault();
    validatePasswordMatch();
    if (!registerForm.checkValidity()) {
      registerForm.reportValidity();
      return;
    }

    const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
    const sent = await sendVerificationCode(email);
    if (!sent) return;

    sessionStorage.setItem('huanyuzhiPendingVerificationEmail', email);
    sessionStorage.setItem('huanyuzhiPendingRegistration', JSON.stringify(getPendingRegistration(email)));
    window.location.href = 'verify-email.html';
  });
}

applyRegisterLanguage(initialLanguage);
