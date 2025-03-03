class AlienRiseFall {
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
        this.currentDirection = null;
        this.hasOpenContract = false;
        this.lastPrice = null;
        this.trendWindow = 10; // Reduced from 15 for faster analysis
        this.rsiPeriod = 7; // Reduced from 14 for faster response
        this.lastTradeResult = null;
        this.waitingForTrend = false;
        this.trendConfirmationCount = 0;
        this.pendingProposal = false;
        this.currentProposalId = null;
        this.lastContractId = null;
        this.tradeInProgress = false;
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
        this.unsubscribeFromTicks();
        this.hasOpenContract = false;
    }

    async subscribeToTicks() {
        try {
            this.ws.send(JSON.stringify({
                ticks: "R_10",
                subscribe: 1
            }));

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
        this.ws.send(JSON.stringify({
            forget_all: ["ticks", "proposal_open_contract"]
        }));
    }

    updateStats(tradeResult) {
        if (tradeResult.win) {
            this.wins++;
            this.consecutiveLosses = 0;
            this.currentStake = this.roundStake(this.config.initialStake);
            this.waitingForTrend = false;
            this.lastTradeResult = 'win';
        } else {
            this.consecutiveLosses++;
            this.currentStake = this.roundStake(this.currentStake * this.config.martingaleMultiplier);
            this.waitingForTrend = true;
            this.trendConfirmationCount = 0;
            this.lastTradeResult = 'loss';
        }

        this.totalTrades++;
        this.totalProfit = this.roundStake(this.totalProfit + tradeResult.profit);

        this.tradeHistory.unshift({
            time: new Date(),
            stake: tradeResult.stake,
            result: tradeResult.win ? 'win' : 'loss',
            profit: tradeResult.profit,
            type: this.currentDirection === 'rise' ? 'CALL' : 'PUT'
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
                currentMode: this.waitingForTrend ? 'ANALYZING TREND' : (this.currentDirection ? this.currentDirection.toUpperCase() : 'READY')
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

    calculateRSI(prices) {
        if (prices.length < this.rsiPeriod + 1) return 50;

        let gains = 0;
        let losses = 0;

        for (let i = 1; i <= this.rsiPeriod; i++) {
            const difference = prices[i - 1] - prices[i];
            if (difference >= 0) {
                gains += difference;
            } else {
                losses -= difference;
            }
        }

        const averageGain = gains / this.rsiPeriod;
        const averageLoss = losses / this.rsiPeriod;
        
        if (averageLoss === 0) return 100;
        
        const rs = averageGain / averageLoss;
        return 100 - (100 / (1 + rs));
    }

    calculateEMA(prices, period) {
        if (prices.length < period) return null;
        
        const multiplier = 2 / (period + 1);
        let ema = prices[prices.length - 1];
        
        for (let i = prices.length - 2; i >= 0; i--) {
            ema = (prices[i] - ema) * multiplier + ema;
        }
        
        return ema;
    }

    calculateTrendStrength(prices) {
        if (prices.length < 3) return { direction: null, strength: 0 };

        const shortTrend = prices[0] - prices[2];
        const mediumTrend = prices.length > 5 ? prices[0] - prices[5] : shortTrend;
        
        // Calculate trend consistency
        let consistentMoves = 0;
        for (let i = 1; i < prices.length; i++) {
            if ((shortTrend > 0 && prices[i-1] > prices[i]) ||
                (shortTrend < 0 && prices[i-1] < prices[i])) {
                consistentMoves++;
            }
        }

        const consistency = consistentMoves / (prices.length - 1);
        const strength = Math.abs(shortTrend) * consistency;
        const direction = shortTrend > 0 ? 'rise' : 'fall';

        return {
            direction,
            strength,
            consistency
        };
    }

    analyzeMarket() {
        if (this.priceHistory.length < this.trendWindow) {
            return null;
        }

        const recentPrices = this.priceHistory.slice(0, this.trendWindow);
        const rsi = this.calculateRSI(recentPrices);
        const trend = this.calculateTrendStrength(recentPrices);

        // After a loss, wait for stronger trend confirmation
        if (this.waitingForTrend) {
            if (trend.consistency > 0.7) {
                this.trendConfirmationCount++;
                if (this.trendConfirmationCount >= 2) { // Need 2 consecutive strong trends
                    this.waitingForTrend = false;
                    return trend.direction;
                }
            } else {
                this.trendConfirmationCount = 0;
            }
            return null;
        }

        // Normal trading conditions
        if (trend.consistency > 0.6) {
            return trend.direction;
        }

        // RSI based trading when trend is not clear
        if (rsi < 30) return 'rise';
        if (rsi > 70) return 'fall';

        return null;
    }

    executeTrade() {
        if (!this.isRunning || this.hasOpenContract || this.pendingProposal || this.tradeInProgress) {
            return;
        }

        const direction = this.analyzeMarket();
        if (!direction) {
            if (this.isRunning && !this.hasOpenContract && !this.pendingProposal) {
                setTimeout(() => this.executeTrade(), 500);
            }
            return;
        }

        this.currentDirection = direction;
        const contractType = direction === 'rise' ? 'CALL' : 'PUT';

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
                duration: 5,
                duration_unit: "t",
                symbol: "R_10"
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
                    this.lastPrice = price;
                    
                    this.priceHistory.unshift(price);
                    if (this.priceHistory.length > Math.max(this.trendWindow, this.rsiPeriod)) {
                        this.priceHistory.pop();
                    }

                    if (!this.hasOpenContract && !this.pendingProposal && this.priceHistory.length >= this.trendWindow) {
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

                        // Add delay after trade completion
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
module.exports = AlienRiseFall;
export default AlienRiseFall; 