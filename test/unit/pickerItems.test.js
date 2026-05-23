const assert = require("node:assert");

// tsconfig.json has outDir: "dist", so tsc emits to dist/pickerItems.js
const { buildPickerItems } = require("../../dist/pickerItems");

describe("buildPickerItems", () => {
  const versions = ["0.70.0", "0.68.4", "0.67.1", "0.66.0", "0.65.2", "0.64.0"];

  it("renders recent 5 + 'Show all' when filter is empty", () => {
    const items = buildPickerItems(versions, "0.70.0", "");
    assert.equal(items.length, 6);
    assert.equal(items[0].label, "0.70.0");
    assert.equal(items[0].description, "latest · current");
    assert.equal(items[4].label, "0.65.2");
    assert.equal(items[5].label, "Show all 6 versions…");
  });

  it("filters all versions on non-empty input, hides 'Show all'", () => {
    const items = buildPickerItems(versions, "0.70.0", "68");
    assert.deepEqual(items.map((i) => i.label), ["0.68.4"]);
  });

  it("omits 'Show all' when there are <= 5 versions", () => {
    const items = buildPickerItems(versions.slice(0, 4), "0.70.0", "");
    assert.equal(items.length, 4);
    assert.equal(items.find((i) => i.label.startsWith("Show all")), undefined);
  });

  it("marks current with 'current' (no 'latest' if not first)", () => {
    const items = buildPickerItems(versions, "0.67.1", "");
    const cur = items.find((i) => i.label === "0.67.1");
    assert.equal(cur.description, "current");
  });
});
