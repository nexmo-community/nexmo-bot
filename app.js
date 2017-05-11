import express from 'express'
import bodyParser from 'body-parser'
import env from 'node-env-file'
import apiai from 'apiai'
import Nexmo from 'nexmo'
import Pusher from 'pusher'
import redis from 'redis'

// Load the env file
try {
  env(`${__dirname}/.env`)
} catch (error) {
  console.log(error)
}

const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379/0'
})

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

const pushMessage = function(message, number) {
  pusher.trigger('message', 'new', {
    message,
    number,
  })
}

const tryGreetingWithCnam = function(number, fallback) {
  client.hget('numbers', number, function(err, result) {
    if (result) {
      result = JSON.parse(result)
      if (result.ni) {
        console.log(`Already have information about ${number}`)
        postNiPrePushMessage(result.ni, number, fallback)
      } else {
        performNILookup(number, fallback)
      }
    } else {
      performNILookup(number, fallback)
    }
  })
}

const performNILookup = function(number, fallback) {
  console.log(`Getting information about ${number}`);
  nexmo.numberInsight.get({level: 'standard', number: number, cnam: true}, function (error, payload) {
    if (error) {
      console.log('Error with NI')
    } else {
      console.log(`Got information about ${number}`);
      postNiPrePushMessage(payload, number, fallback)
      updateNumberWithNI(number, payload)
    }
  })
}

const postNiPrePushMessage = function(ni, number, fallback) {
  if (ni && ni.first_name && ni.last_name) {
    pushMessage(`Hello ${ni.first_name} ${ni.last_name.slice(0, 1)}!`, number)
  } else {
    pushMessage(fallback, number)
  }
}

const updateNumberWithNI = function(number, NIPayload = {}) {
  client.hget('numbers', number, function(err, result) {
    var payload = {}

    if (result) {
      payload = {
        ni: NIPayload,
        ...JSON.parse(result),
      }
    }

    client.hset('numbers', number, JSON.stringify(payload))
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
          tryGreetingWithCnam(number, response.result.fulfillment.speech)
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

const issueCoupon = function(inboundNumberFrom, inboundNumberTo, state = {}) {
  const text = process.env.COUPON_TEXT.replace('{COUPON}', process.env.COUPON)

  const outboundNumberFrom = inboundNumberTo
  const outboundNumberTo = inboundNumberFrom

  console.log(`Sending a coupon from ${outboundNumberFrom} to ${outboundNumberTo}`);

  nexmo.message.sendSms(outboundNumberFrom, outboundNumberTo, text, function(err, response) {
    if (err) {
      console.log("SMS could not be sent!");
      console.log(err);
    } else {
      if (response.messages[0].status == '0') {
        console.log('Send success');
        const payload = {
          ...state,
          coupon_issued: true
        }

        client.hset('numbers', outboundNumberTo, JSON.stringify(payload))
      } else {
        console.log('Non 0 status from Nexmo');
        console.log(response);
      }
    }
  });
}

const tryIssueCoupon = function(inboundNumberFrom, inboundNumberTo) {
  if(process.env.COUPON && process.env.COUPON_TEXT) {
    client.hget('numbers', inboundNumberFrom, function(err, result) {
      if (result) {
        const payload = JSON.parse(result)
        if(!payload.coupon_issued) {
          issueCoupon(inboundNumberFrom, inboundNumberTo, payload)
        } else {
          console.log(`Coupon already issued for ${inboundNumberFrom}`);
        }
      } else {
        issueCoupon(inboundNumberFrom, inboundNumberTo)
      }
    })
  }
}

app.post('/sms', (req, res) => {
  performBotAction(req.body.text, req.body.msisdn)
  tryIssueCoupon(req.body.msisdn, req.body.to)
  res.sendStatus(200)
})

app.get('/sms', (req, res) => {
  performBotAction(req.query.text, req.query.msisdn)
  tryIssueCoupon(req.query.msisdn, req.query.to)
  res.sendStatus(200)
})

app.get('/', (req, res) => {
  res.render('index', {
    pusher_key: process.env.PUSHER_KEY,
    nexmo_number: '+' + process.env.NEXMO_NUMBER,
  })
})

app.listen(process.env.PORT || 3000, () => {
  console.log('Nexmo bot ready!')
})
