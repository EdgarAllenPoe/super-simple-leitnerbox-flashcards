(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.LeitnerCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const NEW_CARDS_PER_DAY = 10;
  const BOX_INTERVAL_DAYS = Object.freeze({
    1: 1,
    2: 2,
    3: 4,
    4: 8,
    5: 16,
  });

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function localDateString(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new TypeError("Invalid date value.");
    }

    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function parseLocalDate(dateString) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString))) {
      throw new TypeError("Date must use YYYY-MM-DD format.");
    }

    const [year, month, day] = String(dateString).split("-").map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      throw new TypeError("Invalid calendar date.");
    }

    return date;
  }

  function addDays(dateString, days) {
    const date = parseLocalDate(dateString);
    date.setDate(date.getDate() + Number(days));
    return localDateString(date);
  }

  function makeId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function isDateString(value) {
    if (typeof value !== "string") {
      return false;
    }

    try {
      parseLocalDate(value);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function createCard(front, back, now = new Date()) {
    const cleanFront = cleanText(front);
    const cleanBack = cleanText(back);

    if (!cleanFront || !cleanBack) {
      throw new TypeError("Both Side A and Side B are required.");
    }

    const timestamp = new Date(now).toISOString();

    return {
      id: makeId(),
      front: cleanFront,
      back: cleanBack,
      box: 0,
      dueDate: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      introducedAt: null,
      lastReviewedAt: null,
      reviewCount: 0,
      correctCount: 0,
      incorrectCount: 0,
    };
  }

  function normalizeTimestamp(value, fallback) {
    if (typeof value !== "string") {
      return fallback;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }

  function normalizeNonNegativeInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : 0;
  }

  function normalizeCard(rawCard, index = 0, now = new Date()) {
    if (!rawCard || typeof rawCard !== "object" || Array.isArray(rawCard)) {
      throw new TypeError(`Card ${index + 1} is not a valid object.`);
    }

    const front = cleanText(rawCard.front ?? rawCard.sideA ?? rawCard.a);
    const back = cleanText(rawCard.back ?? rawCard.sideB ?? rawCard.b);

    if (!front || !back) {
      throw new TypeError(`Card ${index + 1} must contain text for both sides.`);
    }

    const nowIso = new Date(now).toISOString();
    const numericBox = Number(rawCard.box);
    const box = Number.isInteger(numericBox) && numericBox >= 0 && numericBox <= 5
      ? numericBox
      : 0;

    let dueDate = null;
    if (box > 0) {
      dueDate = isDateString(rawCard.dueDate)
        ? rawCard.dueDate
        : localDateString(now);
    }

    const id = cleanText(rawCard.id) || makeId();

    return {
      id,
      front,
      back,
      box,
      dueDate,
      createdAt: normalizeTimestamp(rawCard.createdAt, nowIso),
      updatedAt: normalizeTimestamp(rawCard.updatedAt, nowIso),
      introducedAt: rawCard.introducedAt
        ? normalizeTimestamp(rawCard.introducedAt, null)
        : null,
      lastReviewedAt: rawCard.lastReviewedAt
        ? normalizeTimestamp(rawCard.lastReviewedAt, null)
        : null,
      reviewCount: normalizeNonNegativeInteger(rawCard.reviewCount),
      correctCount: normalizeNonNegativeInteger(rawCard.correctCount),
      incorrectCount: normalizeNonNegativeInteger(rawCard.incorrectCount),
    };
  }

  function createEmptyState() {
    return {
      version: SCHEMA_VERSION,
      cards: [],
      lastSavedAt: null,
    };
  }

  function normalizeState(rawState, now = new Date()) {
    let source = rawState;

    if (Array.isArray(source)) {
      source = { cards: source };
    }

    if (source && typeof source === "object" && source.state) {
      source = source.state;
    }

    if (!source || typeof source !== "object" || !Array.isArray(source.cards)) {
      throw new TypeError("The file does not contain a valid flashcard deck.");
    }

    const seenIds = new Set();
    const cards = source.cards.map((card, index) => {
      const normalized = normalizeCard(card, index, now);
      while (seenIds.has(normalized.id)) {
        normalized.id = makeId();
      }
      seenIds.add(normalized.id);
      return normalized;
    });

    return {
      version: SCHEMA_VERSION,
      cards,
      lastSavedAt: source.lastSavedAt
        ? normalizeTimestamp(source.lastSavedAt, null)
        : null,
    };
  }

  function countIntroducedOn(cards, dateString) {
    return cards.reduce((count, card) => {
      if (!card.introducedAt) {
        return count;
      }

      try {
        return localDateString(card.introducedAt) === dateString ? count + 1 : count;
      } catch (_error) {
        return count;
      }
    }, 0);
  }

  function compareCardsForStudy(left, right) {
    const leftDue = left.dueDate || "9999-12-31";
    const rightDue = right.dueDate || "9999-12-31";

    if (leftDue !== rightDue) {
      return leftDue.localeCompare(rightDue);
    }

    if (left.box !== right.box) {
      return left.box - right.box;
    }

    return left.createdAt.localeCompare(right.createdAt);
  }

  function buildStudyQueue(cards, today = localDateString(), newCardLimit = NEW_CARDS_PER_DAY) {
    const dueCards = cards
      .filter((card) => card.box > 0 && card.dueDate && card.dueDate <= today)
      .slice()
      .sort(compareCardsForStudy);

    const introducedToday = countIntroducedOn(cards, today);
    const remainingNewSlots = Math.max(0, Number(newCardLimit) - introducedToday);

    const newCards = cards
      .filter((card) => card.box === 0)
      .slice()
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, remainingNewSlots);

    return [...dueCards, ...newCards].map((card) => card.id);
  }

  function answerCard(rawCard, wasCorrect, today = localDateString(), now = new Date()) {
    const card = normalizeCard(rawCard, 0, now);
    const timestamp = new Date(now).toISOString();
    const firstIntroduction = card.box === 0 && !card.introducedAt;

    if (wasCorrect) {
      card.box = card.box === 0 ? 1 : Math.min(5, card.box + 1);
      card.correctCount += 1;
    } else {
      card.box = 1;
      card.incorrectCount += 1;
    }

    card.dueDate = addDays(today, BOX_INTERVAL_DAYS[card.box]);
    card.reviewCount += 1;
    card.lastReviewedAt = timestamp;
    card.updatedAt = timestamp;

    if (firstIntroduction) {
      card.introducedAt = timestamp;
    }

    return card;
  }

  function resetCard(rawCard, now = new Date()) {
    const card = normalizeCard(rawCard, 0, now);
    card.box = 0;
    card.dueDate = null;
    card.introducedAt = null;
    card.lastReviewedAt = null;
    card.reviewCount = 0;
    card.correctCount = 0;
    card.incorrectCount = 0;
    card.updatedAt = new Date(now).toISOString();
    return card;
  }

  function getStats(cards, today = localDateString()) {
    const byBox = [0, 0, 0, 0, 0, 0];
    let due = 0;
    let overdue = 0;

    for (const card of cards) {
      if (Number.isInteger(card.box) && card.box >= 0 && card.box <= 5) {
        byBox[card.box] += 1;
      }

      if (card.box > 0 && card.dueDate && card.dueDate <= today) {
        due += 1;
        if (card.dueDate < today) {
          overdue += 1;
        }
      }
    }

    const introducedToday = countIntroducedOn(cards, today);

    return {
      total: cards.length,
      byBox,
      due,
      overdue,
      introducedToday,
      newCardsAvailable: Math.min(
        byBox[0],
        Math.max(0, NEW_CARDS_PER_DAY - introducedToday),
      ),
    };
  }

  return Object.freeze({
    SCHEMA_VERSION,
    NEW_CARDS_PER_DAY,
    BOX_INTERVAL_DAYS,
    localDateString,
    addDays,
    createCard,
    normalizeCard,
    createEmptyState,
    normalizeState,
    countIntroducedOn,
    buildStudyQueue,
    answerCard,
    resetCard,
    getStats,
  });
});
