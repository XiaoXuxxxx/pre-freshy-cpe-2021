import nextConnect from 'next-connect'
import middleware from '@/middlewares/middleware'

import StockHistory from '@/models/stock-history'
import moment from 'moment'

const handler = nextConnect()

const STOCK_SYMBOL_LIST = ['MINT', 'ECML', 'HCA', 'LING', 'MALP']
const OPEN_MARKET_TIME = { hour: 9, minute: 0, second: 0 }
const CLOSE_MARKET_TIME = { hour: 22, minute: 0, second: 0 }

handler
  .use(middleware)

/**
 * @method GET
 * @endpoint /api/stock
 * @description Get current price of stocks
 * 
 * @require User authentication
 */
handler.get(async (req, res) => {
  const openTime = moment().set(OPEN_MARKET_TIME)
  const closeTime = moment().set(CLOSE_MARKET_TIME)
  const subtract = +!(moment().isBetween(openTime, moment().endOf('day')))

  const closedStockHistory = await getStockHistory(subtract + 1)
  const latestStockHistory = await getStockHistory(subtract)

  const stocks = latestStockHistory.map(stock => {
    return { ...(stock?._doc ?? stock), changed: stock.rate - closedStockHistory.find(e => e.symbol == stock.symbol).rate }
  })

  res.status(200)
    .json({
      sucesss: !!stocks,
      data: {
        stocks: stocks,
        is_market_opened: (moment().isBetween(openTime, closeTime))
      },
      timestamp: new Date()
    })
})

const getStockHistory = async (subtraction) => {
  let stockHistory = await StockHistory
    .find({ date: moment().startOf('day').subtract(subtraction, 'day').toDate() })
    .select('-_id symbol rate')
    .lean()
    .exec()

  if (stockHistory.length < STOCK_SYMBOL_LIST.length) {
    stockHistory = await includeMissingStockHistory(stockHistory, subtraction)
  }

  return stockHistory
}

const includeMissingStockHistory = async (stockHistory, subtraction) => {
  const result = []
  const existedStockSymbols = stockHistory.map(stock => stock.symbol)
  const missingStockSymbols = STOCK_SYMBOL_LIST.filter(symbol => !existedStockSymbols.includes(symbol))

  await Promise.all(missingStockSymbols.map(async (symbol) => {
    const foundOldStockHistory = await StockHistory
      .findOne({ symbol: symbol })
      .sort({ date: -1 })
      .select('-_id rate')
      .lean()
      .exec()

    const newStockHistory = await StockHistory.create({
      symbol,
      rate: foundOldStockHistory?.rate || 1,
      date: moment().startOf('day').subtract(subtraction, 'day').toDate(),
    })

    result.push(newStockHistory)
  }))

  return [...result, ...stockHistory]
}

export default handler
