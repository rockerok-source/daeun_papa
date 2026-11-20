const STORAGE_KEY = "soxl_loop_pwa_v2_state";

const DEFAULT_STATE = {
  config: {
    totalSeed: 10000,
    beaconInvest: 1000,
    beaconPct: 10,
    divisions: 18,
    ebbMult: 2.5,
    targetPct: 2.5,
    feePct: 0.07,
    compound: "Y",
    rebTqqqVal: 1180,
    rebSoxlVal: 9650
  },
  tqqq: {
    buyPrice: 68.21,
    qty: 16
  },
  orderInput: {
    date: "2026-11-02",
    tide: "썰물",
    prevSoxl: 77.05,
    prevTqqq: 62.01
  },
  buyOverrides: {},
  sellOverrides: {},
  lots: [
    { id: "LP-03", date: "2026-11-06", buyPrice: 76.20, qty: 6 }
  ],
  journal: [
    { date: "2026-11-02", tide: "썰물", side: "등대매수", lotId: "LT-00", price: 68.21, qty: 16, refBuyPrice: 68.21 },
    { date: "2026-11-02", tide: "썰물", side: "매수", lotId: "LP-01", price: 75.50, qty: 16, refBuyPrice: 75.50 },
    { date: "2026-11-03", tide: "썰물", side: "매수", lotId: "LP-02", price: 70.80, qty: 17, refBuyPrice: 70.80 },
    { date: "2026-11-04", tide: "썰물", side: "매도", lotId: "LP-02", price: 72.70, qty: 17, refBuyPrice: 70.80 },
    { date: "2026-11-05", tide: "밀물", side: "매도", lotId: "LP-01", price: 77.50, qty: 16, refBuyPrice: 75.50 },
    { date: "2026-11-06", tide: "밀물", side: "매수", lotId: "LP-03", price: 76.20, qty: 6, refBuyPrice: 76.20 }
  ]
};

const ZERO_STATE = {
  config: {
    totalSeed: 0,
    beaconInvest: 0,
    beaconPct: 0,
    divisions: 0,
    ebbMult: 0,
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
    date: new Date().toISOString().slice(0, 10),
    tide: "썰물",
    prevSoxl: 0,
    prevTqqq: 0
  },
  buyOverrides: {},
  sellOverrides: {},
  lots: [],
  journal: []
};

const LADDER_SPEC = [
  { name: "그물(-$0.01)", isNet: true, defaultDropPct: 0, weightFrac: 1.0 },
  { name: "그물추 1단계", isNet: false, defaultDropPct: -6.25, weightFrac: 1 / 16 },
  { name: "그물추 2단계", isNet: false, defaultDropPct: -12.50, weightFrac: 1 / 16 },
  { name: "그물추 3단계", isNet: false, defaultDropPct: -18.75, weightFrac: 1 / 16 },
  { name: "그물추 4단계", isNet: false, defaultDropPct: -25.00, weightFrac: 2 / 16 },
  { name: "그물추 5단계", isNet: false, defaultDropPct: -31.25, weightFrac: 2 / 16 },
  { name: "그물추 6단계", isNet: false, defaultDropPct: -37.50, weightFrac: 2 / 16 },
  { name: "그물추 7단계", isNet: false, defaultDropPct: -43.75, weightFrac: 3 / 16 },
  { name: "그물추 8단계", isNet: false, defaultDropPct: -50.00, weightFrac: 4 / 16 }
];

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      config: { ...DEFAULT_STATE.config, ...(parsed.config || {}) },
      tqqq: { ...DEFAULT_STATE.tqqq, ...(parsed.tqqq || {}) },
      orderInput: { ...DEFAULT_STATE.orderInput, ...(parsed.orderInput || {}) },
      buyOverrides: parsed.buyOverrides || {},
      sellOverrides: parsed.sellOverrides || {},
      lots: Array.isArray(parsed.lots) ? parsed.lots : [],
      journal: Array.isArray(parsed.journal) ? parsed.journal : []
    };
  } catch (e) {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function fmtUsd(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? "-" : "";
  return `${sign}$${Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calcMetrics() {
  const cfg = state.config;
  const totalSeed = Number(cfg.totalSeed) || 0;
  const beaconInvest = Number(cfg.beaconInvest) || 0;
  const soxlInit = Math.max(0, totalSeed - beaconInvest);
  const feeRate = (Number(cfg.feePct) || 0) / 100;

  let realizedSum = 0;
  state.journal.forEach((row) => {
    if (row.side === "매도") {
      const sellAmt = (Number(row.price) || 0) * (Number(row.qty) || 0);
      const buyAmt = (Number(row.refBuyPrice) || 0) * (Number(row.qty) || 0);
      const estFee = (sellAmt + buyAmt) * feeRate;
      realizedSum += (sellAmt - buyAmt - estFee);
    }
  });

  const soxlTotalAsset = soxlInit + realizedSum;
  const baseForUnit = cfg.compound === "Y" ? soxlTotalAsset : soxlInit;
  const divs = Number(cfg.divisions) || 0;
  const floodUnit = divs > 0 ? baseForUnit / divs : 0;
  const ebbUnit = floodUnit * (Number(cfg.ebbMult) || 0);
  const activeUnit = state.orderInput.tide === "밀물" ? floodUnit : ebbUnit;

  let openCost = 0;
  let openQty = 0;
  let openMarketVal = 0;
  const prevSoxl = Number(state.orderInput.prevSoxl) || 0;

  state.lots.forEach((lot) => {
    const q = Number(lot.qty) || 0;
    const p = Number(lot.buyPrice) || 0;
    openQty += q;
    openCost += p * q;
    openMarketVal += prevSoxl * q;
  });

  const cashBalance = soxlTotalAsset - openCost;

  // TQQQ beacon stats
  const tqqqBuyPrice = Number(state.tqqq.buyPrice) || 0;
  const tqqqQty = Number(state.tqqq.qty) || 0;
  const tqqqActualCost = tqqqBuyPrice * tqqqQty;
  const prevTqqq = Number(state.orderInput.prevTqqq) || 0;
  const tqqqEvalVal = prevTqqq > 0 ? prevTqqq * tqqqQty : tqqqActualCost;
  const tqqqPnl = tqqqEvalVal - tqqqActualCost;

  const totalPortfolio = beaconInvest + soxlTotalAsset;
  const beaconRatio = totalPortfolio > 0 ? (beaconInvest / totalPortfolio) * 100 : 0;

  return {
    totalSeed,
    beaconInvest,
    soxlInit,
    realizedSum,
    soxlTotalAsset,
    floodUnit,
    ebbUnit,
    activeUnit,
    openCost,
    openQty,
    openMarketVal,
    openPnl: openMarketVal - openCost,
    cashBalance,
    beaconRatio,
    tqqqBuyPrice,
    tqqqQty,
    tqqqActualCost,
    tqqqEvalVal,
    tqqqPnl
  };
}

function renderAll() {
  const m = calcMetrics();
  const cfg = state.config;
  const oi = state.orderInput;

  // Header & KPI
  document.getElementById("headerSummary").textContent =
    `총시드 ${fmtUsd(m.totalSeed)} · 배 ${cfg.divisions}칸 · ${oi.tide} ×${oi.tide === "썰물" ? cfg.ebbMult : 1}`;

  document.getElementById("kpiSoxlTotal").textContent = fmtUsd(m.soxlTotalAsset);
  const relEl = document.getElementById("kpiRealized");
  relEl.textContent = `실현손익: ${fmtUsd(m.realizedSum)}`;
  relEl.className = `kpi-hint ${m.realizedSum >= 0 ? "accent-green" : "accent-red"}`;

  document.getElementById("kpiCash").textContent = fmtUsd(m.cashBalance);
  document.getElementById("kpiLotsCost").textContent = `보유원금: ${fmtUsd(m.openCost)} (${m.openQty}주)`;

  document.getElementById("kpiUnitAmt").textContent = fmtUsd(m.activeUnit);
  document.getElementById("kpiUnitHint").textContent = `${oi.tide} 기준 (밀물 ${fmtUsd(m.floodUnit)})`;

  document.getElementById("kpiBeaconRatio").textContent = `${fmtUsd(m.beaconInvest)} (${m.beaconRatio.toFixed(1)}%)`;
  document.getElementById("kpiBeaconVal").textContent = `매수 $${m.tqqqBuyPrice.toFixed(2)} · ${m.tqqqQty}주`;

  // Order Inputs
  document.getElementById("inpOrderDate").value = oi.date;
  document.getElementById("selTide").value = oi.tide;
  document.getElementById("inpPrevSoxl").value = oi.prevSoxl;
  document.getElementById("inpPrevTqqq").value = oi.prevTqqq;

  // TQQQ Inputs
  document.getElementById("inpTqqqInvest").value = m.beaconInvest;
  document.getElementById("inpTqqqBuyPrice").value = m.tqqqBuyPrice;
  document.getElementById("inpTqqqQty").value = m.tqqqQty;
  document.getElementById("tqqqSummaryLine").innerHTML =
    `실매수원금: <strong>${fmtUsd(m.tqqqActualCost)}</strong> · 현재평가금: <strong>${fmtUsd(m.tqqqEvalVal)}</strong> · 손익: <strong class="${m.tqqqPnl >= 0 ? "accent-green" : "accent-red"}">${fmtUsd(m.tqqqPnl)}</strong>`;

  const tideBadge = document.getElementById("tideBadge");
  tideBadge.textContent = `${oi.tide} 모드`;
  tideBadge.className = oi.tide === "썰물" ? "pill ebb" : "pill";

  renderBuyOrders(m);
  renderSellOrders(m);
  renderLots(m);
  renderJournal();
  renderSettingsAndRebal(m);
}

function renderBuyOrders(m) {
  const listEl = document.getElementById("buyOrderList");
  listEl.innerHTML = "";
  const prevSoxl = Number(state.orderInput.prevSoxl) || 0;
  const feeRate = (Number(state.config.feePct) || 0) / 100;

  let sumAlloc = 0;
  let sumQty = 0;
  let sumEst = 0;

  LADDER_SPEC.forEach((spec, idx) => {
    const ov = state.buyOverrides[idx] || {};

    // Editable dropPct (%)
    const defaultDropPct = spec.isNet
      ? (prevSoxl > 0 ? Number(((-0.01 / prevSoxl) * 100).toFixed(2)) : 0)
      : spec.defaultDropPct;
    const dropPct = ov.dropPct !== undefined ? Number(ov.dropPct) : defaultDropPct;

    // Price derived from dropPct unless overridden directly
    const defaultPrice = spec.isNet && ov.dropPct === undefined
      ? Number(Math.max(0, prevSoxl - 0.01).toFixed(2))
      : Number(Math.max(0, prevSoxl * (1 + dropPct / 100)).toFixed(2));
    const price = ov.price !== undefined ? Number(ov.price) : defaultPrice;

    const defaultAlloc = Number((m.activeUnit * spec.weightFrac).toFixed(2));
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
          <button class="btn-exec" data-exec-buy="${idx}" data-price="${price}" data-qty="${qty}">체결</button>
        </div>
      </div>
      <div class="order-fields-grid">
        <div class="mini-field">
          <label>등락률(%)</label>
          <input type="number" step="0.01" class="mini-input" data-buy-idx="${idx}" data-field="dropPct" value="${dropPct}" />
        </div>
        <div class="mini-field">
          <label>LOC 지정가($)</label>
          <input type="number" step="0.01" class="mini-input" data-buy-idx="${idx}" data-field="price" value="${price.toFixed(2)}" />
        </div>
        <div class="mini-field">
          <label>배정액($)</label>
          <input type="number" step="1" class="mini-input" data-buy-idx="${idx}" data-field="alloc" value="${alloc.toFixed(2)}" />
        </div>
        <div class="mini-field">
          <label>수량(주)</label>
          <input type="number" step="1" class="mini-input" data-buy-idx="${idx}" data-field="qty" value="${qty}" />
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
      const idx = Number(e.target.dataset.buyIdx);
      const field = e.target.dataset.field;
      const val = Number(e.target.value) || 0;
      const curOv = { ...(state.buyOverrides[idx] || {}) };

      if (field === "dropPct") {
        curOv.dropPct = val;
        delete curOv.price; // recalculate price from new dropPct
        delete curOv.qty;   // recalculate qty from new price
      } else if (field === "price") {
        curOv.price = val;
        if (prevSoxl > 0) {
          curOv.dropPct = Number((((val - prevSoxl) / prevSoxl) * 100).toFixed(2));
        }
        delete curOv.qty;
      } else if (field === "alloc") {
        curOv.alloc = val;
        delete curOv.qty;
      } else if (field === "qty") {
        curOv.qty = Math.max(0, Math.floor(val));
      }

      state.buyOverrides[idx] = curOv;
      saveState();
      renderAll();
    });
  });

  listEl.querySelectorAll("button.btn-exec").forEach((btn) => {
    btn.addEventListener("click", () => {
      const price = Number(btn.dataset.price) || 0;
      const qty = Math.floor(Number(btn.dataset.qty) || 0);
      if (price <= 0 || qty <= 0) return;
      const nextNum = state.lots.length + 1;
      const lotId = `LP-${String(nextNum).padStart(2, "0")}`;
      const dt = state.orderInput.date;
      const td = state.orderInput.tide;

      state.lots.push({ id: lotId, date: dt, buyPrice: price, qty });
      state.journal.push({ date: dt, tide: td, side: "매수", lotId, price, qty, refBuyPrice: price });
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

  const indexed = state.lots.map((lot, idx) => ({ lot, idx }));
  const sortedByPrice = [...indexed].sort((a, b) => Number(a.lot.buyPrice) - Number(b.lot.buyPrice));
  const rankMap = {};
  sortedByPrice.forEach((item, rIdx) => {
    rankMap[item.idx] = rIdx + 1;
  });

  if (state.lots.length === 0) {
    listEl.innerHTML = `<div class="muted-sm" style="text-align:center; padding:12px;">미청산 보유 묶음이 없습니다.</div>`;
    return;
  }

  indexed.forEach(({ lot, idx }) => {
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
          <span class="${estNetPnl >= 0 ? "accent-green" : "accent-red"}"><strong>${fmtUsd(estNetPnl)}</strong></span>
          <button class="btn-exec" data-exec-sell="${idx}" data-price="${targetPrice}" data-qty="${sellQty}">익절</button>
          <button class="btn-del" data-del-sell-lot="${idx}">삭제</button>
        </div>
      </div>
      <div class="order-fields-grid sell-grid">
        <div class="mini-field">
          <label>매수 평단가($)</label>
          <input type="number" step="0.01" class="mini-input" data-sell-idx="${idx}" data-field="buyPrice" value="${buyPrice.toFixed(2)}" />
        </div>
        <div class="mini-field">
          <label>매도 수량(주)</label>
          <input type="number" step="1" class="mini-input" data-sell-idx="${idx}" data-field="qty" value="${sellQty}" />
        </div>
        <div class="mini-field">
          <label>목표 매도가($)</label>
          <input type="number" step="0.01" class="mini-input" data-sell-idx="${idx}" data-field="targetPrice" value="${targetPrice.toFixed(2)}" />
        </div>
      </div>
    `;
    listEl.appendChild(card);
  });

  listEl.querySelectorAll("input.mini-input").forEach((inp) => {
    inp.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.sellIdx);
      const field = e.target.dataset.field;
      const val = Number(e.target.value) || 0;
      if (field === "buyPrice") {
        state.lots[idx].buyPrice = val;
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
      const idx = Number(btn.dataset.execSell);
      const sellPrice = Number(btn.dataset.price) || 0;
      const sellQty = Math.floor(Number(btn.dataset.qty) || 0);
      const lot = state.lots[idx];
      if (!lot || sellPrice <= 0 || sellQty <= 0) return;

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
  const tbody = document.getElementById("lotsBody");
  tbody.innerHTML = "";
  const prevSoxl = Number(state.orderInput.prevSoxl) || 0;

  let sumQty = 0;
  let sumCost = 0;
  let sumPnl = 0;

  state.lots.forEach((lot, idx) => {
    const bp = Number(lot.buyPrice) || 0;
    const q = Number(lot.qty) || 0;
    const cost = bp * q;
    const pnl = (prevSoxl - bp) * q;
    sumQty += q;
    sumCost += cost;
    sumPnl += pnl;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" class="cell-input sm-id" data-lot-idx="${idx}" data-field="id" value="${lot.id}" /></td>
      <td><input type="text" class="cell-input sm-date" data-lot-idx="${idx}" data-field="date" value="${lot.date}" /></td>
      <td><input type="number" step="0.01" class="cell-input" data-lot-idx="${idx}" data-field="buyPrice" value="${bp.toFixed(2)}" /></td>
      <td><input type="number" step="1" class="cell-input sm-qty" data-lot-idx="${idx}" data-field="qty" value="${q}" /></td>
      <td>${fmtUsd(cost)}</td>
      <td class="${pnl >= 0 ? "accent-green" : "accent-red"}">${fmtUsd(pnl)}</td>
      <td><button class="btn-del" data-del-lot="${idx}">삭제</button></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("lotSumQty").textContent = `${sumQty}주`;
  document.getElementById("lotSumCost").textContent = fmtUsd(sumCost);
  document.getElementById("lotSumPnl").textContent = fmtUsd(sumPnl);

  tbody.querySelectorAll("input.cell-input").forEach((inp) => {
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

  tbody.querySelectorAll("button.btn-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.lots.splice(Number(btn.dataset.delLot), 1);
      saveState();
      renderAll();
    });
  });
}

function renderJournal() {
  const tbody = document.getElementById("journalBody");
  tbody.innerHTML = "";
  const feeRate = (Number(state.config.feePct) || 0) / 100;

  state.journal.forEach((row, idx) => {
    const pr = Number(row.price) || 0;
    const q = Number(row.qty) || 0;
    const refBp = Number(row.refBuyPrice) || 0;
    const pnl = row.side === "매도"
      ? (pr - refBp) * q - (pr * q + refBp * q) * feeRate
      : 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" class="cell-input sm-date" data-j-idx="${idx}" data-field="date" value="${row.date}" /></td>
      <td>
        <select class="cell-input sm-id" data-j-idx="${idx}" data-field="tide">
          <option value="썰물" ${row.tide === "썰물" ? "selected" : ""}>썰물</option>
          <option value="밀물" ${row.tide === "밀물" ? "selected" : ""}>밀물</option>
        </select>
      </td>
      <td>
        <select class="cell-input sm-id" data-j-idx="${idx}" data-field="side">
          <option value="매수" ${row.side === "매수" ? "selected" : ""}>매수</option>
          <option value="매도" ${row.side === "매도" ? "selected" : ""}>매도</option>
          <option value="등대매수" ${row.side === "등대매수" ? "selected" : ""}>등대</option>
        </select>
      </td>
      <td><input type="text" class="cell-input sm-id" data-j-idx="${idx}" data-field="lotId" value="${row.lotId}" /></td>
      <td><input type="number" step="0.01" class="cell-input" data-j-idx="${idx}" data-field="price" value="${pr.toFixed(2)}" /></td>
      <td><input type="number" step="1" class="cell-input sm-qty" data-j-idx="${idx}" data-field="qty" value="${q}" /></td>
      <td><input type="number" step="0.01" class="cell-input" data-j-idx="${idx}" data-field="refBuyPrice" value="${refBp.toFixed(2)}" /></td>
      <td class="${row.side === "매도" ? (pnl >= 0 ? "accent-green" : "accent-red") : ""}">${row.side === "매도" ? fmtUsd(pnl) : "-"}</td>
      <td><button class="btn-del" data-del-j="${idx}">삭제</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".cell-input").forEach((el) => {
    el.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.jIdx);
      const field = e.target.dataset.field;
      if (["date", "tide", "side", "lotId"].includes(field)) {
        state.journal[idx][field] = e.target.value;
      } else {
        state.journal[idx][field] = Number(e.target.value) || 0;
      }
      saveState();
      renderAll();
    });
  });

  tbody.querySelectorAll("button.btn-del").forEach((btn) => {
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

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });

  const orderMap = [
    ["inpOrderDate", "date", "str"],
    ["selTide", "tide", "str"],
    ["inpPrevSoxl", "prevSoxl", "num"],
    ["inpPrevTqqq", "prevTqqq", "num"]
  ];
  orderMap.forEach(([id, key, typ]) => {
    document.getElementById(id).addEventListener("change", (e) => {
      state.orderInput[key] = typ === "num" ? (Number(e.target.value) || 0) : e.target.value;
      if (key === "prevSoxl" || key === "tide") {
        state.buyOverrides = {};
      }
      saveState();
      renderAll();
    });
  });

  // TQQQ direct editing on LOC Order page
  document.getElementById("inpTqqqInvest").addEventListener("change", (e) => {
    const val = Number(e.target.value) || 0;
    state.config.beaconInvest = val;
    if ((Number(state.config.totalSeed) || 0) > 0) {
      state.config.beaconPct = Number(((val / Number(state.config.totalSeed)) * 100).toFixed(2));
    }
    state.buyOverrides = {};
    saveState();
    renderAll();
  });

  document.getElementById("inpTqqqBuyPrice").addEventListener("change", (e) => {
    state.tqqq.buyPrice = Number(e.target.value) || 0;
    saveState();
    renderAll();
  });

  document.getElementById("inpTqqqQty").addEventListener("change", (e) => {
    state.tqqq.qty = Math.max(0, Math.floor(Number(e.target.value) || 0));
    saveState();
    renderAll();
  });

  // Settings tab inputs
  document.getElementById("cfgTotalSeed").addEventListener("change", (e) => {
    const newTotal = Number(e.target.value) || 0;
    state.config.totalSeed = newTotal;
    state.config.beaconInvest = Number(((newTotal * (Number(state.config.beaconPct) || 0)) / 100).toFixed(2));
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
    const nextIdx = state.lots.length + 1;
    state.lots.push({
      id: `LP-${String(nextIdx).padStart(2, "0")}`,
      date: state.orderInput.date,
      buyPrice: Number(state.orderInput.prevSoxl) || 0,
      qty: 1
    });
    saveState();
    renderAll();
  });

  document.getElementById("btnAddJournal").addEventListener("click", () => {
    state.journal.push({
      date: state.orderInput.date,
      tide: state.orderInput.tide,
      side: "매수",
      lotId: `LP-${String(state.lots.length + 1).padStart(2, "0")}`,
      price: Number(state.orderInput.prevSoxl) || 0,
      qty: 1,
      refBuyPrice: Number(state.orderInput.prevSoxl) || 0
    });
    saveState();
    renderAll();
  });

  document.getElementById("btnExportJson").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `soxl-loop-backup-${state.orderInput.date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Reset ALL values to 0
  document.getElementById("btnResetAll").addEventListener("click", () => {
    if (confirm("모든 설정값과 매매일지·묶음을 전부 0으로 초기화할까요?")) {
      state = structuredClone(ZERO_STATE);
      saveState();
      renderAll();
    }
  });
}

bindEvents();
renderAll();
