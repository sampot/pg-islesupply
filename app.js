import { FleetAudio } from "./audio.js?v=islesupply-1";
import { GOOD_INFO, GOODS, createGame, resolveTurn, scoreGame } from "./game.js?v=islesupply-1";
import { loadBest, loadUnlocks, saveBest, saveUnlocks } from "./persist.js?v=islesupply-1";

const $ = (selector) => document.querySelector(selector);
const audio = new FleetAudio();
const directionIcon = { north: "↑", east: "→", south: "↓", west: "←" };
const emptyGoods = () => ({ grain: 0, medicine: 0, fuel: 0 });

let game = null;
let selectedShip = "swift";
let selectedIsland = "harbor";
let orders = {};
let best = 0;
let unlocks = [];

function resetOrders() {
  orders = Object.fromEntries(
    game.ships.map((ship) => [
      ship.id,
      { destination: null, load: emptyGoods(), unload: emptyGoods() },
    ]),
  );
}

function islandById(id) {
  return game.islands.find((island) => island.id === id);
}

function shipById(id) {
  return game.ships.find((ship) => ship.id === id);
}

function total(goods) {
  return GOODS.reduce((sum, good) => sum + goods[good], 0);
}

function goodsMarkup(goods, compact = false) {
  return GOODS.map(
    (good) => `
      <span class="good ${good}" title="${GOOD_INFO[good].name}">
        <img src="./assets/icons/${GOOD_INFO[good].icon}" alt="" />
        ${compact ? "" : `<small>${GOOD_INFO[good].name}</small>`}<strong>${goods[good]}</strong>
      </span>`,
  ).join("");
}

function renderForecast() {
  $("#forecast-cards").innerHTML = game.forecast
    .map(
      (forecast, index) => `
        <article class="forecast-card ${forecast.typhoon ? "storm" : ""}">
          <span class="forecast-turn">${index === 0 ? "本輪" : "次輪"}</span>
          <strong class="wind">${directionIcon[forecast.wind.direction]} ${forecast.wind.strength}級風</strong>
          <span class="storm-chance">🌀 颱風 ${forecast.typhoonChance}%</span>
          ${forecast.typhoon ? '<b class="warning">本輪成颱！航程 +1</b>' : ""}
        </article>`,
    )
    .join("");
}

function pointForShip(ship) {
  if (ship.location) {
    const island = islandById(ship.location);
    return { x: island.x, y: island.y };
  }
  const from = islandById(ship.transit.from);
  const to = islandById(ship.transit.to);
  const progress = 1 - ship.transit.remaining / ship.transit.duration;
  return {
    x: from.x + (to.x - from.x) * Math.max(0.16, progress),
    y: from.y + (to.y - from.y) * Math.max(0.16, progress),
  };
}

function renderMap() {
  const uniqueRoutes = game.routes.filter(
    (route) => game.routes.findIndex(
      (candidate) => candidate.from === route.to && candidate.to === route.from,
    ) > game.routes.indexOf(route),
  );
  $("#route-layer").innerHTML = uniqueRoutes
    .map((route) => {
      const from = islandById(route.from);
      const to = islandById(route.to);
      return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />
        <text x="${(from.x + to.x) / 2}" y="${(from.y + to.y) / 2}">${route.distance}</text>`;
    })
    .join("");
  $("#island-layer").innerHTML = game.islands
    .map((island) => {
      const shortage = island.shortageStreak > 0;
      const selected = island.id === selectedIsland;
      return `
        <button class="island-node ${island.id === "harbor" ? "main-island" : ""} ${shortage ? "shortage" : ""} ${selected ? "selected" : ""}"
          style="--x:${island.x}%;--y:${island.y}%" data-island="${island.id}" type="button"
          aria-label="${island.name}，${shortage ? "缺貨警告" : "供應正常"}">
          <span class="island-shape"></span>
          <strong>${island.name}</strong>
          ${shortage ? `<b class="alert-badge">${island.shortageStreak}/2</b>` : ""}
        </button>`;
    })
    .join("");
  $("#ship-layer").innerHTML = game.ships
    .map((ship) => {
      const point = pointForShip(ship);
      return `
        <button class="ship-marker ${ship.id === selectedShip ? "selected" : ""}"
          style="--x:${point.x}%;--y:${point.y}%;--ship:${ship.color}" data-map-ship="${ship.id}"
          type="button" aria-label="${ship.name}${ship.transit ? `，航行剩 ${ship.transit.remaining} 回合` : "，已靠岸"}">
          <span>⛵</span>
        </button>`;
    })
    .join("");
  document.querySelectorAll("[data-island]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedIsland = button.dataset.island;
      audio.play("tick");
      renderMap();
      renderIslandDetail();
    });
  });
  document.querySelectorAll("[data-map-ship]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedShip = button.dataset.mapShip;
      audio.play("tick");
      renderAll();
    });
  });
}

function renderIslandDetail() {
  const island = islandById(selectedIsland);
  const used = total(island.stock);
  const specialty = island.specialty ? GOOD_INFO[island.specialty].name : "三物資大量生產";
  $("#island-detail").innerHTML = `
    <div>
      <strong>${island.name}</strong>
      <span>${island.id === "harbor" ? "主島工業港" : `特產：${specialty}`}</span>
    </div>
    <div class="goods-row">${goodsMarkup(island.stock)}</div>
    <div class="capacity">
      <span>倉儲 ${used} / ${island.cap}</span>
      <i style="--fill:${Math.min(100, (used / island.cap) * 100)}%"></i>
    </div>
    <div class="demand">每輪需求　${goodsMarkup(island.demand, true)}</div>`;
}

function renderShipTabs() {
  $("#ship-tabs").innerHTML = game.ships
    .map(
      (ship) => `
        <button type="button" role="tab" data-ship="${ship.id}"
          aria-selected="${ship.id === selectedShip}" class="${ship.id === selectedShip ? "selected" : ""}">
          <span style="color:${ship.color}">●</span>
          <strong>${ship.name}</strong>
          <small>${ship.transit ? `航行 ${ship.transit.remaining}` : islandById(ship.location).name}</small>
        </button>`,
    )
    .join("");
  document.querySelectorAll("[data-ship]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedShip = button.dataset.ship;
      audio.play("tick");
      renderAll();
    });
  });
}

function routeOptions(ship) {
  return game.routes.filter(
    (route) => route.from === ship.location && route.distance <= ship.range,
  );
}

function cargoControls(ship, mode) {
  const values = orders[ship.id][mode];
  return `
    <div class="cargo-controls">
      ${GOODS.map(
        (good) => `
          <label>
            <img src="./assets/icons/${GOOD_INFO[good].icon}" alt="" />
            <span>${GOOD_INFO[good].name}</span>
            <input type="number" min="0" max="${mode === "load" ? ship.capacity : ship.cargo[good]}"
              inputmode="numeric" value="${values[good]}" data-cargo="${mode}" data-good="${good}" />
          </label>`,
      ).join("")}
    </div>`;
}

function renderShipPlan() {
  const ship = shipById(selectedShip);
  if (ship.transit) {
    const destination = islandById(ship.transit.to);
    $("#ship-plan").innerHTML = `
      <div class="sailing-card">
        <div class="sailing-boat">⛵</div>
        <p class="kicker">海上航行中</p>
        <h3>前往 ${destination.name}</h3>
        <p>還有 <strong>${ship.transit.remaining}</strong> 回合抵達。航行中無法改令，貨物也不計入任何島的庫存。</p>
        <div class="goods-row">${goodsMarkup(ship.cargo)}</div>
      </div>`;
    return;
  }
  const island = islandById(ship.location);
  const routes = routeOptions(ship);
  const order = orders[ship.id];
  $("#ship-plan").innerHTML = `
    <div class="ship-summary">
      <div><span>目前靠岸</span><strong>${island.name}</strong></div>
      <div><span>船艙</span><strong>${total(ship.cargo)} / ${ship.capacity}</strong></div>
      <div><span>航程上限</span><strong>${ship.range} 格</strong></div>
    </div>
    <fieldset>
      <legend>① 卸貨到 ${island.name}</legend>
      ${cargoControls(ship, "unload")}
    </fieldset>
    <fieldset>
      <legend>② 從 ${island.name} 裝貨</legend>
      ${cargoControls(ship, "load")}
    </fieldset>
    <fieldset>
      <legend>③ 下一站</legend>
      <div class="destinations">
        <button type="button" data-destination="" class="${!order.destination ? "selected" : ""}">
          ⚓ 留港<small>不出航</small>
        </button>
        ${routes
          .map(
            (route) => `
              <button type="button" data-destination="${route.to}" class="${order.destination === route.to ? "selected" : ""}">
                ${directionIcon[route.direction]} ${islandById(route.to).name}
                <small>${route.distance} 格</small>
              </button>`,
          )
          .join("")}
      </div>
    </fieldset>
    <div class="cargo-preview">
      <span>目前貨艙</span><div class="goods-row">${goodsMarkup(ship.cargo)}</div>
    </div>`;

  document.querySelectorAll("[data-cargo]").forEach((input) => {
    input.addEventListener("input", () => {
      orders[ship.id][input.dataset.cargo][input.dataset.good] = Math.max(
        0,
        Number.parseInt(input.value, 10) || 0,
      );
      renderOrderCount();
    });
    input.addEventListener("change", () => audio.play("tick"));
  });
  document.querySelectorAll("[data-destination]").forEach((button) => {
    button.addEventListener("click", () => {
      orders[ship.id].destination = button.dataset.destination || null;
      audio.play("tick");
      renderShipPlan();
      renderOrderCount();
    });
  });
}

function isActiveOrder(order) {
  return Boolean(order.destination || total(order.load) || total(order.unload));
}

function renderOrderCount() {
  const count = Object.values(orders).filter(isActiveOrder).length;
  $("#order-count").textContent = `${count} / 3`;
}

function renderHud() {
  $("#turn-value").textContent = `${game.turn} / ${game.maxTurns}`;
  const safe = game.islands.filter((island) => island.shortageStreak === 0).length;
  $("#safe-value").textContent = `${safe} / 7`;
  $("#sailing-value").textContent = `${game.ships.filter((ship) => ship.transit).length} 艘`;
  $("#score-value").textContent = String(scoreGame(game));
  $("#map-status").textContent = game.islands.some((island) => island.shortageStreak)
    ? "⚠ 有島缺貨"
    : "● 全島供應正常";
}

function renderAll() {
  renderHud();
  renderForecast();
  renderMap();
  renderIslandDetail();
  renderShipTabs();
  renderShipPlan();
  renderOrderCount();
}

function missingText(missing) {
  return GOODS.filter((good) => missing[good])
    .map((good) => `${GOOD_INFO[good].name} ${missing[good]}`)
    .join("、");
}

function showReport() {
  const report = game.lastReport;
  const ended = game.phase !== "planning";
  $("#report-kicker").textContent = ended ? "航季總結" : `第 ${report.turn} 輪完成`;
  $("#report-title").textContent =
    game.phase === "won" ? "七島燈火不滅！" : game.phase === "lost" ? "補給線中斷…" : "船隊回報";
  const events = [
    ...report.arrivals.map(
      (arrival) => `⛵ ${shipById(arrival.ship).name} 抵達 ${islandById(arrival.island).name}`,
    ),
    ...report.shortages.map(
      (shortage) => `⚠ ${islandById(shortage.island).name} 缺 ${missingText(shortage.missing)}`,
    ),
    ...report.logs.map((log) => `📦 ${log}`),
  ];
  $("#report-content").innerHTML = `
    <div class="report-weather">
      <span>${directionIcon[report.weather.wind.direction]}</span>
      <div><small>本輪海象</small><strong>${report.weather.wind.strength} 級風
        ${report.weather.typhoon ? " · 颱風成形" : ""}</strong></div>
    </div>
    <div class="event-list">
      ${events.length ? events.map((event) => `<p>${event}</p>`).join("") : "<p>海面平穩，各島按計畫運作。</p>"}
    </div>
    ${ended ? `<p class="final-score">航季得分 <strong>${scoreGame(game)}</strong></p>` : ""}`;
  $("#continue-button").textContent = ended ? "回到港務局" : "規劃下一輪";
  $("#report-sheet").hidden = false;
  $("#continue-button").focus();
  audio.play(game.phase === "won" ? "win" : report.shortages.length ? "warn" : "arrival");
}

async function finishGame() {
  if (game.phase === "won") {
    const next = [...unlocks, "sun"];
    if (game.history.every((report) => report.shortages.length === 0)) next.push("storm");
    unlocks = await saveUnlocks(next);
  }
  best = await saveBest(scoreGame(game), best);
  $("#best-score").textContent = String(best);
  $("#unlock-count").textContent = String(unlocks.length);
}

$("#start-button").addEventListener("click", async () => {
  await audio.start();
  audio.play("horn");
  game = createGame({ seed: Date.now() });
  selectedShip = "swift";
  selectedIsland = "harbor";
  resetOrders();
  $("#lobby").hidden = true;
  $("#game").hidden = false;
  renderAll();
  $("#resolve-button").focus();
});

$("#resolve-button").addEventListener("click", () => {
  try {
    game = resolveTurn(game, orders);
    resetOrders();
    renderAll();
    $("#plan-message").textContent = "";
    if (game.phase !== "planning") void finishGame();
    showReport();
  } catch (error) {
    $("#plan-message").textContent = error.message;
    audio.play("warn");
  }
});

$("#continue-button").addEventListener("click", () => {
  audio.play("tick");
  $("#report-sheet").hidden = true;
  if (game.phase !== "planning") {
    $("#game").hidden = true;
    $("#lobby").hidden = false;
    $("#start-button").focus();
  } else {
    $("#resolve-button").focus();
  }
});

$("#sound-toggle").addEventListener("click", () => {
  audio.setEnabled(!audio.enabled);
  $("#sound-toggle").textContent = audio.enabled ? "♫ 音樂開" : "♩ 音樂關";
  $("#sound-toggle").setAttribute("aria-pressed", String(audio.enabled));
  if (audio.enabled) audio.play("tick");
});

$("#about-button").addEventListener("click", () => {
  $("#about-sheet").hidden = false;
  $("#about-close").focus();
  audio.play("tick");
});

$("#about-close").addEventListener("click", () => {
  $("#about-sheet").hidden = true;
  $("#about-button").focus();
  audio.play("tick");
});

[best, unlocks] = await Promise.all([loadBest(), loadUnlocks()]);
$("#best-score").textContent = String(best);
$("#unlock-count").textContent = String(unlocks.length);
