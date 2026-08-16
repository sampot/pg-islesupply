import { describe, expect, it } from "vitest";
import {
  GOODS,
  applyCargoOrder,
  calculateTravelTime,
  consumeIsland,
  createGame,
  forecastFor,
  resolveTurn,
} from "./game.js";

const empty = () => ({ grain: 0, medicine: 0, fuel: 0 });
const stay = (load = empty(), unload = empty()) => ({
  destination: null,
  load,
  unload,
});

describe("島鏈補給規則", () => {
  it("建立七座島、三艘船與兩回合預報", () => {
    const game = createGame({ seed: 42 });

    expect(game.islands).toHaveLength(7);
    expect(game.ships).toHaveLength(3);
    expect(game.forecast).toEqual([forecastFor(42, 1), forecastFor(42, 2)]);
  });

  it("裝貨總量不會超過船艙容量", () => {
    const island = { stock: { grain: 9, medicine: 9, fuel: 9 }, cap: 30 };
    const ship = { capacity: 5, cargo: empty() };

    const result = applyCargoOrder(ship, island, {
      load: { grain: 4, medicine: 4, fuel: 4 },
      unload: empty(),
    });

    expect(Object.values(result.ship.cargo).reduce((a, b) => a + b, 0)).toBe(5);
    expect(result.ship.cargo).toEqual({ grain: 4, medicine: 1, fuel: 0 });
  });

  it("先卸貨再按糧、藥、油順序裝貨", () => {
    const island = { stock: { grain: 3, medicine: 3, fuel: 3 }, cap: 20 };
    const ship = {
      capacity: 4,
      cargo: { grain: 0, medicine: 0, fuel: 4 },
    };

    const result = applyCargoOrder(ship, island, {
      unload: { grain: 0, medicine: 0, fuel: 4 },
      load: { grain: 3, medicine: 3, fuel: 0 },
    });

    expect(result.ship.cargo).toEqual({ grain: 3, medicine: 1, fuel: 0 });
    expect(result.island.stock).toEqual({ grain: 0, medicine: 2, fuel: 7 });
  });

  it("島嶼倉儲溢出時只收得到剩餘空間", () => {
    const island = { stock: { grain: 4, medicine: 3, fuel: 2 }, cap: 10 };
    const ship = {
      capacity: 6,
      cargo: { grain: 0, medicine: 0, fuel: 5 },
    };

    const result = applyCargoOrder(ship, island, {
      unload: { grain: 0, medicine: 0, fuel: 5 },
      load: empty(),
    });

    expect(result.island.stock).toEqual({ grain: 4, medicine: 3, fuel: 3 });
    expect(result.ship.cargo.fuel).toBe(4);
    expect(result.overflow).toBe(4);
  });

  it("消耗依糧、藥、油固定優先序並記錄缺口", () => {
    const island = {
      stock: { grain: 1, medicine: 0, fuel: 2 },
      demand: { grain: 2, medicine: 1, fuel: 1 },
      shortageStreak: 0,
    };

    const result = consumeIsland(island);

    expect(result.island.stock).toEqual({ grain: 0, medicine: 0, fuel: 1 });
    expect(result.missing).toEqual({ grain: 1, medicine: 1, fuel: 0 });
    expect(result.island.shortageStreak).toBe(1);
  });

  it("連續兩回合任一關鍵物資不足即失敗", () => {
    let game = createGame({ seed: 2 });
    game.islands = game.islands.map((island, index) =>
      index === 1
        ? { ...island, stock: empty(), specialty: null }
        : { ...island, demand: empty() },
    );

    game = resolveTurn(game, {});
    expect(game.phase).toBe("planning");
    expect(game.islands[1].shortageStreak).toBe(1);
    game = resolveTurn(game, {});
    expect(game.phase).toBe("lost");
  });

  it("補齊物資會中斷缺貨連續計數", () => {
    const island = {
      stock: { grain: 2, medicine: 1, fuel: 1 },
      demand: { grain: 1, medicine: 1, fuel: 1 },
      shortageStreak: 1,
    };

    expect(consumeIsland(island).island.shortageStreak).toBe(0);
  });

  it("順風縮短航程、逆風拉長且至少一回合", () => {
    expect(calculateTravelTime(3, "east", { direction: "east", strength: 2 })).toBe(1);
    expect(calculateTravelTime(3, "east", { direction: "west", strength: 2 })).toBe(5);
    expect(calculateTravelTime(1, "north", { direction: "north", strength: 3 })).toBe(1);
  });

  it("航程為一的船在本回合抵達但貨仍留在船上", () => {
    let game = createGame({ seed: 7 });
    game.forecast[0] = {
      turn: 1,
      wind: { direction: "east", strength: 3 },
      typhoonChance: 0,
      typhoon: false,
    };
    const ship = game.ships[0];
    const target = game.routes.find(
      (route) => route.from === ship.location && route.direction === "east",
    );

    game = resolveTurn(game, {
      [ship.id]: {
        destination: target.to,
        load: { grain: 2, medicine: 0, fuel: 0 },
        unload: empty(),
      },
    });

    expect(game.ships[0].location).toBe(target.to);
    expect(game.ships[0].transit).toBeNull();
    expect(game.ships[0].cargo.grain).toBe(2);
  });

  it("航行中的貨物不會被島嶼消耗", () => {
    let game = createGame({ seed: 8 });
    game.islands = game.islands.map((island) => ({ ...island, demand: empty() }));
    const ship = game.ships[1];
    const target = game.routes.find((route) => route.from === ship.location);
    game.forecast[0] = {
      turn: 1,
      wind: { direction: "west", strength: 3 },
      typhoonChance: 0,
      typhoon: false,
    };

    game = resolveTurn(game, {
      [ship.id]: {
        destination: target.to,
        load: { grain: 2, medicine: 0, fuel: 0 },
        unload: empty(),
      },
    });

    expect(game.ships[1].transit).not.toBeNull();
    expect(game.ships[1].cargo.grain).toBe(2);
  });

  it("全島撐過十回合即獲勝", () => {
    let game = createGame({ seed: 99 });
    game.islands = game.islands.map((island) => ({
      ...island,
      stock: { grain: 50, medicine: 50, fuel: 50 },
      cap: 200,
      production: empty(),
      specialty: null,
    }));

    for (let turn = 0; turn < 10; turn += 1) game = resolveTurn(game, {});

    expect(game.phase).toBe("won");
    expect(game.turn).toBe(10);
  });

  it("所有貨物種類維持固定解析順序", () => {
    expect(GOODS).toEqual(["grain", "medicine", "fuel"]);
  });
});
