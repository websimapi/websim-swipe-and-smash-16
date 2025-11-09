import Board from './board.js';
import * as recorder from './recorder.js';
import { playSound, playBackgroundMusic } from './audio.js';

export default class Replay {
    constructor(game, config) {
        this.game = game;
        this.config = config;
        this.replayTimeouts = [];
        this.replayBgmControl = null;
        this.controlsTimeout = null;
        this.timelineUpdateInterval = null;
        this.isScrubbing = false;
        this.totalDuration = 0;

        this.state = {
            isPlaying: false,
            isPaused: false,
            pauseTime: 0,
            startTime: 0,
            actions: [],
            currentReplayBoard: null,
        };
        
        this.boundHandleScrubMove = this.handleScrubMove.bind(this);
        this.boundHandleScrubEnd = this.handleScrubEnd.bind(this);

        this.setupUI();
    }

    setupUI() {
        document.getElementById('clip-button').addEventListener('click', () => this.show());
        document.getElementById('close-replay-button').addEventListener('click', () => this.hide());
        document.getElementById('play-pause-button').addEventListener('click', () => this.togglePlayback());

        const timeline = document.getElementById('replay-timeline');
        timeline.addEventListener('pointerdown', this.handleScrubStart.bind(this));
    }

    handleContainerClick() {
        // This is now handled by the play/pause button's click event
    }

    showControls() {
        const playPauseButton = document.getElementById('play-pause-button');
        playPauseButton.classList.add('visible');
        // The button is always visible now, so timeouts are not needed for it.
    }
    
    show() {
        this.game.pauseTimer();
        this.game.pauseMainBGM();
        if (this.game.isRecordingStarted) {
            recorder.pauseRecording();
        }
        const modal = document.getElementById('replay-modal');
        modal.classList.remove('hidden');
        this.play();
    }

    hide() {
        const modal = document.getElementById('replay-modal');
        modal.classList.add('hidden');
        this.stop(); // Use stop to properly clean up

        // Force cleanup of any lingering replay candy elements
        const lingeringCandies = document.querySelectorAll('.replay-candy');
        lingeringCandies.forEach(candy => candy.remove());

        if (this.game.isRecordingStarted) {
            recorder.resumeRecording();
        }
        this.game.resumeMainBGM();
        this.game.resumeTimer();
    }

    async play() {
        const playPauseButton = document.getElementById('play-pause-button');

        const recording = recorder.getRecording();
        if (!recording || !recording.initialState) return;
        
        this.totalDuration = recording.actions.length > 0 ? recording.actions[recording.actions.length - 1].timestamp : 1;

        this.replayTimeouts.forEach(clearTimeout);
        this.replayTimeouts = [];

        const replayBoardElement = document.getElementById('replay-board');
        replayBoardElement.innerHTML = ''; // Clear previous replay

        const candyQueue = recording.actions.filter(a => a.type === 'newCandy').map(a => a.candyType);
        const replayTypeGenerator = () => {
            const nextType = candyQueue.shift();
            // Fallback, though it shouldn't be needed with proper recording.
            return nextType || this.config.candyTypes[0];
        };

        const replayBoard = new Board(this.config.boardSize, this.config.candyTypes, () => {}, replayTypeGenerator, () => this.state.isPaused);
        replayBoard.boardElement = replayBoardElement;
        replayBoard.setupBoard();

        // Override functions for replay board to tag candies
        replayBoard.createCandy = function(row, col, type, isInitializing = false) {
            return Board.prototype.createCandy.call(this, row, col, type, isInitializing, true);
        };
        replayBoard.fillBoard = function() {
            return Board.prototype.fillBoard.call(this, true);
        };

        replayBoard.initialize(recording.initialState);

        this.state.isPlaying = true;
        this.state.isPaused = false;
        this.state.startTime = performance.now();
        this.state.actions = [...recording.actions];
        this.state.currentReplayBoard = replayBoard; // Store for resume
        playPauseButton.innerHTML = '&#10074;&#10074;'; // Pause icon
        
        this.showControls(); 
        this.startTimelineUpdater();
        this.scheduleActions(replayBoard);
    }

    scheduleActions(replayBoard, resumeFromTime = 0) {
        this.replayTimeouts.forEach(clearTimeout);
        this.replayTimeouts = [];

        this.state.actions.forEach(action => {
            if (action.timestamp < resumeFromTime) {
                return; // Skip actions that have already passed
            }

            const delay = action.timestamp - resumeFromTime;

            const timeoutId = setTimeout(async () => {
                if (this.state.isPaused) return;

                if (action.type === 'swap') {
                    const candy1 = replayBoard.grid[action.from.r][action.from.c];
                    const candy2 = replayBoard.grid[action.to.r][action.to.c];
                    if(candy1 && candy2) {
                        await replayBoard.swapCandies(candy1, candy2);
                        const isValid = await replayBoard.processMatches(false, [candy1, candy2]);
                        if(!isValid) {
                             await replayBoard.swapCandies(candy1, candy2);
                        }
                    }
                } else if (action.type === 'activateRainbow') {
                    const rainbowCandy = replayBoard.grid[action.rainbowCandy.r][action.rainbowCandy.c];
                    const otherCandy = replayBoard.grid[action.otherCandy.r][action.otherCandy.c];
                    if (rainbowCandy && otherCandy) {
                        await replayBoard.activateRainbowPowerup(rainbowCandy, otherCandy);
                    }
                } else if (action.type === 'smash') {
                    const candiesToSmash = action.smashed
                        .map(coords => (replayBoard.grid[coords.r] ? replayBoard.grid[coords.r][coords.c] : null))
                        .filter(Boolean);
                    if (candiesToSmash.length > 0) {
                        await replayBoard.smashCandies(candiesToSmash);
                    }
                } else if (action.type === 'initialCascade') {
                    await replayBoard.processMatches(false, null);
                } else if (action.type === 'sound') {
                    playSound(action.name);
                } else if (action.type === 'startRainbow') {
                    document.getElementById('replay-board').parentElement.classList.add('rainbow-mode');
                } else if (action.type === 'endRainbow') {
                    document.getElementById('replay-board').parentElement.classList.remove('rainbow-mode');
                } else if (action.type === 'startBGM' && !this.replayBgmControl) {
                    this.replayBgmControl = await playBackgroundMusic(true);
                }
            }, delay);

            this.replayTimeouts.push(timeoutId);
        });

        const recordingDuration = this.state.actions.length > 0 ? this.state.actions[this.state.actions.length - 1].timestamp : 0;
        const endTimeout = setTimeout(() => {
            if (!this.state.isPaused && !this.isScrubbing) {
                this.hide(); // Hide modal when replay finishes
            }
        }, recordingDuration - resumeFromTime + 2000); // 2 seconds after last action
        this.replayTimeouts.push(endTimeout);
    }

    togglePlayback() {
        if (this.state.isPlaying) {
            if (this.state.isPaused) {
                this.resume();
            } else {
                this.pause();
            }
        }
    }

    pause() {
        if (!this.state.isPlaying || this.state.isPaused) return;

        this.replayTimeouts.forEach(clearTimeout);
        this.replayTimeouts = [];
        this.state.isPaused = true;
        this.state.pauseTime = performance.now() - this.state.startTime;
        if (this.replayBgmControl && this.replayBgmControl.pause) {
            this.replayBgmControl.pause();
        }
        this.stopTimelineUpdater();

        const playPauseButton = document.getElementById('play-pause-button');
        playPauseButton.innerHTML = '&#9658;'; // Play icon
    }

    resume() {
        if (!this.state.isPaused) return;

        this.state.isPaused = false;
        this.state.startTime = performance.now() - this.state.pauseTime;

        if (this.replayBgmControl && this.replayBgmControl.resume) {
            this.replayBgmControl.resume();
        }
        
        this.startTimelineUpdater();
        this.scheduleActions(this.state.currentReplayBoard, this.state.pauseTime);

        const playPauseButton = document.getElementById('play-pause-button');
        playPauseButton.innerHTML = '&#10074;&#10074;'; // Pause icon
    }

    stop() {
        this.replayTimeouts.forEach(clearTimeout);
        this.replayTimeouts = [];
        if (this.replayBgmControl) {
            this.replayBgmControl.stop();
            this.replayBgmControl = null;
        }
        this.stopTimelineUpdater();
        this.state = { isPlaying: false, isPaused: false, pauseTime: 0, startTime: 0, actions: [], currentReplayBoard: null };

        const playPauseButton = document.getElementById('play-pause-button');
        playPauseButton.innerHTML = '&#9658;'; // Play icon
        this.updateTimelineUI(0);
    }

    // --- Timeline and Scrubbing Methods ---

    startTimelineUpdater() {
        this.stopTimelineUpdater(); // Ensure no multiple intervals
        this.timelineUpdateInterval = setInterval(() => {
            if (!this.state.isPaused && this.state.isPlaying) {
                const elapsedTime = performance.now() - this.state.startTime;
                this.updateTimelineUI(elapsedTime);
            }
        }, 100);
    }

    stopTimelineUpdater() {
        clearInterval(this.timelineUpdateInterval);
        this.timelineUpdateInterval = null;
    }

    updateTimelineUI(elapsedTime) {
        const progress = Math.min(1, elapsedTime / this.totalDuration);
        document.getElementById('replay-progress').style.width = `${progress * 100}%`;
    }

    handleScrubStart(e) {
        this.isScrubbing = true;
        this.wasPlaying = !this.state.isPaused;
        this.pause();

        document.addEventListener('pointermove', this.boundHandleScrubMove);
        document.addEventListener('pointerup', this.boundHandleScrubEnd, { once: true });

        this.updateScrub(e);
    }

    handleScrubMove(e) {
        if (!this.isScrubbing) return;
        this.updateScrub(e);
    }

    handleScrubEnd(e) {
        document.removeEventListener('pointermove', this.boundHandleScrubMove);
        this.isScrubbing = false;

        // The state is already rebuilt on move, so we just need to decide whether to resume.
        if (this.wasPlaying) {
            this.resume();
        }
    }

    updateScrub(e) {
        const timeline = document.getElementById('replay-timeline');
        const rect = timeline.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        
        const seekTime = progress * this.totalDuration;
        
        this.rebuildAndPauseAt(seekTime);
    }
    
    async rebuildAndPauseAt(time) {
        this.replayTimeouts.forEach(clearTimeout);
        this.replayTimeouts = [];
        this.stopTimelineUpdater();
        
        const recording = recorder.getRecording();
        if (!recording || !recording.initialState) {
            console.error("Replay cannot be rebuilt: no recording found.");
            return;
        }
        
        const replayBoardElement = document.getElementById('replay-board');

        // Always create a new board for a clean slate when scrubbing.
        const replayBoard = new Board(
            this.config.boardSize,
            this.config.candyTypes,
            () => {}, // onMatch (muted for scrub)
            () => {}, // getNewCandyType (will be replaced by queue)
            () => true // The board is effectively always paused during scrubbing
        );
        replayBoard.boardElement = replayBoardElement;
        this.state.currentReplayBoard = replayBoard;

        // Re-create the candy queue for the replay generator.
        const candyQueue = recording.actions.filter(a => a.type === 'newCandy').map(a => a.candyType);
        replayBoard.getNewCandyType = () => {
            const nextType = candyQueue.shift();
            return nextType || this.config.candyTypes[0];
        };

        // Re-initialize the board state. This needs to clear existing DOM elements.
        replayBoard.boardElement.innerHTML = '';
        replayBoard.setupBoard();
        replayBoard.initialize(recording.initialState);

        const pastActions = recording.actions.filter(a => a.timestamp < time);

        for (const action of pastActions) {
             if (action.type === 'swap') {
                const candy1 = replayBoard.grid[action.from.r][action.from.c];
                const candy2 = replayBoard.grid[action.to.r][action.to.c];
                if(candy1 && candy2) {
                    await replayBoard.swapCandies(candy1, candy2, true);
                    const isValid = await replayBoard.processMatches(false, [candy1, candy2], true);
                    if(!isValid) {
                         await replayBoard.swapCandies(candy1, candy2, true);
                    }
                }
            } else if (action.type === 'activateRainbow') {
                const rainbowCandy = replayBoard.grid[action.rainbowCandy.r][action.rainbowCandy.c];
                const otherCandy = replayBoard.grid[action.otherCandy.r][action.otherCandy.c];
                if (rainbowCandy && otherCandy) {
                    await replayBoard.activateRainbowPowerup(rainbowCandy, otherCandy, true);
                }
            } else if (action.type === 'smash') {
                const candiesToSmash = action.smashed
                    .map(coords => (replayBoard.grid[coords.r] ? replayBoard.grid[coords.r][coords.c] : null))
                    .filter(Boolean);
                if (candiesToSmash.length > 0) {
                    await replayBoard.smashCandies(candiesToSmash, true);
                }
            } else if (action.type === 'initialCascade') {
                await replayBoard.processMatches(false, null, true);
            }
        }
        
        this.state.pauseTime = time;
        this.state.isPaused = true;
        this.updateTimelineUI(time);
    }
}