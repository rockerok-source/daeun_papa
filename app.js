const STORAGE_KEY = "soxl_loop_pwa_v5_state";

function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DEFAULT_LADDER = [
  { id: "net-0", name: "그물(-$0.01)", isNet: true, dropPct: 0, weightUnits: 16, useFullUnit: true },
  { id: "sink-1", name: "그물추 1단계", isNet: false, dropPct: -6.25, weightUnits: 1, useFullUnit: false },
  { id: "sink-2", name: "그물추 2단계", isNet: false, dropPct: -12.50, weightUnits: 1, useFullUnit: false },
  { id: "sink-3", name: "그물추 3단계", isNet: false, dropPct: -18.75, weightUnits: 1, useFullUnit: false },
  { id: "sink-4", name: "그물추 4단계", isNet: false, dropPct: -25.00, weightUnits: 2, useFullUnit: false },
  { id: "sink-5", name: "그물추 5단계", isNet: false, dropPct: -31.25, weightUnits: 2, useFullUnit: false },
  { id: "sink-6", name: "그물추 6단계", isNet: false, dropPct: -37.50, weightUnits: 2, useFullUnit: false },
  { id: "sink-7", name: "그물추 7단계", isNet: false, dropPct: -43.75, weightUnits: 3, useFullUnit: false },
  { id: "sink-8", name: "그물추 8단계", isNet: false, dropPct: -50.00, weightUnits: 4, useFullUnit: false }
];

const DEFAULT_STATE = {
  config: {
    totalSeed: 10000,
    beaconInvest: 0,
    beaconPct: 10,
    divisions: 18,
    ebbMult: 2.5,
    floodMult: 1.0,
    targetPct: 2.5,
    feePct: 0.07,
    compound: "Y",
    rebTqqqVal: 0,
    rebSoxlVal: 0
  },
  tqqq: {
    buyPrice: 0,
    qty: 0
  },
  orderInput: {
    date: getTodayStr(),
    tide: "썰물",
    prevSoxl: 0,
    liveSoxl: 0,
    prevTqqq: 0
  },
  ladder: structuredClone(DEFAULT_LADDER),
  buyOverrides: {},
  sellOverrides: {},
  lots: [],
  journal: []
};

const ZERO_STATE = {
  config: {
    totalSeed: 0,
    beaconInvest: 0,
    beaconPct: 0,
    divisions: 0,
    ebbMult: 0,
    floodMult: 0,
    targetPct: 0,
    feePct: 0,
    compound: "Y",
    rebTqqqVal: 0,
    rebSoxlVal: 0
  },
  tqqq: {
    buyPrice: 0,
    qty: 0
  },
  orderInput: {
    date: getTodayStr(),
    tide: "썰물",
    prevSoxl: 0,
    liveSoxl: 0,
    prevTqqq: 0
  },
  ladder: structuredClone(DEFAULT_LADDER),
  buyOverrides: {},
  sellOverrides: {},
  lots: [],
  journal: []
};

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const init = structuredClone(DEFAULT_STATE);
      init.orderInput.date = getTodayStr();
      return init;
    }
    const parsed = JSON.parse(raw);
    const merged = {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      config: { ...DEFAULT_STATE.config, ...(parsed.config || {}) },
      tqqq: { ...DEFAULT_STATE.tqqq, ...(parsed.tqqq || {}) },
      orderInput: { ...DEFAULT_STATE.orderInput, ...(parsed.orderInput || {}) },
      ladder: Array.isArray(parsed.ladder) && parsed.ladder.length > 0 ? parsed.ladder : structuredClone(DEFAULT_LADDER),
      buyOverrides: parsed.buyOverrides || {},
      sellOverrides: parsed.sellOverrides || {},
      lots: Array.isArray(parsed.lots) ? parsed.lots : [],
      journal: Array.isArray(parsed.journal) ? parsed.journal : []
    };
    // Remove legacy hardcoded TQQQ 62.50 / 16 default if user never edited it and has no beacon journal
    if (
      parsed.tqqq &&
      Number(parsed.tqqq.buyPrice) === 62.5 &&
      Number(parsed.tqqq.qty) === 16 &&
      !merged.journal.some((r) => r.side === "등대매수" || r.side === "등대매도")
    ) {
      merged.tqqq.buyPrice = 0;
      merged.tqqq.qty = 0;
      merged.config.beaconInvest = 0;
    }
    if (!merged.orderInput.date) {
      merged.orderInput.date = getTodayStr();
    }
    if (!merged.orderInput.liveSoxl && merged.orderInput.prevSoxl) {
      merged.orderInput.liveSoxl = merged.orderInput.prevSoxl;
    }
    return merged;
  } catch (e) {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(showToastMsg = false) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (showToastMsg) {
    showToast("모든 수치와 변경사항이 저장되었습니다.");
  }
}

function showToast(msg) {
  const el = document.getElementById("toastMsg");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 2000);
}

function fmtUsd(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? "-" : "";
  return `${sign}$${Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// 4 & 5. Next LP sequence helpers based on the latest LP ID in journal & lots
function getNextSoxlLotId() {
  let maxNum = 0;
  const extractNum = (idStr) => {
    const m = String(idStr || "").toUpperCase().match(/^LP-S?(\d+)$/);
    return m ? Number(m[1]) : 0;
  };
  state.journal.forEach((row) => {
    if (row.side === "매수" || row.side === "매도" || String(row.lotId || "").toUpperCase().startsWith("LP-S")) {
      const n = extractNum(row.lotId);
      if (n > maxNum) maxNum = n;
    }
  });
  state.lots.forEach((lot) => {
    const n = extractNum(lot.id);
    if (n > maxNum) maxNum = n;
  });
  return `LP-S${String(maxNum + 1).padStart(2, "0")}`;
}

function getNextBeaconLotId() {
  let maxNum = 0;
  state.journal.forEach((row) => {
    const m = String(row.lotId || "").toUpperCase().match(/^LP-T(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > maxNum) maxNum = n;
    }
  });
  return `LP-T${String(maxNum + 1).padStart(2, "0")}`;
}

function calcMetrics() {
  const cfg = state.config;
  const totalSeed = Number(cfg.totalSeed) || 0;
  const beaconInvest = Number(cfg.beaconInvest) || 0;
  const soxlInit = Math.max(0, totalSeed - beaconInvest);
  const feeRate = (Number(cfg.feePct) || 0) / 100;

  let realizedSum = 0;
  state.journal.forEach((row) => {
    if (row.side === "매도" || row.side === "등대매도") {
      const sellAmt = (Number(row.price) || 0) * (Number(row.qty) || 0);
      const buyAmt = (Number(row.refBuyPrice) || 0) * (Number(row.qty) || 0);
      const estFee = (sellAmt + buyAmt) * feeRate;
      realizedSum += (sellAmt - buyAmt - estFee);
    }
  });

  const soxlTotalAsset = soxlInit + realizedSum;
  const baseForUnit = cfg.compound === "Y" ? soxlTotalAsset : soxlInit;
  const divs = Number(cfg.divisions) || 0;
  const baseDivAmt = divs > 0 ? baseForUnit / divs : 0;

  const ebbMult = Number(cfg.ebbMult) || 0;
  const floodMult = Number(cfg.floodMult) || 0;
  const activeMult = state.orderInput.tide === "밀물" ? floodMult : ebbMult;
  const activeUnit = baseDivAmt * activeMult;

  const prevSoxl = Number(state.orderInput.prevSoxl) || 0;
  const liveSoxl = Number(state.orderInput.liveSoxl) || prevSoxl;
  const evalSoxlPrice = liveSoxl > 0 ? liveSoxl : prevSoxl;
  const prevTqqq = Number(state.orderInput.prevTqqq) || 0;

  // Open SOXL lots & manual journal buy/sell rows
  let openCost = 0;
  let openQty = 0;
  let openMarketVal = 0;
  const lotsById = {};

  state.lots.forEach((lot) => {
    const q = Number(lot.qty) || 0;
    const p = Number(lot.buyPrice) || 0;
    openQty += q;
    openCost += p * q;
    openMarketVal += evalSoxlPrice * q;
    if (lot.id) {
      lotsById[lot.id] = (lotsById[lot.id] || 0) + q;
    }
  });

  let manualSoxlCost = 0;
  let manualSoxlQty = 0;
  let manualTqqqCost = 0;
  let manualTqqqQty = 0;

  const manualBuyQtyByLot = {};
  const sellQtyByLot = {};
  state.journal.forEach((row) => {
    const q = Number(row.qty) || 0;
    if (row.side === "매수" && row.lotId && !lotsById[row.lotId]) {
      manualBuyQtyByLot[row.lotId] = (manualBuyQtyByLot[row.lotId] || 0) + q;
    } else if (row.side === "매도" && row.lotId) {
      sellQtyByLot[row.lotId] = (sellQtyByLot[row.lotId] || 0) + q;
    }
  });

  state.journal.forEach((row) => {
    const p = Number(row.price) || 0;
    const q = Number(row.qty) || 0;
    if (row.side === "매수" && row.lotId && !lotsById[row.lotId]) {
      const remQ = Math.max(0, (manualBuyQtyByLot[row.lotId] || 0) - (sellQtyByLot[row.lotId] || 0));
      if (remQ > 0 && (manualBuyQtyByLot[row.lotId] || 0) > 0) {
        const ratio = remQ / manualBuyQtyByLot[row.lotId];
        const effQty = q * ratio;
        manualSoxlQty += effQty;
        manualSoxlCost += p * effQty;
        manualBuyQtyByLot[row.lotId] = 0;
      }
    } else if (row.side === "등대매수") {
      manualTqqqQty += q;
      manualTqqqCost += p * q;
    } else if (row.side === "등대매도") {
      manualTqqqQty -= q;
      const avgCost = (Number(row.refBuyPrice) || Number(state.tqqq.buyPrice) || 0);
      manualTqqqCost -= avgCost * q;
    }
  });

  openQty += manualSoxlQty;
  openCost += manualSoxlCost;
  openMarketVal += evalSoxlPrice * manualSoxlQty;

  const cashBalance = soxlTotalAsset - openCost;

  // TQQQ auto calculation from user input (buyPrice * qty) + manual beacon journal rows
  const tqqqBasePrice = Number(state.tqqq.buyPrice) || 0;
  const tqqqBaseQty = Number(state.tqqq.qty) || 0;
  const tqqqBaseCost = Number((tqqqBasePrice * tqqqBaseQty).toFixed(2));
  const tqqqQty = Math.max(0, tqqqBaseQty + manualTqqqQty);
  const tqqqActualCost = Math.max(0, Number((tqqqBaseCost + manualTqqqCost).toFixed(2)));
  const tqqqAvgPrice = tqqqQty > 0
    ? Number((tqqqActualCost / tqqqQty).toFixed(2))
    : tqqqBasePrice;
  const tqqqEvalVal = prevTqqq > 0
    ? prevTqqq * tqqqQty
    : tqqqActualCost;
  const tqqqPnl = tqqqEvalVal - tqqqActualCost;

  const activeBeaconInvest = tqqqActualCost;
  const totalPortfolio = activeBeaconInvest + soxlTotalAsset;
  const beaconRatio = totalPortfolio > 0 ? (activeBeaconInvest / totalPortfolio) * 100 : 0;

  return {
    totalSeed,
    beaconInvest: activeBeaconInvest,
    soxlInit,
    realizedSum,
    soxlTotalAsset,
    baseDivAmt,
    ebbMult,
    floodMult,
    activeMult,
    activeUnit,
    openCost,
    openQty,
    openMarketVal,
    openPnl: openMarketVal - openCost,
    cashBalance,
    beaconRatio,
    tqqqBuyPrice: tqqqAvgPrice,
    tqqqBasePrice,
    tqqqQty,
    tqqqActualCost,
    tqqqEvalVal,
    tqqqPnl
  };
}

function syncBeaconConfigFromCalc(m) {
  state.config.beaconInvest = m.tqqqActualCost;
  if ((Number(state.config.totalSeed) || 0) > 0) {
    state.config.beaconPct = Number(((m.tqqqActualCost / Number(state.config.totalSeed)) * 100).toFixed(2));
  }
}

function renderAll() {
  syncBeaconConfigFromCalc(calcMetrics());
  const m = calcMetrics();
  const cfg = state.config;
  const oi = state.orderInput;

  document.getElementById("headerSummary").textContent =
    `총시드 ${fmtUsd(m.totalSeed)} · 배 ${cfg.divisions}칸 · ${oi.tide} ×${m.activeMult}`;

  // Top 2 Summary Cards
  const totalInvested = m.openCost + m.tqqqActualCost;
  const loopRemainCash = Math.max(0, m.cashBalance);
  const totalCumulativeProfit = m.realizedSum + m.openPnl + m.tqqqPnl;
  const seedReturnRate = m.totalSeed > 0 ? (totalCumulativeProfit / m.totalSeed) * 100 : 0;

  const topInvEl = document.getElementById("topInvestedAmount");
  const topRemCashEl = document.getElementById("topLoopRemainCash");
  const topProfitEl = document.getElementById("topTotalProfit");
  const topRateEl = document.getElementById("topSeedReturnPct");

  if (topInvEl) topInvEl.textContent = fmtUsd(totalInvested);
  if (topRemCashEl) topRemCashEl.textContent = `루프 잔여현금: ${fmtUsd(loopRemainCash)}`;

  if (topProfitEl) {
    const sign = totalCumulativeProfit >= 0 ? "+" : "-";
    topProfitEl.textContent = `${sign}${fmtUsd(Math.abs(totalCumulativeProfit))}`;
    topProfitEl.className = `kpi-val ${totalCumulativeProfit >= 0 ? "accent-green" : "accent-red"}`;
  }

  if (topRateEl) {
    const rSign = seedReturnRate >= 0 ? "+" : "-";
    topRateEl.textContent = `시드 대비 수익률: ${rSign}${Math.abs(seedReturnRate).toFixed(2)}%`;
  }

  document.getElementById("kpiSoxlTotal").textContent = fmtUsd(m.soxlTotalAsset);
  const relEl = document.getElementById("kpiRealized");
  relEl.textContent = `실현손익: ${fmtUsd(m.realizedSum)}`;
  relEl.className = `kpi-hint ${m.realizedSum > 0 ? "accent-green" : (m.realizedSum < 0 ? "accent-red" : "")}`;

  document.getElementById("kpiCash").textContent = fmtUsd(m.cashBalance);
  document.getElementById("kpiLotsCost").textContent = `보유원금: ${fmtUsd(m.openCost)} (${m.openQty}주)`;

  document.getElementById("kpiUnitAmt").textContent = fmtUsd(m.activeUnit);
  document.getElementById("kpiUnitHint").textContent = `${oi.tide} ×${m.activeMult} (1칸 ${fmtUsd(m.baseDivAmt)})`;

  document.getElementById("kpiBeaconRatio").textContent = `${fmtUsd(m.tqqqActualCost)} (${m.beaconRatio.toFixed(1)}%)`;
  document.getElementById("kpiBeaconVal").textContent = `평단 $${m.tqqqBuyPrice.toFixed(2)} · ${m.tqqqQty}주`;

  // Order Inputs
  document.getElementById("inpOrderDate").value = oi.date;
  document.getElementById("selTide").value = oi.tide;
  document.getElementById("lblActiveMult").textContent =
    oi.tide === "썰물" ? "썰물 하락 배수(배)" : "밀물 상승 배수(배)";
  document.getElementById("inpOrderMult").value = m.activeMult;
  document.getElementById("inpPrevSoxl").value = oi.prevSoxl || "";
  document.getElementById("inpLiveSoxl").value = oi.liveSoxl || "";
  document.getElementById("inpPrevTqqq").value = oi.prevTqqq || "";

  // Live vs Prev Close comparison bar
  const prevS = Number(oi.prevSoxl) || 0;
  const liveS = Number(oi.liveSoxl) || prevS;
  document.getElementById("lblSoxlPrevClose").textContent = fmtUsd(prevS);
  const livePriceEl = document.getElementById("lblSoxlLivePrice");
  const liveDiffEl = document.getElementById("lblSoxlLiveDiff");
  livePriceEl.textContent = fmtUsd(liveS);
  if (prevS > 0 && liveS > 0) {
    const diffPct = ((liveS - prevS) / prevS) * 100;
    const dSign = diffPct >= 0 ? "+" : "";
    liveDiffEl.textContent = `(${dSign}${diffPct.toFixed(2)}%)`;
    livePriceEl.className = diffPct >= 0 ? "accent-green" : "accent-red";
  } else {
    liveDiffEl.textContent = "(0.00%)";
    livePriceEl.className = "accent-blue";
  }

  // 2. TQQQ Inputs: Free input without locked default values
  document.getElementById("inpTqqqInvest").value = m.tqqqActualCost.toFixed(2);
  document.getElementById("inpTqqqBuyPrice").value = m.tqqqBuyPrice > 0 ? m.tqqqBuyPrice.toFixed(2) : "";
  document.getElementById("inpTqqqQty").value = m.tqqqQty > 0 ? m.tqqqQty : "";
  document.getElementById("tqqqSummaryLine").innerHTML =
    `총투자금: <strong>${fmtUsd(m.tqqqActualCost)}</strong> · 평단: <strong>$${m.tqqqBuyPrice.toFixed(2)}</strong> · 수량: <strong>${m.tqqqQty}주</strong> · 평가손익: <strong class="${m.tqqqPnl >= 0 ? "accent-green" : "accent-red"}">${fmtUsd(m.tqqqPnl)}</strong>`;

  // 5. Next LP sequence indicator
  const nextSeqEl = document.getElementById("nextLotSeqHint");
  if (nextSeqEl) {
    nextSeqEl.textContent = `다음 매수 순번: ${getNextSoxlLotId()}`;
  }

  const tideBadge = document.getElementById("tideBadge");
  tideBadge.textContent = `${oi.tide} ×${m.activeMult}`;
  tideBadge.className = oi.tide === "썰물" ? "pill ebb" : "pill";

  renderBuyOrders(m);
  renderSellOrders(m);
  renderLots(m);
  renderJournal(m);
  renderSettingsAndRebal(m);
}

function renderBuyOrders(m) {
  const listEl = document.getElementById("buyOrderList");
  listEl.innerHTML = "";
  // 1. LOC buy calculation strictly uses prevSoxl (전일 종가)
  const prevSoxl = Number(state.orderInput.prevSoxl) || 0;
  const feeRate = (Number(state.config.feePct) || 0) / 100;

  const sinkRows = state.ladder.filter((item) => !item.isNet);
  const totalSinkWeight = sinkRows.reduce((acc, item) => acc + (Number(item.weightUnits) || 1), 0) || 1;

  let sumAlloc = 0;
  let sumQty = 0;
  let sumEst = 0;

  state.ladder.forEach((spec, idx) => {
    const ov = state.buyOverrides[spec.id] || {};

    const defaultDropPct = spec.isNet
      ? (prevSoxl > 0 ? Number(((-0.01 / prevSoxl) * 100).toFixed(2)) : 0)
      : Number(spec.dropPct);
    const dropPct = ov.dropPct !== undefined ? Number(ov.dropPct) : defaultDropPct;

    const defaultPrice = spec.isNet && ov.dropPct === undefined
      ? Number(Math.max(0, prevSoxl - 0.01).toFixed(2))
      : Number(Math.max(0, prevSoxl * (1 + dropPct / 100)).toFixed(2));
    const price = ov.price !== undefined ? Number(ov.price) : defaultPrice;

    const frac = spec.useFullUnit ? 1.0 : ((Number(spec.weightUnits) || 1) / totalSinkWeight);
    const defaultAlloc = Number((m.activeUnit * frac).toFixed(2));
    const alloc = ov.alloc !== undefined ? Number(ov.alloc) : defaultAlloc;

    const defaultQty = price > 0
      ? Math.max(spec.isNet ? 0 : (alloc > 0 ? 1 : 0), Math.floor(alloc / (price * (1 + feeRate))))
      : 0;
    const qty = ov.qty !== undefined ? Math.max(0, Math.floor(Number(ov.qty) || 0)) : defaultQty;
    const estAmt = Number((price * qty * (1 + feeRate)).toFixed(2));

    sumAlloc += alloc;
    sumQty += qty;
    sumEst += estAmt;

    const card = document.createElement("div");
    card.className = "order-row-card";
    card.innerHTML = `
      <div class="order-row-top">
        <div class="order-row-title">
          <span>${spec.name}</span>
        </div>
        <div class="order-row-meta">
          <span class="muted-sm">예상 ${fmtUsd(estAmt)}</span>
          <button class="btn-exec" data-exec-buy="${spec.id}" data-price="${price}" data-qty="${qty}">체결</button>
          ${!spec.isNet ? `<button class="btn-del" data-del-sink="${idx}">삭제</button>` : ""}
        </div>
      </div>
      <div class="order-fields-grid">
        <div class="mini-field">
          <label>등락률(%)</label>
          <input type="number" step="0.01" class="mini-input" data-buy-id="${spec.id}" data-idx="${idx}" data-field="dropPct" value="${dropPct}" />
        </div>
        <div class="mini-field">
          <label>LOC 지정가($)</label>
          <input type="number" step="0.01" class="mini-input" data-buy-id="${spec.id}" data-idx="${idx}" data-field="price" value="${price.toFixed(2)}" />
        </div>
        <div class="mini-field">
          <label>배정액($)</label>
          <input type="number" step="1" class="mini-input" data-buy-id="${spec.id}" data-idx="${idx}" data-field="alloc" value="${alloc.toFixed(2)}" />
        </div>
        <div class="mini-field">
          <label>수량(주)</label>
          <input type="number" step="1" class="mini-input" data-buy-id="${spec.id}" data-idx="${idx}" data-field="qty" value="${qty}" />
        </div>
      </div>
    `;
    listEl.appendChild(card);
  });

  document.getElementById("buySumAlloc").textContent = fmtUsd(sumAlloc);
  document.getElementById("buySumQty").textContent = `${sumQty}주`;
  document.getElementById("buySumEst").textContent = fmtUsd(sumEst);

  const banner = document.getElementById("cashStatusBanner");
  const checkText = document.getElementById("cashCheckText");
  const checkAmt = document.getElementById("cashCheckAmount");
  checkAmt.textContent = `${fmtUsd(sumEst)} / 잔고 ${fmtUsd(m.cashBalance)}`;

  if (sumEst > m.cashBalance) {
    banner.className = "status-banner over";
    checkText.textContent = "가용 현금 초과! 하단 수량·금액을 조정하세요.";
  } else {
    banner.className = "status-banner";
    checkText.textContent = "가용 현금 범위 내 주문 가능";
  }

  listEl.querySelectorAll("input.mini-input").forEach((inp) => {
    inp.addEventListener("change", (e) => {
      const id = e.target.dataset.buyId;
      const idx = Number(e.target.dataset.idx);
      const field = e.target.dataset.field;
      const val = Number(e.target.value) || 0;
      const curOv = { ...(state.buyOverrides[id] || {}) };

      if (field === "dropPct") {
        curOv.dropPct = val;
        if (state.ladder[idx]) state.ladder[idx].dropPct = val;
        delete curOv.price;
        delete curOv.qty;
      } else if (field === "price") {
        curOv.price = val;
        if (prevSoxl > 0) {
          const calcPct = Number((((val - prevSoxl) / prevSoxl) * 100).toFixed(2));
          curOv.dropPct = calcPct;
          if (state.ladder[idx]) state.ladder[idx].dropPct = calcPct;
        }
        delete curOv.qty;
      } else if (field === "alloc") {
        curOv.alloc = val;
        delete curOv.qty;
      } else if (field === "qty") {
        curOv.qty = Math.max(0, Math.floor(val));
      }

      state.buyOverrides[id] = curOv;
      saveState();
      renderAll();
    });
  });

  listEl.querySelectorAll("button.btn-exec").forEach((btn) => {
    btn.addEventListener("click", () => {
      const price = Number(btn.dataset.price) || 0;
      const qty = Math.floor(Number(btn.dataset.qty) || 0);
      if (price <= 0 || qty <= 0) return;
      // 5. Assign next LP-Sxx sequence after latest journal LP
      const lotId = getNextSoxlLotId();
      const dt = state.orderInput.date;
      const td = state.orderInput.tide;

      state.lots.push({ id: lotId, date: dt, buyPrice: price, qty });
      state.journal.push({ date: dt, tide: td, side: "매수", lotId, price, qty, refBuyPrice: price });
      saveState();
      renderAll();
      showToast(`${lotId} 매수 체결 등록 완료`);
    });
  });

  listEl.querySelectorAll("button.btn-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.delSink);
      const removed = state.ladder.splice(idx, 1)[0];
      if (removed) {
        delete state.buyOverrides[removed.id];
      }
      let sinkNum = 1;
      state.ladder.forEach((item) => {
        if (!item.isNet) {
          item.name = `그물추 ${sinkNum}단계`;
          sinkNum += 1;
        }
      });
      saveState();
      renderAll();
    });
  });
}

function renderSellOrders(m) {
  const listEl = document.getElementById("sellOrderList");
  listEl.innerHTML = "";
  const targetRate = (Number(state.config.targetPct) || 0) / 100;
  const feeRate = (Number(state.config.feePct) || 0) / 100;

  // 5. Build display list from state.lots; if empty, derive open lots from journal after latest LP sequence
  const displayLots = state.lots.map((lot, idx) => ({ lot, idx, fromJournal: false }));

  if (displayLots.length === 0) {
    // Check unclosed buys in journal
    const map = {};
    state.journal.forEach((row) => {
      if (!row.lotId) return;
      if (row.side === "매수") {
        if (!map[row.lotId]) {
          map[row.lotId] = { id: row.lotId, date: row.date, buyPrice: Number(row.price) || 0, qty: 0 };
        }
        map[row.lotId].qty += Number(row.qty) || 0;
        map[row.lotId].buyPrice = Number(row.price) || map[row.lotId].buyPrice;
      } else if (row.side === "매도" && map[row.lotId]) {
        map[row.lotId].qty -= Number(row.qty) || 0;
      }
    });
    Object.values(map).forEach((item, i) => {
      if (item.qty > 0) {
        displayLots.push({ lot: item, idx: `j-${i}`, fromJournal: true });
      }
    });
  }

  const sortedByPrice = [...displayLots].sort((a, b) => Number(a.lot.buyPrice) - Number(b.lot.buyPrice));
  const rankMap = {};
  sortedByPrice.forEach((item, rIdx) => {
    rankMap[item.idx] = rIdx + 1;
  });

  if (displayLots.length === 0) {
    listEl.innerHTML = `<div class="muted-sm" style="text-align:center; padding:12px;">미청산 보유 묶음이 없습니다. 다음 매수 시 <strong>${getNextSoxlLotId()}</strong> 순번으로 생성됩니다.</div>`;
    return;
  }

  displayLots.forEach(({ lot, idx, fromJournal }) => {
    const ov = state.sellOverrides[idx] || {};
    const buyPrice = Number(lot.buyPrice) || 0;
    const qty = Number(lot.qty) || 0;
    const defaultTargetPrice = Number((buyPrice * (1 + targetRate)).toFixed(2));
    const targetPrice = ov.targetPrice !== undefined ? Number(ov.targetPrice) : defaultTargetPrice;
    const sellQty = ov.qty !== undefined ? Math.max(0, Math.floor(Number(ov.qty) || 0)) : qty;

    const grossSell = targetPrice * sellQty;
    const grossBuy = buyPrice * sellQty;
    const estNetPnl = grossSell - grossBuy - (grossSell + grossBuy) * feeRate;
    const rank = rankMap[idx];

    const card = document.createElement("div");
    card.className = `order-row-card ${rank === 1 ? "prio1" : ""}`;
    card.innerHTML = `
      <div class="order-row-top">
        <div class="order-row-title">
          <span class="${rank === 1 ? "accent-green" : ""}">${rank}순위</span>
          <span>${lot.id}</span>
          <span class="muted-sm">(매수 ${fmtUsd(buyPrice)})</span>
        </div>
        <div class="order-row-meta">
          <span class="muted-sm">예상 <strong class="${estNetPnl >= 0 ? "accent-green" : "accent-red"}">${fmtUsd(estNetPnl)}</strong></span>
          <button class="btn-exec" data-exec-sell="${idx}" data-from-j="${fromJournal ? "1" : "0"}" data-lot-id="${lot.id}" data-buy-price="${buyPrice}" data-price="${targetPrice}" data-qty="${sellQty}">익절</button>
          ${!fromJournal ? `<button class="btn-del" data-del-sell-lot="${idx}">삭제</button>` : ""}
        </div>
      </div>
      <div class="order-fields-grid sell-grid">
        <div class="mini-field">
          <label>매수 평단가($)</label>
          <input type="number" step="0.01" class="mini-input" data-sell-idx="${idx}" data-from-j="${fromJournal ? "1" : "0"}" data-field="buyPrice" value="${buyPrice.toFixed(2)}" />
        </div>
        <div class="mini-field">
          <label>매도 수량(주)</label>
          <input type="number" step="1" class="mini-input" data-sell-idx="${idx}" data-from-j="${fromJournal ? "1" : "0"}" data-field="qty" value="${sellQty}" />
        </div>
        <div class="mini-field">
          <label>목표 매도가($)</label>
          <input type="number" step="0.01" class="mini-input" data-sell-idx="${idx}" data-from-j="${fromJournal ? "1" : "0"}" data-field="targetPrice" value="${targetPrice.toFixed(2)}" />
        </div>
      </div>
    `;
    listEl.appendChild(card);
  });

  listEl.querySelectorAll("input.mini-input").forEach((inp) => {
    inp.addEventListener("change", (e) => {
      const idx = e.target.dataset.sellIdx;
      const fromJ = e.target.dataset.fromJ === "1";
      const field = e.target.dataset.field;
      const val = Number(e.target.value) || 0;
      if (!fromJ && field === "buyPrice") {
        state.lots[Number(idx)].buyPrice = val;
        delete state.sellOverrides[idx];
      } else {
        state.sellOverrides[idx] = { ...(state.sellOverrides[idx] || {}), [field]: val };
      }
      saveState();
      renderAll();
    });
  });

  listEl.querySelectorAll("button.btn-exec").forEach((btn) => {
    btn.addEventListener("click", () => {
      const fromJ = btn.dataset.fromJ === "1";
      const sellPrice = Number(btn.dataset.price) || 0;
      const sellQty = Math.floor(Number(btn.dataset.qty) || 0);
      if (sellPrice <= 0 || sellQty <= 0) return;

      if (fromJ) {
        const lotId = btn.dataset.lotId;
        const buyPrice = Number(btn.dataset.buyPrice) || 0;
        state.journal.push({
          date: state.orderInput.date,
          tide: state.orderInput.tide,
          side: "매도",
          lotId,
          price: sellPrice,
          qty: sellQty,
          refBuyPrice: buyPrice
        });
        state.sellOverrides = {};
        saveState();
        renderAll();
        showToast(`${lotId} 익절 매도 확정 (실현손익 반영)`);
        return;
      }

      const idx = Number(btn.dataset.execSell);
      const lot = state.lots[idx];
      if (!lot) return;

      state.journal.push({
        date: state.orderInput.date,
        tide: state.orderInput.tide,
        side: "매도",
        lotId: lot.id,
        price: sellPrice,
        qty: sellQty,
        refBuyPrice: Number(lot.buyPrice) || 0
      });

      if (sellQty >= Number(lot.qty)) {
        state.lots.splice(idx, 1);
      } else {
        lot.qty = Number(lot.qty) - sellQty;
      }
      state.sellOverrides = {};
      saveState();
      renderAll();
      showToast(`${lot.id} 익절 매도 확정 (실현손익 반영)`);
    });
  });

  listEl.querySelectorAll("button.btn-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.delSellLot);
      state.lots.splice(idx, 1);
      state.sellOverrides = {};
      saveState();
      renderAll();
    });
  });
}

function renderLots(m) {
  const listEl = document.getElementById("lotsList");
  listEl.innerHTML = "";
  const evalSoxl = Number(state.orderInput.liveSoxl) || Number(state.orderInput.prevSoxl) || 0;

  let sumQty = 0;
  let sumCost = 0;
  let sumPnl = 0;

  if (state.lots.length === 0) {
    listEl.innerHTML = `<div class="muted-sm" style="text-align:center; padding:12px;">보유 중인 묶음이 없습니다.</div>`;
  }

  state.lots.forEach((lot, idx) => {
    const bp = Number(lot.buyPrice) || 0;
    const q = Number(lot.qty) || 0;
    const cost = bp * q;
    const pnl = (evalSoxl - bp) * q;
    sumQty += q;
    sumCost += cost;
    sumPnl += pnl;

    const card = document.createElement("div");
    card.className = "order-row-card";
    card.innerHTML = `
      <div class="order-row-top">
        <div class="order-row-title">
          <span>${lot.id}</span>
          <span class="muted-sm">원금 ${fmtUsd(cost)}</span>
        </div>
        <div class="order-row-meta">
          <span class="${pnl >= 0 ? "accent-green" : "accent-red"}"><strong>${fmtUsd(pnl)}</strong></span>
          <button class="btn-del" data-del-lot="${idx}">삭제</button>
        </div>
      </div>
      <div class="order-fields-grid">
        <div class="mini-field">
          <label>묶음ID</label>
          <input type="text" class="mini-input center" data-lot-idx="${idx}" data-field="id" value="${lot.id}" />
        </div>
        <div class="mini-field">
          <label>매수일</label>
          <input type="text" class="mini-input center" data-lot-idx="${idx}" data-field="date" value="${lot.date}" />
        </div>
        <div class="mini-field">
          <label>매수가($)</label>
          <input type="number" step="0.01" class="mini-input" data-lot-idx="${idx}" data-field="buyPrice" value="${bp.toFixed(2)}" />
        </div>
        <div class="mini-field">
          <label>수량(주)</label>
          <input type="number" step="1" class="mini-input" data-lot-idx="${idx}" data-field="qty" value="${q}" />
        </div>
      </div>
    `;
    listEl.appendChild(card);
  });

  document.getElementById("lotSumQty").textContent = `${sumQty}주`;
  document.getElementById("lotSumCost").textContent = fmtUsd(sumCost);
  const lotPnlEl = document.getElementById("lotSumPnl");
  lotPnlEl.textContent = fmtUsd(sumPnl);
  lotPnlEl.className = sumPnl >= 0 ? "accent-green" : "accent-red";

  listEl.querySelectorAll("input.mini-input").forEach((inp) => {
    inp.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.lotIdx);
      const field = e.target.dataset.field;
      if (field === "id" || field === "date") {
        state.lots[idx][field] = e.target.value;
      } else {
        state.lots[idx][field] = Number(e.target.value) || 0;
      }
      saveState();
      renderAll();
    });
  });

  listEl.querySelectorAll("button.btn-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.lots.splice(Number(btn.dataset.delLot), 1);
      saveState();
      renderAll();
    });
  });
}

function renderJournal(m) {
  const listEl = document.getElementById("journalList");
  listEl.innerHTML = "";
  const feeRate = (Number(state.config.feePct) || 0) / 100;

  if (state.journal.length === 0) {
    listEl.innerHTML = `<div class="muted-sm" style="text-align:center; padding:12px;">기록된 매매일지가 없습니다.</div>`;
  }

  state.journal.forEach((row, idx) => {
    const pr = Number(row.price) || 0;
    const q = Number(row.qty) || 0;
    const refBp = Number(row.refBuyPrice) || 0;
    const tradeAmt = pr * q;
    const isSellSide = row.side === "매도" || row.side === "등대매도";
    const isBeaconSide = row.side === "등대매수" || row.side === "등대매도";

    // 4. Ensure TQQQ beacon rows display LP-T00 format if missing or still using LP-Sxx
    if (isBeaconSide && (!row.lotId || !String(row.lotId).toUpperCase().startsWith("LP-T"))) {
      row.lotId = `LP-T${String(idx + 1).padStart(2, "0")}`;
    }

    const pnl = isSellSide
      ? (pr - refBp) * q - (pr * q + refBp * q) * feeRate
      : 0;

    const sideClass = row.side === "매도" ? "side-sell" : (isBeaconSide ? "side-beacon" : "side-buy");
    const badgeColor = row.side === "매도" ? "accent-green" : (isBeaconSide ? "accent-amber" : "accent-blue");

    const card = document.createElement("div");
    card.className = `order-row-card ${sideClass}`;
    card.innerHTML = `
      <div class="order-row-top">
        <div class="order-row-title">
          <span class="${badgeColor}">[${row.side}]</span>
          <span>${row.lotId}</span>
          <span class="muted-sm">· 체결액 ${fmtUsd(tradeAmt)}</span>
        </div>
        <div class="order-row-meta">
          ${isSellSide
            ? `<span class="${pnl >= 0 ? "accent-green" : "accent-red"}"><strong>손익 ${fmtUsd(pnl)}</strong></span>`
            : `<span class="muted-sm">${row.tide}</span>`
          }
          <button class="btn-del" data-del-j="${idx}">삭제</button>
        </div>
      </div>
      <div class="order-fields-grid journal-top-grid">
        <div class="mini-field">
          <label>일자</label>
          <input type="text" class="mini-input center" data-j-idx="${idx}" data-field="date" value="${row.date}" />
        </div>
        <div class="mini-field">
          <label>물때</label>
          <select class="mini-input center" data-j-idx="${idx}" data-field="tide">
            <option value="썰물" ${row.tide === "썰물" ? "selected" : ""}>썰물</option>
            <option value="밀물" ${row.tide === "밀물" ? "selected" : ""}>밀물</option>
          </select>
        </div>
        <div class="mini-field">
          <label>구분</label>
          <select class="mini-input center" data-j-idx="${idx}" data-field="side">
            <option value="매수" ${row.side === "매수" ? "selected" : ""}>매수</option>
            <option value="매도" ${row.side === "매도" ? "selected" : ""}>매도</option>
            <option value="등대매수" ${row.side === "등대매수" ? "selected" : ""}>등대매수</option>
            <option value="등대매도" ${row.side === "등대매도" ? "selected" : ""}>등대매도</option>
          </select>
        </div>
        <div class="mini-field">
          <label>묶음ID</label>
          <input type="text" class="mini-input center" data-j-idx="${idx}" data-field="lotId" value="${row.lotId}" />
        </div>
      </div>
      <div class="order-fields-grid sell-grid">
        <div class="mini-field">
          <label>체결단가($)</label>
          <input type="number" step="0.01" class="mini-input" data-j-idx="${idx}" data-field="price" value="${pr.toFixed(2)}" />
        </div>
        <div class="mini-field">
          <label>체결수량(주)</label>
          <input type="number" step="1" class="mini-input" data-j-idx="${idx}" data-field="qty" value="${q}" />
        </div>
        <div class="mini-field">
          <label>기준매수가($)</label>
          <input type="number" step="0.01" class="mini-input" data-j-idx="${idx}" data-field="refBuyPrice" value="${refBp.toFixed(2)}" />
        </div>
      </div>
    `;
    listEl.appendChild(card);
  });

  const totalPnlEl = document.getElementById("journalTotalPnl");
  totalPnlEl.textContent = fmtUsd(m.realizedSum);
  totalPnlEl.className = m.realizedSum > 0 ? "accent-green" : (m.realizedSum < 0 ? "accent-red" : "");

  listEl.querySelectorAll(".mini-input").forEach((el) => {
    el.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.jIdx);
      const field = e.target.dataset.field;
      if (field === "side") {
        const newSide = e.target.value;
        state.journal[idx].side = newSide;
        // 4. Automatically switch lotId prefix to LP-T00 when changed to 등대매수/등대매도
        if ((newSide === "등대매수" || newSide === "등대매도") && !String(state.journal[idx].lotId).toUpperCase().startsWith("LP-T")) {
          state.journal[idx].lotId = getNextBeaconLotId();
        } else if ((newSide === "매수" || newSide === "매도") && String(state.journal[idx].lotId).toUpperCase().startsWith("LP-T")) {
          state.journal[idx].lotId = getNextSoxlLotId();
        }
      } else if (["date", "tide", "lotId"].includes(field)) {
        state.journal[idx][field] = e.target.value;
      } else {
        state.journal[idx][field] = Number(e.target.value) || 0;
      }
      saveState();
      renderAll();
    });
  });

  listEl.querySelectorAll("button.btn-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.journal.splice(Number(btn.dataset.delJ), 1);
      saveState();
      renderAll();
    });
  });
}

function renderSettingsAndRebal(m) {
  const cfg = state.config;
  document.getElementById("cfgTotalSeed").value = cfg.totalSeed;
  document.getElementById("cfgBeaconInvest").value = cfg.beaconInvest;
  document.getElementById("cfgBeaconPct").value = cfg.beaconPct;
  document.getElementById("cfgDivisions").value = cfg.divisions;
  document.getElementById("cfgEbbMult").value = cfg.ebbMult;
  document.getElementById("cfgFloodMult").value = cfg.floodMult;
  document.getElementById("cfgTargetPct").value = cfg.targetPct;
  document.getElementById("cfgFeePct").value = cfg.feePct;
  document.getElementById("cfgCompound").value = cfg.compound;

  document.getElementById("rebTqqqVal").value = cfg.rebTqqqVal;
  document.getElementById("rebSoxlVal").value = cfg.rebSoxlVal;

  const tqqqV = Number(cfg.rebTqqqVal) || 0;
  const soxlV = Number(cfg.rebSoxlVal) || 0;
  const sumV = tqqqV + soxlV;
  const curRatio = sumV > 0 ? (tqqqV / sumV) * 100 : 0;
  const targetAmt = sumV * ((Number(cfg.beaconPct) || 0) / 100);
  const diff = targetAmt - tqqqV;

  document.getElementById("rebTotalVal").textContent = fmtUsd(sumV);
  document.getElementById("rebCurrPct").textContent = `${curRatio.toFixed(1)}%`;

  let actionMsg = "비중 유지 (조정 불필요)";
  if (Math.abs(diff) >= 10) {
    actionMsg = diff > 0
      ? `TQQQ 등대 ${fmtUsd(diff)} 추가 매수 (SOXL 현금 이동)`
      : `TQQQ 등대 ${fmtUsd(Math.abs(diff))} 일부 매도 → SOXL 루프 시드 편입`;
  }
  document.getElementById("rebActionText").textContent = actionMsg;
}

// 1. Separate Prev Close (previousClose / chartPreviousClose) AND Live Price (regularMarketPrice / closePrice)
function fetchWithTimeout(url, options = {}, timeoutMs = 4500) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

function formatUsDateFromUnix(sec) {
  if (!sec || typeof sec !== "number") return "";
  try {
    const dt = new Date(sec * 1000);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(dt);
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    return m && d ? `${m}/${d}` : "";
  } catch (e) {
    return "";
  }
}

function extractNaverQuote(data) {
  const rawLive = data?.nowPrice || data?.currentPrice || data?.closePrice;
  const liveNum = Number(String(rawLive || "").replace(/,/g, ""));
  if (!liveNum || Number.isNaN(liveNum) || liveNum <= 0) throw new Error("naver invalid price");

  // Naver overseas ETF provides basePrice (전일종가) or compareToPreviousClosePrice
  let prevNum = Number(String(data?.basePrice || data?.prevClosePrice || "").replace(/,/g, ""));
  if (!prevNum || Number.isNaN(prevNum) || prevNum <= 0) {
    const diffRaw = Number(String(data?.compareToPreviousClosePrice || "0").replace(/,/g, ""));
    const code = String(data?.compareToPreviousPrice?.code || "");
    if (!Number.isNaN(diffRaw) && diffRaw !== 0) {
      // code "5" or "4" means falling, "2" or "1" means rising
      const signedDiff = (code === "4" || code === "5") ? -Math.abs(diffRaw) : diffRaw;
      prevNum = Number((liveNum - signedDiff).toFixed(2));
    } else {
      prevNum = liveNum;
    }
  }

  const tradedAt = String(data?.localTradedAt || "");
  const m = tradedAt.match(/(\d{4})-(\d{2})-(\d{2})/);
  const marketDate = m ? `${m[2]}/${m[3]}` : "";
  return {
    prevClose: Number(prevNum.toFixed(2)),
    livePrice: Number(liveNum.toFixed(2)),
    source: "네이버 증권",
    marketDate
  };
}

async function sourceNaverDirect(symbol) {
  const cb = Date.now();
  const suffix = symbol === "SOXL" ? "K" : "O";
  const urls = [
    `https://api.stock.naver.com/etf/${symbol}.${suffix}/basic?_=${cb}`,
    `https://api.stock.naver.com/etf/${symbol}.O/basic?_=${cb}`,
    `https://api.stock.naver.com/etf/${symbol}.K/basic?_=${cb}`
  ];
  return Promise.any(
    urls.map(async (u) => {
      const res = await fetchWithTimeout(u, { cache: "no-store" }, 3500);
      if (!res.ok) throw new Error("naver direct http");
      const data = await res.json();
      return extractNaverQuote(data);
    })
  );
}

async function sourceNasdaqDirect(symbol) {
  const url = `https://api.nasdaq.com/api/quote/${symbol}/info?assetclass=etf`;
  const res = await fetchWithTimeout(url, { cache: "no-store" }, 4000);
  if (!res.ok) throw new Error("nasdaq http");
  const json = await res.json();
  const pd = json?.data?.primaryData || {};
  const liveNum = Number(String(pd.lastSalePrice || "").replace(/[^0-9.]/g, ""));
  if (!liveNum || Number.isNaN(liveNum) || liveNum <= 0) throw new Error("nasdaq invalid");

  const netChange = Number(String(pd.netChange || "0").replace(/[^0-9.-]/g, ""));
  const prevNum = !Number.isNaN(netChange) && netChange !== 0
    ? Number((liveNum - netChange).toFixed(2))
    : liveNum;

  const dtRaw = String(pd.lastTradeTimestamp || "");
  let marketDate = "";
  const parsedDt = Date.parse(dtRaw);
  if (!Number.isNaN(parsedDt)) {
    marketDate = formatUsDateFromUnix(Math.floor(parsedDt / 1000));
  }
  return {
    prevClose: prevNum,
    livePrice: Number(liveNum.toFixed(2)),
    source: "나스닥 공식",
    marketDate
  };
}

async function sourceCnbcDirect(symbol) {
  const url = `https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${symbol}&requestMethod=itv&noCache=${Date.now()}&partnerId=2&fund=1&exthrs=1&output=json`;
  const res = await fetchWithTimeout(url, { cache: "no-store" }, 4000);
  if (!res.ok) throw new Error("cnbc http");
  const json = await res.json();
  const q = json?.FormattedQuoteResult?.FormattedQuote?.[0];
  const liveNum = Number(String(q?.last || "").replace(/[^0-9.]/g, ""));
  if (!liveNum || Number.isNaN(liveNum) || liveNum <= 0) throw new Error("cnbc invalid");
  const prevNum = Number(String(q?.previous_day_closing || "").replace(/[^0-9.]/g, "")) || liveNum;
  const dtStr = String(q?.last_time || "");
  const m = dtStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  const marketDate = m ? `${m[2]}/${m[3]}` : "";
  return {
    prevClose: Number(prevNum.toFixed(2)),
    livePrice: Number(liveNum.toFixed(2)),
    source: "CNBC 시세",
    marketDate
  };
}

function parseYahooChartText(rawText) {
  let data = JSON.parse(rawText);
  if (typeof data?.contents === "string") {
    data = JSON.parse(data.contents);
  }
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error("no chart result");

  const meta = result.meta || {};
  const timestamps = result.timestamp || [];
  const rawCloses = result.indicators?.quote?.[0]?.close || [];

  const validCloses = [];
  for (let i = 0; i < rawCloses.length; i++) {
    const v = rawCloses[i];
    if (typeof v === "number" && !Number.isNaN(v) && v > 0) {
      validCloses.push({ price: v, ts: timestamps[i] || null });
    }
  }

  const regPrice = typeof meta.regularMarketPrice === "number" && meta.regularMarketPrice > 0
    ? meta.regularMarketPrice
    : (validCloses.length > 0 ? validCloses[validCloses.length - 1].price : null);

  if (!regPrice || Number.isNaN(regPrice) || regPrice <= 0) {
    throw new Error("invalid yahoo price");
  }

  // Determine true previous close (not intraday live price)
  let prevClose = typeof meta.previousClose === "number" && meta.previousClose > 0
    ? meta.previousClose
    : (typeof meta.chartPreviousClose === "number" && meta.chartPreviousClose > 0 ? meta.chartPreviousClose : null);

  if (validCloses.length >= 2) {
    const lastEntry = validCloses[validCloses.length - 1];
    const prevEntry = validCloses[validCloses.length - 2];
    // If market is open (regPrice differs from last daily bar or last bar is today), use previous day's close
    if (Math.abs(lastEntry.price - regPrice) < 0.001) {
      prevClose = prevClose || lastEntry.price;
    } else {
      prevClose = lastEntry.price;
    }
    if (!prevClose) prevClose = prevEntry.price;
  } else if (!prevClose) {
    prevClose = regPrice;
  }

  const regTime = typeof meta.regularMarketTime === "number"
    ? meta.regularMarketTime
    : (validCloses.length > 0 ? validCloses[validCloses.length - 1].ts : null);

  return {
    prevClose: Number(prevClose.toFixed(2)),
    livePrice: Number(regPrice.toFixed(2)),
    source: "야후 파이낸스",
    marketDate: formatUsDateFromUnix(regTime)
  };
}

async function sourceYahooProxy(proxyUrl) {
  const res = await fetchWithTimeout(proxyUrl, { cache: "no-store" }, 4500);
  if (!res.ok) throw new Error("proxy http");
  const txt = await res.text();
  return parseYahooChartText(txt);
}

async function fetchSymbolQuoteFast(symbol) {
  const cb = Date.now();
  const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=1d&includePrePost=false&_=${cb}`;
  const suffix = symbol === "SOXL" ? "K" : "O";
  const naverUrl = `https://api.stock.naver.com/etf/${symbol}.${suffix}/basic?_=${cb}`;

  const tasks = [
    sourceYahooProxy(`https://api.allorigins.win/raw?url=${encodeURIComponent(yUrl)}`),
    sourceYahooProxy(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yUrl)}`),
    sourceYahooProxy(`https://corsproxy.io/?url=${encodeURIComponent(yUrl)}`),
    sourceCnbcDirect(symbol),
    sourceNasdaqDirect(symbol),
    sourceNaverDirect(symbol),
    sourceYahooProxy(`https://thingproxy.freeboard.io/fetch/${yUrl}`),
    fetchWithTimeout(`https://api.allorigins.win/raw?url=${encodeURIComponent(naverUrl)}`, { cache: "no-store" }, 4500)
      .then((r) => { if (!r.ok) throw new Error("naver proxy"); return r.json(); })
      .then(extractNaverQuote)
  ];

  try {
    return await Promise.any(tasks);
  } catch (e) {
    return null;
  }
}

async function handleFetchYahooPrices(silent = false) {
  const btn = document.getElementById("btnFetchYahoo");
  const statusEl = document.getElementById("yahooStatusText");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ 전일 종가 · 실시간 시세 조회 중...";
  }
  if (statusEl) {
    statusEl.textContent = "SOXL 전일종가(LOC 기준) 및 실시간 현재가 조회 중...";
  }

  const t0 = performance.now();
  const [soxlRes, tqqqRes] = await Promise.all([
    fetchSymbolQuoteFast("SOXL"),
    fetchSymbolQuoteFast("TQQQ")
  ]);
  const elapsedSec = ((performance.now() - t0) / 1000).toFixed(1);

  if (btn) {
    btn.disabled = false;
    btn.textContent = "🔄 전일 종가 · 실시간 시세 자동조회";
  }

  if (soxlRes || tqqqRes) {
    if (soxlRes) {
      state.orderInput.prevSoxl = soxlRes.prevClose;
      state.orderInput.liveSoxl = soxlRes.livePrice;
    }
    if (tqqqRes) {
      state.orderInput.prevTqqq = tqqqRes.prevClose;
    }
    state.buyOverrides = {};
    saveState();
    renderAll();

    const refObj = soxlRes || tqqqRes;
    const dateTag = refObj.marketDate ? `미장 ${refObj.marketDate}` : "최신 시세";
    if (statusEl) {
      statusEl.textContent = `✅ ${refObj.source} (${dateTag} · ${elapsedSec}초) — SOXL 전일종가 $${Number(state.orderInput.prevSoxl).toFixed(2)} / 실시간 $${Number(state.orderInput.liveSoxl).toFixed(2)}`;
    }
    if (!silent) {
      showToast(`시세 반영 완료 (${elapsedSec}초)`);
    }
  } else {
    if (statusEl) {
      statusEl.textContent = "⚠️ 조회 지연 — 우측 SOXL·TQQQ 링크에서 확인 후 직접 입력해 주세요.";
    }
    if (!silent) {
      showToast("조회 지연 — 우측 링크에서 확인");
    }
  }
}

function syncTqqqInvestFromPriceQty() {
  const bp = Number(state.tqqq.buyPrice) || 0;
  const qty = Number(state.tqqq.qty) || 0;
  const totalTqqq = Number((bp * qty).toFixed(2));
  state.config.beaconInvest = totalTqqq;
  if ((Number(state.config.totalSeed) || 0) > 0) {
    state.config.beaconPct = Number(((totalTqqq / Number(state.config.totalSeed)) * 100).toFixed(2));
  }
  state.buyOverrides = {};
}

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });

  document.getElementById("btnSaveAll").addEventListener("click", () => {
    saveState(true);
    renderAll();
  });

  document.getElementById("btnFetchYahoo").addEventListener("click", () => handleFetchYahooPrices(false));

  document.getElementById("btnAddSink").addEventListener("click", () => {
    const sinkRows = state.ladder.filter((item) => !item.isNet);
    const nextStageNum = sinkRows.length + 1;
    const lastDrop = sinkRows.length > 0 ? Number(sinkRows[sinkRows.length - 1].dropPct) : 0;
    const nextDrop = Number((lastDrop - 6.25).toFixed(2));

    state.ladder.push({
      id: `sink-${Date.now()}`,
      name: `그물추 ${nextStageNum}단계`,
      isNet: false,
      dropPct: nextDrop,
      weightUnits: 2,
      useFullUnit: false
    });
    saveState();
    renderAll();
    showToast(`그물추 ${nextStageNum}단계 추가됨`);
  });

  document.getElementById("inpOrderDate").addEventListener("change", (e) => {
    state.orderInput.date = e.target.value || getTodayStr();
    saveState();
    renderAll();
  });

  document.getElementById("selTide").addEventListener("change", (e) => {
    state.orderInput.tide = e.target.value;
    state.buyOverrides = {};
    saveState();
    renderAll();
  });

  document.getElementById("inpOrderMult").addEventListener("change", (e) => {
    const val = Number(e.target.value) || 0;
    if (state.orderInput.tide === "썰물") {
      state.config.ebbMult = val;
    } else {
      state.config.floodMult = val;
    }
    state.buyOverrides = {};
    saveState();
    renderAll();
  });

  document.getElementById("inpPrevSoxl").addEventListener("change", (e) => {
    state.orderInput.prevSoxl = Number(e.target.value) || 0;
    state.buyOverrides = {};
    saveState();
    renderAll();
  });

  document.getElementById("inpLiveSoxl").addEventListener("change", (e) => {
    state.orderInput.liveSoxl = Number(e.target.value) || 0;
    saveState();
    renderAll();
  });

  document.getElementById("inpPrevTqqq").addEventListener("change", (e) => {
    state.orderInput.prevTqqq = Number(e.target.value) || 0;
    saveState();
    renderAll();
  });

  // 2. TQQQ free input for buyPrice and qty
  document.getElementById("inpTqqqBuyPrice").addEventListener("change", (e) => {
    state.tqqq.buyPrice = Number(e.target.value) || 0;
    syncTqqqInvestFromPriceQty();
    saveState();
    renderAll();
  });

  document.getElementById("inpTqqqQty").addEventListener("change", (e) => {
    state.tqqq.qty = Math.max(0, Math.floor(Number(e.target.value) || 0));
    syncTqqqInvestFromPriceQty();
    saveState();
    renderAll();
  });

  // Settings tab inputs
  document.getElementById("cfgTotalSeed").addEventListener("change", (e) => {
    const newTotal = Number(e.target.value) || 0;
    state.config.totalSeed = newTotal;
    if ((Number(state.tqqq.buyPrice) || 0) === 0 && (Number(state.tqqq.qty) || 0) === 0) {
      state.config.beaconInvest = Number(((newTotal * (Number(state.config.beaconPct) || 0)) / 100).toFixed(2));
    } else if (newTotal > 0) {
      state.config.beaconPct = Number(((Number(state.config.beaconInvest) / newTotal) * 100).toFixed(2));
    }
    state.buyOverrides = {};
    saveState();
    renderAll();
  });

  document.getElementById("cfgBeaconInvest").addEventListener("change", (e) => {
    const val = Number(e.target.value) || 0;
    state.config.beaconInvest = val;
    if ((Number(state.config.totalSeed) || 0) > 0) {
      state.config.beaconPct = Number(((val / Number(state.config.totalSeed)) * 100).toFixed(2));
    }
    state.buyOverrides = {};
    saveState();
    renderAll();
  });

  document.getElementById("cfgBeaconPct").addEventListener("change", (e) => {
    const pct = Number(e.target.value) || 0;
    state.config.beaconPct = pct;
    state.config.beaconInvest = Number((((Number(state.config.totalSeed) || 0) * pct) / 100).toFixed(2));
    state.buyOverrides = {};
    saveState();
    renderAll();
  });

  const cfgMap = [
    ["cfgDivisions", "divisions", "num"],
    ["cfgEbbMult", "ebbMult", "num"],
    ["cfgFloodMult", "floodMult", "num"],
    ["cfgTargetPct", "targetPct", "num"],
    ["cfgFeePct", "feePct", "num"],
    ["cfgCompound", "compound", "str"],
    ["rebTqqqVal", "rebTqqqVal", "num"],
    ["rebSoxlVal", "rebSoxlVal", "num"]
  ];
  cfgMap.forEach(([id, key, typ]) => {
    document.getElementById(id).addEventListener("change", (e) => {
      state.config[key] = typ === "num" ? (Number(e.target.value) || 0) : e.target.value;
      state.buyOverrides = {};
      state.sellOverrides = {};
      saveState();
      renderAll();
    });
  });

  document.getElementById("btnAddLot").addEventListener("click", () => {
    state.lots.push({
      id: getNextSoxlLotId(),
      date: state.orderInput.date,
      buyPrice: Number(state.orderInput.prevSoxl) || 0,
      qty: 1
    });
    saveState();
    renderAll();
  });

  // 5. Add SOXL journal entry with next sequence ID after latest LP in journal
  document.getElementById("btnAddJournal").addEventListener("click", () => {
    state.journal.push({
      date: state.orderInput.date,
      tide: state.orderInput.tide,
      side: "매수",
      lotId: getNextSoxlLotId(),
      price: Number(state.orderInput.prevSoxl) || 0,
      qty: 1,
      refBuyPrice: Number(state.orderInput.prevSoxl) || 0
    });
    saveState();
    renderAll();
  });

  // 4. Add TQQQ Beacon journal entry with LP-T00 sequence ID
  const btnAddBeacon = document.getElementById("btnAddBeaconJournal");
  if (btnAddBeacon) {
    btnAddBeacon.addEventListener("click", () => {
      const tPrice = Number(state.orderInput.prevTqqq) || 0;
      state.journal.push({
        date: state.orderInput.date,
        tide: state.orderInput.tide,
        side: "등대매수",
        lotId: getNextBeaconLotId(),
        price: tPrice,
        qty: 1,
        refBuyPrice: tPrice
      });
      saveState();
      renderAll();
    });
  }

  document.getElementById("btnExportJson").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `soxl-loop-backup-${state.orderInput.date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("btnResetAll").addEventListener("click", () => {
    if (confirm("모든 설정값과 매매일지·묶음을 전부 0으로 초기화할까요?")) {
      state = structuredClone(ZERO_STATE);
      state.orderInput.date = getTodayStr();
      saveState();
      renderAll();
      showToast("모든 설정값이 0으로 초기화되었습니다.");
    }
  });
}

bindEvents();
if (state.orderInput.prevSoxl === 77.05 && state.orderInput.prevTqqq === 62.01) {
  state.orderInput.prevSoxl = 0;
  state.orderInput.liveSoxl = 0;
  state.orderInput.prevTqqq = 0;
}
renderAll();
handleFetchYahooPrices(true);
