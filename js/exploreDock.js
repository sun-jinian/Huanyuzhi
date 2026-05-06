// Explore dock controller
window.ExploreDockController = {
  init() {
    this.exploreDock = document.getElementById('explore-dock');
    if (!this.exploreDock) return;
    this.dockMain = this.exploreDock.querySelector('.dock-main');
    if (!this.dockMain) return;
    this.dockBackBtn = document.getElementById('dock-back-btn');
    this.dockFavoriteToggle = document.getElementById('dock-favorite-toggle');
    this.dockTitleWrap = this.dockMain.querySelector('.dock-title-wrap');
    this.dockCurrentAddress = document.getElementById('dock-current-address');
    this.dockCurrentRegion = document.getElementById('dock-current-region');
    this.dockFoodList = document.getElementById('dock-food-list');
    this.dockSightsList = document.getElementById('dock-sights-list');
    this.dockStaysList = document.getElementById('dock-stays-list');
    this.favoriteList = document.getElementById('favorite-list');
    this.dockSearchInput = document.getElementById('dock-search-input');
    this.dockSearchResults = document.getElementById('dock-search-results');
    this.dockTabButtons = Array.from(document.querySelectorAll('.dock-nav-btn'));

    this.dockOpen = false;
    this.activeDockTab = null;
    this.dockCloseTimer = null;
    this.dockCloseTransitionHandler = null;
    this.currentPlaceKey = '';

    // Event listeners
    this.dockTabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (this.dockOpen && this.activeDockTab === tab) {
          this.close();
        } else {
          this.openTab(tab);
        }
      });
    });

    this.dockSearchInput.addEventListener('input', () => {
      this.renderSearchResults();
    });

    this.dockSearchResults.addEventListener('click', e => {
      const target = e.target.closest('.dock-search-result');
      if (!target) return;
      this.openTab('cang', { resetCangView: false });
      this.showPlaceDetailView(target.dataset.place);
    });

    this.dockBackBtn.addEventListener('click', () => {
      if (!this.dockOpen) return;
      if (this.activeDockTab === 'cang' && this.dockMain.classList.contains('is-detail-view')) {
        this.showFavoriteListView();
        return;
      }
      this.close();
    });

    this.dockFavoriteToggle.addEventListener('click', () => {
      if (!this.currentPlaceKey) return;
      window.MockProfile.toggleFavorite(this.currentPlaceKey);
      this.syncFavoriteButton();
      this.syncFavoriteList();
      if (!window.MockProfile.isFavorite(this.currentPlaceKey) && 
          this.activeDockTab === 'cang' && 
          this.dockMain.classList.contains('is-detail-view')) {
        this.showFavoriteListView();
      }
    });

    this.renderFavoriteList();
    this.showFavoriteListView();
    this.dockOpen = false;
    this.activeDockTab = null;
    this.dockMain.classList.remove('tab-cang', 'tab-xun', 'tab-she', 'is-detail-view');
    this.dockTabButtons.forEach(btn => btn.classList.remove('is-active'));
    this.dockBackBtn.setAttribute('aria-expanded', 'false');
    this.setBrowserDrawerState('inactive collapsed');
  },

  show() {
    this.exploreDock.classList.add('visible');
  },

  openTab(tab, options = {}) {
    const { resetCangView = true } = options;

    if (this.dockCloseTransitionHandler) {
      this.dockMain.removeEventListener('transitionend', this.dockCloseTransitionHandler);
      this.dockCloseTransitionHandler = null;
    }

    if (this.dockCloseTimer) {
      clearTimeout(this.dockCloseTimer);
      this.dockCloseTimer = null;
    }

    this.dockOpen = true;
    this.activeDockTab = tab;
    if (tab === 'cang' && resetCangView) {
      this.showFavoriteListView();
    } else if (tab !== 'cang') {
      this.showFavoriteListView();
    }
    this.setBrowserDrawerState('active extended will-extend');
    this.dockBackBtn.setAttribute('aria-expanded', 'true');
    this.setDockTab(tab);
  },

  close() {
    const drawerState = this.getBrowserDrawerState();
    if ((!this.dockOpen && this.activeDockTab === null) || drawerState.includes('will-collapse')) return;
    
    this.dockOpen = false;
    this.setBrowserDrawerState('inactive collapsed will-collapse');
    this.dockBackBtn.setAttribute('aria-expanded', 'false');

    const durationRaw = getComputedStyle(this.dockMain).getPropertyValue('--dock-drawer-duration').trim();
    const durationMs = durationRaw.endsWith('ms')
      ? parseFloat(durationRaw)
      : (durationRaw.endsWith('s') ? parseFloat(durationRaw) * 1000 : 320);

    const clearCloseLifecycle = () => {
      if (this.dockCloseTransitionHandler) {
        this.dockMain.removeEventListener('transitionend', this.dockCloseTransitionHandler);
        this.dockCloseTransitionHandler = null;
      }
      if (this.dockCloseTimer) {
        clearTimeout(this.dockCloseTimer);
        this.dockCloseTimer = null;
      }
    };

    const finishClose = () => {
      this.setBrowserDrawerState('inactive collapsed');
      this.activeDockTab = null;
      this.dockMain.classList.remove('tab-cang', 'tab-xun', 'tab-she');
      this.dockTabButtons.forEach(btn => btn.classList.remove('is-active'));
      this.dockBackBtn.setAttribute('aria-expanded', 'false');
      clearCloseLifecycle();
    };

    this.dockCloseTransitionHandler = (e) => {
      if (e.target !== this.dockMain) return;
      if (e.propertyName !== 'transform') return;
      finishClose();
    };

    this.dockMain.addEventListener('transitionend', this.dockCloseTransitionHandler);
    this.dockCloseTimer = setTimeout(finishClose, Math.max(120, durationMs + 16));
  },

  setCurrentPlace(placeKey) {
    const place = window.MockProfile.getPlace(placeKey);
    if (!place) return false;
    
    this.currentPlaceKey = placeKey;
    window.MockProfile.setCurrentPlaceKey(placeKey);
    
    this.dockCurrentAddress.textContent = place.address;
    this.dockCurrentRegion.textContent = '';
    this.renderList(this.dockFoodList, place.food);
    this.renderList(this.dockSightsList, place.sights);
    this.renderList(this.dockStaysList, place.stays);
    
    // Update chat panel title
    window.ChatPanelController.setPlace(placeKey);
    
    // Update favorite items active state
    const favoriteItems = this.getFavoriteItems();
    favoriteItems.forEach(item => {
      item.classList.toggle('is-active', item.dataset.place === placeKey);
    });
    
    this.syncFavoriteButton();
    return true;
  },

  showFavoriteListView() {
    this.currentPlaceKey = '';
    window.MockProfile.setCurrentPlaceKey('');
    this.dockMain.classList.remove('is-detail-view');
    this.dockCurrentAddress.textContent = '';
    this.dockCurrentRegion.textContent = '';
    this.setTitleVisible(false);
    this.dockFavoriteToggle.classList.remove('is-favorite');
    const favoriteItems = this.getFavoriteItems();
    favoriteItems.forEach(item => item.classList.remove('is-active'));
  },

  showPlaceDetailView(placeKey) {
    if (!this.setCurrentPlace(placeKey)) return false;
    if (this.activeDockTab !== 'cang' || !this.dockOpen) {
      this.openTab('cang', { resetCangView: false });
    } else {
      this.setDockTab('cang');
    }
    this.dockMain.classList.add('is-detail-view');
    this.setTitleVisible(true);
    return true;
  },

  renderFavoriteList() {
    const favoriteOrder = window.MockProfile.getFavoriteOrder();
    
    this.favoriteList.textContent = '';
    favoriteOrder.forEach(key => {
      if (!window.MockProfile.isFavorite(key)) return;
      const item = this.createFavoriteListItem(key);
      if (item) this.favoriteList.appendChild(item);
    });
  },

  syncFavoriteList() {
    this.renderFavoriteList();
    this.getFavoriteItems().forEach(item => {
      item.classList.toggle('is-active', item.dataset.place === this.currentPlaceKey);
    });
  },

  createFavoriteListItem(placeKey) {
    const place = window.MockProfile.getPlace(placeKey);
    if (!place) return null;
    const item = document.createElement('li');
    item.className = 'dock-fav-item';
    item.dataset.place = placeKey;
    item.textContent = place.address;
    item.addEventListener('click', () => {
      if (this.activeDockTab !== 'cang' || !this.dockOpen) {
        this.openTab('cang', { resetCangView: false });
      }
      this.showPlaceDetailView(placeKey);
    });
    return item;
  },

  syncFavoriteButton() {
    this.dockFavoriteToggle.classList.toggle('is-favorite', window.MockProfile.isFavorite(this.currentPlaceKey));
  },

  renderSearchResults() {
    const keyword = this.dockSearchInput.value.trim();
    const matches = window.MockProfile.searchPlaces(keyword);
    
    this.dockSearchResults.textContent = '';
    matches.forEach(({ key, place }) => {
      const li = document.createElement('li');
      li.className = 'dock-search-result';
      li.dataset.place = key;
      
      // Add address as text node
      li.appendChild(document.createTextNode(place.address));
      
      // Add region in small tag
      const small = document.createElement('small');
      small.textContent = place.region;
      li.appendChild(small);
      
      this.dockSearchResults.appendChild(li);
    });
  },

  renderList(container, items = []) {
    container.textContent = '';
    items.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      container.appendChild(li);
    });
  },

  getFavoriteItems() {
    return Array.from(this.favoriteList.querySelectorAll('.dock-fav-item'));
  },

  getFavoriteItemByPlace(placeKey) {
    return this.getFavoriteItems().find(item => item.dataset.place === placeKey) || null;
  },

  setDockTab(tab) {
    this.dockMain.classList.remove('tab-cang', 'tab-xun', 'tab-she');
    this.dockMain.classList.add(`tab-${tab}`);
    this.dockTabButtons.forEach(btn => {
      btn.classList.toggle('is-active', this.dockOpen && btn.dataset.tab === tab);
    });
    if (tab === 'xun') {
      this.dockSearchInput.focus();
    }
  },

  setTitleVisible(visible) {
    this.dockTitleWrap.classList.toggle('is-empty', !visible);
  },

  setBrowserDrawerState(state) {
    this.dockMain.setAttribute('data-drawer', state);
    document.documentElement.setAttribute('data-browser-drawer', state);
  },

  getBrowserDrawerState() {
    return this.dockMain.getAttribute('data-drawer') || '';
  }
};
