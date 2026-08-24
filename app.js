(function () {
  "use strict";

  const Core = window.LeitnerCore;
  const STORAGE_KEY = "simple-leitner-flashcards-v1";
  const EXPORT_FORMAT = "simple-leitner-flashcards";
  const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

  const elements = {
    tabs: Array.from(document.querySelectorAll(".tab")),
    views: Array.from(document.querySelectorAll(".view")),
    saveIndicator: document.querySelector("#save-indicator"),
    boxCounts: Array.from({ length: 6 }, (_, index) => document.querySelector(`#box-count-${index}`)),
    studySummary: document.querySelector("#study-summary"),
    refreshStudy: document.querySelector("#refresh-study"),
    studyCardArea: document.querySelector("#study-card-area"),
    sessionProgress: document.querySelector("#session-progress"),
    flashcard: document.querySelector("#flashcard"),
    cardSideLabel: document.querySelector("#card-side-label"),
    cardText: document.querySelector("#card-text"),
    cardInstruction: document.querySelector("#card-instruction"),
    revealActions: document.querySelector("#reveal-actions"),
    showAnswer: document.querySelector("#show-answer"),
    gradeActions: document.querySelector("#grade-actions"),
    markAgain: document.querySelector("#mark-again"),
    markCorrect: document.querySelector("#mark-correct"),
    studyEmpty: document.querySelector("#study-empty"),
    studyEmptyTitle: document.querySelector("#study-empty-title"),
    studyEmptyText: document.querySelector("#study-empty-text"),
    studyEmptyAction: document.querySelector("#study-empty-action"),
    cardForm: document.querySelector("#card-form"),
    cardFormTitle: document.querySelector("#card-form-title"),
    sideA: document.querySelector("#side-a"),
    sideB: document.querySelector("#side-b"),
    saveCard: document.querySelector("#save-card"),
    cancelEdit: document.querySelector("#cancel-edit"),
    cardSearch: document.querySelector("#card-search"),
    cardList: document.querySelector("#card-list"),
    cardListEmpty: document.querySelector("#card-list-empty"),
    cardListCount: document.querySelector("#card-list-count"),
    browserStorageMessage: document.querySelector("#browser-storage-message"),
    storageTotal: document.querySelector("#storage-total"),
    storageDue: document.querySelector("#storage-due"),
    storageLastSaved: document.querySelector("#storage-last-saved"),
    exportDeck: document.querySelector("#export-deck"),
    chooseImport: document.querySelector("#choose-import"),
    importDeck: document.querySelector("#import-deck"),
    clearDeck: document.querySelector("#clear-deck"),
    toast: document.querySelector("#toast"),
  };

  let state = Core.createEmptyState();
  let storageAvailable = true;
  let activeView = "study";
  let studyQueue = [];
  let sessionTotal = 0;
  let sessionCompleted = 0;
  let currentCardId = null;
  let showingBack = false;
  let editingCardId = null;
  let toastTimer = null;

  function loadStateFromBrowser() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      state = saved ? Core.normalizeState(JSON.parse(saved)) : Core.createEmptyState();
    } catch (error) {
      console.error("Could not load browser data:", error);
      state = Core.createEmptyState();
      storageAvailable = false;
    }
  }

  function persistState(options = {}) {
    const { silent = false } = options;
    state.lastSavedAt = new Date().toISOString();

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageAvailable = true;
      elements.saveIndicator.textContent = "Saved in this browser";
      elements.saveIndicator.title = `Saved ${formatDateTime(state.lastSavedAt)}`;
    } catch (error) {
      console.error("Could not save browser data:", error);
      storageAvailable = false;
      elements.saveIndicator.textContent = "Browser save unavailable";
      elements.saveIndicator.title = "Use Save deck to file so your cards are not lost.";
      if (!silent) {
        showToast("Browser storage is unavailable. Save your deck to a file.");
      }
    }

    renderStorage();
  }

  function switchView(viewName) {
    activeView = viewName;

    for (const tab of elements.tabs) {
      const selected = tab.dataset.view === viewName;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
    }

    for (const view of elements.views) {
      view.hidden = view.id !== `view-${viewName}`;
    }

    if (viewName === "study") {
      startStudySession();
    } else if (viewName === "cards") {
      renderCardList();
      window.requestAnimationFrame(() => elements.sideA.focus());
    } else if (viewName === "storage") {
      renderStorage();
    }
  }

  function renderAll() {
    renderStats();
    renderCardList();
    renderStorage();

    if (activeView === "study") {
      startStudySession();
    }
  }

  function renderStats() {
    const stats = Core.getStats(state.cards);
    stats.byBox.forEach((count, index) => {
      elements.boxCounts[index].textContent = String(count);
    });
  }

  function startStudySession() {
    studyQueue = Core.buildStudyQueue(state.cards);
    sessionTotal = studyQueue.length;
    sessionCompleted = 0;
    currentCardId = null;
    showingBack = false;
    showNextCard();
  }

  function getCurrentCard() {
    return state.cards.find((card) => card.id === currentCardId) || null;
  }

  function showNextCard() {
    while (studyQueue.length > 0) {
      const candidateId = studyQueue.shift();
      if (state.cards.some((card) => card.id === candidateId)) {
        currentCardId = candidateId;
        showingBack = false;
        renderStudyCard();
        return;
      }
    }

    currentCardId = null;
    renderStudyEmpty();
  }

  function renderStudyCard() {
    const card = getCurrentCard();
    if (!card) {
      showNextCard();
      return;
    }

    const stats = Core.getStats(state.cards);
    const remainingIncludingCurrent = studyQueue.length + 1;
    const currentNumber = sessionCompleted + 1;

    elements.studySummary.textContent = `${stats.due} due · ${stats.newCardsAvailable} new available today`;
    elements.sessionProgress.textContent = `Card ${currentNumber} of ${sessionTotal} · ${remainingIncludingCurrent} remaining`;
    elements.cardSideLabel.textContent = showingBack ? "Side B" : "Side A";
    elements.cardText.textContent = showingBack ? card.back : card.front;
    elements.cardInstruction.textContent = showingBack
      ? "Choose Again or Got it."
      : "Select the card or press Space to show Side B.";

    elements.studyCardArea.hidden = false;
    elements.studyEmpty.hidden = true;
    elements.revealActions.hidden = showingBack;
    elements.gradeActions.hidden = !showingBack;
    elements.flashcard.setAttribute("aria-label", showingBack ? "Side B" : "Side A. Show Side B");

    if (showingBack) {
      window.requestAnimationFrame(() => elements.markCorrect.focus());
    } else {
      window.requestAnimationFrame(() => elements.flashcard.focus());
    }
  }

  function renderStudyEmpty() {
    const stats = Core.getStats(state.cards);
    elements.studyCardArea.hidden = true;
    elements.studyEmpty.hidden = false;
    elements.refreshStudy.hidden = false;

    if (state.cards.length === 0) {
      elements.studySummary.textContent = "No cards are due.";
      elements.studyEmptyTitle.textContent = "No cards yet";
      elements.studyEmptyText.textContent = "Add your first card to begin.";
      elements.studyEmptyAction.textContent = "Add a card";
      elements.studyEmptyAction.dataset.action = "add";
      return;
    }

    if (sessionTotal > 0 && sessionCompleted >= sessionTotal) {
      elements.studySummary.textContent = "Session complete.";
      elements.studyEmptyTitle.textContent = "Nice work";
      elements.studyEmptyText.textContent = `You reviewed ${sessionCompleted} ${pluralize("card", sessionCompleted)}.`;
      elements.studyEmptyAction.textContent = "Review status";
      elements.studyEmptyAction.dataset.action = "refresh";
      return;
    }

    if (stats.byBox[0] > 0 && stats.newCardsAvailable === 0) {
      elements.studySummary.textContent = "Nothing else is due today.";
      elements.studyEmptyTitle.textContent = "You are done for today";
      elements.studyEmptyText.textContent = `The daily limit of ${Core.NEW_CARDS_PER_DAY} new cards has been reached.`;
      elements.studyEmptyAction.textContent = "Manage cards";
      elements.studyEmptyAction.dataset.action = "add";
      return;
    }

    elements.studySummary.textContent = "Nothing is due today.";
    elements.studyEmptyTitle.textContent = "You are caught up";
    elements.studyEmptyText.textContent = "Come back when the next card is due.";
    elements.studyEmptyAction.textContent = "Manage cards";
    elements.studyEmptyAction.dataset.action = "add";
  }

  function revealAnswer() {
    if (!currentCardId || showingBack) {
      return;
    }

    showingBack = true;
    renderStudyCard();
  }

  function gradeCurrentCard(wasCorrect) {
    const cardIndex = state.cards.findIndex((card) => card.id === currentCardId);
    if (cardIndex < 0 || !showingBack) {
      return;
    }

    state.cards[cardIndex] = Core.answerCard(state.cards[cardIndex], wasCorrect);
    sessionCompleted += 1;
    persistState({ silent: true });
    renderStats();
    renderCardList();
    showNextCard();
  }

  function resetCardForm() {
    editingCardId = null;
    elements.cardForm.reset();
    elements.cardFormTitle.textContent = "Add a card";
    elements.saveCard.textContent = "Add card";
    elements.cancelEdit.hidden = true;
  }

  function submitCardForm(event) {
    event.preventDefault();
    const front = elements.sideA.value.trim();
    const back = elements.sideB.value.trim();

    if (!front || !back) {
      showToast("Enter text for both Side A and Side B.");
      return;
    }

    if (editingCardId) {
      const card = state.cards.find((item) => item.id === editingCardId);
      if (!card) {
        resetCardForm();
        showToast("That card is no longer available.");
        return;
      }

      card.front = front;
      card.back = back;
      card.updatedAt = new Date().toISOString();
      showToast("Card updated.");
    } else {
      state.cards.push(Core.createCard(front, back));
      showToast("Card added to the Inbox.");
    }

    persistState({ silent: true });
    resetCardForm();
    renderStats();
    renderCardList();
    elements.sideA.focus();
  }

  function editCard(cardId) {
    const card = state.cards.find((item) => item.id === cardId);
    if (!card) {
      return;
    }

    editingCardId = card.id;
    elements.sideA.value = card.front;
    elements.sideB.value = card.back;
    elements.cardFormTitle.textContent = "Edit card";
    elements.saveCard.textContent = "Save changes";
    elements.cancelEdit.hidden = false;
    elements.cardForm.scrollIntoView({ behavior: "smooth", block: "start" });
    window.requestAnimationFrame(() => elements.sideA.focus());
  }

  function resetCardProgress(cardId) {
    const index = state.cards.findIndex((card) => card.id === cardId);
    if (index < 0) {
      return;
    }

    const card = state.cards[index];
    if (!window.confirm(`Return “${truncate(card.front, 80)}” to the Inbox and erase its study progress?`)) {
      return;
    }

    state.cards[index] = Core.resetCard(card);
    persistState({ silent: true });
    renderAll();
    showToast("Card returned to the Inbox.");
  }

  function deleteCard(cardId) {
    const card = state.cards.find((item) => item.id === cardId);
    if (!card) {
      return;
    }

    if (!window.confirm(`Delete “${truncate(card.front, 80)}”?`)) {
      return;
    }

    state.cards = state.cards.filter((item) => item.id !== cardId);
    studyQueue = studyQueue.filter((id) => id !== cardId);
    if (editingCardId === cardId) {
      resetCardForm();
    }

    persistState({ silent: true });
    renderAll();
    showToast("Card deleted.");
  }

  function renderCardList() {
    const query = elements.cardSearch.value.trim().toLocaleLowerCase();
    const cards = state.cards
      .filter((card) => !query || `${card.front}\n${card.back}`.toLocaleLowerCase().includes(query))
      .slice()
      .sort((left, right) => {
        if (left.box !== right.box) {
          return left.box - right.box;
        }
        return left.createdAt.localeCompare(right.createdAt);
      });

    elements.cardList.replaceChildren();
    elements.cardListCount.textContent = query
      ? `${cards.length} of ${state.cards.length} ${pluralize("card", state.cards.length)}`
      : `${state.cards.length} ${pluralize("card", state.cards.length)}`;
    elements.cardListEmpty.hidden = cards.length > 0;
    elements.cardListEmpty.textContent = query ? "No cards match your search." : "No cards have been added.";

    for (const card of cards) {
      elements.cardList.append(createCardRow(card));
    }
  }

  function createCardRow(card) {
    const article = document.createElement("article");
    article.className = "card-row";
    article.dataset.cardId = card.id;

    article.append(
      createCardSide("Side A", card.front, card),
      createCardSide("Side B", card.back),
    );

    const actions = document.createElement("div");
    actions.className = "card-row-actions";
    actions.append(
      createActionButton("Edit", "edit", card.id, "button button-secondary"),
    );

    if (card.box > 0) {
      actions.append(createActionButton("Reset", "reset", card.id, "button button-quiet"));
    }

    actions.append(createActionButton("Delete", "delete", card.id, "button button-danger"));
    article.append(actions);
    return article;
  }

  function createCardSide(labelText, text, card = null) {
    const side = document.createElement("div");
    side.className = "card-row-side";

    const label = document.createElement("span");
    label.className = "card-row-label";
    label.textContent = labelText;

    const paragraph = document.createElement("p");
    paragraph.className = "card-row-text";
    paragraph.textContent = text;

    side.append(label, paragraph);

    if (card) {
      const meta = document.createElement("p");
      meta.className = "card-row-meta";
      meta.textContent = card.box === 0
        ? "Inbox · not yet introduced"
        : `Box ${card.box} · due ${formatDueDate(card.dueDate)}`;
      side.append(meta);
    }

    return side;
  }

  function createActionButton(text, action, cardId, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.dataset.action = action;
    button.dataset.cardId = cardId;
    return button;
  }

  function handleCardListClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const { action, cardId } = button.dataset;
    if (action === "edit") {
      editCard(cardId);
    } else if (action === "reset") {
      resetCardProgress(cardId);
    } else if (action === "delete") {
      deleteCard(cardId);
    }
  }

  function renderStorage() {
    const stats = Core.getStats(state.cards);
    elements.storageTotal.textContent = String(stats.total);
    elements.storageDue.textContent = String(stats.due);
    elements.storageLastSaved.textContent = state.lastSavedAt ? formatDateTime(state.lastSavedAt) : "Not yet";
    elements.browserStorageMessage.textContent = storageAvailable
      ? "Every change is saved automatically on this device."
      : "Browser storage is unavailable. Use a backup file to protect your deck.";
    elements.exportDeck.disabled = state.cards.length === 0;
    elements.clearDeck.disabled = state.cards.length === 0;
  }

  function exportDeck() {
    const payload = {
      format: EXPORT_FORMAT,
      version: Core.SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      schedule: {
        newCardsPerDay: Core.NEW_CARDS_PER_DAY,
        boxIntervalsDays: [1, 2, 4, 8, 16],
      },
      cards: state.cards,
    };

    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `leitner-flashcards-${Core.localDateString()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Deck backup saved.");
  }

  async function importDeck(event) {
    const [file] = event.target.files;
    event.target.value = "";

    if (!file) {
      return;
    }

    if (file.size > MAX_IMPORT_BYTES) {
      showToast("That file is too large to load.");
      return;
    }

    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      if (payload && payload.format && payload.format !== EXPORT_FORMAT) {
        throw new TypeError("This is not a Simple Leitner Flashcards backup.");
      }

      const importedState = Core.normalizeState(payload);
      const description = `${importedState.cards.length} ${pluralize("card", importedState.cards.length)}`;

      if (!window.confirm(`Replace the current deck with ${description} from “${file.name}”?`)) {
        return;
      }

      state = importedState;
      resetCardForm();
      elements.cardSearch.value = "";
      persistState({ silent: true });
      renderAll();
      showToast(`Loaded ${description}.`);
    } catch (error) {
      console.error("Could not import deck:", error);
      showToast(error instanceof Error ? error.message : "The deck could not be loaded.");
    }
  }

  function clearDeck() {
    if (state.cards.length === 0) {
      return;
    }

    if (!window.confirm(`Delete all ${state.cards.length} ${pluralize("card", state.cards.length)} from this browser?`)) {
      return;
    }

    state = Core.createEmptyState();
    resetCardForm();
    elements.cardSearch.value = "";
    persistState({ silent: true });
    renderAll();
    showToast("All cards deleted.");
  }

  function handleStudyEmptyAction() {
    if (elements.studyEmptyAction.dataset.action === "refresh") {
      startStudySession();
    } else {
      switchView("cards");
    }
  }

  function handleKeyboard(event) {
    const activeElement = document.activeElement;
    const isTyping = activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(activeElement.tagName);
    if (isTyping || activeView !== "study" || !currentCardId) {
      return;
    }

    if (!showingBack && (event.key === " " || event.key === "Enter")) {
      event.preventDefault();
      revealAnswer();
    } else if (showingBack && event.key === "1") {
      event.preventDefault();
      gradeCurrentCard(false);
    } else if (showingBack && event.key === "2") {
      event.preventDefault();
      gradeCurrentCard(true);
    }
  }

  function handleStorageEvent(event) {
    if (event.key !== STORAGE_KEY || event.newValue === null) {
      return;
    }

    try {
      state = Core.normalizeState(JSON.parse(event.newValue));
      renderAll();
      showToast("Deck updated from another tab.");
    } catch (error) {
      console.error("Could not synchronize deck:", error);
    }
  }

  function bindEvents() {
    for (const tab of elements.tabs) {
      tab.addEventListener("click", () => switchView(tab.dataset.view));
    }

    elements.refreshStudy.addEventListener("click", startStudySession);
    elements.flashcard.addEventListener("click", revealAnswer);
    elements.showAnswer.addEventListener("click", revealAnswer);
    elements.markAgain.addEventListener("click", () => gradeCurrentCard(false));
    elements.markCorrect.addEventListener("click", () => gradeCurrentCard(true));
    elements.studyEmptyAction.addEventListener("click", handleStudyEmptyAction);
    elements.cardForm.addEventListener("submit", submitCardForm);
    elements.cancelEdit.addEventListener("click", resetCardForm);
    elements.cardSearch.addEventListener("input", renderCardList);
    elements.cardList.addEventListener("click", handleCardListClick);
    elements.exportDeck.addEventListener("click", exportDeck);
    elements.chooseImport.addEventListener("click", () => elements.importDeck.click());
    elements.importDeck.addEventListener("change", importDeck);
    elements.clearDeck.addEventListener("click", clearDeck);
    document.addEventListener("keydown", handleKeyboard);
    window.addEventListener("storage", handleStorageEvent);
  }

  function formatDueDate(dateString) {
    if (!dateString) {
      return "not scheduled";
    }

    const today = Core.localDateString();
    if (dateString === today) {
      return "today";
    }
    if (dateString < today) {
      return `overdue (${formatDateOnly(dateString)})`;
    }
    return formatDateOnly(dateString);
  }

  function formatDateOnly(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: year === new Date().getFullYear() ? undefined : "numeric",
    }).format(new Date(year, month - 1, day, 12));
  }

  function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "Unknown";
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function pluralize(word, count) {
    return count === 1 ? word : `${word}s`;
  }

  function truncate(text, maxLength) {
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 3200);
  }

  function initialize() {
    loadStateFromBrowser();
    bindEvents();
    renderAll();

    if (!storageAvailable) {
      elements.saveIndicator.textContent = "Browser save unavailable";
      showToast("Browser storage is unavailable. Save your deck to a file.");
    }
  }

  initialize();
})();
