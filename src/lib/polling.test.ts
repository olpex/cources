import { describe, it, expect } from "vitest";
import { pollDelay } from "./polling";
describe("night polling", () => {
  it("4x at 23:30 Kyiv", () => expect(pollDelay(300000, new Date("2026-11-15T21:30:00Z"))).toBe(1200000));
  it("4x at 06:59 Kyiv", () => expect(pollDelay(300000, new Date("2026-11-15T04:59:00Z"))).toBe(1200000));
  it("normal at 07:00 Kyiv", () => expect(pollDelay(300000, new Date("2026-11-15T05:00:00Z"))).toBe(300000));
});
