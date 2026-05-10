// Shared application state
const YuanyuzhiStorage = {
  migrate(storage, oldKey, newKey) {
    const existing = storage.getItem(newKey);
    const legacy = storage.getItem(oldKey);
    if (existing === null && legacy !== null) {
      storage.setItem(newKey, legacy);
    }
  }
};

YuanyuzhiStorage.migrate(sessionStorage, 'touringGuideLoggedIn', 'yuanyuzhiLoggedIn');

window.AppState = {
  currentLanguage: 'zh',
  exploreEnabled: false,
  exploreTriggered: false,
  qualityLevel: 'medium',
  adaptivePixelCap: 1.25,
  chatEnabled: false,
  chatDisabled: false,
  cloudLayerDisabled: false,
  atmosphereLayerDisabled: false,
  stopAutoRotate: false,
  isLoggedIn: sessionStorage.getItem('yuanyuzhiLoggedIn') === 'true'
};

window.AppConfig = {
  apiBase: window.location.origin && window.location.port === '3000'
    ? window.location.origin
    : 'http://localhost:3000',
  wsBase: window.location.origin && window.location.port === '3000'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
    : 'ws://localhost:3000'
};
