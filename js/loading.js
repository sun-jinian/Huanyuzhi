// Loading screen controller
window.LoadingController = {
  init() {
    const loadingBar = document.getElementById('loading-bar');
    const loadingEl = document.getElementById('loading');
    if (!loadingBar || !loadingEl) return;

    // Loading progress bar animation
    let progress = 0;
    const loadInterval = setInterval(() => {
      progress += Math.random() * 8;
      if (progress >= 100) {
        progress = 100;
        clearInterval(loadInterval);
      }
      loadingBar.style.width = `${progress}%`;
    }, 80);

    // Hide loading after 2200ms
    setTimeout(() => {
      loadingEl.classList.add('hidden');
    }, 2200);

    // Set display none after 3000ms
    setTimeout(() => {
      loadingEl.style.display = 'none';
    }, 3000);
  }
};
