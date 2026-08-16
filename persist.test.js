import { describe, expect, it, vi } from "vitest";
import { loadBest, loadUnlocks, saveBest, saveUnlocks } from "./persist.js";

describe("島鏈補給 KV", () => {
  it("從指定 best key 載入最佳分數", async () => {
    const fetcher = vi.fn(async () => new Response("640"));
    await expect(loadBest(fetcher)).resolves.toBe(640);
    expect(fetcher).toHaveBeenCalledWith("/api/kv/islesupply:best");
  });

  it("靜態預覽無 KV 時安全回退", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(loadBest(fetcher)).resolves.toBe(0);
    await expect(loadUnlocks(fetcher)).resolves.toEqual([]);
  });

  it("只在刷新紀錄時寫入 best", async () => {
    const fetcher = vi.fn(async () => new Response(""));
    await expect(saveBest(500, 700, fetcher)).resolves.toBe(700);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(saveBest(900, 700, fetcher)).resolves.toBe(900);
    expect(fetcher).toHaveBeenCalledWith("/api/kv/islesupply:best", {
      method: "PUT",
      body: "900",
    });
  });

  it("去重並保存解鎖船旗", async () => {
    const fetcher = vi.fn(async () => new Response(""));
    await expect(saveUnlocks(["sun", "sun", "storm"], fetcher)).resolves.toEqual([
      "sun",
      "storm",
    ]);
    expect(fetcher).toHaveBeenCalledWith("/api/kv/islesupply:unlocks", {
      method: "PUT",
      body: '["sun","storm"]',
    });
  });
});
