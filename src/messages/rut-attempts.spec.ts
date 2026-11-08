import { describe, expect, it } from "vitest";
import {
  MAX_RUTS_PER_SOURCE,
  RUT_WINDOW_MS,
  RutAttempts,
} from "./rut-attempts.js";

describe("RutAttempts", () => {
  it(`allows ${MAX_RUTS_PER_SOURCE} different RUTs and refuses the next`, () => {
    const attempts = new RutAttempts(() => 0);
    expect(attempts.allow("1.1.1.1", "a")).toBe(true);
    expect(attempts.allow("1.1.1.1", "b")).toBe(true);
    expect(attempts.allow("1.1.1.1", "c")).toBe(true);
    expect(attempts.allow("1.1.1.1", "d")).toBe(false);
  });

  it("does not count a RUT already tried", () => {
    const attempts = new RutAttempts(() => 0);
    for (const rut of ["a", "b", "c"]) attempts.allow("1.1.1.1", rut);
    expect(attempts.allow("1.1.1.1", "a")).toBe(true);
  });

  it("counts each source apart", () => {
    const attempts = new RutAttempts(() => 0);
    for (const rut of ["a", "b", "c"]) attempts.allow("1.1.1.1", rut);
    expect(attempts.allow("2.2.2.2", "d")).toBe(true);
  });

  it("starts over once the window passes", () => {
    let now = 0;
    const attempts = new RutAttempts(() => now);
    for (const rut of ["a", "b", "c"]) attempts.allow("1.1.1.1", rut);
    now = RUT_WINDOW_MS;
    expect(attempts.allow("1.1.1.1", "d")).toBe(true);
  });
});
