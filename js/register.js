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
    submit: '创建账号'
  },
  en: {
    pageTitle: 'Register · Yuanyuzhi',
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
    submit: 'Create account'
  }
};

const languageSelect = document.getElementById('register-language');
const birthdayInput = document.getElementById('register-birthday');
const fromCountrySelect = document.getElementById('register-from-country');
const preferredCountrySelect = document.getElementById('register-preferred-country');
const legacyLanguage = localStorage.getItem('touringGuideLanguage');

if (localStorage.getItem('yuanyuzhiLanguage') === null && legacyLanguage !== null) {
  localStorage.setItem('yuanyuzhiLanguage', legacyLanguage);
}

const initialLanguage = localStorage.getItem('yuanyuzhiLanguage') || document.documentElement.lang || 'zh';
const apiBase = window.location.origin && window.location.port === '3000'
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
  localStorage.setItem('yuanyuzhiLanguage', lang);
  languageSelect.value = lang;
  loadCountries(lang);
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

applyRegisterLanguage(initialLanguage);
