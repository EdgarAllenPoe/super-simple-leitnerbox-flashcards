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

test("uses the fixed five-box schedule and four rating keys", () => {
  assert.deepEqual(Core.BOX_INTERVAL_DAYS, { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 });
  assert.equal(Core.INBOX_PROMOTION_COUNT, 5);
  assert.deepEqual(Core.RATING_ORDER, ["again", "hard", "good", "easy"]);
  assert.deepEqual(Core.RATING_KEYS, { 1: "again", 2: "hard", 3: "good", 4: "easy" });
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

test("four ratings place new cards into the intended entry boxes", () => {
  const expected = {
    again: [1, "2026-08-25"],
    hard: [1, "2026-08-25"],
    good: [1, "2026-08-25"],
    easy: [2, "2026-08-26"],
  };

  for (const [rating, [expectedBox, expectedDue]] of Object.entries(expected)) {
    const answered = Core.answerCard(Core.createCard("Q", "A", NOW), rating, TODAY, NOW);
    assert.equal(answered.box, expectedBox, rating);
    assert.equal(answered.dueDate, expectedDue, rating);
    assert.equal(answered.reviewCount, 1, rating);
    assert.ok(answered.introducedAt, rating);
  }
});

test("Again returns every reviewed card to Box 1", () => {
  const answered = Core.answerCard(cardInBox(5, TODAY), "again", TODAY, NOW);
  assert.equal(answered.box, 1);
  assert.equal(answered.dueDate, "2026-08-25");
  assert.equal(answered.incorrectCount, 1);
  assert.equal(answered.correctCount, 1);
});

test("Hard keeps a reviewed card in its current box", () => {
  const cases = [
    [1, "2026-08-25"],
    [2, "2026-08-26"],
    [3, "2026-08-28"],
    [4, "2026-09-01"],
    [5, "2026-09-09"],
  ];

  for (const [box, expectedDue] of cases) {
    const answered = Core.answerCard(cardInBox(box, TODAY), "hard", TODAY, NOW);
    assert.equal(answered.box, box);
    assert.equal(answered.dueDate, expectedDue);
  }
});

test("Good advances one box and uses the destination interval", () => {
  const cases = [
    [1, 2, "2026-08-26"],
    [2, 3, "2026-08-28"],
    [3, 4, "2026-09-01"],
    [4, 5, "2026-09-09"],
    [5, 5, "2026-09-09"],
  ];

  for (const [startBox, expectedBox, expectedDue] of cases) {
    const answered = Core.answerCard(cardInBox(startBox, TODAY), "good", TODAY, NOW);
    assert.equal(answered.box, expectedBox);
    assert.equal(answered.dueDate, expectedDue);
  }
});

test("Easy advances two boxes and stops at Box 5", () => {
  const cases = [
    [1, 3, "2026-08-28"],
    [2, 4, "2026-09-01"],
    [3, 5, "2026-09-09"],
    [4, 5, "2026-09-09"],
    [5, 5, "2026-09-09"],
  ];

  for (const [startBox, expectedBox, expectedDue] of cases) {
    const answered = Core.answerCard(cardInBox(startBox, TODAY), "easy", TODAY, NOW);
    assert.equal(answered.box, expectedBox);
    assert.equal(answered.dueDate, expectedDue);
  }
});

test("non-Again ratings count as successful reviews", () => {
  for (const rating of ["hard", "good", "easy"]) {
    const answered = Core.answerCard(cardInBox(2, TODAY), rating, TODAY, NOW);
    assert.equal(answered.correctCount, 2, rating);
    assert.equal(answered.incorrectCount, 0, rating);
  }
});

test("boolean ratings remain compatible with older callers", () => {
  assert.equal(Core.answerCard(cardInBox(2, TODAY), false, TODAY, NOW).box, 1);
  assert.equal(Core.answerCard(cardInBox(2, TODAY), true, TODAY, NOW).box, 3);
});

test("rejects unknown ratings", () => {
  assert.throws(
    () => Core.answerCard(cardInBox(2, TODAY), "perfect", TODAY, NOW),
    /Again, Hard, Good, or Easy/,
  );
});

test("study queue includes due Leitner cards but never Inbox cards", () => {
  const cards = [
    cardInBox(2, "2026-08-23", { id: "overdue" }),
    cardInBox(1, TODAY, { id: "due" }),
    cardInBox(3, "2026-08-25", { id: "future" }),
  ];

  for (let index = 0; index < 12; index += 1) {
    cards.push({
      ...Core.createCard(
        `New ${index}`,
        `Answer ${index}`,
        new Date(`2026-08-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`),
      ),
      id: `new-${index}`,
    });
  }

  const queue = Core.buildStudyQueue(cards, TODAY);
  assert.deepEqual(queue, ["overdue", "due"]);
  assert.equal(queue.includes("future"), false);
  assert.equal(queue.some((id) => id.startsWith("new-")), false);
});

test("promoting Inbox cards moves the five oldest to Box 1 due today", () => {
  const cards = [];
  for (let index = 0; index < 7; index += 1) {
    cards.push({
      ...Core.createCard(
        `Inbox ${index}`,
        `Back ${index}`,
        new Date(`2026-08-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`),
      ),
      id: `inbox-${index}`,
    });
  }
  cards.push(cardInBox(2, "2026-08-26", { id: "existing" }));

  const promoted = Core.promoteInboxCards(cards, Core.INBOX_PROMOTION_COUNT, TODAY, NOW);
  assert.deepEqual(
    promoted.filter((card) => card.id.startsWith("inbox-") && card.box === 1).map((card) => card.id),
    ["inbox-0", "inbox-1", "inbox-2", "inbox-3", "inbox-4"],
  );
  assert.deepEqual(
    promoted.filter((card) => card.box === 0).map((card) => card.id),
    ["inbox-5", "inbox-6"],
  );
  for (const card of promoted.filter((item) => item.id.startsWith("inbox-") && item.box === 1)) {
    assert.equal(card.dueDate, TODAY);
    assert.equal(card.reviewCount, 0);
    assert.ok(card.introducedAt);
  }
  const existing = promoted.find((card) => card.id === "existing");
  assert.equal(existing.box, 2);
  assert.equal(existing.dueDate, "2026-08-26");
});

test("reset clears study progress and returns a card to the Inbox", () => {
  const reset = Core.resetCard(cardInBox(4, "2026-09-01"), NOW);
  assert.equal(reset.box, 0);
  assert.equal(reset.dueDate, null);
  assert.equal(reset.reviewCount, 0);
  assert.equal(reset.introducedAt, null);
});

test("reset all returns every card to the Inbox while preserving card text", () => {
  const cards = [
    cardInBox(2, TODAY, { id: "one", front: "One", back: "Uno" }),
    cardInBox(5, "2026-09-09", { id: "two", front: "Two", back: "Dos" }),
    { ...Core.createCard("Three", "Tres", NOW), id: "three" },
  ];

  const reset = Core.resetAllCards(cards, NOW);
  assert.equal(reset.length, 3);
  assert.deepEqual(reset.map((card) => card.box), [0, 0, 0]);
  assert.deepEqual(reset.map((card) => card.dueDate), [null, null, null]);
  assert.deepEqual(reset.map((card) => card.reviewCount), [0, 0, 0]);
  assert.deepEqual(reset.map((card) => [card.front, card.back]), [
    ["One", "Uno"],
    ["Two", "Dos"],
    ["Three", "Tres"],
  ]);
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
