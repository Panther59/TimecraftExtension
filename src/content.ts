(function () {
  if (document.getElementById('timecraft-panel')) return;

  let DEFAULT_TIME_SEC = 60;
  let remaining: number = DEFAULT_TIME_SEC;
  let overTime = 0;
  let isRunning = false;
  let isStopped = false;
  let standupStarted = false;
  let currentUser = '';
  let sessionId: string = '';
  let session: StandupSession | null = null;

  interface StandupSession {
    id: string;
    startedAt: string;
    timePerSpeaker: number;
    members: string[];
    history: { name: string; time: string }[];
    userTimes: { [name: string]: number };
  }

  function generateSessionId() {
    return `standup-session-${Date.now()}`;
  }

  function getAllSessions(): StandupSession[] {
    const stored = localStorage.getItem('timecraft-sessions');
    return stored ? JSON.parse(stored) : [];
  }

  function saveAllSessions(sessions: StandupSession[]) {
    localStorage.setItem('timecraft-sessions', JSON.stringify(sessions));
  }

  function getCurrentSession(): StandupSession | null {
    if (!sessionId) return null;
    const sessions = getAllSessions();
    return sessions.find(s => s.id === sessionId) || null;
  }

  function updateCurrentSession(updater: (s: StandupSession) => void) {
    const sessions = getAllSessions();
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx === -1) return;
    updater(sessions[idx]);
    saveAllSessions(sessions);
  }

  // --- Style ---
  const style = document.createElement('style');
  style.textContent = `
    .flashing-orange {
      animation: flash-orange 1s infinite !important;
    }
    .flashing-red {
      animation: flash-red 1s infinite !important;
    }
    @keyframes flash-orange {
      0% { background-color: orange; }
      50% { background-color: transparent; }
      100% { background-color: orange; }
    }
    @keyframes flash-red {
      0% { background-color: #b91c1c; }
      50% { background-color: transparent; }
      100% { background-color: #b91c1c; }
    }
    #standup-summary-popup, #timecraft-history {
      position: fixed;
      background: #222;
      color: #fff;
      border-radius: 8px;
      padding: 20px;
      z-index: 9999;
      min-width: 320px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.15);
      font-family: sans-serif;
      cursor: move;
      user-select: none;
      right: unset !important;
    }
    #standup-summary-popup h3, #timecraft-history .drag-bar {
      margin-top: 0;
      cursor: move;
      user-select: none;
    }
    #standup-summary-popup ul {
      padding-left: 20px;
    }
    #standup-summary-popup button {
      margin-top: 16px;
      padding: 8px 20px;
      background: #2ea44f;
      color: #fff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
    }
    #standup-config-popup {
      position: fixed;
      top: 110px;
      right: 50px;
      background: #333;
      color: #fff;
      border-radius: 8px;
      padding: 20px;
      z-index: 9999;
      min-width: 320px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.15);
      font-family: sans-serif;
    }
    #standup-config-popup label {
      margin-right: 6px;
    }
    #standup-config-popup input[type="number"] {
      width: 80px;
      padding: 6px;
      border-radius: 4px;
      border: 1px solid #555;
      margin-right: 10px;
    }
    #standup-config-popup button {
      padding: 8px 20px;
      background: #2ea44f;
      color: #fff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
    }
  `;
  document.head.appendChild(style);

  // --- UI ---
  const headerBar = document.querySelector('.AppHeader-localBar') as HTMLElement | null;
  if (!headerBar) return;

  // Standup Button
  const standupBtn = document.createElement('button') as HTMLButtonElement;
  standupBtn.innerText = "Start Daily Standup";
  standupBtn.style.cssText = `
    margin-right: 12px;
    padding: 6px 12px;
    background: #2ea44f;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
  `;
  headerBar.insertBefore(standupBtn, headerBar.firstChild);

  // Timer Panel
  const panel = document.createElement('div') as HTMLDivElement;
  panel.id = 'timecraft-panel';
  panel.style.cssText = `
    padding: 10px;
    font-family: sans-serif;
    font-weight: bold;
    color: #fff;
    text-align: center;
    border-radius: 6px;
    margin: 8px;
    display: none;
    background-color: green;
    transition: background-color 0.5s ease;
  `;

  const userTitle = document.createElement('div');
  userTitle.style.fontSize = '32px';
  userTitle.style.fontWeight = 'bold';
  userTitle.style.marginBottom = '4px';
  userTitle.innerText = '';

  const timerDisplay = document.createElement('div');
  timerDisplay.style.fontSize = '24px';
  timerDisplay.innerText = `${DEFAULT_TIME_SEC} seconds remaining`;

  const controls = document.createElement('div');
  controls.style.marginTop = '8px';

  const togglePauseBtn = document.createElement('button');
  togglePauseBtn.innerText = "Pause";
  styleButton(togglePauseBtn);
  togglePauseBtn.disabled = true;

  const stopBtn = document.createElement('button');
  stopBtn.innerText = "Stop";
  styleButton(stopBtn);
  stopBtn.disabled = true;

  controls.appendChild(togglePauseBtn);
  controls.appendChild(stopBtn);

  panel.appendChild(userTitle);
  panel.appendChild(timerDisplay);
  panel.appendChild(controls);
  headerBar.insertAdjacentElement('afterend', panel);

  // History Panel
  const historyPanel = document.createElement('div');
  historyPanel.id = 'timecraft-history';
  historyPanel.style.cssText = `
    top: 100px;
    left: 20px;
    width: 250px;
    max-height: 80vh;
    overflow-y: auto;
    background: #333;
    color: #fff;
    border-radius: 8px;
    padding: 12px;
    font-family: sans-serif;
    display: none;
    z-index: 9998;
    right: unset !important;
  `;
  // Add drag-bar
  const dragBar = document.createElement('div');
  dragBar.className = 'drag-bar';
  dragBar.innerText = 'History';
  dragBar.style.fontWeight = 'bold';
  dragBar.style.fontSize = '18px';
  dragBar.style.marginBottom = '10px';
  dragBar.style.cursor = 'move';
  dragBar.style.userSelect = 'none';
  historyPanel.appendChild(dragBar);

  document.body.appendChild(historyPanel);

  let historyPanelContent = document.createElement('div');
  historyPanel.appendChild(historyPanelContent);

  // --- Timer Logic ---
  let timerInterval: number | null = null;
  let timerStartTime: number = 0;
  let timerEndTime: number = 0;

  function styleButton(btn: HTMLButtonElement) {
    btn.style.cssText = `
      margin: 0 6px;
      padding: 6px 12px;
      background: #6f42c1;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
    `;
  }

  function stopFlashing() {
    panel.classList.remove('flashing-orange', 'flashing-red');
    panel.style.animation = '';
  }

  function startPreTimer(callback: () => void) {
    let count = 3;
    timerDisplay.innerText = `Get ready... ${count}`;
    const interval = setInterval(() => {
      count--;
      if (count > 0) timerDisplay.innerText = `Get ready... ${count}`;
      else {
        clearInterval(interval);
        callback();
      }
    }, 1000);
  }

  function updateHistoryPanel() {
    if (!session) return;
    const historyList = session.history
      .map(h => `<li>${h.name}: ${h.time}</li>`)
      .join('');
    historyPanelContent.innerHTML = `<ul>${historyList}</ul>
      <div><small>Session started: ${new Date(session.startedAt).toLocaleString()}</small></div>
      <div><small>Speaker time limit: ${session.timePerSpeaker}s</small></div>`;
  }

  // --- Timer Start for User ---
  function startTimerForUser(user: string) {
    currentUser = user;
    userTitle.innerText = currentUser;
    // Resume previous time for this user in this session, or start fresh with session-wide limit
    const baseTime = session?.timePerSpeaker ?? DEFAULT_TIME_SEC;
    remaining = (session?.userTimes[user] ?? baseTime);
    overTime = 0;
    isRunning = false;
    isStopped = false;
    stopFlashing();
    panel.style.backgroundColor = "green";
    panel.style.display = "block";
    timerDisplay.innerText = `${remaining} seconds remaining`;

    // Flash on start (orange) by adding and keeping the class for entire orange period
    panel.classList.remove('flashing-orange', 'flashing-red');
    setTimeout(() => {
      panel.classList.add('flashing-orange');
      panel.style.backgroundColor = "orange";
    }, 50);

    startPreTimer(() => {
      isRunning = true;
      timerStartTime = Date.now();
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = window.setInterval(() => {
        if (!isRunning || isStopped) return;

        const orangeThreshold = Math.floor(baseTime * 0.2);

        if (remaining > 0) {
          remaining--;
          timerDisplay.innerText = `${remaining} seconds remaining`;

          updateCurrentSession(s => { s.userTimes[currentUser] = remaining; });

          // Orange for last 20% of time
          if (remaining <= orangeThreshold) {
            panel.style.backgroundColor = "orange";
            panel.classList.add('flashing-orange');
            panel.classList.remove('flashing-red');
          } else {
            panel.style.backgroundColor = "green";
            panel.classList.remove('flashing-orange', 'flashing-red');
          }
        } else {
          overTime++;
          timerDisplay.innerText = `${overTime} seconds over`;
          panel.style.backgroundColor = "#b91c1c";
          panel.classList.remove('flashing-orange');
          panel.classList.add('flashing-red');
        }
      }, 1000);
    });
  }

  function stopTimerForUser() {
    if (!currentUser || !session) return;
    isRunning = false;
    isStopped = true;
    timerEndTime = Date.now();
    if (timerInterval) clearInterval(timerInterval);
    togglePauseBtn.disabled = true;
    stopBtn.disabled = true;
    panel.style.backgroundColor = "green";
    timerDisplay.innerText = `${remaining} seconds remaining`;
    stopFlashing();

    // Save user time to history
    const timeTaken = Math.round((timerEndTime - timerStartTime) / 1000);
    updateCurrentSession(s => {
      s.history.push({ name: currentUser, time: `${timeTaken}s` });
      if (!s.members.includes(currentUser)) s.members.push(currentUser);
      s.userTimes[currentUser] = remaining;
    });
    currentUser = '';
    userTitle.innerText = '';
    remaining = session?.timePerSpeaker ?? DEFAULT_TIME_SEC;
    overTime = 0;
    session = getCurrentSession();
    updateHistoryPanel();
  }

  function pauseTimer() {
    isRunning = false;
    togglePauseBtn.innerText = "Resume";
  }

  function resumeTimer() {
    isRunning = true;
    togglePauseBtn.innerText = "Pause";
  }

  // --- Standup Config Popup ---
  function showConfigPopup(onConfirm: (seconds: number) => void) {
    let oldPopup = document.getElementById('standup-config-popup');
    if (oldPopup) oldPopup.remove();

    const popup = document.createElement('div');
    popup.id = 'standup-config-popup';
    popup.innerHTML = `
      <h3>Daily Standup Settings</h3>
      <label for="standup-seconds">Speaker limit (seconds):</label>
      <input id="standup-seconds" type="number" min="10" max="3600" value="${DEFAULT_TIME_SEC}">
      <button id="standup-config-confirm">Start Standup</button>
    `;
    document.body.appendChild(popup);

    document.getElementById('standup-config-confirm')!.onclick = () => {
      const sec = parseInt((document.getElementById('standup-seconds') as HTMLInputElement).value) || DEFAULT_TIME_SEC;
      popup.remove();
      onConfirm(sec);
    };
  }

  // --- Make panels moveable ---
  function makeMoveable(panel: HTMLElement, dragHandle: HTMLElement) {
    let offsetX = 0, offsetY = 0, isDragging = false;
    function dragMouseDown(e: MouseEvent) {
      isDragging = true;
      const rect = panel.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      panel.style.right = '';
      document.addEventListener('mousemove', dragMove);
      document.addEventListener('mouseup', dragEnd);
    }
    function dragMove(e: MouseEvent) {
      if (isDragging) {
        panel.style.top = `${e.clientY - offsetY}px`;
        panel.style.left = `${e.clientX - offsetX}px`;
        panel.style.right = '';
      }
    }
    function dragEnd() {
      isDragging = false;
      document.removeEventListener('mousemove', dragMove);
      document.removeEventListener('mouseup', dragEnd);
    }
    dragHandle.addEventListener('mousedown', dragMouseDown);
  }

  // --- Standup Button Logic ---
  standupBtn.addEventListener('click', () => {
    if (!standupStarted) {
      // Show config popup
      showConfigPopup((seconds) => {
        standupStarted = true;
        standupBtn.innerText = "End Daily Standup";
        historyPanel.style.display = 'block';
        // Create new session
        sessionId = generateSessionId();
        DEFAULT_TIME_SEC = seconds;
        session = {
          id: sessionId,
          startedAt: new Date().toISOString(),
          timePerSpeaker: seconds,
          members: [],
          history: [],
          userTimes: {}
        };
        const sessions = getAllSessions();
        sessions.push(session);
        saveAllSessions(sessions);
        updateHistoryPanel();
      });
    } else {
      // End standup
      standupStarted = false;
      standupBtn.innerText = "Start Daily Standup";
      panel.style.display = "none";
      historyPanel.style.display = "none";
      stopTimerForUser();
      showStandupSummaryPopup();
      sessionId = '';
      session = null;
    }
  });

  // --- Timer Controls ---
  togglePauseBtn.addEventListener('click', () => {
    if (isRunning) {
      pauseTimer();
    } else {
      resumeTimer();
    }
  });

  stopBtn.addEventListener('click', () => {
    stopTimerForUser();
    panel.style.display = "none";
  });

  // --- Summary Popup ---
  function showStandupSummaryPopup() {
    if (!session) return;
    let oldPopup = document.getElementById('standup-summary-popup');
    if (oldPopup) oldPopup.remove();

    // Calculate total time & per-member time
    let totalTime = session.history.reduce((acc, h) => acc + parseInt(h.time), 0);
    let memberTimes: { [name: string]: number } = {};
    session.history.forEach((h) => {
      memberTimes[h.name] = (memberTimes[h.name] || 0) + parseInt(h.time);
    });

    const popup = document.createElement('div');
    popup.id = 'standup-summary-popup';
    popup.style.top = '110px';
    popup.style.left = '50px';
    popup.style.right = '';
    popup.innerHTML = `
      <h3 id="standup-summary-title" style="cursor:move;user-select:none;">Daily Standup Summary</h3>
      <div><strong>Total Time:</strong> ${totalTime}s</div>
      <div><strong>Speaker limit:</strong> ${session.timePerSpeaker}s</div>
      <div><strong>Members:</strong></div>
      <ul>
        ${session.members.map(name => `<li>${name}: ${memberTimes[name] || 0}s</li>`).join("")}
      </ul>
      <div><small>Session started: ${new Date(session.startedAt).toLocaleString()}</small></div>
      <button id="close-standup-summary">Close</button>
    `;
    document.body.appendChild(popup);

    // Make popup movable by dragging the title bar
    const titleBar = popup.querySelector('#standup-summary-title')!;
    makeMoveable(popup, titleBar as HTMLElement);

    document.getElementById('close-standup-summary')!.onclick = () => {
      popup.remove();
    };
  }

  // --- Make History Panel Moveable ---
  makeMoveable(historyPanel, dragBar);

  // --- History Panel Live Update ---
  setInterval(updateHistoryPanel, 2000);

  // --- Initial Load ---
  updateHistoryPanel();

  // --- Existing attachButtonListeners integration ---
  function attachButtonListeners() {
    const buttons = document.querySelectorAll("button");
    buttons.forEach(btn => {
      const el = btn as HTMLButtonElement;
      if (!el.dataset.timecraftAttached) {
        el.addEventListener("click", () => {
          const eventData = {
            buttonText: el.innerText.trim(),
            user: (document.querySelector('meta[name="user-login"]') as HTMLMetaElement)?.content || 'anonymous',
            action: 'clicked_button',
            timestamp: new Date().toISOString()
          };
          const customEvt = new CustomEvent("timecraft-event", { detail: eventData });
          window.dispatchEvent(customEvt);
        });
        el.dataset.timecraftAttached = "true";
      }
    });
  }
  attachButtonListeners();
  const observer = new MutationObserver(() => attachButtonListeners());
  observer.observe(document.body, { childList: true, subtree: true });

  // Listen for member button click event and start timer for selected user
  window.addEventListener("timecraft-event", (event: Event) => {
    const customEvent = event as CustomEvent;
    if (!standupStarted) return;

    const data = customEvent.detail;
    const btnText = data.buttonText;
    if (!btnText || btnText === 'Start Standup' || btnText === 'Start Daily Standup' || btnText === 'Standup Started' || btnText === 'End Daily Standup') return;

    // If previous user was running, stop and save
    if (!isStopped && currentUser) {
      stopTimerForUser();
    }
    startTimerForUser(btnText);
  });

})();