/** Covers the form-field-to-number conversion used by the action editor.
 *
 *  This is where a temperature can quietly disappear on its way to the LLM:
 *  the editor holds the value as a string, and "0" is both falsy-looking and a
 *  meaningful setting. The adapters are tested in shared/llm — these tests pin
 *  down the step before them. */

import { describe, it, expect } from "vitest";
import { parseOptionalFloat, parseOptionalInt } from "./utils";

describe("parseOptionalFloat", () => {
  it("parses a decimal value", () => {
    expect(parseOptionalFloat("0.7")).toBe(0.7);
  });

  it('keeps "0" as 0 rather than dropping it', () => {
    // A truthiness check here would turn "deterministic" into "provider default".
    expect(parseOptionalFloat("0")).toBe(0);
  });

  it("treats an empty field as unset", () => {
    expect(parseOptionalFloat("")).toBeUndefined();
  });

  it("treats a whitespace-only field as unset", () => {
    expect(parseOptionalFloat("   ")).toBeUndefined();
  });

  it("returns undefined for unparseable input instead of NaN", () => {
    // NaN would serialize to null in the request body and get the call rejected.
    expect(parseOptionalFloat("abc")).toBeUndefined();
  });

  it("parses the upper end of the range", () => {
    expect(parseOptionalFloat("2")).toBe(2);
  });
});

describe("parseOptionalInt", () => {
  it("parses an integer value", () => {
    expect(parseOptionalInt("256")).toBe(256);
  });

  it("treats an empty field as unset", () => {
    expect(parseOptionalInt("")).toBeUndefined();
  });

  it("returns undefined for unparseable input instead of NaN", () => {
    expect(parseOptionalInt("abc")).toBeUndefined();
  });

  it("truncates a decimal to an integer", () => {
    expect(parseOptionalInt("100.9")).toBe(100);
  });
});
