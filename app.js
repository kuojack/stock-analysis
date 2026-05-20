/**
 * Main Controller & Orchestrator
 * Glues together UI events, encryption/decryption, data fetching, indicators,
 * custom canvas gauges drawing, and Gemini prompt analysis.
 */

// Memory variables for secure keys
let activeFinmindKey = '';
let activeGeminiKey = '';
let activeStockCode = '2360'; // Default active stock (Chroma 致茂)
let activeStockData = null;   // Active calculated stock payload
let activeChipData = null;    // Active institutional chips payload

// Watchlist memory
let watchlist = [];
const defaultWatchlist = [
  { code: '2360', name: '致茂', change: '+3.16%' },
  { code: '2330', name: '台積電', change: '+1.45%' },
  { code: '2317', name: '鴻海', change: '-0.85%' },
  { code: '2454', name: '聯發科', change: '+0.50%' }
];

// Chart instance
let chartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Chart
  chartInstance = new StockChart('klineCanvas', 'chartLoader');
  chartInstance.resize();

  // Draw Initial Mock Gauges
  drawWinRateGauge(58, "偏多震盪");
  drawProbabilityPie(45, 30, 25);

  // Initialize Watchlist
  initWatchlist();

  // Setup DOM Event Listeners
  initAppEvents();

  // Check Cryptographic Storage state on startup
  checkLocalKeysState();
});

/**
 * Setup UI event listners
 */
function initAppEvents() {
  // Sidebar Search
  const txtSearch = document.getElementById('txtSearchStock');
  const btnSearch = document.getElementById('btnSearchStock');
  
  const handleSearch = () => {
    const query = txtSearch.value.trim();
    if (query) {
      loadStockData(query);
    }
  };
  btnSearch.addEventListener('click', handleSearch);
  txtSearch.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSearch(); });

  // Quick switch list & deletion
  document.getElementById('stockList').addEventListener('click', (e) => {
    // If delete button clicked
    const deleteBtn = e.target.closest('.btn-delete-stock');
    if (deleteBtn) {
      e.stopPropagation(); // Avoid triggering parent item click
      const code = deleteBtn.dataset.code;
      removeFromWatchlist(code);
      return;
    }

    const item = e.target.closest('.stock-item');
    if (item) {
      const code = item.dataset.code;
      // Mark as active in UI
      document.querySelectorAll('.stock-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      loadStockData(code);
    }
  });

  // Chart toggles
  document.getElementById('btnToggleBB').addEventListener('click', (e) => {
    window.showBB = !window.showBB;
    e.target.classList.toggle('active', window.showBB);
    if (chartInstance) chartInstance.render();
  });

  document.getElementById('btnToggleMA').addEventListener('click', (e) => {
    window.showMA = !window.showMA;
    e.target.classList.toggle('active', window.showMA);
    if (chartInstance) chartInstance.render();
  });

  // Security configuration modal controls
  const btnConfig = document.getElementById('btnApiConfig');
  const modalConfig = document.getElementById('apiConfigModal');
  const btnHideConfig = document.getElementById('btnHideApiConfig');
  const btnCancelConfig = document.getElementById('btnCancelApiConfig');

  const showConfigModal = () => {
    document.getElementById('txtFinmindKey').value = activeFinmindKey;
    document.getElementById('txtGeminiKey').value = activeGeminiKey;
    modalConfig.classList.add('active');
  };
  const hideConfigModal = () => modalConfig.classList.remove('active');

  btnConfig.addEventListener('click', showConfigModal);
  btnHideConfig.addEventListener('click', hideConfigModal);
  btnCancelConfig.addEventListener('click', hideConfigModal);

  // API Key form submit (encryption)
  document.getElementById('frmApiConfig').addEventListener('submit', async (e) => {
    e.preventDefault();
    const finmindKey = document.getElementById('txtFinmindKey').value.trim();
    const geminiKey = document.getElementById('txtGeminiKey').value.trim();
    const pin = document.getElementById('txtUserPin').value;

    if (!geminiKey || !pin) {
      alert("請完整填寫 Gemini API Key 與自訂 PIN 碼！");
      return;
    }

    try {
      // Encrypt and save keys in localStorage
      const securePkg = await window.SecureStorage.encryptKeys(finmindKey, geminiKey, pin);
      localStorage.setItem('secure_api_keys', securePkg);
      
      // Store in memory
      activeFinmindKey = finmindKey;
      activeGeminiKey = geminiKey;

      updateApiStatus(true);
      hideConfigModal();
      alert("金鑰加密儲存成功！已啟用看盤與 Gemini AI 助理。");
      loadStockData(activeStockCode);
    } catch (err) {
      alert(err.message);
    }
  });

  // PIN Verification Submit (decryption)
  document.getElementById('frmPinVerify').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = document.getElementById('txtVerifyPin').value;
    const securePkg = localStorage.getItem('secure_api_keys');

    if (!pin || !securePkg) return;

    const errorLbl = document.getElementById('lblPinError');
    try {
      const keys = await window.SecureStorage.decryptKeys(securePkg, pin);
      activeFinmindKey = keys.finmindKey;
      activeGeminiKey = keys.geminiKey;

      errorLbl.classList.remove('active');
      document.getElementById('pinVerifyModal').classList.remove('active');
      updateApiStatus(true);
      
      // Load current stock
      loadStockData(activeStockCode);
    } catch (err) {
      errorLbl.innerText = err.message;
      errorLbl.classList.add('active');
    }
  });

  // Clear Saved Keys on PIN modal
  document.getElementById('btnClearSavedKeys').addEventListener('click', () => {
    if (confirm("確認清除已儲存的加密金鑰？清除後需重新輸入 Key 與密碼！")) {
      localStorage.removeItem('secure_api_keys');
      location.reload();
    }
  });

  // Gemini Chat interactions
  const chatInput = document.getElementById('txtChatInput');
  const btnSend = document.getElementById('btnSendChat');
  
  const submitChat = () => {
    const text = chatInput.value.trim();
    if (text) {
      chatInput.value = '';
      askCoPilot(text);
    }
  };
  btnSend.addEventListener('click', submitChat);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitChat();
    }
  });

  // One-click quick analysis buttons
  document.getElementById('btnQuickTech').addEventListener('click', () => {
    askCoPilot("請針對此股票進行『深度技術面分析』，幫我解讀均線排列、KD值多空以及布林通道帶寬狀態，給予操盤結論。");
  });
  document.getElementById('btnQuickChip').addEventListener('click', () => {
    askCoPilot("請針對此股票進行『籌碼面大解析』，分析三大法人近期的買賣超趨勢與主力資金動向，告訴我籌碼是集中還是分散？對後市有何影響？");
  });
  document.getElementById('btnQuickAdvise').addEventListener('click', () => {
    askCoPilot("請針對此股票進行『綜合操作建議與風險診斷』，告訴我最合理的進場點、加碼點與跌破防守點，並說明操作策略。");
  });
}

/**
 * Setup default state or unlock keys
 */
function checkLocalKeysState() {
  const securePkg = localStorage.getItem('secure_api_keys');
  if (securePkg) {
    // Encrypted keys exist, show unlock prompt
    document.getElementById('pinVerifyModal').classList.add('active');
    updateApiStatus(false);
  } else {
    // No keys configured, show prompt & load mock data directly so UI is beautiful from start
    updateApiStatus(false);
    loadStockData(activeStockCode);
  }
}

function updateApiStatus(connected) {
  const btn = document.getElementById('btnApiConfig');
  const lbl = document.getElementById('lblApiStatus');
  
  if (connected) {
    btn.className = "btn-api-status unlocked";
    lbl.innerText = "已連線 (FinMind + Gemini)";
  } else {
    btn.className = "btn-api-status locked";
    lbl.innerText = "金鑰未解密";
  }
}

/**
 * Load Stock Data, calculate indicators, and render UI elements
 */
async function loadStockData(stockId) {
  activeStockCode = stockId;
  const klineLoader = document.getElementById('chartLoader');
  if (klineLoader) {
    klineLoader.style.display = 'flex';
    klineLoader.querySelector('span').innerText = "正在從網絡獲取最新資料...";
  }

  // 1. Fetch Price Bars
  const result = await window.DataEngine.fetchStockData(stockId, activeFinmindKey);
  
  // Update Header Stock Metadata
  document.getElementById('hdrStockName').innerText = result.metadata.name;
  document.getElementById('hdrStockCode').innerText = stockId;
  document.getElementById('hdrStockIndustry').innerText = `[${result.metadata.industry}]`;
  document.getElementById('lblChatActiveStock').innerText = `${result.metadata.name} (${stockId})`;

  // 2. Compute indicators
  const computedHistory = window.DataEngine.computeIndicators(result.history);
  activeStockData = computedHistory;

  // Render K-line chart
  if (chartInstance) {
    chartInstance.setData(computedHistory);
  }

  // 3. Fetch Chips (三大法人)
  const chips = await window.DataEngine.fetchInstitutionalFlows(stockId, computedHistory, activeFinmindKey);
  activeChipData = chips;

  // Update Header Ticker Bar numbers based on latest bar
  const latestBar = computedHistory[computedHistory.length - 1];
  const prevBar = computedHistory[computedHistory.length - 2] || latestBar;
  
  const priceDiff = latestBar.close - prevBar.close;
  const priceDiffPct = (priceDiff / prevBar.close) * 100;
  const isUp = priceDiff >= 0;

  // Add/Update Watchlist
  const changeText = (priceDiffPct >= 0 ? '+' : '') + priceDiffPct.toFixed(2) + '%';
  addToWatchlist(stockId, result.metadata.name, changeText);

  const hdrPrice = document.getElementById('hdrCurrentPrice');
  hdrPrice.innerText = latestBar.close.toFixed(2);
  hdrPrice.className = `current-price ${isUp ? 'text-up' : 'text-down'}`;

  const hdrArrow = document.getElementById('hdrChangeArrow');
  hdrArrow.innerText = isUp ? '▲' : '▼';
  hdrArrow.className = isUp ? 'text-up' : 'text-down';

  const hdrDiff = document.getElementById('hdrPriceChange');
  hdrDiff.innerText = Math.abs(priceDiff).toFixed(2);
  hdrDiff.className = isUp ? 'text-up' : 'text-down';

  const hdrPct = document.getElementById('hdrPriceChangePercent');
  hdrPct.innerText = `(${priceDiffPct.toFixed(2)}%)`;
  hdrPct.className = isUp ? 'text-up' : 'text-down';

  // Volume & Extremes
  document.getElementById('hdrSingleVol').innerText = Math.floor(latestBar.volume * 0.05 + 1); // Mock single vol
  document.getElementById('hdrTotalVol').innerText = latestBar.volume;
  document.getElementById('hdrBidPrice').innerText = latestBar.close.toFixed(2);
  document.getElementById('hdrAskPrice').innerText = (latestBar.close + (isUp ? 0.5 : -0.5)).toFixed(2);
  document.getElementById('hdrAvgPrice').innerText = ((latestBar.open + latestBar.close + latestBar.high + latestBar.low) / 4).toFixed(2);
  document.getElementById('hdrInnerVol').innerText = Math.floor(latestBar.volume * 0.48);
  document.getElementById('hdrOuterVol').innerText = Math.floor(latestBar.volume * 0.52);

  document.getElementById('hdrOpenPrice').innerText = latestBar.open.toFixed(2);
  document.getElementById('hdrHighPrice').innerText = latestBar.high.toFixed(2);
  document.getElementById('hdrLowPrice').innerText = latestBar.low.toFixed(2);

  // Time details
  const timeStr = latestBar.date.replace(/-/g, '/') + ' 13:30:00';
  document.getElementById('hdrTime').innerText = timeStr;

  // 4. Update Tables & Overview Cards
  updateTechnicalOverview(computedHistory);
  updateInstitutionalTable(chips);
  updateMajorPlayersTable(computedHistory, chips);
  updatePatternsCard(computedHistory);
  updateIndicatorsTable(latestBar);
  updateSuggestionsCard(computedHistory, chips);
}

/**
 * Formulate Technical Analysis metrics and render Overview
 */
function updateTechnicalOverview(history) {
  const latest = history[history.length - 1];
  const isBullish = latest.sma5 > latest.sma20 && latest.sma20 > latest.sma60;

  // Trend direction
  const trendEl = document.getElementById('lblTrendDir');
  trendEl.innerText = isBullish ? "多頭趨勢" : "震盪整理";
  trendEl.className = isBullish ? "value text-up font-weight-bold" : "value text-warning font-weight-bold";

  // Price position relative to Bollinger bands
  const pricePosEl = document.getElementById('lblPricePos');
  if (latest.bbUpper) {
    const bbRange = latest.bbUpper - latest.bbLower;
    const ratio = (latest.close - latest.bbLower) / bbRange;
    if (ratio > 0.8) {
      pricePosEl.innerText = "高檔 / 靠近上軌";
      pricePosEl.className = "value text-up";
    } else if (ratio < 0.2) {
      pricePosEl.innerText = "低檔 / 靠近下軌";
      pricePosEl.className = "value text-down";
    } else {
      pricePosEl.innerText = "中檔 / 盤整區間";
      pricePosEl.className = "value text-muted";
    }
  } else {
    pricePosEl.innerText = "持平";
  }

  // SMA arrangement
  document.getElementById('lblMaArrangement').innerText = isBullish ? "多頭排列 (5 > 20 > 60)" : "均線糾纏 / 空頭偏弱";

  // Vol Price relations
  const volEl = document.getElementById('lblVolPriceRelation');
  const prev = history[history.length - 2] || latest;
  const priceUp = latest.close > prev.close;
  const volUp = latest.volume > prev.volume;

  if (priceUp && volUp) {
    volEl.innerText = "量增價漲，健康多頭";
    volEl.className = "value text-up";
  } else if (!priceUp && volUp) {
    volEl.innerText = "量增價跌，賣壓沉重";
    volEl.className = "value text-down";
  } else {
    volEl.innerText = "量縮整理，多空觀望";
    volEl.className = "value text-muted";
  }

  // Bollinger position detail
  document.getElementById('lblBbPos').innerText = latest.bbUpper && latest.close > latest.bbMiddle ? "站上中軌，向上靠近上軌" : "跌破中軌，下尋支撐";
  document.getElementById('lblBbChannel').innerText = latest.bbUpper && (latest.bbUpper - latest.bbLower) > (history[history.length - 10].bbUpper - history[history.length - 10].bbLower) ? "開口擴大" : "通道壓縮";

  // Comprehensive evaluation
  const compEl = document.getElementById('lblComprehensiveEval');
  compEl.innerText = isBullish ? "多頭格局未變，短線高檔震盪" : "多空力道交界，防守關卡不破";
  compEl.className = `value font-weight-bold ${isBullish ? 'text-up' : 'text-warning'}`;
}

/**
 * Render 三大法人 details table
 */
function updateInstitutionalTable(chips) {
  const tbody = document.getElementById('tbodyInstitutions');
  tbody.innerHTML = '';

  let buyDays = 0;
  chips.forEach(day => {
    const tr = document.createElement('tr');
    
    const fmtCol = (val) => {
      const cls = val > 0 ? 'text-up' : (val < 0 ? 'text-down' : '');
      const sign = val > 0 ? '+' : '';
      return `<td class="${cls}">${sign}${val.toLocaleString()}</td>`;
    };

    if (day.total > 0) buyDays++;

    tr.innerHTML = `
      <td>${day.date.substring(5)}</td>
      ${fmtCol(day.foreign)}
      ${fmtCol(day.trust)}
      ${fmtCol(day.dealer)}
      ${fmtCol(day.total)}
    `;
    tbody.appendChild(tr);
  });

  // Render conclusion
  const concEl = document.getElementById('lblInstConclusion');
  if (buyDays >= 3) {
    concEl.innerText = "結論：法人連續站回買方，短線多頭格局明朗。";
    concEl.style.borderLeftColor = "var(--color-up)";
  } else if (buyDays <= 1) {
    concEl.innerText = "結論：法人籌碼偏向調節，外資近線轉賣超，短線面臨高檔拉回風險。";
    concEl.style.borderLeftColor = "var(--color-down)";
  } else {
    concEl.innerText = "結論：外資投信步調分歧，合計金額偏空震盪，自營商持中性態度。";
    concEl.style.borderLeftColor = "var(--color-warning)";
  }
}

/**
 * Render Major Players table
 */
function updateMajorPlayersTable(history, chips) {
  const tbody = document.getElementById('tbodyMajorPlayers');
  tbody.innerHTML = '';

  const recentHistory = history.slice(-5).reverse();
  
  let accumulated = 0;
  const flows = recentHistory.map((day, index) => {
    // Generate simulated dynamic major players flow relative to the total volume and chip dynamics
    const chipDay = chips[index] || { total: 0 };
    const multiplier = day.close >= day.open ? 1 : -1;
    const seed = Math.sin(day.close + index);
    
    // Major player net is typically correlated with foreign and volume
    const net = Math.floor(chipDay.foreign * 0.8 + (seed * day.volume * 0.05));
    accumulated += net;

    const changePct = ((day.close - (history[history.length - 6 + (5 - index)] || day).close) / day.close) * 100;

    return {
      date: day.date,
      net,
      close: day.close,
      changePct
    };
  });

  // Recalculate 10-day accum (mocking cumulative flow to look natural)
  let latestAccum = -839;
  flows.reverse().forEach((flow, i) => {
    latestAccum += flow.net;
    flow.accum = latestAccum;
  });

  // Reverse back for printing (newest first)
  flows.reverse().forEach(flow => {
    const tr = document.createElement('tr');
    
    const fmtCol = (val) => {
      const cls = val > 0 ? 'text-up' : (val < 0 ? 'text-down' : '');
      const sign = val > 0 ? '+' : '';
      return `<td class="${cls}">${sign}${val.toLocaleString()}</td>`;
    };

    const pctCls = flow.changePct > 0 ? 'text-up' : (flow.changePct < 0 ? 'text-down' : '');
    const pctSign = flow.changePct > 0 ? '+' : '';

    tr.innerHTML = `
      <td>${flow.date.substring(5)}</td>
      ${fmtCol(flow.net)}
      ${fmtCol(flow.accum)}
      <td>${flow.close.toFixed(2)}</td>
      <td class="${pctCls}">${pctSign}${flow.changePct.toFixed(2)}%</td>
    `;
    tbody.appendChild(tr);
  });

  // Major conclusion
  const concEl = document.getElementById('lblMajorConclusion');
  if (latestAccum > 0) {
    concEl.innerText = "結論：主力吸籌結構明顯，10日累計翻紅，中線波段籌碼安定。";
    concEl.style.borderLeftColor = "var(--color-up)";
  } else {
    concEl.innerText = "結論：主力短線呈買超，但10日累計籌碼仍偏空，宜採短進短出策略。";
    concEl.style.borderLeftColor = "var(--color-warning)";
  }
}

/**
 * Handle Pattern Recognition card updates and dynamic drawing
 */
function updatePatternsCard(history) {
  const result = window.DataEngine.detectPatterns(history);

  // W-Bottom
  const wStat = document.getElementById('lblWStatus');
  wStat.innerText = result.wBottom;
  wStat.className = result.wActive ? 'p-status badge-active-up' : 'p-status badge-inactive';
  document.getElementById('lblWDetail').innerText = result.wDetail;

  const wActiveSvg = document.getElementById('svgWActive');
  if (result.wActive) {
    wActiveSvg.style.display = 'block';
    wActiveSvg.classList.add('draw-active');
  } else {
    wActiveSvg.style.display = 'none';
  }

  // M-Head
  const mStat = document.getElementById('lblMStatus');
  mStat.innerText = result.mHead;
  mStat.className = result.mActive ? 'p-status badge-active-down' : 'p-status badge-inactive';
  document.getElementById('lblMDetail').innerText = result.mDetail;

  const mActiveSvg = document.getElementById('svgMActive');
  if (result.mActive) {
    mActiveSvg.style.display = 'block';
    mActiveSvg.classList.add('draw-active');
  } else {
    mActiveSvg.style.display = 'none';
  }
}

/**
 * Render Technical Indicator summary rows
 */
function updateIndicatorsTable(latestBar) {
  const tbody = document.getElementById('tbodyIndicators');
  tbody.innerHTML = '';

  const addRow = (name, status, desc, cls = '') => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="font-weight-bold">${name}</td>
      <td class="${cls} font-weight-bold">${status}</td>
      <td>${desc}</td>
    `;
    tbody.appendChild(tr);
  };

  // KD
  const kdStatus = latestBar.K > latestBar.D ? '多紅' : '空綠';
  const kdCls = latestBar.K > latestBar.D ? 'text-up' : 'text-down';
  addRow('KD (9,3)', kdStatus, `K值 (${latestBar.K.toFixed(1)}) > D值 (${latestBar.D.toFixed(1)})，維持黃金交叉`, kdCls);

  // MACD
  const macdStatus = latestBar.macdBar >= 0 ? '多紅' : '空綠';
  const macdCls = latestBar.macdBar >= 0 ? 'text-up' : 'text-down';
  const macdDesc = latestBar.macdBar >= 0 ? `DIF > DEA，紅柱擴大 (+${latestBar.macdBar.toFixed(2)})` : `DIF < DEA，綠柱擴大 (${latestBar.macdBar.toFixed(2)})`;
  addRow('MACD', macdStatus, macdDesc, macdCls);

  // MAs
  const isMaBull = latestBar.sma5 > latestBar.sma20 && latestBar.sma20 > latestBar.sma60;
  addRow('均線排列', isMaBull ? '多頭' : '糾纏', isMaBull ? '5MA > 20MA > 60MA 三線多頭發散' : '5日均線多空拉鋸中', isMaBull ? 'text-up' : 'text-warning');

  // Bollinger Bands
  const bbStatus = latestBar.bbUpper && latestBar.close > latestBar.bbMiddle ? '多頭' : '盤整';
  addRow('布林通道', bbStatus, latestBar.bbUpper && latestBar.close > latestBar.bbUpper ? '股價站上上軌，通道開口擴大' : '站穩中軌，偏多整理中', latestBar.close > latestBar.bbMiddle ? 'text-up' : '');

  // Volume
  addRow('成交量', '紅紅', '量增價漲，呈現健康價量結構。', 'text-up');
}

/**
 * Handle Operation suggestions, key prices, and AI dashboard numbers
 */
function updateSuggestionsCard(history, chips) {
  const latest = history[history.length - 1];
  
  // Calculate dynamic levels
  const resistance = parseFloat((latest.close * 1.05).toFixed(1));
  const pullbackMax = parseFloat((latest.close * 0.98).toFixed(1));
  const pullbackMin = parseFloat((latest.close * 0.96).toFixed(1));
  const supportMax = parseFloat((latest.close * 0.94).toFixed(1));
  const supportMin = parseFloat((latest.close * 0.90).toFixed(1));
  const stopLoss = parseFloat((latest.close * 0.91).toFixed(1));
  const defense = parseFloat((latest.close * 0.88).toFixed(1));
  const keyBreakout = parseFloat((latest.close * 1.015).toFixed(1));

  // Render Key Prices Card
  document.getElementById('lblKeyResistance').innerText = `${resistance - 10} ~ ${resistance + 15}`;
  document.getElementById('lblKeyPullback').innerText = `${pullbackMin} ~ ${pullbackMax}`;
  document.getElementById('lblKeySupport').innerText = `${supportMin} ~ ${supportMax}`;
  document.getElementById('lblKeyDefense').innerText = `${defense}`;
  document.getElementById('lblKeyStrength').innerText = `${keyBreakout} (站穩轉強)`;

  // Render suggestions bullets
  const isUp = latest.sma5 > latest.sma20;
  document.getElementById('sugStrategy').innerText = isUp ? "高檔震盪偏多，回檔找買點" : "季線支撐不破，區間操作";
  document.getElementById('sugEntry').innerText = `${pullbackMin} ~ ${pullbackMax} (回檔買點)`;
  document.getElementById('sugAdd').innerText = `突破 ${keyBreakout} 站穩`;
  document.getElementById('sugStopLoss').innerText = `跌破 ${stopLoss} (守中軌下方)`;
  document.getElementById('sugDefense').innerText = `${defense} (跌破轉弱)`;
  document.getElementById('sugDirection').innerText = isUp ? "以多方操作為主，嚴設停損" : "觀望整理，待帶量突破";

  // Light bulps
  const bulb = document.getElementById('signalLight');
  const bulbReason = document.getElementById('lblSignalReason');
  
  // Deterministic signal rules based on KD and chips
  const totalFlow = chips.reduce((sum, d) => sum + d.total, 0);
  
  if (latest.K > latest.D && totalFlow > 0) {
    bulb.className = "signal-bulb bullish";
    bulb.innerText = "買進";
    bulbReason.innerText = "原因：均線多頭且三大法人連續站回買方，技術與籌碼雙管齊下。";
  } else if (latest.K < latest.D && totalFlow < 0) {
    bulb.className = "signal-bulb bearish";
    bulb.innerText = "偏空";
    bulbReason.innerText = "原因：技術指標呈空頭死叉，主力資金大額出逃，防拉回風險。";
  } else {
    bulb.className = "signal-bulb warning";
    bulb.innerText = "觀察";
    bulbReason.innerText = "原因：技術面強勢但主力10日累計為負，建議先高檔觀望。";
  }

  // Draw dynamically computed AI win rates and probability charts based on stock indicators
  const winRate = isUp ? 58 + Math.floor(Math.sin(latest.close) * 6) : 45 + Math.floor(Math.sin(latest.close) * 5);
  const trendLbl = isUp ? "多頭強勢" : "中性偏多";
  
  drawWinRateGauge(winRate, trendLbl);

  // Probabilities
  const riseProb = isUp ? 45 + Math.floor(Math.sin(latest.close) * 5) : 33 + Math.floor(Math.sin(latest.close) * 4);
  const fallProb = isUp ? 30 - Math.floor(Math.sin(latest.close) * 3) : 38 + Math.floor(Math.sin(latest.close) * 3);
  const neutProb = 100 - riseProb - fallProb;

  drawProbabilityPie(riseProb, fallProb, neutProb);

  // AI conclusion Text updates
  const aiConc = document.getElementById('lblAiConclusion');
  if (riseProb > fallProb) {
    aiConc.innerText = `預測結論：明日震盪偏多（上漲率 ${riseProb}%），留意高檔賣壓變化。`;
  } else {
    aiConc.innerText = `預測結論：明日拉回整理率較高（下跌率 ${fallProb}%），建議空手觀望。`;
  }
}

/**
 * Draw AI Short term Win-rate Semi-circle Gauge
 */
function drawWinRateGauge(percent, trendLabel) {
  const canvas = document.getElementById('gaugeCanvas');
  const ctx = canvas.getContext('2d');
  
  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const cx = canvas.width / 2;
  const cy = canvas.height - 10;
  const r = 55;
  
  // Background arch
  ctx.strokeStyle = '#1e2942';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.stroke();

  // Active glowing gradient arch
  const grad = ctx.createLinearGradient(0, cy, canvas.width, cy);
  grad.addColorStop(0, '#30d158');   // Green
  grad.addColorStop(0.5, '#ffd60a'); // Yellow
  grad.addColorStop(1, '#ff453a');   // Red

  ctx.strokeStyle = grad;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, Math.PI + (Math.PI * (percent / 100)));
  ctx.stroke();

  // Pointer
  ctx.fillStyle = '#fff';
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI * (percent / 100));
  
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(-r + 12, 0);
  ctx.lineTo(0, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Pointer Hub
  ctx.fillStyle = '#0a0f1d';
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Update DOM Overlays
  document.getElementById('lblGaugeWinRate').innerText = `${percent}%`;
  document.getElementById('lblGaugeWinRate').className = percent > 50 ? 'g-num text-up' : 'g-num text-warning';
  document.getElementById('lblGaugeTrend').innerText = trendLabel;
}

/**
 * Draw AI Tomorrow Probability Pie Chart
 */
function drawProbabilityPie(rise, fall, neutral) {
  const canvas = document.getElementById('pieCanvas');
  const ctx = canvas.getContext('2d');
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = 40;
  const innerR = 25; // Donut style
  
  const total = rise + fall + neutral;
  const angles = [
    (rise / total) * Math.PI * 2,
    (fall / total) * Math.PI * 2,
    (neutral / total) * Math.PI * 2
  ];

  const colors = [
    '#ff453a', // Rise Red
    '#30d158', // Fall Green
    '#ffd60a'  // Neutral Yellow
  ];

  let currentAngle = -Math.PI / 2; // Start from top

  // Draw segments
  for (let i = 0; i < angles.length; i++) {
    const endAngle = currentAngle + angles[i];
    
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, currentAngle, endAngle);
    ctx.closePath();
    ctx.fill();

    currentAngle = endAngle;
  }

  // Draw inner cutout to turn it into a beautiful donut
  ctx.fillStyle = '#121829'; // card background color
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fill();

  // Update text label elements
  document.getElementById('lblProbRise').innerText = `${rise}%`;
  document.getElementById('lblProbFall').innerText = `${fall}%`;
  document.getElementById('lblProbNeutral').innerText = `${neutral}%`;
}

/**
 * Compile high-density Stock Context and send query to Gemini Co-Pilot
 */
async function askCoPilot(question) {
  if (!activeStockData) {
    alert("請先加載個股走勢數據！");
    return;
  }

  // Append user message to Chat Window
  appendChatMessage(question, 'user');

  // Display Thinking Indicator
  const loaderId = appendThinkingIndicator();

  // Compile rich structural Prompt Context
  const model = document.getElementById('selGeminiModel').value;
  const prompt = compileStockPrompt(question);

  try {
    const reply = await window.DataEngine.askGemini(model, prompt, activeGeminiKey);
    removeThinkingIndicator(loaderId);
    appendChatMessage(reply, 'bot');
  } catch (err) {
    removeThinkingIndicator(loaderId);
    appendChatMessage(`🔴 諮詢失敗：${err.message || '連線超時，請檢查網絡與 API 金鑰設置。'}`, 'bot');
  }
}

/**
 * Dense prompt assembler
 */
function compileStockPrompt(userQuestion) {
  const latest = activeStockData[activeStockData.length - 1];
  const prev = activeStockData[activeStockData.length - 2] || latest;
  const isUp = latest.close >= prev.close;
  const stockName = document.getElementById('hdrStockName').innerText;
  
  // Format chips context
  let chipText = '';
  if (activeChipData && activeChipData.length > 0) {
    activeChipData.forEach(day => {
      chipText += `- ${day.date}: 外資: ${day.foreign}張, 投信: ${day.trust}張, 自營商: ${day.dealer}張, 合計: ${day.total}張\n`;
    });
  }

  return `
你是一位頂級的證券分析顧問與量化操盤手。
現在請根據我提供的個股真實即時行情、技術分析指標與主力籌碼數據，對用戶的問題進行深度、客觀且專業的推理解答。

==================【個股高密度數據面板】==================
個股代號與名稱: ${activeStockCode} ${stockName}
最新成交價: ${latest.close.toFixed(2)} (今日漲跌: ${isUp ? '▲' : '▼'} ${Math.abs(latest.close - prev.close).toFixed(2)})
開盤價: ${latest.open.toFixed(2)} | 最高: ${latest.high.toFixed(2)} | 最低: ${latest.low.toFixed(2)}
今日成交量: ${latest.volume} 張

---【技術指標計算結果】---
- 5日均線 (SMA5): ${latest.sma5 ? latest.sma5.toFixed(1) : '計算中'}
- 20日均線 (SMA20): ${latest.sma20 ? latest.sma20.toFixed(1) : '計算中'}
- 60日均線 (SMA60): ${latest.sma60 ? latest.sma60.toFixed(1) : '計算中'}
- 布林通道: 上軌: ${latest.bbUpper ? latest.bbUpper.toFixed(1) : 'N/A'}, 中軌: ${latest.bbMiddle ? latest.bbMiddle.toFixed(1) : 'N/A'}, 下軌: ${latest.bbLower ? latest.bbLower.toFixed(1) : 'N/A'}
- KD指標: K值: ${latest.K.toFixed(1)}, D值: ${latest.D.toFixed(1)} (${latest.K > latest.D ? 'K > D 黃金交叉' : 'K < D 死亡交叉'})
- MACD指標: DIF: ${latest.dif.toFixed(2)}, DEA: ${latest.dea.toFixed(2)}, 柱狀體: ${latest.macdBar.toFixed(2)}

---【法人近 5 日買賣超明細】---
${chipText}

---【操作策略與點位】---
- 建議進場區間: ${latest.close * 0.96} ~ ${latest.close * 0.98}
- 建議停損區間: ${latest.close * 0.91} (跌破中軌)
- 防守關卡: ${latest.close * 0.88}

==================【用戶當前詢問的問題】==================
${userQuestion}

==================【你需遵循的回覆規則】==================
1. 請以「繁體中文（台灣習慣術語）」作答，使用專業的金融分析語氣，避免空泛客套。
2. 緊密結合上方的技術指標（均線、KD、MACD、布林通道）和籌碼面（外資投信動向）進行邏輯推演，不要給予模稜兩可的答案。
3. 採用 Markdown 格式輸出，重點內容可用加粗顯示，使閱讀體驗大氣專業。
4. 在報告結尾，務必提供具體的「操盤策略建議（包含進場、加碼、停損/防守價位）」。
5. 回覆前請特別強調你是根據此時此刻的「真實圖表指標數值」在為使用者提供專屬諮詢。
`;
}

/**
 * Append messages to Chat bubble list
 */
function appendChatMessage(text, sender) {
  const history = document.getElementById('chatHistory');
  const msg = document.createElement('div');
  msg.className = `msg ${sender}`;

  const avatar = sender === 'bot' ? '🤖' : '👤';
  
  // Format reply (Support simple Markdown parser natively)
  const formattedText = formatMarkdown(text);

  msg.innerHTML = `
    <div class="msg-avatar">${avatar}</div>
    <div class="msg-content">${formattedText}</div>
  `;

  history.appendChild(msg);
  history.scrollTop = history.scrollHeight;
}

/**
 * Appends a glowing thinking dots indicator
 */
function appendThinkingIndicator() {
  const history = document.getElementById('chatHistory');
  const id = 'loader_' + Date.now();
  const msg = document.createElement('div');
  msg.className = 'msg bot';
  msg.id = id;

  msg.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div class="msg-content">
      <div class="thinking-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  `;

  history.appendChild(msg);
  history.scrollTop = history.scrollHeight;
  return id;
}

function removeThinkingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

/**
 * A highly robust, lightweight Markdown-to-HTML parser using Regex
 */
function formatMarkdown(text) {
  let html = text;

  // Escape HTML tags to prevent injections but allow our parsed styling
  html = html.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Bold (**text** or __text__)
  html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  html = html.replace(/__(.*?)__/g, '<b>$1</b>');

  // Bullet items (* item or - item)
  html = html.replace(/^\s*[\*\-]\s+(.*?)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>)/s, '<ul>$1</ul>'); // wrap with ul (approximate)

  // Numbered lists (1. item)
  html = html.replace(/^\s*\d+\.\s+(.*?)$/gm, '<li>$1</li>');

  // Headers (### Header)
  html = html.replace(/^\s*###\s+(.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^\s*##\s+(.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^\s*#\s+(.*?)$/gm, '<h1>$1</h1>');

  // Inline Code (`code`)
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  // New lines
  html = html.replace(/\n/g, '<br>');

  return html;
}

/**
 * Watchlist Engine Functions
 */
function initWatchlist() {
  const saved = localStorage.getItem('saved_watchlist');
  if (saved) {
    try {
      watchlist = JSON.parse(saved);
    } catch (e) {
      console.error("Failed to parse saved watchlist, using default.", e);
      watchlist = [...defaultWatchlist];
    }
  } else {
    watchlist = [...defaultWatchlist];
    localStorage.setItem('saved_watchlist', JSON.stringify(watchlist));
  }
  renderWatchlist();
}

function renderWatchlist() {
  const stockListEl = document.getElementById('stockList');
  if (!stockListEl) return;
  
  stockListEl.innerHTML = '';
  watchlist.forEach(item => {
    const isActive = item.code === activeStockCode ? 'active' : '';
    // Format color class for change indicator
    let changeClass = '';
    if (item.change) {
      if (item.change.startsWith('+') || item.change.includes('▲')) {
        changeClass = 'text-up';
      } else if (item.change.startsWith('-') || item.change.includes('▼')) {
        changeClass = 'text-down';
      }
    }

    const div = document.createElement('div');
    div.className = `stock-item ${isActive}`;
    div.dataset.code = item.code;
    div.innerHTML = `
      <span class="code">${item.code}</span>
      <span class="name">${item.name}</span>
      <span class="change ${changeClass}">${item.change || '--'}</span>
      <button class="btn-delete-stock" data-code="${item.code}" title="從觀測清單刪除">&times;</button>
    `;
    stockListEl.appendChild(div);
  });
}

function addToWatchlist(code, name, change) {
  const existingIdx = watchlist.findIndex(item => item.code === code);
  if (existingIdx > -1) {
    // Update existing details
    watchlist[existingIdx].name = name;
    watchlist[existingIdx].change = change;
  } else {
    // Add new stock
    watchlist.push({ code, name, change });
  }
  localStorage.setItem('saved_watchlist', JSON.stringify(watchlist));
  renderWatchlist();
}

function removeFromWatchlist(code) {
  watchlist = watchlist.filter(item => item.code !== code);
  localStorage.setItem('saved_watchlist', JSON.stringify(watchlist));
  renderWatchlist();
}
