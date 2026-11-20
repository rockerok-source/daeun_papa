const STORAGE_KEY = "soxl_loop_pwa_v1_state";

const DEFAULT_STATE = {
  config: {
    totalSeed: 10000,
    beaconPct: 10,
    divisions: 18,
    ebbMult: 2.5,
    targetPct: 2.5,
    feePct: 0.07,
    compound: "Y",
    rebTqqqVal: 1180,
    rebSoxlVal: 9650
  },
  orderInput: {
    date: "2026-11-02",
    tide: "썰물",
    prevSoxl: 77.05,
    prevTqqq: 62.01
  },
  // Custom overrides keyed by row index for editable buy & sell orders
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

const LADDER_SPEC = [
  { name: "그물(-$0.01)", drop: null, weightFrac: 1.0 },
  { name: "그물추1", drop: -0.0625, weightFrac: 1 / 16 },
  { name: "그물추2", drop: -0.1250, weightFrac: 1 / 16 },
  { name: "그물추3", drop: -0.1875, weightFrac: 1 / 16 },
  { name: "그물추4", drop: -0.2500, weightFrac: 2 / 16 },
  { name: "그물추5", drop: -0.3125, weightFrac: 2 / 16 },
  { name: "그물추6", drop: -0.3750, weightFrac: 2 / 16 },
  { name: "그물추7", drop: -0.4375, weightFrac: 3 / 16 },
  { name: "그물추8", drop: -0.5000, weightFrac: 4 / 16 }
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
      orderInput: { ...DEFAULT_STATE.orderInput, ...(parsed.orderInput || {}) },
      buyOverrides: parsed.buyOverrides || {},
      sellOverrides: parsed.sellOverrides || {},
      lots: Array.isArray(parsed.lots) ? parsed.lots : structuredClone(DEFAULT_STATE.lots),
      journal: Array.isArray(parsed.journal) ? parsed.journal : structuredClone(DEFAULT_STATE.journal)
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
  const beaconInit = cfg.totalSeed * (cfg.beaconPct / 100);
  const soxlInit = cfg.totalSeed - beaconInit;
  const feeRate = cfg.feePct / 100;

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
  const divs = Math.max(1, Number(cfg.divisions) || 18);
  const floodUnit = baseForUnit / divs;
  const ebbUnit = floodUnit * (Number(cfg.ebbMult) || 2.5);
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
  const totalPortfolio = beaconInit + soxlTotalAsset;
  const beaconRatio = totalPortfolio > 0 ? (beaconInit / totalPortfolio) * 100 : 0;

  return {
    beaconInit,
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
    beaconRatio
  };
}

function renderAll() {
  const m = calcMetrics();
  const cfg = state.config;
  const oi = state.orderInput;

  // Header & KPI
  document.getElementById("headerSummary").textContent =
    `총시드 ${fmtUsd(cfg.totalSeed)} · 배 ${cfg.divisions}칸 · ${oi.tide} ×${oi.tide === "썰물" ? cfg.ebbMult : 1}`;

  document.getElementById("kpiSoxlTotal").textContent = fmtUsd(m.soxlTotalAsset);
  const relEl = document.getElementById("kpiRealized");
  relEl.textContent = `실현손익: ${fmtUsd(m.realizedSum)}`;
  relEl.className = `kpi-hint ${m.realizedSum >= 0 ? "accent-green" : "accent-red"}`;

  document.getElementById("kpiCash").textContent = fmtUsd(m.cashBalance);
  document.getElementById("kpiLotsCost").textContent = `보유원금: ${fmtUsd(m.openCost)} (${m.openQty}주)`;

  document.getElementById("kpiUnitAmt").textContent = fmtUsd(m.activeUnit);
  document.getElementById("kpiUnitHint").textContent = `${oi.tide} 기준 (밀물 ${fmtUsd(m.floodUnit)})`;

  document.getElementById("kpiBeaconRatio").textContent = `${m.beaconRatio.toFixed(1)}%`;
  document.getElementById("kpiBeaconVal").textContent = `배정: ${fmtUsd(m.beaconInit)}`;

  // Order Inputs
  document.getElementById("inpOrderDate").value = oi.date;
  document.getElementById("selTide").value = oi.tide;
  document.getElementById("inpPrevSoxl").value = oi.prevSoxl;
  document.getElementById("inpPrevTqqq").value = oi.prevTqqq;

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
  const tbody = document.getElementById("buyOrderBody");
  tbody.innerHTML = "";
  const prevSoxl = Number(state.orderInput.prevSoxl) || 0;
  const feeRate = (Number(state.config.feePct) || 0) / 100;

  let sumAlloc = 0;
  let sumQty = 0;
  let sumEst = 0;

  LADDER_SPEC.forEach((spec, idx) => {
    const ov = state.buyOverrides[idx] || {};
    const dropPct = spec.drop === null ? (prevSoxl > 0 ? (-0.01 / prevSoxl) * 100 : 0) : spec.drop * 100;
    const defaultPrice = spec.drop === null
      ? Number(Math.max(0.01, prevSoxl - 0.01).toFixed(2))
      : Number((prevSoxl * (1 + spec.drop)).toFixed(2));
    const defaultAlloc = Number((m.activeUnit * spec.weightFrac).toFixed(2));
    const defaultQty = defaultPrice > 0
      ? Math.max(spec.drop === null ? 0 : 1, Math.floor(defaultAlloc / (defaultPrice * (1 + feeRate))))
      : 0;

    const price = ov.price !== undefined ? Number(ov.price) : defaultPrice;
    const alloc = ov.alloc !== undefined ? Number(ov.alloc) : defaultAlloc;
    const qty = ov.qty !== undefined ? Math.max(0, Math.floor(Number(ov.qty) || 0)) : defaultQty;
    const estAmt = Number((price * qty * (1 + feeRate)).toFixed(2));

    sumAlloc += alloc;
    sumQty += qty;
    sumEst += estAmt;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${spec.name}</strong></td>
      <td>${dropPct.toFixed(2)}%</td>
      <td><input type="number" step="0.01" class="cell-input" data-buy-idx="${idx}" data-field="price" value="${price.toFixed(2)}" /></td>
      <td><input type="number" step="1" class="cell-input" data-buy-idx="${idx}" data-field="alloc" value="${alloc.toFixed(2)}" /></td>
      <td><input type="number" step="1" class="cell-input sm-qty" data-buy-idx="${idx}" data-field="qty" value="${qty}" /></td>
      <td>${fmtUsd(estAmt)}</td>
      <td><button class="btn-exec" data-exec-buy="${idx}" data-price="${price}" data-qty="${qty}">체결</button></td>
    `;
    tbody.appendChild(tr);
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
    checkText.textContent = "가용 현금 초과! 하단 그물추 수량·금액을 조정하세요.";
  } else {
    banner.className = "status-banner";
    checkText.textContent = "가용 현금 범위 내 주문 가능";
  }

  tbody.querySelectorAll("input.cell-input").forEach((inp) => {
    inp.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.buyIdx);
      const field = e.target.dataset.field;
      const val = Number(e.target.value) || 0;
      state.buyOverrides[idx] = { ...(state.buyOverrides[idx] || {}), [field]: val };
      if (field === "alloc" && state.buyOverrides[idx].qty === undefined) {
        const curPrice = state.buyOverrides[idx].price !== undefined
          ? Number(state.buyOverrides[idx].price)
          : (LADDER_SPEC[idx].drop === null ? Math.max(0.01, prevSoxl - 0.01) : prevSoxl * (1 + LADDER_SPEC[idx].drop));
        if (curPrice > 0) {
          state.buyOverrides[idx].qty = Math.floor(val / (curPrice * (1 + feeRate)));
        }
      }
      saveState();
      renderAll();
    });
  });

  tbody.querySelectorAll("button.btn-exec").forEach((btn) => {
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
  const tbody = document.getElementById("sellOrderBody");
  tbody.innerHTML = "";
  const targetRate = (Number(state.config.targetPct) || 0) / 100;
  const feeRate = (Number(state.config.feePct) || 0) / 100;

  // Rank lowest buyPrice first (1 = highest priority)
  const indexed = state.lots.map((lot, idx) => ({ lot, idx }));
  const sortedByPrice = [...indexed].sort((a, b) => Number(a.lot.buyPrice) - Number(b.lot.buyPrice));
  const rankMap = {};
  sortedByPrice.forEach((item, rIdx) => {
    rankMap[item.idx] = rIdx + 1;
  });

  if (state.lots.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted-sm">미청산 보유 묶음이 없습니다.</td></tr>`;
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

    const tr = document.createElement("tr");
    if (rank === 1) tr.className = "row-prio1";
    tr.innerHTML = `
      <td><strong>${rank}순위</strong></td>
      <td>${lot.id}</td>
      <td>${fmtUsd(buyPrice)}</td>
      <td><input type="number" step="1" class="cell-input sm-qty" data-sell-idx="${idx}" data-field="qty" value="${sellQty}" /></td>
      <td><input type="number" step="0.01" class="cell-input" data-sell-idx="${idx}" data-field="targetPrice" value="${targetPrice.toFixed(2)}" /></td>
      <td class="${estNetPnl >= 0 ? "accent-green" : "accent-red"}"><strong>${fmtUsd(estNetPnl)}</strong></td>
      <td><button class="btn-exec" data-exec-sell="${idx}" data-price="${targetPrice}" data-qty="${sellQty}">익절</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("input.cell-input").forEach((inp) => {
    inp.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.sellIdx);
      const field = e.target.dataset.field;
      state.sellOverrides[idx] = { ...(state.sellOverrides[idx] || {}), [field]: Number(e.target.value) || 0 };
      saveState();
      renderSellOrders(m);
    });
  });

  tbody.querySelectorAll("button.btn-exec").forEach((btn) => {
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
  const targetAmt = sumV * ((Number(cfg.beaconPct) || 10) / 100);
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

// Bind Events
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

  const cfgMap = [
    ["cfgTotalSeed", "totalSeed", "num"],
    ["cfgBeaconPct", "beaconPct", "num"],
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
      buyPrice: Number(state.orderInput.prevSoxl) || 70,
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
      price: Number(state.orderInput.prevSoxl) || 70,
      qty: 1,
      refBuyPrice: Number(state.orderInput.prevSoxl) || 70
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

  document.getElementById("btnResetAll").addEventListener("click", () => {
    if (confirm("모든 매매일지, 묶음, 설정 값을 초기 상태로 되돌릴까요?")) {
      state = structuredClone(DEFAULT_STATE);
      saveState();
      renderAll();
    }
  });
}

bindEvents();
renderAll();
