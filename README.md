# DashJoin.js
A non-custodial server-side SDK that allows users to mix using DASH's CoinJoin feature.

# IN PROGRESS:
  - [ ] Parse `dsi` messages
    - TODO
  - [ ] Send `dsi` messages with correctly format
    - [ ] Send inputs
    - [ ] Send collateral
    - [ ] Send outputs

# Release Status
TBD

# Install
TBD

# Features
- Networking
	- [x] Authenticate with a Masternode
		- Status: *STABLE*
		- [x] Send `version`
		- [x] Respond to `version` with `verack`
		- [x] Respond to `ping` with `pong`
		- [x] Handle all other requests by a Masternode
      - [x] `sendheaders`
      - [x] `sendcmpct`
      - [x] `senddsq`
      - [x] `getheaders`
      - [x] `sendaddrv2`
	- [x] Transaction encoding
		- Status: *DONE*
		- Overview: A partial implementation of a Transaction is working on a fundamental level. Encoding the transaction for the purpose of creating a collateral transaction is the priority right now.
		- [x] Craft a collateral transaction from user input
			- [x] Place the encoded raw transaction into the `dsa` message
				- See: (DASH `dsa` docs)[https://docs.dash.org/projects/core/en/stable/docs/reference/p2p-network-privatesend-messages.html#dsa]
			
	- [x] Transmitting CoinJoin to a Masternode
		- Status: *IN PROGRESS*
		- Overview: `dsa` message is very close to being correct
		- [x] Send `dsa` message
			- [x] Craft a `dsa` message
				- [x] Encode collateral transactions
					- [x] Encode a single `vin` (transaction input hash - or: "outpoint")
					- [x] Create raw transaction header with this encoded `vin`
				- [x] Transmit collateral transactions
			- notes: dsa packet structure is correct, collateral tx is *ALMOST THERE*
		- [x] Parse `dssu` messages
			- Overview: Generic parsing of `dssu` works, but will need to identify other types of dssu packets. In addition, the dssu packet will likely affect logic moving forward based on things like the Message ID and Pool Status/Pool Status Update fields.
			- [x] Basic parsing of `dssu`
			- [x] Recognizing and translating opcodes to string equivalents
				- for things like pool status update, message ID, etc
			- [x] Handle all message ID response codes
			- [x] Handle all Pool State response codes
			- [x] Handle all Pool Status Update response codes
		- [ ] Parse `dsc` messages
			- TODO
		- [ ] Parse `dsq` messages
			- TODO
		- [ ] Parse `dss` messages
			- TODO
		- [ ] Parse `dsf` messages
			- TODO

# Demo
A demo at this point in time would be a bit too premature.

## Authentication to a Masternode
It's possible to run `node ./launcher.js` to see how the code connects to the Masternode of choice.
Be sure to fill out your `.config.json` with the correct info. 
Please note that `launcher.js` will spawn multiple instances of `demo.js`.
This is for the purpose of developing and testing `dsi` message transmission.

# Version
0.1.0
