class RussianOdds {
    constructor(ws, config) {
        this.ws = ws;
        this.config = config;
        this.isRunning = false;
        this.currentStake = config.initialStake;
        this.totalProfit = 0;
        this.totalTrades = 0;
        this.wins = 0;
        this.consecutiveLosses = 0;
        this.startTime = null;
        this.tradeHistory = [];
        this.onUpdate = null;
        this.digitHistory = [];
        this.normalWindow = 5;
        this.recoveryWindow = 5;
        this.isRecoveryMode = false;
        this.minPatternStrength = 0.6;
        this.recoveryPatternStrength = 0.55;
        this.currentMode = null;
        this.hasOpenContract = false;
        this.pendingProposal = false;
        this.currentProposalId = null;
        this.lastContractId = null;
        this.tradeInProgress = false;
        this.lastDigit = null;
        this.evenOddCounts = { even: 0, odd: 0 };
    }

    setUpdateCallback(callback) {
        this.onUpdate = callback;
    }

    roundStake(value) {
        return Math.round(value * 100) / 100;
    }

    async start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.startTime = new Date();
        this.currentStake = this.config.initialStake;
        this.digitHistory = [];
        this.evenOddCounts = { even: 0, odd: 0 };
        await this.subscribeToTicks();
        console.log('Russian Odds Bot started, collecting initial data...');
    }

    stop() {
        this.isRunning = false;
        this.unsubscribeFromTicks();
        this.hasOpenContract = false;
        this.pendingProposal = false;
        this.tradeInProgress = false;
    }

    async subscribeToTicks() {
        try {
            this.ws.send(JSON.stringify({
                ticks: "R_50",
                subscribe: 1
            }));

            this.ws.send(JSON.stringify({
                proposal_open_contract: 1,
                subscribe: 1
            }));

            console.log('Subscribed to R_50 ticks and contract updates');
        } catch (error) {
            console.error('Error subscribing:', error);
        }
    }

    unsubscribeFromTicks() {
        this.ws.send(JSON.stringify({
            forget_all: ["ticks", "proposal_open_contract"]
        }));
    }

    updateStats(tradeResult) {
        if (tradeResult.win) {
            this.wins++;
            this.consecutiveLosses = 0;
            this.currentStake = this.roundStake(this.config.initialStake);
            this.isRecoveryMode = false;
            console.log('Win - Resetting to normal mode');
        } else {
            this.consecutiveLosses++;
            this.currentStake = this.roundStake(this.currentStake * this.config.martingaleMultiplier);
            this.isRecoveryMode = true;
            console.log('Loss - Entering recovery mode');
        }

        this.totalTrades++;
        this.totalProfit = this.roundStake(this.totalProfit + tradeResult.profit);

        this.tradeHistory.unshift({
            time: new Date(),
            stake: tradeResult.stake,
            result: tradeResult.win ? 'win' : 'loss',
            profit: tradeResult.profit,
            type: this.currentMode === 'even' ? 'EVEN' : 'ODD'
        });

        if (this.tradeHistory.length > 50) {
            this.tradeHistory.pop();
        }

        if (this.onUpdate) {
            this.onUpdate({
                currentStake: this.currentStake,
                totalProfit: this.totalProfit,
                totalTrades: this.totalTrades,
                winRate: (this.wins / this.totalTrades * 100).toFixed(2),
                consecutiveLosses: this.consecutiveLosses,
                runningTime: this.getRunningTime(),
                tradeHistory: this.tradeHistory,
                progressToTarget: (this.totalProfit / this.config.takeProfit * 100).toFixed(2)
            });
        }

        if (this.totalProfit <= -this.config.stopLoss || this.totalProfit >= this.config.takeProfit) {
            this.stop();
        }
    }

    getRunningTime() {
        if (!this.startTime) return '00:00:00';
        const diff = Math.floor((new Date() - this.startTime) / 1000);
        const hours = Math.floor(diff / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
        const seconds = (diff % 60).toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    analyzePattern() {
        const window = this.isRecoveryMode ? this.recoveryWindow : this.normalWindow;
        if (this.digitHistory.length < window) return null;

        const recentDigits = this.digitHistory.slice(0, window);
        let evenCount = 0;
        let oddCount = 0;

        recentDigits.forEach(digit => {
            digit % 2 === 0 ? evenCount++ : oddCount++;
        });

        const evenProb = evenCount / window;
        const oddProb = oddCount / window;
        const threshold = this.isRecoveryMode ? this.recoveryPatternStrength : this.minPatternStrength;

        console.log(`Pattern Analysis - Even: ${evenProb.toFixed(2)}, Odd: ${oddProb.toFixed(2)}, Threshold: ${threshold}`);

        if (evenProb > threshold) {
            console.log('Even pattern detected - Trading ODD');
            return 'odd';
        }
        if (oddProb > threshold) {
            console.log('Odd pattern detected - Trading EVEN');
            return 'even';
        }

        return null;
    }

    async executeTrade() {
        if (!this.isRunning || this.hasOpenContract || this.pendingProposal || this.tradeInProgress) {
            return;
        }

        const pattern = this.analyzePattern();
        if (!pattern) {
            if (this.isRunning && !this.hasOpenContract && !this.pendingProposal) {
                setTimeout(() => this.executeTrade(), 500);
            }
            return;
        }

        this.currentMode = pattern;
        const contractType = pattern === 'even' ? 'DIGITEVEN' : 'DIGITODD';

        try {
            console.log('Executing trade:', contractType, 'Stake:', this.currentStake);
            this.pendingProposal = true;
            this.tradeInProgress = true;
            
            this.ws.send(JSON.stringify({
                proposal: 1,
                amount: this.currentStake.toString(),
                basis: "stake",
                contract_type: contractType,
                currency: "USD",
                duration: 1,
                duration_unit: "t",
                symbol: "R_50"
            }));
        } catch (error) {
            console.error('Trade execution error:', error);
            this.pendingProposal = false;
            this.tradeInProgress = false;
            this.stop();
        }
    }

    handleMessage(message) {
        try {
            const data = JSON.parse(typeof message === 'string' ? message : message.toString());

            if (data.msg_type === 'proposal') {
                if (this.isRunning && data.proposal && !this.hasOpenContract && this.pendingProposal) {
                    if (!this.currentProposalId) {
                        this.currentProposalId = data.proposal.id;
                        this.ws.send(JSON.stringify({
                            buy: data.proposal.id,
                            price: data.proposal.ask_price
                        }));
                    }
                }
            }
            else if (data.msg_type === 'buy') {
                if (data.buy) {
                    this.hasOpenContract = true;
                    this.pendingProposal = false;
                    this.currentProposalId = null;
                    this.lastContractId = data.buy.contract_id;
                }
            }
            else if (data.msg_type === 'tick') {
                if (data.tick && data.tick.quote) {
                    const digit = parseInt(data.tick.quote.toString().slice(-1));
                    this.lastDigit = digit;
                    
                    // Update digit history
                    this.digitHistory.unshift(digit);
                    if (this.digitHistory.length > Math.max(this.normalWindow, this.recoveryWindow)) {
                        this.digitHistory.pop();
                    }

                    // Update even/odd counts
                    digit % 2 === 0 ? this.evenOddCounts.even++ : this.evenOddCounts.odd++;

                    if (!this.hasOpenContract && !this.pendingProposal && 
                        this.digitHistory.length >= (this.isRecoveryMode ? this.recoveryWindow : this.normalWindow)) {
                        this.executeTrade();
                    }
                }
            }
            else if (data.msg_type === 'proposal_open_contract') {
                const contract = data.proposal_open_contract;
                if (contract && contract.is_sold) {
                    if (contract.contract_id === this.lastContractId) {
                        const profit = parseFloat(contract.profit);
                        const win = profit > 0;

                        this.updateStats({
                            stake: this.currentStake,
                            profit: profit,
                            win: win
                        });

                        this.hasOpenContract = false;
                        this.tradeInProgress = false;
                        this.lastContractId = null;

                        setTimeout(() => {
                            if (this.isRunning) {
                                this.executeTrade();
                            }
                        }, 500);
                    }
                }
            }
        } catch (error) {
            console.error('Error handling message:', error);
            this.pendingProposal = false;
            this.tradeInProgress = false;
        }
    }
}

// Export the bot class
module.exports = RussianOdds;
export default RussianOdds; 