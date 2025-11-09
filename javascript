// ... existing code ...
    resumeReplay() {
        if (!this.replayState.isPaused) return;
        
        this.replayState.isPaused = false;
        this.replayState.startTime = performance.now() - this.replayState.pauseTime;

        if (this.replayBgmControl && this.replayBgmControl.resume) {
            this.replayBgmControl.resume();
        }

        const replayBoardElement = document.getElementById('replay-board');
        // Find the replay board instance from the element if possible, or handle it differently.
        // This part is tricky as we don't store the replayBoard instance on the game object.
        // For simplicity and accuracy, let's restart the replay.
        const recording = recorder.getRecording();
        const replayBoard = new Board(config.boardSize, config.candyTypes, () => {}, () => {});
        replayBoard.boardElement = replayBoardElement;
        
        this.scheduleReplayActions(replayBoard);

        const playPauseButton = document.getElementById('play-pause-button');
        playPauseButton.innerHTML = '&#10074;&#10074;'; // Pause icon
        playPauseButton.classList.remove('playing');
    }

    stopReplay() {
// ... existing code ...

