import express from 'express'
import bodyParser from 'body-parser'
import env from 'node-env-file'
import apiai from 'apiai'
import Nexmo from 'nexmo'
import Pusher from 'pusher'

// Load the env file
try {
  env(`${__dirname}/.env`)
} catch (error) {
  console.log(error)
}

const app = express()
const bot = apiai(process.env.API_AI_CLIENT_TOKEN)

const nexmo = new Nexmo({
  apiKey: process.env.NEXMO_API_KEY,
  apiSecret: process.env.NEXMO_API_SECRET,
})

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  encrypted: true
})

app.use(bodyParser.json())
app.use(express.static('public'))
app.set('view engine', 'ejs')

const pushMessage = function (message, number) {
  pusher.trigger('message', 'new', {
    message,
    number,
  })
}

const tryGreetingWithCnam = function (number) {
  nexmo.numberInsight.get({level: 'standard', number: number, cnam: true}, function (error, payload) {
    if (error) {
      console.log('Error with NI')
    } else {
      if(payload && payload.first_name && payload.last_name) {
        pushMessage(`Hello ${payload.first_name} ${payload.last_name.slice(0, 1)}!`, number)
      } else {
        pushMessage(`Hello!`, number)
      }
    }
  })
}

const performBotAction = function(input, number) {
  console.log(`GOT: "${input}" from ${number}`)

  const botRequest = bot.textRequest(input, {
    sessionId: number,
  })

  botRequest.on('response', function(response) {
    console.log(`BOT RESPONSE`)
    console.log(response)

    switch (response.result.action) {
      case 'smalltalk.greetings.hello':
        if (process.env.CNAM_ENABLED && process.env.CNAM_ENABLED === 'true') {
          tryGreetingWithCnam(number)
        } else {
          pushMessage(response.result.fulfillment.speech, number)
        }
        break
      default:
        pushMessage(response.result.fulfillment.speech, number)
    }
  })

  botRequest.on('error', function(error) {
    console.log(error)
  })

  botRequest.end()
}

app.post('/sms', (req, res) => {
  performBotAction(req.body.text, req.body.msisdn)
  res.sendStatus(200)
})

app.get('/sms', (req, res) => {
  performBotAction(req.query.text, req.query.msisdn)
  res.sendStatus(200)
})

app.get('/', (req, res) => {
  res.render('index', {
    pusher_key: process.env.PUSHER_KEY,
    nexmo_number: '+' + process.env.NEXMO_NUMBER,
  })
})

app.listen(3000, () => {
  console.log('Nexmo bot ready!')
})
