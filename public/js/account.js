const accountBackMap = document.getElementById('account-back-map');
const accountAvatar = document.getElementById('account-avatar');
const accountName = document.getElementById('account-name');
const accountEmail = document.getElementById('account-email');

if (accountBackMap) {
  accountBackMap.addEventListener('click', () => {
    sessionStorage.setItem('huanyuzhiDirectExplore', 'true');
  });
}

async function loadAccount() {
  let response = null;
  try {
    response = await fetch(`${window.AppConfig.apiBase}/api/session`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json'
      }
    });
  } catch (error) {
    window.location.href = 'index.html';
    return;
  }

  if (!response.ok) {
    window.location.href = 'index.html';
    return;
  }

  const data = await response.json();
  const user = data.user || {};
  const name = user.nickname || user.email || 'Account';
  const avatar = user.avatar || name.slice(0, 1).toUpperCase();

  if (accountAvatar) accountAvatar.textContent = avatar.slice(0, 1).toUpperCase();
  if (accountName) accountName.textContent = name;
  if (accountEmail) accountEmail.textContent = user.email || '';
}

loadAccount();
