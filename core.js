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
  const INBOX_PROMOTION_COUNT = 5;
  const BOX_INTERVAL_DAYS = Object.freeze({
    1: 1,
    2: 2,
    3: 4,
    4: 8,
    5: 16,
  });
  const RATING_ORDER = Object.freeze(["again", "hard", "good", "easy"]);
  const RATING_KEYS = Object.freeze({
    1: "again",
    2: "hard",
    3: "good",
    4: "easy",
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

  function normalizeRating(value) {
    if (value === false) {
      return "again";
    }
    if (value === true) {
      return "good";
    }

    const rating = cleanText(value).toLowerCase();
    if (!RATING_ORDER.includes(rating)) {
      throw new TypeError("Rating must be Again, Hard, Good, or Easy.");
    }
    return rating;
  }

  function getDestinationBox(currentBox, rawRating) {
    const rating = normalizeRating(rawRating);
    const box = Number(currentBox);

    if (!Number.isInteger(box) || box < 0 || box > 5) {
      throw new TypeError("Current box must be an integer from 0 through 5.");
    }

    if (rating === "again") {
      return 1;
    }
    if (rating === "hard") {
      return box === 0 ? 1 : box;
    }
    if (rating === "good") {
      return box === 0 ? 1 : Math.min(5, box + 1);
    }
    return box === 0 ? 2 : Math.min(5, box + 2);
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

  function buildStudyQueue(cards, today = localDateString()) {
    return cards
      .filter((card) => card.box > 0 && card.dueDate && card.dueDate <= today)
      .slice()
      .sort(compareCardsForStudy)
      .map((card) => card.id);
  }

  function promoteInboxCards(cards, count = INBOX_PROMOTION_COUNT, today = localDateString(), now = new Date()) {
    if (!Array.isArray(cards)) {
      throw new TypeError("Cards must be an array.");
    }

    const numericCount = Number(count);
    if (!Number.isInteger(numericCount) || numericCount < 0) {
      throw new TypeError("Promotion count must be a non-negative integer.");
    }

    const timestamp = new Date(now).toISOString();
    const selectedIds = new Set(
      cards
        .filter((card) => card.box === 0)
        .slice()
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .slice(0, numericCount)
        .map((card) => card.id),
    );

    return cards.map((rawCard, index) => {
      if (!selectedIds.has(rawCard.id)) {
        return rawCard;
      }

      const card = normalizeCard(rawCard, index, now);
      card.box = 1;
      card.dueDate = today;
      card.introducedAt = timestamp;
      card.updatedAt = timestamp;
      return card;
    });
  }

  function answerCard(rawCard, rawRating, today = localDateString(), now = new Date()) {
    const card = normalizeCard(rawCard, 0, now);
    const rating = normalizeRating(rawRating);
    const timestamp = new Date(now).toISOString();
    const firstIntroduction = card.box === 0 && !card.introducedAt;

    card.box = getDestinationBox(card.box, rating);
    card.dueDate = addDays(today, BOX_INTERVAL_DAYS[card.box]);
    card.reviewCount += 1;
    card.lastReviewedAt = timestamp;
    card.updatedAt = timestamp;

    if (rating === "again") {
      card.incorrectCount += 1;
    } else {
      card.correctCount += 1;
    }

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

  function resetAllCards(cards, now = new Date()) {
    if (!Array.isArray(cards)) {
      throw new TypeError("Cards must be an array.");
    }

    return cards.map((card) => resetCard(card, now));
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

    return {
      total: cards.length,
      byBox,
      due,
      overdue,
      inbox: byBox[0],
    };
  }

  return Object.freeze({
    SCHEMA_VERSION,
    INBOX_PROMOTION_COUNT,
    BOX_INTERVAL_DAYS,
    RATING_ORDER,
    RATING_KEYS,
    localDateString,
    addDays,
    normalizeRating,
    getDestinationBox,
    createCard,
    normalizeCard,
    createEmptyState,
    normalizeState,
    countIntroducedOn,
    buildStudyQueue,
    promoteInboxCards,
    answerCard,
    resetCard,
    resetAllCards,
    getStats,
  });
});
