/* ==========================
   Quiz Bank Game - app.js
   Supports: MCQ + TF
   - Categories via multiple JSON files
   - Add Question via API (server.js)
   - No repetition per match (deck shuffle + pop)
   - Auto scoring on option click
   - Celebration effects on game end
   ========================== */

const AUTO_SCORE_ON_SELECT = true; // إذا تريدها يدوي لاحقًا خليها false

(() => {
  "use strict";

  // ---------- DOM Helpers ----------
  const $ = (sel) => document.querySelector(sel);

  // Header buttons
  const btnSettings = $("#btnSettings");
  const btnReset = $("#btnReset");
  const btnAddQuestion = $("#btnAddQuestion");

  // Dialogs
  const settingsDialog = $("#settingsDialog");
  const endDialog = $("#endDialog");
  const addQuestionDialog = $("#addQuestionDialog");

  // Team badges + scores
  const badgeTurnA = $("#badgeTurnA");
  const badgeTurnB = $("#badgeTurnB");
  const scoreAEl = $("#scoreA");
  const scoreBEl = $("#scoreB");
  const incA = $("#incA");
  const decA = $("#decA");
  const incB = $("#incB");
  const decB = $("#decB");

  // Meta
  const questionNumberEl = $("#questionNumber");
  const timerTextEl = $("#timerText");
  const timerBarEl = $("#timerBar");
  const questionTypeEl = $("#questionType");
  const questionCategoryEl = $("#questionCategory");

  // Quiz area
  const statusChip = $("#statusChip");
  const questionTextEl = $("#questionText");
  const optionsForm = $("#optionsForm");
  const feedbackEl = $("#feedback");

  // Controls
  const btnStart = $("#btnStart");
  const btnNext = $("#btnNext");
  const btnReveal = $("#btnReveal");
  const btnCorrect = $("#btnCorrect");
  const btnWrong = $("#btnWrong");

  // Settings fields
  const questionsPerGameInput = $("#questionsPerGame");
  const secondsPerQuestionInput = $("#secondsPerQuestion");
  const pointsCorrectInput = $("#pointsCorrect");
  const pointsWrongInput = $("#pointsWrong");
  const enableMCQInput = $("#enableMCQ");
  const enableTFInput = $("#enableTF");
  const gameCategory = $("#gameCategory");
  const btnSaveSettings = $("#btnSaveSettings");

  // End dialog fields
  const winnerText = $("#winnerText");
  const endScoreA = $("#endScoreA");
  const endScoreB = $("#endScoreB");
  const btnPlayAgain = $("#btnPlayAgain");

  // Add Question form fields
  const addQuestionForm = $("#addQuestionForm");
  const btnCloseAddDialog = $("#btnCloseAddDialog");
  const btnCancelAddDialog = $("#btnCancelAddDialog");

  const aqType = $("#aqType");
  const aqCategorySelect = $("#aqCategorySelect");
  const aqQuestion = $("#aqQuestion");
  const mcqFields = $("#mcqFields");
  const tfFields = $("#tfFields");
  const aqOpt1 = $("#aqOpt1");
  const aqOpt2 = $("#aqOpt2");
  const aqOpt3 = $("#aqOpt3");
  const aqOpt4 = $("#aqOpt4");
  const aqCorrectMcq = $("#aqCorrectMcq");
  const aqCorrectTf = $("#aqCorrectTf");

  // ---------- App State ----------
  const DEFAULTS = {
    questionsPerGame: 20,
    secondsPerQuestion: 30,
    pointsCorrect: 1,
    pointsWrong: 0,
    enableMCQ: true,
    enableTF: true,
    category: "general",
  };

  let settings = { ...DEFAULTS };

  let allQuestions = [];
  let pool = [];
  let deck = [];

  let currentQuestion = null;
  let currentIndex = 0;
  let isGameRunning = false;

  let turn = "A";
  let scoreA = 0;
  let scoreB = 0;

  let selectedIndex = null;
  let revealed = false;
  let locked = false;

  // Timer
  let timerId = null;
  let remaining = 0;
  let totalSeconds = 30;
  let lastTickAt = 0;

  // ---------- Utils ----------
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function setChip(state, text) {
    statusChip.classList.remove("chip-idle", "chip-running", "chip-correct", "chip-wrong", "chip-timeout");
    statusChip.classList.add(state);
    statusChip.textContent = text;
  }

  function showFeedback(msg, kind = "info") {
    feedbackEl.hidden = false;
    feedbackEl.textContent = msg;

    feedbackEl.style.borderColor =
      kind === "success"
        ? "rgba(53,208,127,.45)"
        : kind === "danger"
        ? "rgba(255,77,109,.50)"
        : kind === "warning"
        ? "rgba(255,176,32,.45)"
        : "rgba(255,255,255,.14)";
  }

  function hideFeedback() {
    feedbackEl.hidden = true;
    feedbackEl.textContent = "";
    feedbackEl.style.borderColor = "";
  }

  function updateScoresUI() {
    scoreAEl.textContent = String(scoreA);
    scoreBEl.textContent = String(scoreB);
  }

  function updateTurnUI() {
    const isA = turn === "A";
    badgeTurnA.hidden = !isA;
    badgeTurnB.hidden = isA;
  }

  function switchTurn() {
    turn = turn === "A" ? "B" : "A";
    updateTurnUI();
  }

  function safeNumberFromInput(el, fallback, min, max) {
    const v = Number(el.value);
    if (Number.isFinite(v)) return clamp(v, min, max);
    return fallback;
  }

  function questionTypeLabel(type) {
    return type === "MCQ" ? "MCQ" : "TF";
  }

  // ---------- Loading Questions (multi-file) ----------
  const questionsCache = new Map(); // category -> array

  async function loadQuestions(category) {
    const cat = String(category || "general").toLowerCase();

    if (questionsCache.has(cat)) {
      allQuestions = questionsCache.get(cat);
      return;
    }

    const filePath = `data/questions.${cat}.json`;
    const res = await fetch(filePath, { cache: "no-store" });
    if (!res.ok) throw new Error(`تعذر تحميل ${filePath} (HTTP ${res.status})`);

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error(`${filePath} يجب أن يكون Array`);

    const normalized = data
      .filter(q => q && typeof q === "object")
      .map((q, idx) => ({
        id: Number(q.id ?? (idx + 1)),
        type: String(q.type || "MCQ").toUpperCase(),
        question: String(q.question || "").trim(),
        options: Array.isArray(q.options) ? q.options.map(o => String(o).trim()) : [],
        correctIndex: Number(q.correctIndex),
        category: cat,
      }))
      .filter(q =>
        Number.isFinite(q.id) &&
        q.question &&
        (q.type === "MCQ" || q.type === "TF") &&
        q.options.length >= 2 &&
        Number.isInteger(q.correctIndex) &&
        q.correctIndex >= 0 &&
        q.correctIndex < q.options.length
      );

    if (!normalized.length) throw new Error(`لا توجد أسئلة صالحة داخل ${filePath}`);

    questionsCache.set(cat, normalized);
    allQuestions = normalized;
  }

  function rebuildPool() {
    const types = [];
    if (settings.enableMCQ) types.push("MCQ");
    if (settings.enableTF) types.push("TF");

    const raw = allQuestions.filter(q => types.includes(q.type));

    // إزالة التكرار (type + question)
    const seen = new Set();
    pool = [];
    for (const q of raw) {
      const key = `${q.type}||${q.question}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push(q);
    }

    deck = shuffle(pool); // deck جديدة
  }

  function getNextRandomQuestion() {
    return deck.pop() || null;
  }

  // ---------- Timer ----------
  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function updateTimerUI() {
    timerTextEl.textContent = `${remaining}s`;
    const pct = totalSeconds > 0 ? (remaining / totalSeconds) * 100 : 0;
    timerBarEl.style.width = `${clamp(pct, 0, 100)}%`;
  }

  function startTimer(seconds) {
    stopTimer();
    totalSeconds = seconds;
    remaining = seconds;
    lastTickAt = Date.now();
    updateTimerUI();

    timerId = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.floor((now - lastTickAt) / 1000);

      if (elapsed >= 1) {
        remaining = clamp(remaining - elapsed, 0, totalSeconds);
        lastTickAt = now;
        updateTimerUI();

        if (remaining <= 0) {
          stopTimer();
          onTimeout();
        }
      }
    }, 200);
  }

  // ---------- Rendering ----------
  function renderOptions(q) {
    optionsForm.innerHTML = "";

    q.options.forEach((opt, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option-btn";
      btn.dataset.index = String(idx);
      btn.textContent = opt;

      btn.addEventListener("click", () => {
        if (locked || !isGameRunning) return;
        selectOption(idx);
      });

      optionsForm.appendChild(btn);
    });

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "* في أسئلة True/False ستظهر خياران فقط.";
    optionsForm.appendChild(hint);
  }

  function selectOption(idx) {
    selectedIndex = idx;

    const buttons = optionsForm.querySelectorAll(".option-btn");
    buttons.forEach((b) => b.classList.remove("selected"));
    const selectedBtn = optionsForm.querySelector(`.option-btn[data-index="${idx}"]`);
    if (selectedBtn) selectedBtn.classList.add("selected");

    if (AUTO_SCORE_ON_SELECT) {
      judgeSelectedImmediately();
    } else {
      hideFeedback();
    }
  }

  function revealAnswer(noScore = false) {
    if (!currentQuestion || revealed) return;

    revealed = true;
    locked = true;
    stopTimer();

    const buttons = optionsForm.querySelectorAll(".option-btn");
    buttons.forEach((b) => b.classList.remove("correct", "wrong"));

    const correct = currentQuestion.correctIndex;

    const correctBtn = optionsForm.querySelector(`.option-btn[data-index="${correct}"]`);
    if (correctBtn) correctBtn.classList.add("correct");

    if (selectedIndex !== null && selectedIndex !== correct) {
      const selectedBtn = optionsForm.querySelector(`.option-btn[data-index="${selectedIndex}"]`);
      if (selectedBtn) selectedBtn.classList.add("wrong");
    }

    if (AUTO_SCORE_ON_SELECT && noScore) {
      // كشف فقط بدون نقاط
      btnReveal.disabled = true;
      btnCorrect.disabled = true;
      btnWrong.disabled = true;
      btnNext.disabled = false;

      setChip("chip-idle", "تم إظهار الإجابة");
      showFeedback("تم إظهار الإجابة (بدون نقاط). اضغط السؤال التالي.", "info");
      switchTurn();
      return;
    }

    btnCorrect.disabled = false;
    btnWrong.disabled = false;
    btnNext.disabled = false;

    setChip("chip-idle", "تم إظهار الإجابة");
    showFeedback("تم إظهار الإجابة. اختر (صحيح) أو (خاطئ) لتسجيل النقاط.", "info");
  }

  function setQuestionUI(q) {
    currentQuestion = q;
    selectedIndex = null;
    revealed = false;
    locked = false;

    hideFeedback();

    questionTextEl.textContent = q.question;
    questionTypeEl.textContent = questionTypeLabel(q.type);
    questionCategoryEl.textContent = q.category ?? "—";
    questionNumberEl.textContent = `${currentIndex}/${settings.questionsPerGame}`;

    renderOptions(q);

    btnReveal.disabled = false;
    btnCorrect.disabled = true;
    btnWrong.disabled = true;
    btnNext.disabled = true;

    if (AUTO_SCORE_ON_SELECT) {
      // في الوضع التلقائي، أزرار الحكم اليدوي ليست مطلوبة
      btnCorrect.disabled = true;
      btnWrong.disabled = true;
    }
  }

  // ---------- Game Flow ----------
  async function startGame() {
    hideFeedback();

    await loadQuestions(settings.category);

    if (!settings.enableMCQ && !settings.enableTF) {
      settings.enableMCQ = true;
      enableMCQInput.checked = true;
      showFeedback("تم تفعيل MCQ تلقائياً لأن كلا النوعين كانا مغلقين.", "warning");
    }

    rebuildPool();

    if (!pool.length) {
      showFeedback("لا توجد أسئلة مطابقة للإعدادات الحالية.", "danger");
      return;
    }

    isGameRunning = true;
    currentIndex = 0;
    scoreA = 0;
    scoreB = 0;
    turn = "A";
    updateScoresUI();
    updateTurnUI();

    btnStart.disabled = true;

    nextQuestion(true);
  }

  function nextQuestion(isFirst = false) {
    if (!isGameRunning) return;

    if (currentIndex >= settings.questionsPerGame) {
      endGame();
      return;
    }

    const q = getNextRandomQuestion();
    if (!q) {
      endGame(true);
      return;
    }

    currentIndex += 1;
    setChip("chip-running", isFirst ? "بدأت اللعبة" : "سؤال جديد");
    setQuestionUI(q);

    const secs = clamp(settings.secondsPerQuestion, 5, 120);
    startTimer(secs);
  }

  function onTimeout() {
    if (!isGameRunning || revealed) return;

    // إذا auto score: انتهى الوقت => كشف بدون نقاط وانتقل
    if (AUTO_SCORE_ON_SELECT) {
      revealAnswer(true);
      return;
    }

    // الوضع اليدوي
    revealed = true;
    locked = true;

    const correct = currentQuestion.correctIndex;
    const correctBtn = optionsForm.querySelector(`.option-btn[data-index="${correct}"]`);
    if (correctBtn) correctBtn.classList.add("correct");

    setChip("chip-timeout", "انتهى الوقت");
    showFeedback("انتهى الوقت ⏳ اختر (خاطئة) أو (صحيحة) لتسجيل الحكم.", "warning");

    btnCorrect.disabled = false;
    btnWrong.disabled = false;
    btnNext.disabled = false;
  }

  function applyScore(delta) {
    if (turn === "A") scoreA += delta;
    else scoreB += delta;

    scoreA = Math.max(0, scoreA);
    scoreB = Math.max(0, scoreB);

    updateScoresUI();
  }

  function markCorrect() {
    if (!isGameRunning || !currentQuestion) return;
    if (!revealed) revealAnswer(false);

    applyScore(settings.pointsCorrect);

    setChip("chip-correct", "صحيح ✅");
    showFeedback(`تم تسجيل إجابة صحيحة للفريق ${turn}. (+${settings.pointsCorrect})`, "success");

    btnCorrect.disabled = true;
    btnWrong.disabled = true;
    btnReveal.disabled = true;

    switchTurn();
    btnNext.disabled = false;
  }

  function markWrong() {
    if (!isGameRunning || !currentQuestion) return;
    if (!revealed) revealAnswer(false);

    const penalty = settings.pointsWrong;
    if (penalty > 0) applyScore(-penalty);

    setChip("chip-wrong", "خاطئ ❌");
    showFeedback(
      penalty > 0 ? `تم تسجيل إجابة خاطئة للفريق ${turn}. (-${penalty})` : `تم تسجيل إجابة خاطئة للفريق ${turn}.`,
      "danger"
    );

    btnCorrect.disabled = true;
    btnWrong.disabled = true;
    btnReveal.disabled = true;

    switchTurn();
    btnNext.disabled = false;
  }

  function endGame(ranOut = false) {
    isGameRunning = false;
    stopTimer();

    btnStart.disabled = false;
    btnNext.disabled = true;
    btnReveal.disabled = true;
    btnCorrect.disabled = true;
    btnWrong.disabled = true;

    const a = scoreA;
    const b = scoreB;

    endScoreA.textContent = String(a);
    endScoreB.textContent = String(b);

    let msg = "";
    if (a > b) msg = "🏆 الفائز: الفريق A";
    else if (b > a) msg = "🏆 الفائز: الفريق B";
    else msg = "🤝 تعادل بين الفريقين";

    if (ranOut) msg += " (انتهت الأسئلة المتاحة)";

    winnerText.textContent = msg;
    setChip("chip-idle", "انتهت المباراة");

    // 🎉 إطلاق الاحتفالية!
    triggerCelebration();

    if (typeof endDialog.showModal === "function") endDialog.showModal();
    else alert(`${msg}\nA=${a} | B=${b}`);
  }

  function hardResetUI() {
    stopTimer();

    isGameRunning = false;
    currentQuestion = null;
    currentIndex = 0;
    pool = [];
    deck = [];
    selectedIndex = null;
    revealed = false;
    locked = false;

    scoreA = 0;
    scoreB = 0;
    turn = "A";
    updateScoresUI();
    updateTurnUI();

    questionTextEl.textContent = "اضغط \"ابدأ\" لبدء اللعبة وتحميل الأسئلة.";
    questionTypeEl.textContent = "—";
    questionCategoryEl.textContent = "—";
    questionNumberEl.textContent = "—";

    timerTextEl.textContent = `${settings.secondsPerQuestion}s`;
    timerBarEl.style.width = "100%";

    optionsForm.innerHTML = `<div class="hint">* في أسئلة True/False ستظهر خياران فقط.</div>`;

    btnStart.disabled = false;
    btnNext.disabled = true;
    btnReveal.disabled = true;
    btnCorrect.disabled = true;
    btnWrong.disabled = true;

    setChip("chip-idle", "جاهز");
    hideFeedback();
  }

  // ---------- Auto judge (score on select) ----------
  function judgeSelectedImmediately() {
    if (!isGameRunning || !currentQuestion) return;
    if (selectedIndex === null) return;
    if (locked || revealed) return;

    revealed = true;
    locked = true;
    stopTimer();

    const correct = currentQuestion.correctIndex;

    const buttons = optionsForm.querySelectorAll(".option-btn");
    buttons.forEach((b) => b.classList.remove("correct", "wrong"));

    const correctBtn = optionsForm.querySelector(`.option-btn[data-index="${correct}"]`);
    if (correctBtn) correctBtn.classList.add("correct");

    const selectedBtn = optionsForm.querySelector(`.option-btn[data-index="${selectedIndex}"]`);
    const isCorrect = selectedIndex === correct;

    if (!isCorrect && selectedBtn) selectedBtn.classList.add("wrong");

    if (isCorrect) {
      applyScore(settings.pointsCorrect);
      setChip("chip-correct", "صحيح ✅");
      showFeedback(`✅ إجابة صحيحة للفريق ${turn}. (+${settings.pointsCorrect})`, "success");
    } else {
      const penalty = settings.pointsWrong;
      if (penalty > 0) applyScore(-penalty);
      setChip("chip-wrong", "خاطئ ❌");
      showFeedback(
        penalty > 0 ? `❌ إجابة خاطئة للفريق ${turn}. (-${penalty})` : `❌ إجابة خاطئة للفريق ${turn}.`,
        "danger"
      );
    }

    btnReveal.disabled = true;
    btnCorrect.disabled = true;
    btnWrong.disabled = true;

    btnNext.disabled = false;

    switchTurn();
  }

  // ---------- Settings ----------
  function loadSettingsToUI() {
    questionsPerGameInput.value = String(settings.questionsPerGame);
    secondsPerQuestionInput.value = String(settings.secondsPerQuestion);
    pointsCorrectInput.value = String(settings.pointsCorrect);
    pointsWrongInput.value = String(settings.pointsWrong);
    enableMCQInput.checked = settings.enableMCQ;
    enableTFInput.checked = settings.enableTF;
    gameCategory.value = settings.category;
  }

  function readSettingsFromUI() {
    settings.questionsPerGame = safeNumberFromInput(questionsPerGameInput, DEFAULTS.questionsPerGame, 5, 100);
    settings.secondsPerQuestion = safeNumberFromInput(secondsPerQuestionInput, DEFAULTS.secondsPerQuestion, 5, 120);
    settings.pointsCorrect = safeNumberFromInput(pointsCorrectInput, DEFAULTS.pointsCorrect, 1, 50);
    settings.pointsWrong = safeNumberFromInput(pointsWrongInput, DEFAULTS.pointsWrong, 0, 50);
    settings.enableMCQ = !!enableMCQInput.checked;
    settings.enableTF = !!enableTFInput.checked;
    settings.category = (gameCategory.value || "general").toLowerCase();
  }

  function openSettings() {
    loadSettingsToUI();
    if (typeof settingsDialog.showModal === "function") settingsDialog.showModal();
    else alert("المتصفح لا يدعم dialog. استخدم Chrome/Edge.");
  }

  function onSaveSettings() {
    readSettingsFromUI();

    if (isGameRunning) {
      showFeedback("تم حفظ الإعدادات. تمت إعادة ضبط اللعبة لتطبيق التغييرات.", "warning");
      hardResetUI();
    } else {
      timerTextEl.textContent = `${settings.secondsPerQuestion}s`;
      timerBarEl.style.width = "100%";
      showFeedback("تم حفظ الإعدادات ✅", "success");
      setTimeout(() => hideFeedback(), 1200);
    }
  }

  // ---------- API: add question ----------
  async function addQuestionToJson(newQ) {
    const res = await fetch("/api/add-question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newQ),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "فشل إضافة السؤال");
    return data.added;
  }

  function toggleAddDialogFields() {
    const type = aqType.value;
    if (type === "TF") {
      tfFields.hidden = false;
      mcqFields.hidden = true;
    } else {
      tfFields.hidden = true;
      mcqFields.hidden = false;
    }
  }

  function openAddQuestionDialog() {
    toggleAddDialogFields();
    if (typeof addQuestionDialog.showModal === "function") addQuestionDialog.showModal();
    else alert("المتصفح لا يدعم dialog.");
  }

  function closeAddQuestionDialog() {
    if (addQuestionDialog.open) addQuestionDialog.close();
  }

  function clearAddDialog() {
    aqType.value = "MCQ";
    aqCategorySelect.value = settings.category || "general";
    aqQuestion.value = "";
    aqOpt1.value = "";
    aqOpt2.value = "";
    aqOpt3.value = "";
    aqOpt4.value = "";
    aqCorrectMcq.value = "0";
    aqCorrectTf.value = "0";
    toggleAddDialogFields();
  }

  // ==========================================
  // 🎉 Celebration System
  // ==========================================

  function createConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    
    const colors = ['#6ea8ff', '#35d07f', '#ffb020', '#ff4d6d', '#e8ecff'];
    const shapes = ['●', '★', '✦', '◆', '♦', '▲', '■'];
    
    for (let i = 0; i < 100; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      confetti.textContent = shapes[Math.floor(Math.random() * shapes.length)];
      confetti.style.color = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.fontSize = Math.random() * 20 + 10 + 'px';
      confetti.style.left = Math.random() * 100 + '%';
      confetti.style.top = -20 + 'px';
      confetti.style.animationDelay = Math.random() * 0.5 + 's';
      confetti.style.animationDuration = Math.random() * 2 + 2 + 's';
      
      container.appendChild(confetti);
    }
    
    setTimeout(() => container.remove(), 5000);
  }

  function createFireworks() {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    
    const colors = ['#6ea8ff', '#35d07f', '#ffb020', '#ff4d6d'];
    
    for (let f = 0; f < 3; f++) {
      const x = Math.random() * 80 + 10;
      const y = Math.random() * 50 + 10;
      
      for (let i = 0; i < 30; i++) {
        const firework = document.createElement('div');
        firework.className = 'firework';
        firework.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        firework.style.left = x + '%';
        firework.style.top = y + '%';
        
        const angle = (Math.PI * 2 * i) / 30;
        const velocity = Math.random() * 100 + 50;
        const tx = Math.cos(angle) * velocity;
        const ty = Math.sin(angle) * velocity;
        
        firework.style.setProperty('--tx', tx + 'px');
        firework.style.setProperty('--ty', ty + 'px');
        firework.style.animationDelay = f * 0.2 + 's';
        
        container.appendChild(firework);
      }
    }
    
    setTimeout(() => container.remove(), 2000);
  }

  function playVictorySound() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 587.33, 659.25, 783.99];
      
      notes.forEach((freq, index) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = freq;
        oscillator.type = 'sine';
        
        const startTime = audioContext.currentTime + (index * 0.15);
        gainNode.gain.setValueAtTime(0.3, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.3);
      });
    } catch (e) {
      console.log('Audio not supported');
    }
  }

  function triggerCelebration() {
    const overlay = document.createElement('div');
    overlay.className = 'celebration-overlay';
    document.body.appendChild(overlay);
    
    setTimeout(() => overlay.remove(), 2000);
    
    createConfetti();
    setTimeout(() => createFireworks(), 300);
    setTimeout(() => createFireworks(), 600);
    setTimeout(() => createFireworks(), 900);
    
    playVictorySound();
  }

  // ---------- Events ----------
  btnSettings?.addEventListener("click", openSettings);
  btnSaveSettings?.addEventListener("click", () => onSaveSettings());

  btnReset?.addEventListener("click", () => {
    hardResetUI();
    showFeedback("تمت إعادة ضبط اللعبة.", "info");
    setTimeout(() => hideFeedback(), 900);
  });

  btnStart?.addEventListener("click", async () => {
    try {
      await startGame();
    } catch (err) {
      showFeedback(`❌ فشل بدء اللعبة: ${err.message}`, "danger");
      console.error(err);
    }
  });

  btnNext?.addEventListener("click", () => {
    if (!isGameRunning) return;
    hideFeedback();
    nextQuestion(false);
  });

  btnReveal?.addEventListener("click", () => {
    if (!isGameRunning) return;

    // في الوضع التلقائي: الكشف = بدون نقاط
    if (AUTO_SCORE_ON_SELECT) revealAnswer(true);
    else revealAnswer(false);
  });

  btnCorrect?.addEventListener("click", () => markCorrect());
  btnWrong?.addEventListener("click", () => markWrong());

  incA?.addEventListener("click", () => { scoreA += 1; updateScoresUI(); });
  decA?.addEventListener("click", () => { scoreA = Math.max(0, scoreA - 1); updateScoresUI(); });
  incB?.addEventListener("click", () => { scoreB += 1; updateScoresUI(); });
  decB?.addEventListener("click", () => { scoreB = Math.max(0, scoreB - 1); updateScoresUI(); });

  btnPlayAgain?.addEventListener("click", () => hardResetUI());

  // Add Question dialog events
  btnAddQuestion?.addEventListener("click", () => {
    clearAddDialog();
    openAddQuestionDialog();
  });

  aqType?.addEventListener("change", toggleAddDialogFields);
  btnCloseAddDialog?.addEventListener("click", closeAddQuestionDialog);
  btnCancelAddDialog?.addEventListener("click", closeAddQuestionDialog);

  addQuestionForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
      const type = aqType.value;
      const category = (aqCategorySelect.value || "general").toLowerCase();
      const question = (aqQuestion.value || "").trim();

      if (question.length < 3) {
        showFeedback("❌ اكتب نص السؤال بشكل صحيح.", "danger");
        return;
      }

      let payload;

      if (type === "TF") {
        payload = {
          type: "TF",
          question,
          options: ["True", "False"],
          correctIndex: Number(aqCorrectTf.value),
          category,
        };
      } else {
        const options = [aqOpt1.value, aqOpt2.value, aqOpt3.value, aqOpt4.value].map(s => (s || "").trim());
        if (options.some(o => o.length < 1)) {
          showFeedback("❌ املأ كل الخيارات الأربعة.", "danger");
          return;
        }
        payload = {
          type: "MCQ",
          question,
          options,
          correctIndex: Number(aqCorrectMcq.value),
          category,
        };
      }

      const added = await addQuestionToJson(payload);

      if (!questionsCache.has(category)) questionsCache.set(category, []);
      questionsCache.get(category).push(added);

      if (settings.category === category) {
        allQuestions = questionsCache.get(category);

        const allowed =
          (added.type === "MCQ" && settings.enableMCQ) ||
          (added.type === "TF" && settings.enableTF);

        if (allowed) {
          pool.push(added);
          deck.unshift(added);
        }
      }

      showFeedback(`✅ تم حفظ السؤال في ملف الفئة (${category}) (id=${added.id})`, "success");
      closeAddQuestionDialog();
    } catch (err) {
      showFeedback(`❌ ${err.message}`, "danger");
    }
  });

  // Shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.key === " " && isGameRunning && btnReveal && !btnReveal.disabled) {
      e.preventDefault();
      btnReveal.click();
    }
    if (e.key === "ArrowRight" && isGameRunning && btnNext && !btnNext.disabled) {
      btnNext.click();
    }
  });

  // ---------- Init ----------
  hardResetUI();
})();