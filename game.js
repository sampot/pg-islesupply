export const GOODS = Object.freeze(["grain", "medicine", "fuel"]);

export const GOOD_INFO = Object.freeze({
  grain: { name: "糧食", icon: "resource_wheat.svg" },
  medicine: { name: "藥品", icon: "flask_half.svg" },
  fuel: { name: "燃油", icon: "fire.svg" },
});

const DIRECTIONS = ["north", "east", "south", "west"];
const OPPOSITE = { north: "south", south: "north", east: "west", west: "east" };

const ISLAND_BLUEPRINTS = [
  {
    id: "harbor",
    name: "中央港",
    x: 50,
    y: 49,
    cap: 44,
    stock: { grain: 15, medicine: 12, fuel: 14 },
    demand: { grain: 1, medicine: 1, fuel: 1 },
    production: { grain: 7, medicine: 5, fuel: 6 },
    specialty: null,
  },
  {
    id: "rice",
    name: "稻浪島",
    x: 77,
    y: 24,
    cap: 15,
    stock: { grain: 4, medicine: 3, fuel: 3 },
    demand: { grain: 1, medicine: 1, fuel: 2 },
    production: null,
    specialty: "grain",
  },
  {
    id: "clinic",
    name: "白塔島",
    x: 88,
    y: 57,
    cap: 14,
    stock: { grain: 4, medicine: 3, fuel: 3 },
    demand: { grain: 2, medicine: 1, fuel: 1 },
    production: null,
    specialty: "medicine",
  },
  {
    id: "reef",
    name: "珊瑚島",
    x: 68,
    y: 82,
    cap: 13,
    stock: { grain: 4, medicine: 3, fuel: 3 },
    demand: { grain: 1, medicine: 2, fuel: 1 },
    production: null,
    specialty: "fuel",
  },
  {
    id: "lighthouse",
    name: "燈岬島",
    x: 31,
    y: 80,
    cap: 13,
    stock: { grain: 4, medicine: 3, fuel: 3 },
    demand: { grain: 2, medicine: 1, fuel: 2 },
    production: null,
    specialty: "fuel",
  },
  {
    id: "orchard",
    name: "果嶼",
    x: 13,
    y: 53,
    cap: 15,
    stock: { grain: 5, medicine: 3, fuel: 3 },
    demand: { grain: 1, medicine: 2, fuel: 1 },
    production: null,
    specialty: "grain",
  },
  {
    id: "spring",
    name: "泉心島",
    x: 27,
    y: 20,
    cap: 14,
    stock: { grain: 4, medicine: 4, fuel: 3 },
    demand: { grain: 2, medicine: 1, fuel: 1 },
    production: null,
    specialty: "medicine",
  },
];

export const ROUTES = Object.freeze([
  ["harbor", "rice", 2, "east"],
  ["harbor", "clinic", 3, "east"],
  ["harbor", "reef", 2, "south"],
  ["harbor", "lighthouse", 2, "south"],
  ["harbor", "orchard", 3, "west"],
  ["harbor", "spring", 2, "north"],
  ["rice", "clinic", 2, "south"],
  ["clinic", "reef", 2, "south"],
  ["reef", "lighthouse", 3, "west"],
  ["lighthouse", "orchard", 2, "north"],
  ["orchard", "spring", 2, "north"],
  ["spring", "rice", 3, "east"],
].flatMap(([from, to, distance, direction]) => [
  { from, to, distance, direction },
  { from: to, to: from, distance, direction: OPPOSITE[direction] },
]));

const SHIP_BLUEPRINTS = [
  { id: "swift", name: "飛魚號", capacity: 5, range: 3, color: "#ffe477" },
  { id: "turtle", name: "海龜號", capacity: 8, range: 3, color: "#72f0c0" },
  { id: "gull", name: "白鷗號", capacity: 6, range: 2, color: "#f6a9ff" },
];

function stock(values = {}) {
  return Object.fromEntries(GOODS.map((good) => [good, Math.max(0, values[good] ?? 0)]));
}

function total(values) {
  return GOODS.reduce((sum, good) => sum + values[good], 0);
}

function hash(seed, value) {
  let n = (seed ^ Math.imul(value + 1, 0x9e3779b1)) >>> 0;
  n ^= n >>> 16;
  n = Math.imul(n, 0x21f0aaad);
  n ^= n >>> 15;
  n = Math.imul(n, 0x735a2d97);
  return (n ^ (n >>> 15)) >>> 0;
}

function random01(seed, value) {
  return hash(seed, value) / 0x100000000;
}

export function forecastFor(seed, turn) {
  const direction = DIRECTIONS[Math.floor(random01(seed, turn * 3) * DIRECTIONS.length)];
  const strength = 1 + Math.floor(random01(seed, turn * 3 + 1) * 3);
  const typhoonChance = 10 + Math.floor(random01(seed, turn * 3 + 2) * 31);
  return {
    turn,
    wind: { direction, strength },
    typhoonChance,
    typhoon: random01(seed ^ 0xa53c, turn) * 100 < typhoonChance,
  };
}

export function createGame({ seed = Date.now() } = {}) {
  const safeSeed = Number(seed) >>> 0;
  return {
    seed: safeSeed,
    turn: 1,
    maxTurns: 10,
    phase: "planning",
    islands: ISLAND_BLUEPRINTS.map((island) => ({
      ...island,
      stock: stock(island.stock),
      demand: stock(island.demand),
      production: island.production ? stock(island.production) : null,
      shortageStreak: 0,
    })),
    ships: SHIP_BLUEPRINTS.map((ship) => ({
      ...ship,
      cargo: stock(),
      location: "harbor",
      transit: null,
    })),
    routes: ROUTES.map((route) => ({ ...route })),
    forecast: [forecastFor(safeSeed, 1), forecastFor(safeSeed, 2)],
    history: [],
    lastReport: null,
  };
}

export function calculateTravelTime(distance, direction, wind) {
  let turns = distance;
  if (wind.direction === direction) turns -= wind.strength;
  if (wind.direction === OPPOSITE[direction]) turns += wind.strength;
  return Math.max(1, Math.ceil(turns));
}

function safeAmount(value) {
  return Number.isInteger(Number(value)) ? Math.max(0, Number(value)) : 0;
}

export function applyCargoOrder(ship, island, order = {}) {
  const nextShip = { ...ship, cargo: stock(ship.cargo) };
  const nextIsland = { ...island, stock: stock(island.stock) };
  let overflow = 0;

  for (const good of GOODS) {
    const requested = safeAmount(order.unload?.[good]);
    const room = Math.max(0, nextIsland.cap - total(nextIsland.stock));
    const moved = Math.min(requested, nextShip.cargo[good], room);
    nextShip.cargo[good] -= moved;
    nextIsland.stock[good] += moved;
    overflow += Math.min(requested, nextShip.cargo[good] + moved) - moved;
  }

  for (const good of GOODS) {
    const requested = safeAmount(order.load?.[good]);
    const room = Math.max(0, nextShip.capacity - total(nextShip.cargo));
    const moved = Math.min(requested, nextIsland.stock[good], room);
    nextShip.cargo[good] += moved;
    nextIsland.stock[good] -= moved;
  }

  return { ship: nextShip, island: nextIsland, overflow };
}

export function consumeIsland(island) {
  const next = { ...island, stock: stock(island.stock) };
  const missing = stock();
  for (const good of GOODS) {
    const used = Math.min(next.stock[good], next.demand[good]);
    next.stock[good] -= used;
    missing[good] = next.demand[good] - used;
  }
  next.shortageStreak = total(missing) > 0 ? island.shortageStreak + 1 : 0;
  return { island: next, missing };
}

function addProduction(island) {
  const next = { ...island, stock: stock(island.stock) };
  const produced = stock(island.production ?? {});
  if (island.specialty) produced[island.specialty] += 1;
  for (const good of GOODS) {
    const room = Math.max(0, next.cap - total(next.stock));
    const moved = Math.min(produced[good], room);
    next.stock[good] += moved;
    produced[good] = moved;
  }
  return { island: next, produced };
}

function cargoPhase(game, orders) {
  let islands = game.islands.map((island) => ({ ...island, stock: stock(island.stock) }));
  let ships = game.ships.map((ship) => ({ ...ship, cargo: stock(ship.cargo) }));
  const logs = [];

  for (let index = 0; index < ships.length; index += 1) {
    const ship = ships[index];
    if (ship.transit) continue;
    const islandIndex = islands.findIndex((island) => island.id === ship.location);
    const result = applyCargoOrder(ship, islands[islandIndex], orders[ship.id] ?? {});
    ships[index] = result.ship;
    islands[islandIndex] = result.island;
    if (result.overflow) logs.push(`${ship.name} 有 ${result.overflow} 箱因倉滿未卸下`);
  }
  return { islands, ships, logs };
}

function launchShips(game, ships, orders, weather) {
  return ships.map((ship) => {
    if (ship.transit) return ship;
    const destination = orders[ship.id]?.destination;
    if (!destination || destination === ship.location) return ship;
    const route = game.routes.find(
      (candidate) => candidate.from === ship.location && candidate.to === destination,
    );
    if (!route || route.distance > ship.range) return ship;
    const duration =
      calculateTravelTime(route.distance, route.direction, weather.wind) +
      (weather.typhoon ? 1 : 0);
    return {
      ...ship,
      location: null,
      transit: {
        from: route.from,
        to: route.to,
        remaining: duration,
        duration,
        direction: route.direction,
      },
    };
  });
}

function advanceShips(ships) {
  const arrivals = [];
  const nextShips = ships.map((ship) => {
    if (!ship.transit) return ship;
    const remaining = ship.transit.remaining - 1;
    if (remaining > 0) return { ...ship, transit: { ...ship.transit, remaining } };
    arrivals.push({ ship: ship.id, island: ship.transit.to });
    return { ...ship, location: ship.transit.to, transit: null };
  });
  return { ships: nextShips, arrivals };
}

export function resolveTurn(game, orders = {}) {
  if (game.phase !== "planning") throw new Error("航季已經結束");
  const weather = game.forecast[0];
  const cargo = cargoPhase(game, orders);
  const launched = launchShips(game, cargo.ships, orders, weather);
  const movement = advanceShips(launched);
  const production = [];
  const shortages = [];
  const islands = cargo.islands.map((island) => {
    const made = addProduction(island);
    production.push({ island: island.id, goods: made.produced });
    const consumed = consumeIsland(made.island);
    if (total(consumed.missing)) {
      shortages.push({ island: island.id, missing: consumed.missing });
    }
    return consumed.island;
  });
  const lost = islands.some((island) => island.shortageStreak >= 2);
  const won = !lost && game.turn >= game.maxTurns;
  const report = {
    turn: game.turn,
    weather,
    arrivals: movement.arrivals,
    shortages,
    production,
    logs: cargo.logs,
  };
  const nextTurn = lost || won ? game.turn : game.turn + 1;

  return {
    ...game,
    turn: nextTurn,
    phase: lost ? "lost" : won ? "won" : "planning",
    islands,
    ships: movement.ships,
    forecast:
      lost || won
        ? game.forecast
        : [forecastFor(game.seed, nextTurn), forecastFor(game.seed, nextTurn + 1)],
    history: [...game.history, report],
    lastReport: report,
  };
}

export function scoreGame(game) {
  const healthy = game.islands.filter((island) => island.shortageStreak === 0).length;
  const stockScore = game.islands.reduce((sum, island) => sum + total(island.stock), 0);
  return game.turn * 100 + healthy * 35 + stockScore * 2;
}
