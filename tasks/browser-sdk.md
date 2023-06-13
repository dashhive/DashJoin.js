# Overview
The following tasks can be completed concurrently (and almost 100%) independantly from the backend tasks that are currently in progress. These are browser tasks that are made with modularity in mind. The SDK described below will be a data-driven one where we feed a json configuration to drive the integration.

# The *Big picture*
We need a small Browser-based library that can take advantage of `dashcore-lib`. If you feel `DashTx.js` is a better option, or you're more comfortable with it, that's fine too.

## Browser side functionality
The goal of the `DashJoin.js` is to allow the user the ability to have their wallet info in the browser and not on a server anywhere. This means that a private key or WIF **CANNOT** be transmitted to the server portion. Instead, the browser portion will create and sign data then submit that payload to the server. 

This gives us the benefit of allowing the server to handle sensitive PII in a way that is cryptographically secure since the server has no idea how to sign your transactions without your private key. It is this proxy methodology that opens up CoinJoin to potentially many different use-cases and platforms. Imagine running CoinJoin purely through a couple of `curl` commands. That's not part of the scope, but since we're using https as a bridge, the possibility is there.

# Terminology
I say `object` but really it can be a class, or an object with methods and properties. Anyway you choose, just do what feels right and allows for flexibility. Make sure to modularize your code. If you've seen @coolAJ86's code where he does something like this:
```js
let Lib = {};
module.exports = Lib;

Lib.load_wif = async function(file){
  // ... code here 
}
```
... that would be a perfect pattern to use for all components described in this document.

## Create a `wallet object`
- [ ] Ability to load a private key as a WIF or any format that `dashcore-lib` uses.
  - See `node_modules/@dashevo/dashcore-lib/lib/privatekey.js`
- [ ] Can create collateral transactions
  - this is partially done. ask @wmerfalen for more details
  - Example code is in `src/demodata.js`
    - search for `makeCollateralTxn()`
- [ ] Can sign/serialize transactions
  - [ ] Must be able to take the output and feed it to the RPC `sendrawtransaction` or `decoderawtransaction`
    - Look at `makeCollateralTxn()` and look for anywhere where it says `tx.uncheckedSerialize()` or `tx.serialize()`. The former will serialize it even if there are errors, while the latter will throw exceptions.

## Create a `configuration object`
We will need the library to communicate with an origin server. The origin server and other configuration options need to be configured. Create a configuration object which can be fed to the `wallet object` and the `Server object`
- [ ] Create a config loader that will accept a json file
  - [ ] The JSON schema doesn't have to be exact, but it should accept the following things
    - `origin_server`: this will be a fully-qualified domain name. this is the backend that you will be communicating with
    - `api.version`: depending on where we're at with the code base, this should be one of:
      - `alpha`
      - `beta`
      - `v1`
      - `vN` where N is a future version
    - `api.user_agent`: Have this pull from the package.json. I believe @coolaj86 has some cool techniques to make a nifty looking and informative user agent string. Just for logging and auditing purposes mostly.
    - `network`: this should be one of the following:
      - `testnet`
      - `regtest`
      - `devnet`
      - `mainnet` or `livenet`
        - make sure it can accept one or the other
    - `coin_join.rounds`: integer. how many rounds the user would like
    - `coin_join.denomination`: see the dash core docs, but this has to be one of the standard denominations in `satoshis`.
    - `coin_join.txn_pool`: this should be an array of signed transaction inputs and outputs. this can be blank for now until we flesh out the rest of the API

## Create a `server object`
The wallet and configuration will need to have access to a server library that can understand how to communicate with a backend server.
The server object needs to communicate over https (bonus: if you can get websockets working too, that would be awesome!)
- [ ] Create a server object that creates urls based on configuration properties like:
  - `origin_server`, `network`, and `api.version`
- [ ] Urls will follow a pattern:
  - `/api/${VERSION}/<SECTION>/<OBJECT>/[IDENTIFIER]?query=param....`
    - example: `POST /api/alpha/matchmaking/session`
      - All `POST/PUT` must have a json content type
- [ ] All URL's will respond with JSON. so make a JSON decoding method
  - Some libraries will allow you to set the base url and all you have to pass in is the URI.
    - [ ] Make that happen ^. Set the base url to `origin_server` and replace `${VERSION}` with `api.version`
- [ ] Pass in a `X-CoinJoin-UserAgent` header
  - value is `api.user_agent` (see above)
- [ ] Each client will need a custom header to send, but only after you've hit the `/auth/create` route described below
  - The header key should be: `X-CoinJoin-SessionID`
  - This value will be a unique UUID string that is created once you authenticate (don't worry, there's no user/pw login lol)
- [ ] The first route to hit before any other URL is the `auth` route:
  - `POST /api/${VERSION}/auth/create`
   ```json
    {
      network: "testnet|devnet|regtest|mainnet|livenet",
      coin_join: { pass in the entire coin_join object here },
      dsi: { ... TBD .. },
      dsa: { pass in return from makeCollateralTxn() here },
    }
    ```
  - The server will respond with a 200 and a response object
   ```json
    {
      status: <string>,
      status_code: <integral string relating to status>,
      session_id: <integer>
      error: [string] .. only present if error
      error_code: [integer] .. only present if error
    }
    ```
- [ ] Take the `session_id` and use it to populate `X-CoinJoin-SessionID` header
- [ ] You are now ready to matchmake with other participants
  - `POST /api/${VERSION}/matchmaking/session`
  ```json
    {
      inputs: [],
      collateral: [],
      outputs: [],
    }
  ```
    - Must have `X-CoinJoin-SessionID` header in request
    - This portion of the server SDK is a work in progress.
    - each key/value pair is TBD
- [ ] It's possible to get an updated status:
  - `GET /api/${VERSION}/matchmaking/session/${SESSION_ID}`
    - `${SESSION_ID}` is the same value as what you place in `X-CoinJoin-SessionID`
    - this is the only route where you have to pass `X-CoinJoin-SessionID` in the URL.
      - if `X-CoinJoin-SessionID` is present in the headers, it will be ignored and ${SESSION_ID} will be honored instead
    - This route should respond with something like:
  ```json
    {
      stage: <see below>,
      status: <string>,
      status_code: <integral representation of status>
      error: // if errors
      error_code: // if errors
    }
  ```
  - It is safe and most likely preferable to display the `status` to the user, but always sanitize. Never trust even integral inputs (parse them using parseInt())
  - `stage` is an integer that corresponds to the numbers `0` through `11` in the link provided here: [dash-features-coinjoin.html#coinjoin-processing](https://docs.dash.org/projects/core/en/stable/docs/guide/dash-features-coinjoin.html#coinjoin-processing)
- [ ] Canceling a session that's in progress is theoretically possible, but it will cause the masternode to charge you a fee. That's what the collateral inputs are for. That part of the SDK is TBD

## Upcoming features TBD:
- [ ] continuously check the `/matchmaking/session/${SESSION_ID}` route
- [ ] start a websocket that connects to the origin server
  - [ ] make sure it upgrades fully to the most secure proto (WSS, I believe)
- [ ] A polyfill for the websocket API would be to continuously poll `/matchmaking/session/${SESSION_ID}`
- [ ] A rate-limiting middleware will be built into the express server. Be prepared to handle:
  - [ ] Rate limit hit. HTTP status `429 (Too Many Requests)`
    - [ ] Might change, but: anything over 120 requests per minute will be rate limited
      - rate limit punishment will be no requests can go through until 10 seconds after the rate limit was hit



# Author(s)
William Merfalen [github/wmerfalen](https://github.com/wmerfalen)

# Date published
`Tue Jun 13 15:25:52 UTC 2023`
