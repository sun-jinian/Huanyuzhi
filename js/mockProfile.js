// Data layer: All mock data and data access APIs
// Other modules must NOT directly use window.__MOCK_DOCK_DATA__
// Instead, they must use window.MockProfile APIs

// Internal mock data (not exposed directly)
const __MOCK_DOCK_DATA__ = {
  currentPlaceKey: '',
  favoriteOrder: [
    'shanghai',
    'beijing',
    'wenzhou',
    'qingtian',
    'fujian',
    'tianjin',
    'lishui',
    'taiwan',
    'hangzhou',
    'suzhou',
    'chengdu',
    'chongqing',
    'xian',
    'guangzhou',
    'shenzhen',
    'nanjing'
  ],
  favoriteState: {
    shanghai: true,
    beijing: true,
    wenzhou: true,
    qingtian: true,
    fujian: true,
    tianjin: true,
    lishui: true,
    taiwan: true,
    hangzhou: true,
    suzhou: true,
    chengdu: true,
    chongqing: true,
    xian: true,
    guangzhou: true,
    shenzhen: true,
    nanjing: true
  },
  placeProfiles: {
    shanghai: {
      address: '上海，中国',
      region: 'Shanghai, China',
      food: ['生煎包', '葱油拌面', '蟹粉小笼包'],
      sights: ['武康大楼', '安福路街区', '衡复风貌区'],
      stays: ['衡山花园酒店', '武康庭院民宿']
    },
    beijing: {
      address: '北京，中国',
      region: 'Beijing, China',
      food: ['北京烤鸭', '炸酱面', '豆汁焦圈'],
      sights: ['故宫', '什刹海', '天坛公园'],
      stays: ['王府井精品酒店', '后海胡同民宿']
    },
    wenzhou: {
      address: '温州，中国',
      region: 'Wenzhou, China',
      food: ['鱼丸', '灯盏糕', '糯米饭'],
      sights: ['江心屿', '楠溪江', '五马街'],
      stays: ['瓯江江景酒店', '楠溪江山居']
    },
    qingtian: {
      address: '青田，中国',
      region: 'Qingtian, China',
      food: ['山粉饺', '田鱼干', '青田稻米饭'],
      sights: ['石门洞', '瓯江画廊', '侨乡古街'],
      stays: ['青田侨乡酒店', '江畔客栈']
    },
    fujian: {
      address: '福建，中国',
      region: 'Fujian, China',
      food: ['佛跳墙', '沙县小吃', '海蛎煎'],
      sights: ['鼓浪屿', '武夷山', '三坊七巷'],
      stays: ['厦门海景酒店', '武夷山茶宿']
    },
    tianjin: {
      address: '天津，中国',
      region: 'Tianjin, China',
      food: ['煎饼果子', '狗不理包子', '耳朵眼炸糕'],
      sights: ['五大道', '意式风情区', '海河夜景'],
      stays: ['海河悦榕庄', '津湾精品公寓']
    },
    lishui: {
      address: '丽水，中国',
      region: 'Lishui, China',
      food: ['缙云烧饼', '黄米粿', '土鸡煲'],
      sights: ['古堰画乡', '云和梯田', '仙都景区'],
      stays: ['古堰文艺民宿', '云和山间酒店']
    },
    taiwan: {
      address: '台湾，中国',
      region: 'Taiwan, China',
      food: ['卤肉饭', '蚵仔煎', '牛肉面'],
      sights: ['台北101', '阿里山', '日月潭'],
      stays: ['台北设计酒店', '花莲海岸民宿']
    },
    hangzhou: {
      address: '杭州，中国',
      region: 'Hangzhou, China',
      food: ['西湖醋鱼', '龙井虾仁', '片儿川'],
      sights: ['西湖', '灵隐寺', '京杭大运河'],
      stays: ['西湖湖畔酒店', '满觉陇茶宿']
    },
    suzhou: {
      address: '苏州，中国',
      region: 'Suzhou, China',
      food: ['松鼠桂鱼', '苏式汤面', '鲜肉月饼'],
      sights: ['拙政园', '平江路', '金鸡湖'],
      stays: ['园林精品酒店', '平江路民宿']
    },
    chengdu: {
      address: '成都，中国',
      region: 'Chengdu, China',
      food: ['火锅', '担担面', '钟水饺'],
      sights: ['宽窄巷子', '武侯祠', '青城山'],
      stays: ['太古里设计酒店', '青城山温泉民宿']
    },
    chongqing: {
      address: '重庆，中国',
      region: 'Chongqing, China',
      food: ['重庆小面', '毛血旺', '酸辣粉'],
      sights: ['洪崖洞', '解放碑', '磁器口古镇'],
      stays: ['江景高层酒店', '山城老街民宿']
    },
    xian: {
      address: '西安，中国',
      region: "Xi'an, China",
      food: ['肉夹馍', '羊肉泡馍', '凉皮'],
      sights: ['兵马俑', '大雁塔', '西安城墙'],
      stays: ['钟楼精品酒店', '城墙根民宿']
    },
    guangzhou: {
      address: '广州，中国',
      region: 'Guangzhou, China',
      food: ['早茶', '烧鹅', '艇仔粥'],
      sights: ['沙面', '陈家祠', '珠江夜游'],
      stays: ['珠江新城酒店', '东山口洋楼民宿']
    },
    shenzhen: {
      address: '深圳，中国',
      region: 'Shenzhen, China',
      food: ['潮汕牛肉火锅', '肠粉', '客家酿豆腐'],
      sights: ['深圳湾公园', '华侨城创意园', '大鹏所城'],
      stays: ['南山商务酒店', '大鹏海边民宿']
    },
    nanjing: {
      address: '南京，中国',
      region: 'Nanjing, China',
      food: ['盐水鸭', '鸭血粉丝汤', '牛肉锅贴'],
      sights: ['夫子庙', '中山陵', '秦淮河'],
      stays: ['老门东精品酒店', '秦淮河畔客栈']
    }
  }
};

// Public API
window.MockProfile = {
  // Get all place profiles
  getProfiles() {
    return __MOCK_DOCK_DATA__.placeProfiles;
  },

  // Get list of all place keys
  getProfileKeys() {
    return Object.keys(__MOCK_DOCK_DATA__.placeProfiles);
  },

  // Get favorite order list
  getFavoriteOrder() {
    return __MOCK_DOCK_DATA__.favoriteOrder;
  },

  // Get full favorite state object
  getFavoriteState() {
    return __MOCK_DOCK_DATA__.favoriteState;
  },

  // Check if a place is favorite
  isFavorite(placeKey) {
    return !!__MOCK_DOCK_DATA__.favoriteState[placeKey];
  },

  // Set favorite state
  setFavorite(placeKey, value) {
    __MOCK_DOCK_DATA__.favoriteState[placeKey] = value;
  },

  // Toggle favorite state
  toggleFavorite(placeKey) {
    __MOCK_DOCK_DATA__.favoriteState[placeKey] = !__MOCK_DOCK_DATA__.favoriteState[placeKey];
    return __MOCK_DOCK_DATA__.favoriteState[placeKey];
  },

  // Get current place key
  getCurrentPlaceKey() {
    return __MOCK_DOCK_DATA__.currentPlaceKey;
  },

  // Set current place key
  setCurrentPlaceKey(placeKey) {
    __MOCK_DOCK_DATA__.currentPlaceKey = placeKey;
  },

  // Get single place profile
  getPlace(placeKey) {
    return __MOCK_DOCK_DATA__.placeProfiles[placeKey] || null;
  },

  // Search places by keyword
  searchPlaces(keyword) {
    if (!keyword) return [];
    const normalized = keyword.toLowerCase();
    return Object.entries(__MOCK_DOCK_DATA__.placeProfiles)
      .filter(([, place]) =>
        place.address.toLowerCase().includes(normalized) ||
        place.region.toLowerCase().includes(normalized)
      )
      .map(([key, place]) => ({ key, place }));
  }
};
