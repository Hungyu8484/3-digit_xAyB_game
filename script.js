class XAyBGame {
    constructor() {
        this.secretNumber = this.generateSecretNumber();
        this.attempts = 0;
        this.maxAttempts = 10;
        this.gameOver = false;
        this.guesses = [];
        
        this.initializeElements();
        this.bindEvents();
        this.updateDisplay();
    }

    initializeElements() {
        this.guessInput = document.getElementById('guessInput');
        this.submitBtn = document.getElementById('submitGuess');
        this.newGameBtn = document.getElementById('newGame');
        this.attemptCount = document.getElementById('attemptCount');
        this.guessesList = document.getElementById('guessesList');
        this.gameMessage = document.getElementById('gameMessage');
    }

    bindEvents() {
        this.submitBtn.addEventListener('click', () => this.submitGuess());
        this.newGameBtn.addEventListener('click', () => this.startNewGame());
        this.guessInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.submitGuess();
            }
        });
    }

    generateSecretNumber() {
        // Generate a 3-digit number with all different digits
        let digits = [];
        while (digits.length < 3) {
            const digit = Math.floor(Math.random() * 10);
            if (!digits.includes(digit)) {
                digits.push(digit);
            }
        }
        return digits.join('');
    }

    submitGuess() {
        if (this.gameOver) return;

        const guess = this.guessInput.value.trim();
        
        if (!this.validateGuess(guess)) {
            return;
        }

        this.attempts++;
        const result = this.calculateXAyB(guess);
        
        this.guesses.push({
            guess: guess,
            result: result,
            attempt: this.attempts
        });

        this.updateDisplay();
        this.checkGameEnd(result);

        this.guessInput.value = '';
        this.guessInput.focus();
    }

    validateGuess(guess) {
        if (!guess) {
            this.showMessage('Please enter a number!', 'error');
            return false;
        }

        if (guess.length !== 3) {
            this.showMessage('Please enter exactly 3 digits!', 'error');
            return false;
        }

        if (isNaN(guess)) {
            this.showMessage('Please enter a valid number!', 'error');
            return false;
        }

        // Check for duplicate digits
        const digits = guess.split('');
        if (new Set(digits).size !== digits.length) {
            this.showMessage('All digits must be different!', 'error');
            return false;
        }

        return true;
    }

    calculateXAyB(guess) {
        const secret = this.secretNumber.split('');
        const guessDigits = guess.split('');
        
        let a = 0; // Correct digit in correct position
        let b = 0; // Correct digit in wrong position

        // Count A's (correct position)
        for (let i = 0; i < 3; i++) {
            if (secret[i] === guessDigits[i]) {
                a++;
            }
        }

        // Count B's (correct digit, wrong position)
        for (let i = 0; i < 3; i++) {
            if (secret[i] !== guessDigits[i] && secret.includes(guessDigits[i])) {
                b++;
            }
        }

        return { a, b };
    }

    checkGameEnd(result) {
        if (result.a === 3) {
            this.gameOver = true;
            this.showMessage(`🎉 Congratulations! You won in ${this.attempts} attempts!`, 'success');
            this.submitBtn.disabled = true;
        } else if (this.attempts >= this.maxAttempts) {
            this.gameOver = true;
            this.showMessage(`😞 Game Over! The secret number was ${this.secretNumber}`, 'error');
            this.submitBtn.disabled = true;
        }
    }

    updateDisplay() {
        this.attemptCount.textContent = this.attempts;
        this.renderGuesses();
    }

    renderGuesses() {
        this.guessesList.innerHTML = '';
        
        if (this.guesses.length === 0) {
            this.guessesList.innerHTML = '<p class="no-guesses">No guesses yet. Make your first guess!</p>';
            return;
        }

        this.guesses.forEach(guessData => {
            const guessElement = document.createElement('div');
            guessElement.className = 'guess-item';
            
            const { a, b } = guessData.result;
            const resultText = a > 0 || b > 0 ? `${a}A${b}B` : '0A0B';
            
            guessElement.innerHTML = `
                <span class="attempt-number">#${guessData.attempt}</span>
                <span class="guess-number">${guessData.guess}</span>
                <span class="guess-result">${resultText}</span>
            `;
            
            this.guessesList.appendChild(guessElement);
        });
    }

    showMessage(text, type) {
        this.gameMessage.textContent = text;
        this.gameMessage.className = `message ${type}`;
        
        // Clear message after 3 seconds
        setTimeout(() => {
            this.gameMessage.textContent = '';
            this.gameMessage.className = 'message';
        }, 3000);
    }

    startNewGame() {
        this.secretNumber = this.generateSecretNumber();
        this.attempts = 0;
        this.gameOver = false;
        this.guesses = [];
        
        this.guessInput.value = '';
        this.guessInput.disabled = false;
        this.submitBtn.disabled = false;
        this.gameMessage.textContent = '';
        this.gameMessage.className = 'message';
        
        this.updateDisplay();
        this.guessInput.focus();
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new XAyBGame();
});
