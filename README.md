# NexmoBot

![feedbot](https://user-images.githubusercontent.com/1238468/28156938-a2b39634-67ac-11e7-9567-17f9d00e900e.png)

### Prerequisites

- Node 7.4.0
- Redis 3.2.x
- Yarn
- [API.ai](https://api.ai/) account
- [Pusher](https://pusher.com/) application
- [Nexmo](https://nexmo.com) account & virtual number

### Prerequisites (development)

- Ngrok or similar
- Nexmo CLI

### Setup

```sh
$ cp .env.example .env
$ yarn install
```

Edit the variables in `.env` to match your credentials and phone number.

For development start `ngrok` and point your number to your number to your endpoint:

```sh
$ nexmo link:sms 447700900000 https://example.ngrok.io/sms
```

### Run

```sh
$ npm start
```

## Contributing

Contributions are welcome, please follow [GitHub Flow](https://guides.github.com/introduction/flow/index.html)
