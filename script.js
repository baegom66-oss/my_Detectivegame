const firebaseConfig = {
  apiKey: "AIzaSyB4IrbfO9wLCTvyIP9Wc1_w38baC0qrSD0",
  authDomain: "my-detective-game.firebaseapp.com",
  databaseURL: "https://my-detective-game-default-rtdb.firebaseio.com",
  projectId: "my-detective-game",
  storageBucket: "my-detective-game.firebasestorage.app",
  messagingSenderId: "556148051636",
  appId: "1:556148051636:web:08125ae7e3d155605b91e1",
  measurementId: "G-6KKD3F89PQ"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const STATES = {
  WAITING: "WAITING",
  SELECT_LOCATION: "SELECT_LOCATION",
  SUBMIT_CARD: "SUBMIT_CARD",
  VOTING: "VOTING",
  FINAL_VOTE: "FINAL_VOTE",
  RESULT: "RESULT"
};

const LOCATIONS = ["과실", "한국화실", "컴퓨터실", "조소실", "세미나실"];
const evidenceDeck = [
  "목격자의 증언",
  "cctv기록",
  "옷에 묻은 물감",
  "수상한 발자국",
  "의문의 지문",
  "현장의 머리카락",
  "알리바이 부재",
  "평소 피해자와 원한 관계",
  "사라진 앞치마",
  "현장에 남겨진 붓",
  "깨진 석고 조각",
  "찢어진 트럼프 카드",
  "굳어있는 붓",
  "버려진 종이테이프",
  "전날 피해자와 다툼",
  "수상한 손가락의 상처",
  "옷 주머니의 찢어진 종이 조각",
  "사라진 컴퓨터실 열쇠",
  "고장난 컴퓨터",
  "평소 피해자를 질투함",
  "최근 정신과 상담 기록",
  "최근 피해자의 작품을 자주 구경함",
  "sns의 범행을 암시하는 내용",
  "사건당일 술을 마신 상태"
];

const el = {
  statusText: document.getElementById("statusText"),
  joinSection: document.getElementById("joinSection"),
  gameSection: document.getElementById("gameSection"),
  nameInput: document.getElementById("nameInput"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  joinRoomBtn: document.getElementById("joinRoomBtn"),
  maxPlayersInput: document.getElementById("maxPlayersInput"),
  hostOnlyConfig: document.getElementById("hostOnlyConfig"),
  roomCodeText: document.getElementById("roomCodeText"),
  gameStateText: document.getElementById("gameStateText"),
  roundText: document.getElementById("roundText"),
  myRoleText: document.getElementById("myRoleText"),
  startGameBtn: document.getElementById("startGameBtn"),
  playersList: document.getElementById("playersList"),
  myCards: document.getElementById("myCards"),
  actionArea: document.getElementById("actionArea"),
  revealedCardsArea: document.getElementById("revealedCardsArea")
};

let playerId = localStorage.getItem("deduction_player_id");
if (!playerId) {
  playerId = "p_" + Math.random().toString(36).slice(2, 11);
  localStorage.setItem("deduction_player_id", playerId);
}

let roomCode = "";
let roomRef = null;
let roomData = null;

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function setStatus(msg) {
  el.statusText.textContent = msg;
}

function getMyPlayer() {
  return roomData?.players?.[playerId] || null;
}

function getPlayers() {
  const players = roomData?.players || {};
  return Object.entries(players).map(([id, p]) => ({ id, ...p }));
}

function setRoomListener(code) {
  roomCode = code;
  roomRef = db.ref(`rooms/${code}`);
  roomRef.on("value", (snap) => {
    roomData = snap.val();
    if (!roomData) {
      setStatus("방이 삭제되었습니다.");
      return;
    }
    render();
    if (isHost()) {
      hostAutoProgress();
    }
  });
}

function isHost() {
  return roomData?.hostId === playerId;
}

async function createRoom() {
  const name = el.nameInput.value.trim();
  const maxPlayers = Number(el.maxPlayersInput.value);
  if (!name) return alert("이름을 입력하세요.");
  if (maxPlayers < 5 || maxPlayers > 8) return alert("인원은 5~8명이어야 합니다.");

  const code = createCode();
  const initData = {
    hostId: playerId,
    maxPlayers,
    createdAt: Date.now(),
    game: {
      state: STATES.WAITING,
      round: 0,
      revealedByLocation: {},
      usedDeck: [],
      midVote: null,
      finalResult: null,
      ranking: null
    },
    players: {
      [playerId]: {
        name,
        online: true,
        role: null,
        cards: [],
        location: null,
        submittedCard: null,
        prevRoundCard: null
      }
    },
    midVotes: {},
    finalVotes: {},
    predictions: {}
  };

  await db.ref(`rooms/${code}`).set(initData);
  await attachPresence(code);
  setRoomListener(code);
}

async function joinRoom() {
  const name = el.nameInput.value.trim();
  const code = el.roomCodeInput.value.trim().toUpperCase();
  if (!name) return alert("이름을 입력하세요.");
  if (!code) return alert("방 코드를 입력하세요.");

  const ref = db.ref(`rooms/${code}`);
  const snap = await ref.get();
  if (!snap.exists()) return alert("존재하지 않는 방 코드입니다.");

  const data = snap.val();
  const players = data.players || {};
  const count = Object.keys(players).length;
  if (!players[playerId] && count >= data.maxPlayers) return alert("방이 가득 찼습니다.");
  if (data.game.state !== STATES.WAITING && !players[playerId]) return alert("이미 시작된 게임에는 새로 입장할 수 없습니다.");

  await ref.child(`players/${playerId}`).update({
    name,
    online: true,
    role: players[playerId]?.role || null,
    cards: players[playerId]?.cards || [],
    location: null,
    submittedCard: null,
    prevRoundCard: players[playerId]?.prevRoundCard || null
  });

  await attachPresence(code);
  setRoomListener(code);
}

async function attachPresence(code) {
  const pRef = db.ref(`rooms/${code}/players/${playerId}/online`);
  await pRef.set(true);
  pRef.onDisconnect().set(false);
}

async function startGame() {
  if (!isHost()) return;
  const players = getPlayers();
  const max = roomData.maxPlayers;
  if (players.length !== max) return alert(`현재 ${players.length}명입니다. ${max}명 전원이 입장해야 시작할 수 있습니다.`);

  const ids = shuffle(players.map((p) => p.id));
  const roles = [];
  roles.push("범인");
  if (max >= 6) roles.push("공범");
  while (roles.length < max) roles.push("시민");
  const shuffledRoles = shuffle(roles);

  const usedDeck = shuffle(evidenceDeck).slice(0, max * 3);
  const updates = {};

  ids.forEach((id, idx) => {
    updates[`players/${id}/role`] = shuffledRoles[idx];
    updates[`players/${id}/cards`] = usedDeck.slice(idx * 3, idx * 3 + 3);
    updates[`players/${id}/location`] = null;
    updates[`players/${id}/submittedCard`] = null;
    updates[`players/${id}/prevRoundCard`] = null;
  });

  updates["game/state"] = STATES.SELECT_LOCATION;
  updates["game/round"] = 1;
  updates["game/revealedByLocation"] = {};
  updates["game/usedDeck"] = usedDeck;
  updates["game/midVote"] = null;
  updates["game/finalResult"] = null;
  updates["game/ranking"] = null;
  updates.midVotes = {};
  updates.finalVotes = {};
  updates.predictions = {};
  await roomRef.update(updates);
}

function allPlayersSelectedLocation() {
  return getPlayers().every((p) => !!p.location);
}

function allPlayersSubmittedCard() {
  return getPlayers().every((p) => !!p.submittedCard);
}

function allPlayersVotedMid() {
  const votes = roomData.midVotes || {};
  const ids = getPlayers().map((p) => p.id);
  return ids.every((id) => Array.isArray(votes[id]?.picks) && votes[id].picks.length === 2);
}

function allPlayersVotedFinal() {
  const votes = roomData.finalVotes || {};
  const ids = getPlayers().map((p) => p.id);
  return ids.every((id) => !!votes[id]?.pick);
}

function resolveTopTwo(voteMap, allowedCandidates) {
  const counts = {};
  allowedCandidates.forEach((id) => {
    counts[id] = 0;
  });
  Object.values(voteMap).forEach((v) => {
    (v.picks || []).forEach((pick) => {
      if (counts[pick] !== undefined) counts[pick] += 1;
    });
  });

  const arr = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (arr.length <= 2) return { finalists: arr.map((x) => x[0]), tiePool: null };

  const first = arr[0][1];
  const second = arr[1][1];
  const firstGroup = arr.filter((x) => x[1] === first).map((x) => x[0]);
  const secondGroup = arr.filter((x) => x[1] === second).map((x) => x[0]);

  if (firstGroup.length === 2 && second < first) return { finalists: firstGroup, tiePool: null };
  if (firstGroup.length === 1 && secondGroup.length === 1) return { finalists: [firstGroup[0], secondGroup[0]], tiePool: null };

  const tiePool = arr.filter((x) => x[1] >= second).map((x) => x[0]);
  return { finalists: null, tiePool };
}

async function hostAutoProgress() {
  const state = roomData?.game?.state;
  if (!state) return;

  if (state === STATES.SELECT_LOCATION && allPlayersSelectedLocation()) {
    await roomRef.update({ "game/state": STATES.SUBMIT_CARD });
    return;
  }

  if (state === STATES.SUBMIT_CARD && allPlayersSubmittedCard()) {
    const players = getPlayers();
    const grouped = {};
    const updates = {};
    players.forEach((p) => {
      if (!grouped[p.location]) grouped[p.location] = [];
      grouped[p.location].push(p.submittedCard);
      updates[`players/${p.id}/prevRoundCard`] = p.submittedCard;
      updates[`players/${p.id}/submittedCard`] = null;
      updates[`players/${p.id}/location`] = null;
    });

    Object.keys(grouped).forEach((loc) => {
      grouped[loc] = shuffle(grouped[loc]);
    });

    const currentRound = roomData.game.round;
    updates["game/revealedByLocation"] = grouped;

    if (currentRound === 7) {
      updates["game/state"] = STATES.VOTING;
      updates["game/round"] = 8;
      updates["midVotes"] = {};
      updates["game/midVote"] = { candidates: getPlayers().map((p) => p.id), finalists: null, containsCriminal: null, done: false };
    } else if (currentRound === 10) {
      updates["game/state"] = STATES.FINAL_VOTE;
      updates["finalVotes"] = {};
    } else {
      updates["game/round"] = currentRound + 1;
      updates["game/state"] = STATES.SELECT_LOCATION;
    }
    await roomRef.update(updates);
    return;
  }

  if (state === STATES.VOTING && allPlayersVotedMid()) {
    const midVote = roomData.game.midVote || {};
    const candidates = midVote.candidates || getPlayers().map((p) => p.id);
    const result = resolveTopTwo(roomData.midVotes || {}, candidates);

    if (result.finalists) {
      const criminal = getPlayers().find((p) => p.role === "범인")?.id;
      await roomRef.update({
        "game/midVote/finalists": result.finalists,
        "game/midVote/containsCriminal": result.finalists.includes(criminal),
        "game/midVote/done": true,
        "game/state": STATES.SELECT_LOCATION,
        midVotes: {}
      });
    } else {
      await roomRef.update({
        "game/midVote/candidates": result.tiePool,
        "game/midVote/finalists": null,
        "game/midVote/containsCriminal": null,
        midVotes: {}
      });
    }
    return;
  }

  if (state === STATES.FINAL_VOTE && allPlayersVotedFinal()) {
    const counts = {};
    Object.values(roomData.finalVotes || {}).forEach((v) => {
      counts[v.pick] = (counts[v.pick] || 0) + 1;
    });
    const selected = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const players = getPlayers();
    const criminal = players.find((p) => p.role === "범인");
    const citizensWin = selected === criminal?.id;

    await roomRef.update({
      "game/state": STATES.RESULT,
      "game/finalResult": {
        selectedCriminalId: selected || null,
        realCriminalId: criminal?.id || null,
        citizensWin
      }
    });
    return;
  }

  if (state === STATES.RESULT) {
    await maybeComputeRanking();
  }
}

async function maybeComputeRanking() {
  const result = roomData?.game?.finalResult;
  if (!result || roomData?.game?.ranking) return;
  const players = getPlayers();
  const citizens = players.filter((p) => p.role === "시민");
  const predictions = roomData.predictions || {};
  const needed = citizens.map((p) => p.id);
  const done = needed.every((id) => Array.isArray(predictions[id]) && predictions[id].length === 3);
  if (!done) return;

  const criminal = players.find((p) => p.role === "범인");
  const accomplice = players.find((p) => p.role === "공범");
  const criminalCards = new Set(criminal?.cards || []);
  const scoreMap = {};
  citizens.forEach((c) => {
    const guess = predictions[c.id] || [];
    scoreMap[c.id] = guess.filter((g) => criminalCards.has(g)).length;
  });

  let ranking = [];
  if (result.citizensWin) {
    ranking = citizens
      .map((c) => ({ playerId: c.id, score: scoreMap[c.id], label: c.name }))
      .sort((a, b) => b.score - a.score);
  } else {
    if (criminal) ranking.push({ playerId: criminal.id, score: 999, label: `${criminal.name} (공동 1등)` });
    if (accomplice) ranking.push({ playerId: accomplice.id, score: 999, label: `${accomplice.name} (공동 1등)` });
    const citizenRank = citizens
      .map((c) => ({ playerId: c.id, score: scoreMap[c.id], label: c.name }))
      .sort((a, b) => b.score - a.score);
    ranking = ranking.concat(citizenRank);
  }

  await roomRef.update({
    "game/ranking": ranking
  });
}

async function chooseLocation(location) {
  await roomRef.child(`players/${playerId}/location`).set(location);
}

async function submitCard(card) {
  const me = getMyPlayer();
  if (!me) return;
  if (me.prevRoundCard && me.prevRoundCard === card) {
    return alert("직전 라운드에서 사용한 카드는 이번 라운드에 제출할 수 없습니다.");
  }
  await roomRef.child(`players/${playerId}/submittedCard`).set(card);
}

async function voteMid(picks) {
  if (new Set(picks).size !== 2) return alert("서로 다른 2명을 선택하세요.");
  await roomRef.child(`midVotes/${playerId}`).set({ picks });
}

async function voteFinal(pick) {
  await roomRef.child(`finalVotes/${playerId}`).set({ pick });
}

async function submitPrediction(cards) {
  if (cards.length !== 3) return alert("범인의 카드 3장을 선택하세요.");
  await roomRef.child(`predictions/${playerId}`).set(cards);
}

function renderPlayers() {
  const players = getPlayers();
  el.playersList.innerHTML = "";
  players.forEach((p) => {
    const li = document.createElement("li");
    const online = p.online ? "온라인" : "오프라인";
    li.textContent = `${p.name} (${online})`;
    el.playersList.appendChild(li);
  });
}

function renderMyCards() {
  const me = getMyPlayer();
  el.myCards.innerHTML = "";
  if (!me?.cards?.length) {
    el.myCards.innerHTML = "<p class='hint'>게임 시작 후 카드가 표시됩니다.</p>";
    return;
  }
  me.cards.forEach((card) => {
    const btn = document.createElement("button");
    btn.className = "card-btn";
    if (me.prevRoundCard === card) btn.classList.add("disabled");
    btn.textContent = card + (me.prevRoundCard === card ? " (이번 라운드 사용 불가)" : "");
    el.myCards.appendChild(btn);
  });
}

function renderRevealedCards() {
  const map = roomData?.game?.revealedByLocation || {};
  const keys = Object.keys(map);
  if (!keys.length) {
    el.revealedCardsArea.innerHTML = "<p class='hint'>아직 공개된 카드가 없습니다.</p>";
    return;
  }
  el.revealedCardsArea.innerHTML = keys
    .map((loc) => {
      const items = map[loc].map((c) => `<li>${c}</li>`).join("");
      return `<div class="card"><strong>${loc}</strong><ul class="list">${items}</ul></div>`;
    })
    .join("");
}

function renderActionArea() {
  const state = roomData?.game?.state;
  const me = getMyPlayer();
  const players = getPlayers();
  if (!state || !me) {
    el.actionArea.innerHTML = "<p class='hint'>대기 중입니다.</p>";
    return;
  }

  if (state === STATES.WAITING) {
    el.actionArea.innerHTML = "<p>방장이 게임을 시작할 때까지 대기하세요.</p>";
    return;
  }

  if (state === STATES.SELECT_LOCATION) {
    if (me.location) {
      el.actionArea.innerHTML = `<p>선택 완료: <span class="pill">${me.location}</span></p><p class="hint">모든 플레이어의 선택을 기다립니다.</p>`;
      return;
    }
    el.actionArea.innerHTML = `<p>이번 라운드 장소를 선택하세요.</p>${LOCATIONS.map((l) => `<button class="btn choose-loc" data-loc="${l}">${l}</button>`).join("")}`;
    el.actionArea.querySelectorAll(".choose-loc").forEach((btn) => {
      btn.addEventListener("click", () => chooseLocation(btn.dataset.loc));
    });
    return;
  }

  if (state === STATES.SUBMIT_CARD) {
    if (me.submittedCard) {
      el.actionArea.innerHTML = `<p>제출 완료: <span class="pill">${me.submittedCard}</span></p><p class="hint">모든 플레이어의 제출을 기다립니다.</p>`;
      return;
    }
    const choices = me.cards
      .map((card) => `<button class="btn submit-card" data-card="${card}" ${me.prevRoundCard === card ? "disabled" : ""}>${card}</button>`)
      .join("");
    el.actionArea.innerHTML = `<p>카드 1장을 제출하세요.</p>${choices}`;
    el.actionArea.querySelectorAll(".submit-card").forEach((btn) => {
      btn.addEventListener("click", () => submitCard(btn.dataset.card));
    });
    return;
  }

  if (state === STATES.VOTING) {
    const voted = roomData?.midVotes?.[playerId]?.picks || null;
    const midVote = roomData?.game?.midVote || {};
    const candidateIds = midVote.candidates || players.map((p) => p.id);
    const candidatePlayers = players.filter((p) => candidateIds.includes(p.id));
    if (voted) {
      el.actionArea.innerHTML = `<p>중간 투표 완료: <span class="pill">${voted.map((id) => players.find((p) => p.id === id)?.name || id).join(", ")}</span></p><p class="hint">다른 플레이어를 기다립니다.</p>`;
      return;
    }
    el.actionArea.innerHTML = `
      <p>중간 투표: 2명을 선택하세요.</p>
      ${candidatePlayers.map((p) => `<label><input type="checkbox" class="mid-vote" value="${p.id}" /> ${p.name}</label>`).join("")}
      <button id="midVoteBtn" class="btn primary">중간 투표 제출</button>
    `;
    document.getElementById("midVoteBtn").addEventListener("click", () => {
      const checked = [...document.querySelectorAll(".mid-vote:checked")].map((n) => n.value);
      voteMid(checked);
    });
    return;
  }

  if (state === STATES.FINAL_VOTE) {
    const voted = roomData?.finalVotes?.[playerId]?.pick || null;
    if (voted) {
      const pickedName = players.find((p) => p.id === voted)?.name || voted;
      el.actionArea.innerHTML = `<p>최종 투표 완료: <span class="pill">${pickedName}</span></p>`;
      return;
    }
    el.actionArea.innerHTML = `
      <p>최종 투표: 범인 1명을 지목하세요.</p>
      ${players.map((p) => `<button class="btn final-vote" data-id="${p.id}">${p.name}</button>`).join("")}
    `;
    el.actionArea.querySelectorAll(".final-vote").forEach((btn) => {
      btn.addEventListener("click", () => voteFinal(btn.dataset.id));
    });
    return;
  }

  if (state === STATES.RESULT) {
    const result = roomData?.game?.finalResult;
    const ranking = roomData?.game?.ranking;
    const criminal = players.find((p) => p.role === "범인");
    const meIsCitizen = me.role === "시민";
    const alreadyPredicted = Array.isArray(roomData?.predictions?.[playerId]);
    let html = `
      <p class="${result?.citizensWin ? "success" : "danger-text"}">
        ${result?.citizensWin ? "시민팀 승리" : "시민팀 패배, 범인팀 승리"}
      </p>
      <p>실제 범인: <strong>${criminal?.name || "-"}</strong></p>
    `;
    if (meIsCitizen && !alreadyPredicted) {
      const options = (roomData?.game?.usedDeck || []).map(
        (c) => `<label><input type="checkbox" class="pred-card" value="${c}" /> ${c}</label>`
      );
      html += `${options.join("")}<button id="predictionBtn" class="btn primary">범인 카드 3장 예측 제출</button>`;
    } else if (meIsCitizen) {
      html += "<p class='hint'>카드 예측 제출 완료</p>";
    }

    if (ranking?.length) {
      html += "<h3>등수</h3><ul class='list'>" + ranking.map((r, idx) => `<li>${idx + 1}위 - ${r.label} (점수 ${r.score === 999 ? "-" : r.score})</li>`).join("") + "</ul>";
    }
    el.actionArea.innerHTML = html;

    const predBtn = document.getElementById("predictionBtn");
    if (predBtn) {
      predBtn.addEventListener("click", () => {
        const picks = [...document.querySelectorAll(".pred-card:checked")].map((n) => n.value);
        if (picks.length !== 3) return alert("정확히 3장을 선택하세요.");
        submitPrediction(picks);
      });
    }
  }
}

function renderStartButton() {
  const show = isHost() && roomData?.game?.state === STATES.WAITING;
  el.startGameBtn.classList.toggle("hidden", !show);
}

function render() {
  if (!roomData) return;
  const me = getMyPlayer();
  el.joinSection.classList.add("hidden");
  el.gameSection.classList.remove("hidden");
  el.roomCodeText.textContent = roomCode;
  el.gameStateText.textContent = roomData.game?.state || "-";
  el.roundText.textContent = String(roomData.game?.round || "-");
  el.myRoleText.textContent = me?.role || "비공개";
  setStatus("실시간 동기화 중");
  renderPlayers();
  renderMyCards();
  renderRevealedCards();
  renderActionArea();
  renderStartButton();

  const mid = roomData?.game?.midVote;
  if (mid?.done) {
    const p1 = getPlayers().find((p) => p.id === mid.finalists?.[0])?.name || "-";
    const p2 = getPlayers().find((p) => p.id === mid.finalists?.[1])?.name || "-";
    const msg = mid.containsCriminal ? "범인 포함" : "범인 미포함";
    el.revealedCardsArea.innerHTML = `<div class="card"><p>중간 투표 최종 2인: ${p1}, ${p2}</p><p><strong>${msg}</strong></p></div>` + el.revealedCardsArea.innerHTML;
  }
}

el.createRoomBtn.addEventListener("click", createRoom);
el.joinRoomBtn.addEventListener("click", joinRoom);
el.startGameBtn.addEventListener("click", startGame);

setStatus("이름, 방 코드를 입력하고 시작하세요.");
