class SmartEven {
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
        this.priceHistory = [];
        this.digitHistory = [];
        this.currentMode = null; // 'even' or 'odd'
        this.hasOpenContract = false;
        this.lastDigit = null;
        this.trendWindow = 12;
        this.waitingForPattern = false;
        this.patternConfirmations = 0;
        this.pendingProposal = false;
        this.currentProposalId = null;
        this.lastContractId = null;
        this.tradeInProgress = false;
        this.evenOddDistribution = { even: 0, odd: 0 };
        this.streakCounter = { even: 0, odd: 0 };
        this.lastResult = null;
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
        this.evenOddDistribution = { even: 0, odd: 0 };
        this.streakCounter = { even: 0, odd: 0 };
        await this.subscribeToTicks();
        console.log('Bot started, waiting for price data...');
    }

    stop() {
        this.isRunning = false;
        this.unsubscribeFromTicks();
        this.hasOpenContract = false;
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
            this.waitingForPattern = false;
            this.lastResult = 'win';
        } else {
            this.consecutiveLosses++;
            this.currentStake = this.roundStake(this.currentStake * this.config.martingaleMultiplier);
            this.waitingForPattern = true;
            this.patternConfirmations = 0;
            this.lastResult = 'loss';
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
                progressToTarget: (this.totalProfit / this.config.takeProfit * 100).toFixed(2),
                currentMode: this.waitingForPattern ? 'ANALYZING' : (this.currentMode ? this.currentMode.toUpperCase() : 'READY')
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

    updateDistribution(digit) {
        if (digit % 2 === 0) {
            this.evenOddDistribution.even++;
            this.streakCounter.even++;
            this.streakCounter.odd = 0;
        } else {
            this.evenOddDistribution.odd++;
            this.streakCounter.odd++;
            this.streakCounter.even = 0;
        }
    }

    calculateProbability() {
        const total = this.evenOddDistribution.even + this.evenOddDistribution.odd;
        if (total === 0) return null;

        const evenProb = this.evenOddDistribution.even / total;
        const oddProb = this.evenOddDistribution.odd / total;

        return {
            even: evenProb,
            odd: oddProb,
            evenStreak: this.streakCounter.even,
            oddStreak: this.streakCounter.odd
        };
    }

    analyzePattern() {
        if (this.digitHistory.length < this.trendWindow) {
            return null;
        }

        const probs = this.calculateProbability();
        if (!probs) return null;

        // After a loss, wait for confirmation but with less strict conditions
        if (this.waitingForPattern) {
            // Reduced threshold from 0.65 to 0.55 and removed double confirmation requirement
            const threshold = 0.55; // Reduced from 0.65 to 0.55
            if (probs.even > threshold) {
                return 'odd'; // Trade opposite of dominant pattern
            } else if (probs.odd > threshold) {
                return 'even'; // Trade opposite of dominant pattern
            }
            
            // Added streak-based entry after loss
            if (probs.evenStreak >= 2) {
                return 'odd'; // Bet against even streak
            } else if (probs.oddStreak >= 2) {
                return 'even'; // Bet against odd streak
            }
            
            return null;
        }

        // Normal trading conditions remain unchanged
        if (probs.evenStreak >= 3) {
            return 'odd'; // Bet against even streak
        } else if (probs.oddStreak >= 3) {
            return 'even'; // Bet against odd streak
        }

        // Check for probability imbalance
        if (probs.even > 0.55) {
            return 'odd';
        } else if (probs.odd > 0.55) {
            return 'even';
        }

        return null;
    }

    async executeTrade() {
        if (!this.isRunning || this.hasOpenContract || this.pendingProposal || this.tradeInProgress) {
            return;
        }

        const mode = this.analyzePattern();
        if (!mode) {
            if (this.isRunning && !this.hasOpenContract && !this.pendingProposal) {
                setTimeout(() => this.executeTrade(), 500);
            }
            return;
        }

        this.currentMode = mode;
        const contractType = mode === 'even' ? 'DIGITEVEN' : 'DIGITODD';

        try {
            console.log('Executing trade:', contractType);
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
                    const price = parseFloat(data.tick.quote);
                    const digit = parseInt(data.tick.quote.toString().slice(-1));
                    
                    this.lastDigit = digit;
                    this.updateDistribution(digit);
                    
                    this.priceHistory.unshift(price);
                    this.digitHistory.unshift(digit);
                    
                    if (this.priceHistory.length > this.trendWindow) {
                        this.priceHistory.pop();
                        this.digitHistory.pop();
                    }

                    if (!this.hasOpenContract && !this.pendingProposal && this.digitHistory.length >= this.trendWindow) {
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
module.exports = SmartEven;
export default SmartEven; 