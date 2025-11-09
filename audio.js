const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const audioBuffers = {};

// Master gain
const masterGainNode = audioContext.createGain();
masterGainNode.connect(audioContext.destination);

// Background music state
let bgmSource = null;
let bgmGainNode = null;
let bgmStartTime = 0;
const BGM_CONFIG = {
    name: '/Jelly Cascade - Mash for the Candy Crown - Sonauto.ogg',
    duration: 95,
    fadeIn: 15,
    fadeOut: 15,
    maxVolume: 0.3
};
let isBgmPaused = false;
let updateBgmAnimationId = null;

async function loadSound(name) {
    if (audioBuffers[name]) {
        return audioBuffers[name];
    }
    try {
        const response = await fetch(name);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        audioBuffers[name] = audioBuffer;
        return audioBuffer;
    } catch (error) {
        console.error(`Error loading sound: ${name}`, error);
    }
}

export function playSound(name) {
    // Resume context on user gesture
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    loadSound(name).then(audioBuffer => {
        if (!audioBuffer) return;
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(masterGainNode);
        source.start(0);
    });
}

function updateBgmVolume() {
    if (!bgmGainNode || !bgmStartTime) {
        cancelAnimationFrame(updateBgmAnimationId);
        return;
    }

    const { duration, fadeIn, fadeOut, maxVolume } = BGM_CONFIG;
    // Calculate current position in the looping track
    const playbackTime = (audioContext.currentTime - bgmStartTime) % duration;

    let gain = maxVolume;
    if (playbackTime < fadeIn) {
        // Fade in
        gain = maxVolume * (playbackTime / fadeIn);
    } else if (playbackTime > duration - fadeOut) {
        // Fade out
        const timeIntoFadeOut = playbackTime - (duration - fadeOut);
        gain = maxVolume * (1 - (timeIntoFadeOut / fadeOut));
    }

    // Clamp gain value to avoid any potential issues
    gain = Math.max(0, Math.min(maxVolume, gain));
    
    // Use setValueAtTime for smooth transitions
    bgmGainNode.gain.setValueAtTime(gain, audioContext.currentTime);

    updateBgmAnimationId = requestAnimationFrame(updateBgmVolume);
}

export async function playBackgroundMusic(isReplay = false) {
    // Resume context on user gesture if needed
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }
    
    // Don't start a new one if it's the main BGM and it's already running
    if (!isReplay && bgmSource) {
        return;
    }

    const audioBuffer = await loadSound(BGM_CONFIG.name);
    if (!audioBuffer) {
        console.error("Background music failed to load.");
        return;
    }

    let sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.loop = true;

    const gainNode = audioContext.createGain();
    gainNode.gain.value = BGM_CONFIG.maxVolume; // Start at max volume for simplicity in replay
    gainNode.connect(masterGainNode);
    
    sourceNode.connect(gainNode);
    sourceNode.start(0);

    if (isReplay) {
        let pausedAt = 0;
        let startedAt = audioContext.currentTime;
        let isPaused = false;
        
        // For replays, return a controller to stop it later
        return {
            stop: () => {
                sourceNode.stop();
                sourceNode.disconnect();
                gainNode.disconnect();
            },
            pause: () => {
                if (isPaused) return;
                isPaused = true;
                pausedAt = audioContext.currentTime - startedAt;
                sourceNode.stop();
            },
            resume: () => {
                if (!isPaused) return;
                isPaused = false;
                
                // Create a new source node to resume playback.
                const newSourceNode = audioContext.createBufferSource();
                newSourceNode.buffer = sourceNode.buffer;
                newSourceNode.loop = sourceNode.loop;
                newSourceNode.connect(gainNode);
                newSourceNode.start(0, pausedAt % newSourceNode.buffer.duration);
                
                // update references
                sourceNode = newSourceNode;
                startedAt = audioContext.currentTime - pausedAt;
            }
        };
    } else {
        // For main game BGM, manage it with the global variables
        bgmSource = sourceNode;
        bgmGainNode = gainNode;
        bgmStartTime = audioContext.currentTime;
        bgmGainNode.gain.value = 0; // Reset for fade-in logic
        
        cancelAnimationFrame(updateBgmAnimationId); // Stop any previous animation loop
        updateBgmVolume();
    }
}

export function stopBackgroundMusic() {
    if (bgmSource) {
        bgmSource.stop();
        bgmSource.disconnect();
        bgmSource = null;
        cancelAnimationFrame(updateBgmAnimationId);
        updateBgmAnimationId = null;
    }
    if (bgmGainNode) {
        bgmGainNode.disconnect();
        bgmGainNode = null;
    }
}


export function pauseBackgroundMusic() {
    if (bgmGainNode) {
        isBgmPaused = true;
        bgmGainNode.disconnect();
    }
}

export function resumeBackgroundMusic() {
    if (bgmGainNode && isBgmPaused) {
        isBgmPaused = false;
        bgmGainNode.connect(masterGainNode);
    }
}


export function muteGameAudio() {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    masterGainNode.gain.setValueAtTime(0, audioContext.currentTime);
}

export function unmuteGameAudio() {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    masterGainNode.gain.setValueAtTime(1, audioContext.currentTime);
}

// Preload common sounds
window.addEventListener('load', () => {
    loadSound('match.mp3');
    loadSound('smash.mp3');
    loadSound(BGM_CONFIG.name); // Preload background music
    loadSound('sweet_mash.mp3');
    loadSound('nice_swipe.mp3');
    loadSound('tasty_trio.mp3');
    loadSound('crunch_combo.mp3');
    loadSound('good_move.mp3');
    loadSound('smash_success.mp3');
    loadSound('combo_6.mp3');
    loadSound('combo_7.mp3');
});