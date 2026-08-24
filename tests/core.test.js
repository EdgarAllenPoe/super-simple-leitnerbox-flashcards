"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../core.js");

const NOW = new Date("2026-08-24T12:00:00.000Z");
const TODAY = "2026-08-24";

function cardInBox(box, dueDate, overrides = {}) {
  return {
    id: overrides.id || `card-${box}-${Math.random()}`,
    front: overrides.front || "Front",
    back: overrides.back || "Back",
    box,
    dueDate,
    createdAt: overrides.createdAt || "2026-08-01T12:00:00.000Z",
    updatedAt: overrides.updatedAt || "2026-08-01T12:00:00.000Z",
    introducedAt: overrides.introducedAt ?? "2026-08-01T12:00:00.000Z",
    lastReviewedAt: overrides.lastReviewedAt ?? "2026-08-01T12:00:00.000Z",
    reviewCount: overrides.reviewCount ?? 1,
    correctCount: overrides.correctCount ?? 1,
    incorrectCount: overrides.incorrectCount ?? 0,
  };
}

test("uses the fixed five-box schedule", () => {
  assert.deepEqual(Core.BOX_INTERVAL_DAYS, { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 });
  assert.equal(Core.NEW_CARDS_PER_DAY, 10);
});

test("adds calendar days safely", () => {
  assert.equal(Core.addDays("2026-08-24", 1), "2026-08-25");
  assert.equal(Core.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(Core.addDays("2028-02-28", 1), "2028-02-29");
});

test("creates new cards in the Inbox", () => {
  const card = Core.createCard("  Question  ", "  Answer  ", NOW);
  assert.equal(card.front, "Question");
  assert.equal(card.back, "Answer");
  assert.equal(card.box, 0);
  assert.equal(card.dueDate, null);
  assert.equal(card.reviewCount, 0);
});

test("a correct new card enters Box 1 and is due in one day", () => {
  const newCard = Core.createCard("Q", "A", NOW);
  const answered = Core.answerCard(newCard, true, TODAY, NOW);

  assert.equal(answered.box, 1);
  assert.equal(answered.dueDate, "2026-08-25");
  assert.equal(answered.reviewCount, 1);
  assert.equal(answered.correctCount, 1);
  assert.ok(answered.introducedAt);
});

test("correct answers advance cards using each destination box interval", () => {
  const cases = [
    [1, 2, "2026-08-26"],
    [2, 3, "2026-08-28"],
    [3, 4, "2026-09-01"],
    [4, 5, "2026-09-09"],
    [5, 5, "2026-09-09"],
  ];

  for (const [startBox, expectedBox, expectedDue] of cases) {
    const answered = Core.answerCard(cardInBox(startBox, TODAY), true, TODAY, NOW);
    assert.equal(answered.box, expectedBox);
    assert.equal(answered.dueDate, expectedDue);
  }
});

test("Again returns every card to Box 1", () => {
  const answered = Core.answerCard(cardInBox(5, TODAY), false, TODAY, NOW);
  assert.equal(answered.box, 1);
  assert.equal(answered.dueDate, "2026-08-25");
  assert.equal(answered.incorrectCount, 1);
});

test("study queue includes due cards first and limits new cards", () => {
  const cards = [
    cardInBox(2, "2026-08-23", { id: "overdue" }),
    cardInBox(1, TODAY, { id: "due" }),
    cardInBox(3, "2026-08-25", { id: "future" }),
  ];

  for (let index = 0; index < 12; index += 1) {
    cards.push({
      ...Core.createCard(`New ${index}`, `Answer ${index}`, new Date(`2026-08-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`)),
      id: `new-${index}`,
    });
  }

  const queue = Core.buildStudyQueue(cards, TODAY);
  assert.equal(queue.length, 12);
  assert.deepEqual(queue.slice(0, 2), ["overdue", "due"]);
  assert.equal(queue.includes("future"), false);
  assert.equal(queue.filter((id) => id.startsWith("new-")).length, 10);
});

test("cards already introduced today reduce the daily new-card allowance", () => {
  const cards = [];
  for (let index = 0; index < 8; index += 1) {
    cards.push(cardInBox(1, "2026-08-25", {
      id: `introduced-${index}`,
      introducedAt: "2026-08-24T08:00:00.000Z",
    }));
  }
  for (let index = 0; index < 5; index += 1) {
    cards.push({ ...Core.createCard(`New ${index}`, `Back ${index}`, NOW), id: `new-${index}` });
  }

  const queue = Core.buildStudyQueue(cards, TODAY);
  assert.equal(queue.length, 2);
});

test("reset clears study progress and returns a card to the Inbox", () => {
  const reset = Core.resetCard(cardInBox(4, "2026-09-01"), NOW);
  assert.equal(reset.box, 0);
  assert.equal(reset.dueDate, null);
  assert.equal(reset.reviewCount, 0);
  assert.equal(reset.introducedAt, null);
});

test("normalizes a simple array import and alternative side names", () => {
  const normalized = Core.normalizeState([
    { sideA: "One", sideB: "Uno" },
    { a: "Two", b: "Dos", box: 2, dueDate: TODAY },
  ], NOW);

  assert.equal(normalized.cards.length, 2);
  assert.equal(normalized.cards[0].front, "One");
  assert.equal(normalized.cards[1].box, 2);
  assert.equal(normalized.cards[1].dueDate, TODAY);
});

test("reports box and due statistics", () => {
  const cards = [
    Core.createCard("New", "Card", NOW),
    cardInBox(1, "2026-08-23"),
    cardInBox(2, TODAY),
    cardInBox(3, "2026-08-25"),
  ];

  const stats = Core.getStats(cards, TODAY);
  assert.deepEqual(stats.byBox, [1, 1, 1, 1, 0, 0]);
  assert.equal(stats.total, 4);
  assert.equal(stats.due, 2);
  assert.equal(stats.overdue, 1);
});
