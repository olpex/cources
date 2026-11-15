import { test } from "node:test";
import assert from "node:assert/strict";
import { pollDelay } from "./polling";
test("4x at 23:30 Kyiv", () => assert.equal(pollDelay(300000, new Date("2026-11-15T21:30:00Z")), 1200000));
test("4x at 06:59 Kyiv", () => assert.equal(pollDelay(300000, new Date("2026-11-15T04:59:00Z")), 1200000));
test("normal at 07:00 Kyiv", () => assert.equal(pollDelay(300000, new Date("2026-11-15T05:00:00Z")), 300000));
