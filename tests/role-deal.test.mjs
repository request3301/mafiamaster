import assert from "node:assert/strict";
import test from "node:test";
import { restoreNumberedCard, takeNumberedCard } from "../app/role-deal.ts";

test("a player chooses a one-based card number and the remaining deck closes the gap", () => {
  const draw = takeNumberedCard(["Мирный", "Дон", "Мафия", "Шериф"], 2);

  assert.deepEqual(draw, {
    card: "Дон",
    index: 1,
    remaining: ["Мирный", "Мафия", "Шериф"],
  });
  assert.deepEqual(draw?.remaining.map((_, index) => index + 1), [1, 2, 3]);
});

test("cancelling a dealt card restores it under the same number", () => {
  const restored = restoreNumberedCard(["Мирный", "Мафия", "Шериф"], 2, "Дон");
  assert.deepEqual(restored, ["Мирный", "Дон", "Мафия", "Шериф"]);
});

test("card numbers outside the remaining one-to-N range are ignored", () => {
  assert.equal(takeNumberedCard(["Мирный"], 0), null);
  assert.equal(takeNumberedCard(["Мирный"], 2), null);
  assert.equal(takeNumberedCard(["Мирный"], 1.5), null);
});
