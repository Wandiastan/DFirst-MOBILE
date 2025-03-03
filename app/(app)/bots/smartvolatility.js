class SmartVolatility {
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
        this.volatilityWindow = 10;
        this.atrPeriod = 5;
        this.hasOpenContract = false;
        this.currentDuration = 1;
        this.pendingProposal = false;
        this.currentProposalId = null;
        this.lastContractId = null;
        this.tradeInProgress = false;
        this.lastVolatility = null;
        this.volatilityThreshold = 0.0015;
        this.lastTradeType = null;
        this.lastTradeTime = null;
        this.recoveryMode = false;
        this.tradeTimeout = null;
        this.messageQueue = [];
        this.processingMessage = false;
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
        console.log('Bot started, waiting for price data...');
    }

    stop() {
        this.isRunning = false;
        clearTimeout(this.tradeTimeout);
        this.unsubscribeFromTicks();
        this.hasOpenContract = false;
        this.pendingProposal = false;
        this.tradeInProgress = false;
        this.messageQueue = [];
        this.processingMessage = false;
    }

    async subscribeToTicks() {
        try {
            this.ws.send(JSON.stringify({
                ticks: "R_75",
                subscribe: 1
            }));

            this.ws.send(JSON.stringify({
                proposal_open_contract: 1,
                subscribe: 1
            }));

            console.log('Subscribed to R_75 ticks and contract updates');
        } catch (error) {
            console.error('Error subscribing:', error);
        }
    }

    unsubscribeFromTicks() {
        this.ws.send(JSON.stringify({
            forget_all: ["ticks", "proposal_open_contract"]
        }));
    }

    calculateATR() {
        if (this.priceHistory.length < this.atrPeriod) return null;

        let atr = 0;
        for (let i = 1; i < this.atrPeriod; i++) {
            const high = Math.max(this.priceHistory[i], this.priceHistory[i-1]);
            const low = Math.min(this.priceHistory[i], this.priceHistory[i-1]);
            atr += (high - low);
        }
        return atr / this.atrPeriod;
    }

    adjustStakeByVolatility(volatility) {
        if (!volatility) return this.currentStake;

        let adjustedStake = this.currentStake;
        if (volatility > this.volatilityThreshold * 1.5) {
            // High volatility - reduce stake
            adjustedStake = this.roundStake(this.currentStake * 0.8);
        } else if (volatility < this.volatilityThreshold * 0.5) {
            // Low volatility - increase stake
            adjustedStake = this.roundStake(this.currentStake * 1.2);
        }

        // Ensure stake stays within reasonable bounds
        return Math.max(
            this.config.initialStake * 0.5,
            Math.min(adjustedStake, this.config.initialStake * 3)
        );
    }

    adjustDurationByVolatility(volatility) {
        if (!volatility) return 1;

        if (volatility > this.volatilityThreshold * 1.5) {
            return 1; // High volatility - shorter duration
        } else if (volatility < this.volatilityThreshold * 0.5) {
            return 2; // Low volatility - longer duration
        }
        return 1; // Default duration
    }

    updateStats(tradeResult) {
        if (tradeResult.win) {
            this.wins++;
            this.consecutiveLosses = 0;
            // For SmartVolatility, we use volatility-based stake adjustment instead of martingale
            this.currentStake = this.roundStake(this.adjustStakeByVolatility(this.lastVolatility) || this.config.initialStake);
        } else {
            this.consecutiveLosses++;
            // Adjust stake based on volatility after loss
            this.currentStake = this.roundStake(this.adjustStakeByVolatility(this.lastVolatility) || this.config.initialStake);
        }

        this.totalTrades++;
        this.totalProfit = this.roundStake(this.totalProfit + tradeResult.profit);

        this.tradeHistory.unshift({
            time: new Date(),
            stake: tradeResult.stake,
            result: tradeResult.win ? 'win' : 'loss',
            profit: tradeResult.profit,
            type: this.lastTradeType
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

    analyzeVolatility() {
        const atr = this.calculateATR();
        if (!atr) return null;

        this.lastVolatility = atr;
        const priceChange = Math.abs(this.priceHistory[0] - this.priceHistory[1]);
        
        if (priceChange > atr * 1.2) {
            // Significant price movement detected
            return this.priceHistory[0] > this.priceHistory[1] ? 'CALL' : 'PUT';
        }

        // Check for volatility breakout
        if (atr > this.volatilityThreshold) {
            const trend = this.priceHistory.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
            return this.priceHistory[0] > trend ? 'CALL' : 'PUT';
        }

        return null;
    }

    async executeTrade() {
        if (!this.isRunning || this.hasOpenContract || this.pendingProposal || this.tradeInProgress) {
            // Schedule next trade check
            if (this.isRunning) {
                clearTimeout(this.tradeTimeout);
                this.tradeTimeout = setTimeout(() => this.executeTrade(), 1000);
            }
            return;
        }

        // Prevent trading too frequently
        const now = Date.now();
        if (this.lastTradeTime && now - this.lastTradeTime < 2000) {
            this.tradeTimeout = setTimeout(() => this.executeTrade(), 2000);
            return;
        }

        const tradeSignal = this.analyzeVolatility();
        if (!tradeSignal) {
            if (this.isRunning) {
                clearTimeout(this.tradeTimeout);
                this.tradeTimeout = setTimeout(() => this.executeTrade(), 1000);
            }
            return;
        }

        try {
            // Reset flags before starting new trade
            this.pendingProposal = true;
            this.tradeInProgress = true;
            this.lastTradeTime = now;

            const adjustedStake = this.adjustStakeByVolatility(this.lastVolatility);
            const duration = this.adjustDurationByVolatility(this.lastVolatility);
            this.lastTradeType = tradeSignal;

            console.log('Executing trade:', tradeSignal, 'Stake:', adjustedStake, 'Duration:', duration);
            
            this.ws.send(JSON.stringify({
                proposal: 1,
                amount: adjustedStake.toString(),
                basis: "stake",
                contract_type: tradeSignal,
                currency: "USD",
                duration: duration,
                duration_unit: "t",
                symbol: "R_75"
            }));

            // Set timeout to reset flags if no response
            setTimeout(() => {
                if (this.pendingProposal) {
                    console.log('Trade proposal timeout - resetting flags');
                    this.pendingProposal = false;
                    this.tradeInProgress = false;
                    this.executeTrade();
                }
            }, 5000);

        } catch (error) {
            console.error('Trade execution error:', error);
            this.pendingProposal = false;
            this.tradeInProgress = false;
            
            // Attempt recovery
            if (this.isRunning) {
                console.log('Attempting trade recovery...');
                setTimeout(() => this.executeTrade(), 2000);
            }
        }
    }

    handleMessage(message) {
        // Add message to queue
        this.messageQueue.push(message);
        this.processMessageQueue();
    }

    async processMessageQueue() {
        if (this.processingMessage || this.messageQueue.length === 0) return;

        this.processingMessage = true;
        try {
            const message = this.messageQueue.shift();
            const data = JSON.parse(typeof message === 'string' ? message : message.toString());

            switch (data.msg_type) {
                case 'proposal':
                    if (this.isRunning && data.proposal && !this.hasOpenContract && this.pendingProposal) {
                        if (!this.currentProposalId) {
                            this.currentProposalId = data.proposal.id;
                            this.ws.send(JSON.stringify({
                                buy: data.proposal.id,
                                price: data.proposal.ask_price
                            }));
                        }
                    }
                    break;

                case 'buy':
                    if (data.buy) {
                        this.hasOpenContract = true;
                        this.pendingProposal = false;
                        this.currentProposalId = null;
                        this.lastContractId = data.buy.contract_id;
                    }
                    break;

                case 'tick':
                    if (data.tick && data.tick.quote) {
                        const price = parseFloat(data.tick.quote);
                        this.priceHistory.unshift(price);
                        
                        if (this.priceHistory.length > this.volatilityWindow) {
                            this.priceHistory.pop();
                        }

                        if (!this.hasOpenContract && !this.pendingProposal && this.priceHistory.length >= this.volatilityWindow) {
                            clearTimeout(this.tradeTimeout);
                            this.tradeTimeout = setTimeout(() => this.executeTrade(), 500);
                        }
                    }
                    break;

                case 'proposal_open_contract':
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

                            // Reset trade flags
                            this.hasOpenContract = false;
                            this.tradeInProgress = false;
                            this.lastContractId = null;
                            this.recoveryMode = false;

                            // Schedule next trade
                            if (this.isRunning) {
                                clearTimeout(this.tradeTimeout);
                                this.tradeTimeout = setTimeout(() => this.executeTrade(), 1000);
                            }
                        }
                    }
                    break;

                case 'error':
                    console.error('WebSocket error:', data.error);
                    // Reset flags on error
                    this.pendingProposal = false;
                    this.tradeInProgress = false;
                    
                    if (this.isRunning) {
                        setTimeout(() => this.executeTrade(), 2000);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
            // Reset flags on error
            this.pendingProposal = false;
            this.tradeInProgress = false;
        } finally {
            this.processingMessage = false;
            // Process next message if any
            if (this.messageQueue.length > 0) {
                this.processMessageQueue();
            }
        }
    }
}

// Export the bot class
module.exports = SmartVolatility;
export default SmartVolatility; 