class RiseFallBot {
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
        this.trendWindow = 15;
        this.rsiPeriod = 14;
        this.priceMovements = [];
        this.trendStrength = 0;
        this.lastTradeTime = null;
        this.volumeProfile = [];
        this.lastSignalStrength = 0;
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
            this.trendStrength = Math.min(this.trendStrength + 1, 3);
        } else {
            this.consecutiveLosses++;
            this.currentStake = this.roundStake(this.currentStake * this.config.martingaleMultiplier);
            this.trendStrength = Math.max(this.trendStrength - 1, -3);
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
                currentMode: this.currentDirection ? this.currentDirection.toUpperCase() : 'ANALYZING'
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

    calculateMACD(prices) {
        const fast = 12;
        const slow = 26;
        const signal = 9;

        const fastEMA = this.calculateEMA(prices, fast);
        const slowEMA = this.calculateEMA(prices, slow);
        
        if (!fastEMA || !slowEMA) return { macd: 0, signal: 0, histogram: 0 };
        
        const macd = fastEMA - slowEMA;
        const signalLine = this.calculateEMA([...prices, macd], signal) || 0;
        const histogram = macd - signalLine;
        
        return { macd, signal: signalLine, histogram };
    }

    detectPricePattern(prices) {
        if (prices.length < 5) return null;
        
        const recentPrices = prices.slice(0, 5);
        const diffs = [];
        
        for (let i = 1; i < recentPrices.length; i++) {
            diffs.push(recentPrices[i-1] - recentPrices[i]);
        }
        
        // Detect potential reversal patterns
        const isDoubleTop = diffs[0] < 0 && diffs[1] > 0 && diffs[2] < 0 && diffs[3] > 0;
        const isDoubleBottom = diffs[0] > 0 && diffs[1] < 0 && diffs[2] > 0 && diffs[3] < 0;
        
        if (isDoubleTop) return 'fall';
        if (isDoubleBottom) return 'rise';
        
        return null;
    }

    calculateVolatility(prices) {
        if (prices.length < 2) return 0;
        
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i-1] - prices[i]) / prices[i]);
        }
        
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
        
        return Math.sqrt(variance);
    }

    analyzeMarket() {
        if (this.priceHistory.length < this.trendWindow) {
            console.log('Waiting for more price data...', this.priceHistory.length, '/', this.trendWindow);
            return null;
        }

        const recentPrices = this.priceHistory.slice(0, this.trendWindow);
        
        // Enhanced momentum analysis
        const shortMomentum = recentPrices[0] - recentPrices[3];
        const mediumMomentum = recentPrices[0] - recentPrices[7];
        const longMomentum = recentPrices[0] - recentPrices[14];

        // Calculate RSI
        const rsi = this.calculateRSI(recentPrices);
        
        // Calculate MACD
        const macd = this.calculateMACD(recentPrices);
        
        // Calculate volatility
        const volatility = this.calculateVolatility(recentPrices);
        
        // Detect price patterns
        const pattern = this.detectPricePattern(recentPrices);
        
        // Track price movements with more history
        const currentMovement = recentPrices[0] - recentPrices[1];
        this.priceMovements.unshift(currentMovement);
        if (this.priceMovements.length > 5) this.priceMovements.pop();
        
        // Enhanced trend consistency calculation
        const trendConsistency = this.priceMovements.reduce((count, movement) => {
            if ((this.currentDirection === 'rise' && movement > 0) ||
                (this.currentDirection === 'fall' && movement < 0)) {
                return count + 1;
            }
            return count;
        }, 0) / this.priceMovements.length;

        // Volume profile analysis (simulated with price movements)
        this.volumeProfile.unshift(Math.abs(currentMovement));
        if (this.volumeProfile.length > 10) this.volumeProfile.pop();
        const volumeStrength = this.volumeProfile.reduce((a, b) => a + b, 0) / this.volumeProfile.length;

        const marketState = {
            shortMomentum,
            mediumMomentum,
            longMomentum,
            rsi,
            macd,
            volatility,
            trendConsistency,
            volumeStrength,
            pattern,
            currentPrice: recentPrices[0]
        };

        console.log('Market Analysis:', marketState);

        let signal = null;
        let signalStrength = 0;

        // Strong trend signals with multiple confirmations
        if (pattern) {
            signalStrength += 2;
            signal = pattern;
        }

        // Momentum-based signals
        if (shortMomentum > 0 && mediumMomentum > 0 && longMomentum > 0) {
            signalStrength += 1;
            signal = 'rise';
        } else if (shortMomentum < 0 && mediumMomentum < 0 && longMomentum < 0) {
            signalStrength += 1;
            signal = 'fall';
        }

        // RSI signals
        if (rsi < 30) {
            signalStrength += (signal === 'rise' ? 1 : -1);
        } else if (rsi > 70) {
            signalStrength += (signal === 'fall' ? 1 : -1);
        }

        // MACD signals
        if (macd.histogram > 0 && macd.macd > 0) {
            signalStrength += (signal === 'rise' ? 1 : -1);
        } else if (macd.histogram < 0 && macd.macd < 0) {
            signalStrength += (signal === 'fall' ? 1 : -1);
        }

        // Trend continuation
        if (this.currentDirection && trendConsistency > 0.7) {
            signalStrength += (signal === this.currentDirection ? 1 : -1);
        }

        // Volume confirmation
        if (volumeStrength > 0.5) {
            signalStrength += 0.5;
        }

        // Require stronger confirmation for volatile markets
        const requiredStrength = volatility > 0.001 ? 3 : 2;

        // Only generate signal if strength meets threshold
        if (Math.abs(signalStrength) < requiredStrength) {
            signal = null;
        }

        if (signal) {
            console.log(`Signal generated: ${signal.toUpperCase()} (Strength: ${signalStrength.toFixed(1)})`);
            this.lastSignalStrength = signalStrength;
        }

        return signal;
    }

    executeTrade() {
        if (!this.isRunning || this.hasOpenContract || this.pendingProposal || this.tradeInProgress) {
            console.log('Skip trade execution:', 
                !this.isRunning ? 'Bot not running' : 
                this.hasOpenContract ? 'Has open contract' :
                this.pendingProposal ? 'Pending proposal' :
                'Trade in progress');
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
            
            this.lastTradeTime = new Date();
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
            console.log('Received message:', data.msg_type);

            if (data.msg_type === 'proposal') {
                if (this.isRunning && data.proposal && !this.hasOpenContract && this.pendingProposal) {
                    if (!this.currentProposalId) {
                        console.log('Buying contract:', data.proposal.id);
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
                    console.log('Contract purchased:', data.buy.contract_id);
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
                        console.log('Contract result:', contract.status);
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
module.exports = RiseFallBot;
export default RiseFallBot;
