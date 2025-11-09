import * as recorder from './recorder.js';
import { playSound } from './audio.js';

export default class Board {
    constructor(size, candyTypes, onMatch, getNewCandyType, getIsPaused = () => false) {
        this.size = size;
        this.candyTypes = candyTypes;
        this.grid = [];
        this.boardElement = document.getElementById('game-board');
        this.onMatch = onMatch;
        this.getNewCandyType = getNewCandyType;
        this.getIsPaused = getIsPaused;
    }

    pausableTimeout(duration) {
        return new Promise(resolve => {
            let start = performance.now();
            let remaining = duration;

            const tick = (now) => {
                if (!this.getIsPaused()) {
                    const elapsed = now - start;
                    start = now;
                    remaining -= elapsed;
                }

                if (remaining <= 0) {
                    resolve();
                } else {
                    requestAnimationFrame(tick);
                }
            };
            requestAnimationFrame(tick);
        });
    }

    initialize(initialState) {
        this.setupBoard();
        for (let r = 0; r < this.size; r++) {
            this.grid[r] = [];
            for (let c = 0; c < this.size; c++) {
                const candyType = initialState[r][c];
                this.grid[r][c] = this.createCandy(r, c, candyType, true);
            }
        }
    }

    setupBoard() {
        this.boardElement.style.gridTemplateColumns = `repeat(${this.size}, 1fr)`;
        this.boardElement.style.gridTemplateRows = `repeat(${this.size}, 1fr)`;
    }

    createCandy(row, col, type, isInitializing = false, isReplay = false) {
        const candy = document.createElement('div');
        const candyType = type || this.getNewCandyType(isInitializing);
        
        candy.classList.add('candy');
        if (isReplay) {
            candy.classList.add('replay-candy');
        }
        candy.dataset.row = row;
        candy.dataset.col = col;
        candy.dataset.type = candyType;
        candy.style.backgroundImage = `url(${candyType})`;
        
        const candySize = this.boardElement.clientWidth / this.size;
        candy.style.width = `${candySize}px`;
        candy.style.height = `${candySize}px`;
        
        if (isInitializing) {
            candy.style.top = `${row * candySize}px`;
            candy.style.left = `${col * candySize}px`;
        } else {
            // Start above the board for drop-in animation
            candy.style.top = `${-candySize}px`;
            candy.style.left = `${col * candySize}px`;
        }

        this.boardElement.appendChild(candy);
        return candy;
    }

    async swapCandies(candy1, candy2, instant = false) {
        const r1 = parseInt(candy1.dataset.row);
        const c1 = parseInt(candy1.dataset.col);
        const r2 = parseInt(candy2.dataset.row);
        const c2 = parseInt(candy2.dataset.col);

        // Swap in grid
        this.grid[r1][c1] = candy2;
        this.grid[r2][c2] = candy1;

        // Swap datasets
        candy1.dataset.row = r2;
        candy1.dataset.col = c2;
        if(candy2) { // Add check for candy2 being null
            candy2.dataset.row = r1;
            candy2.dataset.col = c1;
        }

        // Animate swap
        const candySize = this.boardElement.clientWidth / this.size;
        candy1.style.top = `${r2 * candySize}px`;
        candy1.style.left = `${c2 * candySize}px`;
        if (candy2) { // Add check for candy2 being null
            candy2.style.top = `${r1 * candySize}px`;
            candy2.style.left = `${c1 * candySize}px`;
        }

        if (!instant) {
            playSound('nice_swipe.mp3');
            recorder.recordSound('nice_swipe.mp3');
        }
        return instant ? Promise.resolve() : this.pausableTimeout(300);
    }

    getAffectedCandies(powerupCandy) {
        const affected = new Set();
        const r = parseInt(powerupCandy.dataset.row);
        const c = parseInt(powerupCandy.dataset.col);
        const powerupType = powerupCandy.dataset.powerup;

        switch (powerupType) {
            case 'row':
                for (let i = 0; i < this.size; i++) {
                    if (this.grid[r][i]) affected.add(this.grid[r][i]);
                }
                break;
            case 'col':
                for (let i = 0; i < this.size; i++) {
                    if (this.grid[i][c]) affected.add(this.grid[i][c]);
                }
                break;
            case 'bomb':
                 for (let i = r - 1; i <= r + 1; i++) {
                    for (let j = c - 1; j <= c + 1; j++) {
                        if (this.isValid(i, j) && this.grid[i][j]) {
                            affected.add(this.grid[i][j]);
                        }
                    }
                }
                break;
        }
        return Array.from(affected);
    }

    async processMatches(isInitializing = false, swappedCandies = null, instant = false) {
        const matchGroups = this.findMatchGroups();

        if (matchGroups.length === 0) {
            return false; // No matches found, invalid move if it was a swap.
        }

        let totalMatchedCandies = [];
        let createdPowerups = [];

        for (const group of matchGroups) {
            totalMatchedCandies = totalMatchedCandies.concat(group.candies);

            // Power-up creation logic
            let powerup = null;
            if (swappedCandies) { // Only create powerups on player moves
                const isSwapped = (c) => swappedCandies.includes(c);
                if (group.type === 'five' && group.candies.some(isSwapped)) {
                    powerup = { type: 'rainbow' };
                } else if (group.type === 'L' || group.type === 'T') {
                     powerup = { type: 'bomb' };
                } else if (group.type === 'four') {
                     powerup = group.candies[1].dataset.row === group.candies[0].dataset.row ? { type: 'row' } : { type: 'col' };
                }
            }
            
            if (powerup) {
                const primaryCandy = group.candies.find(c => swappedCandies && swappedCandies.includes(c)) || group.candies[Math.floor(group.candies.length/2)];
                const r = parseInt(primaryCandy.dataset.row);
                const c = parseInt(primaryCandy.dataset.col);
                
                powerup.row = r;
                powerup.col = c;
                createdPowerups.push(powerup);
            }
        }
        
        const allCandiesToClear = new Set(totalMatchedCandies);

        // Don't remove candies that are becoming powerups
        createdPowerups.forEach(p => {
            const candyToUpgrade = this.grid[p.row][p.col];
            if (candyToUpgrade && allCandiesToClear.has(candyToUpgrade)) {
                allCandiesToClear.delete(candyToUpgrade);
                candyToUpgrade.dataset.powerup = p.type;
                candyToUpgrade.classList.add(`powerup-${p.type}`);
                 if (p.type === 'rainbow') {
                    candyToUpgrade.dataset.type = 'candy_chocolate.png';
                    candyToUpgrade.style.backgroundImage = `url(candy_chocolate.png)`;
                }
            }
        });

        // Chain reaction for powerups
        const processedPowerups = new Set();
        let powerupsInClearZone = Array.from(allCandiesToClear).filter(c => c.dataset.powerup);

        while (powerupsInClearZone.length > 0) {
            const currentPowerup = powerupsInClearZone.shift();
            if (processedPowerups.has(currentPowerup)) continue;

            processedPowerups.add(currentPowerup);
            const affectedByPowerup = this.getAffectedCandies(currentPowerup);
            
            for (const affectedCandy of affectedByPowerup) {
                if (!allCandiesToClear.has(affectedCandy)) {
                    allCandiesToClear.add(affectedCandy);
                    if (affectedCandy.dataset.powerup && !processedPowerups.has(affectedCandy)) {
                        powerupsInClearZone.push(affectedCandy);
                    }
                }
            }
        }


        if (allCandiesToClear.size > 0) {
            if (!instant) this.onMatch(Array.from(allCandiesToClear), swappedCandies !== null);
            
            allCandiesToClear.forEach(candy => {
                candy.classList.add('matched');
                const r = parseInt(candy.dataset.row);
                const c = parseInt(candy.dataset.col);
                if (this.grid[r] && this.grid[r][c] === candy) {
                    this.grid[r][c] = null;
                }
            });
        }
        
        if (!instant) await this.pausableTimeout(300);
        
        allCandiesToClear.forEach(candy => candy.remove());
        
        await this.dropCandies(instant);
        await this.fillBoard(false, instant);
        
        // Recursive call to handle cascades.
        const hadCascade = await this.processMatches(isInitializing, null, instant);
        
        return true;
    }

    findMatchGroups() {
        const groups = [];
        const visited = new Set();

        for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
                const candy = this.grid[r][c];
                if (!candy || visited.has(candy)) continue;

                const matchRight = this.findMatchesInDirection(r, c, 0, 1);
                const matchDown = this.findMatchesInDirection(r, c, 1, 0);
                
                let combined = [];

                if (matchRight.length >= 3) combined.push(...matchRight);
                if (matchDown.length >= 3) combined.push(...matchDown);
                
                combined = [...new Set(combined)]; // Remove duplicates
                
                if (combined.length > 0) {
                    let type = 'three';
                    if (combined.length >= 5) type = 'five';
                    else if (combined.length === 4) type = 'four';

                    // Very basic L/T check
                    if (matchRight.length >= 3 && matchDown.length >= 3) {
                         type = 'L'; // Could also be a T
                    }

                    groups.push({ candies: combined, type: type });
                    combined.forEach(c => visited.add(c));
                }
            }
        }
        return groups;
    }

    findMatchesInDirection(startR, startC, dR, dC) {
        const matches = [];
        const startCandy = this.grid[startR][startC];
        if (!startCandy) return matches;

        matches.push(startCandy);
        
        let r = startR + dR;
        let c = startC + dC;
        
        while (this.isValid(r, c) && this.grid[r][c] && this.grid[r][c].dataset.type === startCandy.dataset.type) {
            matches.push(this.grid[r][c]);
            r += dR;
            c += dC;
        }
        
        return matches;
    }

    async smashCandies(candiesToSmash, instant = false) {
        if (candiesToSmash.length === 0) return;
        
        // This is a smash, not a player-made match, so isPlayerMove is false.
        if (!instant) this.onMatch(candiesToSmash, false);
        
        candiesToSmash.forEach(candy => {
            candy.classList.add('matched');
            const r = parseInt(candy.dataset.row);
            const c = parseInt(candy.dataset.col);
            if (this.grid[r] && this.grid[r][c] === candy) {
                 this.grid[r][c] = null;
            }
        });

        if (!instant) await this.pausableTimeout(300);
        
        candiesToSmash.forEach(candy => candy.remove());
        
        await this.dropCandies(instant);
        await this.fillBoard(false, instant);
        
        await this.processMatches(false, null, instant);
    }
    
    async activateRainbowPowerup(rainbowCandy, otherCandy, instant = false) {
        const targetType = otherCandy.dataset.type;
        const candiesToRemove = new Set();
        candiesToRemove.add(rainbowCandy);

        for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
                if (this.grid[r][c] && this.grid[r][c].dataset.type === targetType) {
                    candiesToRemove.add(this.grid[r][c]);
                }
            }
        }

        if (!instant) this.onMatch(Array.from(candiesToRemove), true);
        
        candiesToRemove.forEach(candy => {
            candy.classList.add('matched');
            this.grid[parseInt(candy.dataset.row)][parseInt(candy.dataset.col)] = null;
        });

        if (!instant) await this.pausableTimeout(300);
        
        candiesToRemove.forEach(candy => candy.remove());
        
        await this.dropCandies(instant);
        await this.fillBoard(false, instant);
        
        await this.processMatches(false, null, instant);
    }

    async dropCandies(instant = false) {
        for (let c = 0; c < this.size; c++) {
            let emptyRow = this.size - 1;
            for (let r = this.size - 1; r >= 0; r--) {
                if (this.grid[r][c]) {
                    if (emptyRow !== r) {
                        // Move candy down
                        this.grid[emptyRow][c] = this.grid[r][c];
                        this.grid[r][c] = null;
                        this.grid[emptyRow][c].dataset.row = emptyRow;
                        
                        const candySize = this.boardElement.clientWidth / this.size;
                        this.grid[emptyRow][c].style.top = `${emptyRow * candySize}px`;
                    }
                    emptyRow--;
                }
            }
        }
        return instant ? Promise.resolve() : this.pausableTimeout(300);
    }
    
    async fillBoard(isReplay = false, instant = false) {
        const candySize = this.boardElement.clientWidth / this.size;
        for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
                if (!this.grid[r][c]) {
                    const candy = this.createCandy(r, c, undefined, false, isReplay);
                    this.grid[r][c] = candy;
                    // Animate the drop
                    if (instant) {
                         candy.style.top = `${r * candySize}px`;
                    } else {
                        await new Promise(resolve => requestAnimationFrame(() => {
                            candy.style.top = `${r * candySize}px`;
                            resolve();
                        }));
                    }
                }
            }
        }
        return instant ? Promise.resolve() : this.pausableTimeout(300);
    }

    isValid(row, col) {
        return row >= 0 && row < this.size && col >= 0 && col < this.size;
    }
}