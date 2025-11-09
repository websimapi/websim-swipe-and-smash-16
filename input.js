import { playBackgroundMusic } from './audio.js';

export default class InputHandler {
    constructor(boardElement, onSwap, onHold) {
        this.boardElement = boardElement;
        this.onSwap = onSwap;
        this.onHold = onHold;
        this.startCandy = null;
        this.isSwapping = false;
        this.startPos = { x: 0, y: 0 };
        this.holdTimeout = null;
        this.moved = false;
        this.enabled = false;

        // Bind event handlers once to ensure they can be removed correctly
        this.boundHandlePointerDown = this.handlePointerDown.bind(this);
        this.boundHandlePointerMove = this.handlePointerMove.bind(this);
        this.boundHandlePointerUp = this.handlePointerUp.bind(this);
    }

    enable() {
        if (this.enabled) return;
        this.enabled = true;
        this.boardElement.parentElement.addEventListener('pointerdown', this.boundHandlePointerDown);
    }

    disable() {
        if (!this.enabled) return;
        this.enabled = false;
        this.boardElement.parentElement.removeEventListener('pointerdown', this.boundHandlePointerDown);
    }

    handlePointerDown(e) {
        if (this.isSwapping) return;

        const target = e.target;
        if (!target.classList.contains('candy')) return;
        
        this.startCandy = target;
        this.startPos.x = e.clientX;
        this.startPos.y = e.clientY;
        this.moved = false;

        this.holdTimeout = setTimeout(() => {
            if (!this.moved && this.startCandy) {
                this.onHold(this.startCandy);
                // After a hold action, we don't want to do anything else
                // So we release the pointer control logic
                this.handlePointerUp(); 
            }
        }, 500); // 500ms for a hold
        
        // Listen for move and up events on the whole document to capture drags
        // that might go outside the game board.
        document.addEventListener('pointermove', this.boundHandlePointerMove);
        document.addEventListener('pointerup', this.boundHandlePointerUp);
    }

    handlePointerMove(e) {
        if (!this.startCandy) return;

        const dx = e.clientX - this.startPos.x;
        const dy = e.clientY - this.startPos.y;
        const moveThreshold = 10;

        if (Math.abs(dx) > moveThreshold || Math.abs(dy) > moveThreshold) {
            this.moved = true;
            clearTimeout(this.holdTimeout);
            this.holdTimeout = null;
        }

        const swipeThreshold = 20; // Minimum pixels to be considered a swipe

        if (this.moved && (Math.abs(dx) > swipeThreshold || Math.abs(dy) > swipeThreshold)) {
            // A swipe has been detected, determine direction
            let endRow, endCol;
            const startRow = parseInt(this.startCandy.dataset.row);
            const startCol = parseInt(this.startCandy.dataset.col);

            if (Math.abs(dx) > Math.abs(dy)) { // Horizontal swipe
                endRow = startRow;
                endCol = startCol + (dx > 0 ? 1 : -1);
            } else { // Vertical swipe
                endRow = startRow + (dy > 0 ? 1 : -1);
                endCol = startCol;
            }

            // Find the candy at the target position
            const targetCandy = document.querySelector(`.candy[data-row='${endRow}'][data-col='${endCol}']`);

            if (targetCandy) {
                this.isSwapping = true;
                this.onSwap(this.startCandy, targetCandy).then(() => {
                    this.isSwapping = false;
                });
            }

            // The swipe action is complete, so we clean up immediately
            this.handlePointerUp();
        }
    }

    handlePointerUp() {
        clearTimeout(this.holdTimeout);
        this.holdTimeout = null;
        // Clean up state and remove listeners
        this.startCandy = null;
        document.removeEventListener('pointermove', this.boundHandlePointerMove);
        document.removeEventListener('pointerup', this.boundHandlePointerUp);
    }
}