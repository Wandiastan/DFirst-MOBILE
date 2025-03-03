class SafeOverBot {
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
        this.digitHistory = []; // Store recent digits for pattern analysis
        this.currentBarrier = 0; // Fixed barrier at 0 for maximum safety
        this.minConsecutiveZeros = 2; // Minimum consecutive zeros before trading
        this.consecutiveZeros = 0;
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
        await this.subscribeToTicks();
        this.executeTrade();
    }

    stop() {
        this.isRunning = false;
        this.unsubscribeFromTicks();
    }

    async subscribeToTicks() {
        try {
            // Subscribe to ticks for Volatility 10 (less volatile)
            this.ws.send(JSON.stringify({
                ticks: "R_10",
                subscribe: 1
            }));

            // Subscribe to contract updates
            this.ws.send(JSON.stringify({
                proposal_open_contract: 1,
                subscribe: 1
            }));

            console.log('Subscribed to R_10 ticks and contract updates');
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
        } else {
            this.consecutiveLosses++;
            this.currentStake = this.roundStake(this.currentStake * this.config.martingaleMultiplier);
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

    analyzePattern() {
        // Always trade, no pattern analysis
        return true;
    }

    async executeTrade() {
        if (!this.isRunning) return;

        // Analyze pattern to determine if we should trade
        const shouldTrade = this.analyzePattern();
        if (!shouldTrade) {
            setTimeout(() => this.executeTrade(), 1000);
            return;
        }

        try {
            // Send proposal request for digit over contract
            this.ws.send(JSON.stringify({
                proposal: 1,
                amount: this.currentStake.toString(),
                basis: "stake",
                contract_type: "DIGITOVER",
                currency: "USD",
                duration: 1,
                duration_unit: "t",
                symbol: "R_10",
                barrier: this.currentBarrier.toString()
            }));
        } catch (error) {
            console.error('Trade execution error:', error);
            this.stop();
        }
    }

    handleMessage(message) {
        try {
            const data = JSON.parse(typeof message === 'string' ? message : message.toString());
            console.log('Received message:', data.msg_type);

            if (data.msg_type === 'proposal') {
                if (this.isRunning && data.proposal) {
                    console.log('Buying contract with proposal:', data.proposal.id);
                    this.ws.send(JSON.stringify({
                        buy: data.proposal.id,
                        price: data.proposal.ask_price
                    }));
                }
            }
            else if (data.msg_type === 'buy') {
                if (data.buy) {
                    console.log('Contract purchased:', data.buy.contract_id);
                    this.currentContractId = data.buy.contract_id;
                }
            }
            else if (data.msg_type === 'tick') {
                if (data.tick && data.tick.quote) {
                    const digit = parseInt(data.tick.quote.toString().slice(-1));
                    this.lastDigit = digit;
                    
                    // Update digit history for pattern analysis
                    this.digitHistory.unshift(digit);
                    if (this.digitHistory.length > 10) {
                        this.digitHistory.pop();
                    }
                    
                    console.log('Current digit:', digit, 'Consecutive zeros:', this.consecutiveZeros);
                }
            }
            else if (data.msg_type === 'proposal_open_contract') {
                const contract = data.proposal_open_contract;
                if (contract && contract.is_sold) {
                    console.log('Contract result:', contract.status);
                    const profit = parseFloat(contract.profit);
                    const win = profit > 0;

                    this.updateStats({
                        stake: this.currentStake,
                        profit: profit,
                        win: win
                    });

                    // Execute next trade after a short delay
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
module.exports = SafeOverBot;
export default SafeOverBot; 