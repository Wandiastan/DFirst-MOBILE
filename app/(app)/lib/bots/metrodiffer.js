class MetroDiffer {
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
        this.lastDigit = null;
        this.tradeHistory = [];
        this.onUpdate = null;
        this.digitFrequency = Array(10).fill(0); // Track frequency of each digit (0-9)
        this.lastResult = 'win'; // Track last trade result for strategy switching
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
        this.digitFrequency = Array(10).fill(0); // Reset digit frequency
        await this.subscribeToTicks();
        this.executeTrade();
    }

    stop() {
        this.isRunning = false;
        this.unsubscribeFromTicks();
    }

    async subscribeToTicks() {
        try {
            // Subscribe to ticks for R_25
            this.ws.send(JSON.stringify({
                ticks: "R_25",
                subscribe: 1
            }));

            // Subscribe to contract updates
            this.ws.send(JSON.stringify({
                proposal_open_contract: 1,
                subscribe: 1
            }));

            console.log('Subscribed to R_25 ticks and contract updates');
        } catch (error) {
            console.error('Error subscribing:', error);
        }
    }

    unsubscribeFromTicks() {
        const request = {
            forget_all: ["ticks"]
        };
        this.ws.send(JSON.stringify(request));
    }

    updateStats(tradeResult) {
        if (tradeResult.win) {
            this.wins++;
            this.consecutiveLosses = 0;
            this.currentStake = this.roundStake(this.config.initialStake);
            this.lastResult = 'win';
        } else {
            this.consecutiveLosses++;
            this.currentStake = this.roundStake(this.currentStake * this.config.martingaleMultiplier);
            this.lastResult = 'loss';
        }

        this.totalTrades++;
        this.totalProfit += tradeResult.profit;

        // Add to trade history
        this.tradeHistory.unshift({
            time: new Date(),
            stake: tradeResult.stake,
            result: tradeResult.win ? 'win' : 'loss',
            profit: tradeResult.profit
        });

        // Keep only last 50 trades in history
        if (this.tradeHistory.length > 50) {
            this.tradeHistory.pop();
        }

        // Update dashboard
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

        // Check stop conditions
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

    getLeastFrequentDigit() {
        let minFreq = Math.min(...this.digitFrequency);
        let leastFrequentDigits = this.digitFrequency
            .map((freq, digit) => ({ freq, digit }))
            .filter(item => item.freq === minFreq)
            .map(item => item.digit);
        
        // If multiple digits have the same minimum frequency, choose randomly among them
        return leastFrequentDigits[Math.floor(Math.random() * leastFrequentDigits.length)];
    }

    getRandomDigit() {
        return Math.floor(Math.random() * 10);
    }

    async executeTrade() {
        if (!this.isRunning) return;

        // Update digit frequency with the last digit
        if (this.lastDigit !== null) {
            this.digitFrequency[this.lastDigit]++;
        }

        // Select barrier based on strategy
        let selectedDigit;
        if (this.lastResult === 'loss') {
            // After a loss, use the least frequent digit
            selectedDigit = this.getLeastFrequentDigit();
        } else {
            // After a win or at start, use random digit
            selectedDigit = this.getRandomDigit();
        }

        try {
            // Send proposal request
            this.ws.send(JSON.stringify({
                proposal: 1,
                amount: this.currentStake.toString(),
                basis: "stake",
                contract_type: "DIGITDIFF",
                currency: "USD",
                duration: 1,
                duration_unit: "t",
                symbol: "R_25",
                barrier: selectedDigit.toString()
            }));
        } catch (error) {
            console.error('Trade execution error:', error);
            this.stop();
        }
    }

    handleMessage(message) {
        try {
            const data = JSON.parse(typeof message === 'string' ? message : message.toString());

            if (data.msg_type === 'proposal') {
                if (this.isRunning && data.proposal) {
                    this.ws.send(JSON.stringify({
                        buy: data.proposal.id,
                        price: data.proposal.ask_price
                    }));
                }
            }
            else if (data.msg_type === 'buy') {
                if (data.buy) {
                    this.currentContractId = data.buy.contract_id;
                }
            }
            else if (data.msg_type === 'tick') {
                if (data.tick && data.tick.quote) {
                    this.lastDigit = parseInt(data.tick.quote.toString().slice(-1));
                }
            }
            else if (data.msg_type === 'proposal_open_contract') {
                const contract = data.proposal_open_contract;
                if (contract && contract.is_sold) {
                    const profit = parseFloat(contract.profit);
                    const win = profit > 0;

                    this.updateStats({
                        stake: this.currentStake,
                        profit: profit,
                        win: win
                    });

                    // Add small delay before next trade
                    setTimeout(() => {
                        if (this.isRunning) {
                            this.executeTrade();
                        }
                    }, 1000);
                }
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    }
}

// Export the bot class
module.exports = MetroDiffer;
export default MetroDiffer; 