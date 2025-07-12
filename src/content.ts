// TypeScript version of content.js with event logging and per-user tracking
(function () {
  if (document.getElementById('timecraft-panel')) return;

  const TOTAL_TIME_SEC = 60;
  let remaining: number = TOTAL_TIME_SEC;
  let overTime = 0;
  let isRunning = false;
  let isStopped = false;
  let standupStarted = false;
  let expectingNewSpeaker = false;
  let preTimerRunning = false;
  let currentUser = '';
  const history: { name: string; time: string }[] = [];

  const style = document.createElement('style');
  style.textContent = `
    .flashing-orange {
      animation: flash-orange 1s infinite;
    }
    .flashing-red {
      animation: flash-red 1s infinite;
    }
    @keyframes flash-orange {
      0% { background-color: orange; }
      50% { background-color: transparent; }
      100% { background-color: orange; }
    }
    @keyframes flash-red {
      0% { background-color: red; }
      50% { background-color: transparent; }
      100% { background-color: red; }
    }
  `;
  document.head.appendChild(style);

  const headerBar = document.querySelector('.AppHeader-localBar') as HTMLElement | null;
  if (!headerBar) return;

  const startBtn = document.createElement('button') as HTMLButtonElement;
  startBtn.innerText = "Start Daily Standup";
  startBtn.style.cssText = `
    margin-right: 12px;
    padding: 6px 12px;
    background: #2ea44f;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
  `;
  headerBar.insertBefore(startBtn, headerBar.firstChild);

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

  const label = document.createElement('div');
  label.style.fontSize = '16px';
  label.style.marginBottom = '4px';
  label.innerText = 'Timer';

  const timerDisplay = document.createElement('div');
  timerDisplay.style.fontSize = '24px';
  timerDisplay.innerText = formatTime(remaining);

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

  panel.appendChild(label);
  panel.appendChild(timerDisplay);
  panel.appendChild(controls);
  headerBar.insertAdjacentElement('afterend', panel);

  const historyPanel = document.createElement('div');
  historyPanel.id = 'timecraft-history';
  historyPanel.style.cssText = `
    position: fixed;
    top: 100px;
    right: 20px;
    width: 250px;
    max-height: 80vh;
    overflow-y: auto;
    background: #f6f8fa;
    border: 1px solid #d0d7de;
    padding: 10px;
    border-radius: 8px;
    font-family: sans-serif;
    font-size: 14px;
    z-index: 9999;
  `;
  historyPanel.innerHTML = `<strong>Standup History</strong><hr>`;
  document.body.appendChild(historyPanel);

  setInterval(() => {
    if (!isRunning || isStopped) return;
    if (remaining > 0) remaining--;
    else overTime++;
    updateDisplay();
  }, 1000);

  startBtn.onclick = () => {
    standupStarted = true;
    expectingNewSpeaker = true;
    startBtn.disabled = true;
    startBtn.innerText = "Standup Started";
    startBtn.style.backgroundColor = "#6c757d";
    panel.style.display = "block";
  };

  togglePauseBtn.onclick = () => {
    isRunning = !isRunning;
    togglePauseBtn.innerText = isRunning ? "Pause" : "Resume";
  };

  stopBtn.onclick = () => {
    isRunning = false;
    isStopped = true;
    expectingNewSpeaker = true;
    stopFlashing();
    togglePauseBtn.disabled = true;
    stopBtn.disabled = true;
    const totalTime = TOTAL_TIME_SEC + overTime - remaining;
    history.push({ name: currentUser, time: formatTime(totalTime) });
    updateHistory();
    timerDisplay.innerText += " (Stopped)";
    panel.className = "flashing-red";
  };

  function updateDisplay() {
    if (remaining > 0) {
      timerDisplay.innerText = formatTime(remaining);
    } else {
      timerDisplay.innerText = `+${formatTime(overTime)} Over`;
    }
    if (remaining <= 0) {
      panel.className = 'flashing-red';
    } else if (remaining <= TOTAL_TIME_SEC * 0.2) {
      panel.className = 'flashing-orange';
    } else {
      panel.className = '';
      panel.style.backgroundColor = 'green';
    }
  }

  function stopFlashing() {
    panel.className = '';
  }

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function styleButton(btn: HTMLButtonElement) {
    btn.style.cssText = `
      margin: 0 5px;
      padding: 6px 10px;
      border: none;
      border-radius: 4px;
      background: #24292f;
      color: white;
      cursor: pointer;
    `;
  }

  function updateHistory() {
    const list = history.map(h => `<div><strong>${h.name}</strong>: ${h.time}</div>`).join('');
    historyPanel.innerHTML = `<strong>Standup History</strong><hr>${list}`;
  }

  function startPreTimer(callback: () => void) {
    if (preTimerRunning) return;
    preTimerRunning = true;
    let count = 3;
    timerDisplay.innerText = `Get ready... ${count}`;
    const interval = setInterval(() => {
      count--;
      if (count > 0) timerDisplay.innerText = `Get ready... ${count}`;
      else {
        clearInterval(interval);
        preTimerRunning = false;
        callback();
      }
    }, 1000);
  }

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

  window.addEventListener("timecraft-event", (event: Event) => {
    const customEvent = event as CustomEvent;
    console.log("Custom event received:", customEvent.detail);
    if (!standupStarted || preTimerRunning || !expectingNewSpeaker) return;

    const data = customEvent.detail;
    const newUser = data.buttonText;
    if (!newUser || newUser === 'Start Daily Standup' || newUser === 'Standup Started') return;

    if (!isStopped && currentUser) {
      const totalTime = TOTAL_TIME_SEC + overTime - remaining;
      history.push({ name: currentUser, time: formatTime(totalTime) });
      updateHistory();
    }

    currentUser = newUser;
    label.innerText = `Update from: ${currentUser}`;
    remaining = TOTAL_TIME_SEC;
    overTime = 0;
    isRunning = false;
    isStopped = false;
    expectingNewSpeaker = true;
    togglePauseBtn.innerText = "Pause";
    togglePauseBtn.disabled = false;
    stopBtn.disabled = false;
    stopFlashing();
    panel.className = '';
    panel.style.backgroundColor = 'green';

    startPreTimer(() => {
      isRunning = true;
    });
  });

})();
