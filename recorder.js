let recording = [];
let initialState = null;
let startTime = 0;
let isPaused = false;
let timePaused = 0; // total time spent paused
let pauseStartTime = 0; // when the current pause began


export function startRecording(boardGrid) {
    if (startTime > 0) return; // Already started
    recording = [];
    startTime = Date.now();
    isPaused = false;
    timePaused = 0;
    pauseStartTime = 0;
    // Deep copy of the initial candy types, not the elements
    initialState = boardGrid.map(row => 
        row.map(candy => candy ? candy.dataset.type : null)
    );
    // Record that BGM starts at the beginning
    recordAction({ type: 'startBGM' });
}

export function resetRecording() {
    recording = [];
    initialState = null;
    startTime = 0;
}

export function pauseRecording() {
    if (!isPaused && startTime > 0) {
        isPaused = true;
        pauseStartTime = Date.now();
    }
}

export function resumeRecording() {
    if (isPaused && startTime > 0) {
        isPaused = false;
        timePaused += Date.now() - pauseStartTime;
        pauseStartTime = 0;
    }
}

export function recordAction(action) {
    if (startTime === 0 || isPaused) return; // Don't record if not started or paused
    // action = { type: 'swap', from: {r,c}, to: {r,c} }
    // action = { type: 'smash', from: {r,c} }
    const timestamp = Date.now() - startTime - timePaused;
    recording.push({ ...action, timestamp });
}

export function recordSound(soundName) {
    if (startTime === 0 || isPaused) return;
    const timestamp = Date.now() - startTime - timePaused;
    recording.push({ type: 'sound', name: soundName, timestamp });
}

export function getRecording() {
    if (recording) {
        // Sort by timestamp to ensure actions and sounds are in order
        recording.sort((a, b) => a.timestamp - b.timestamp);
    }
    return {
        initialState: initialState,
        actions: recording
    };
}