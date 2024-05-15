# [DashJoin.js](https://github.com/dashhive/DashJoin.js)

A working reference implementation of Coin Join that can easily be ported to any
language.

# Table of Contents

- RegTest Setup
- Maturing Coins
- Install
- Running the Demo
- Troubleshooting
- Roadmap

# Prerequisites (RegTest)

## RegTest

You will need:

- Build Tools
- Docker
- Dashmate
- RegTest

See <https://github.com/dashhive/DashJoin.js/issues/12>.

## Maturing the Coinbase

Before running the demo, generate some blocks:

```sh
./bin/dash-cli-generateblocks 20
```

You'll get some errors the first time you try to run the demo, generate even
more blocks:

```sh
./bin/dash-cli-generateblocks 105
```

If you still get some errors on the 3rd run, just generate a few more for good
measure:

```sh
./bin/dash-cli-generateblocks 10
```

## Install

```sh
git clone https://github.com/dashhive/DashJoin.js.git
pushd ./DashJoin.js/

npm ci --only=production
```

## How to Run the Demo

1.  Make sure the tests still pass: \
    (the tests replay known-good transactions from scratch)

    ```sh
    npm run test
    ```

2.  Then run the demo in two different screens:

    ```sh
    # in the FIRST screen
    node ./demo.js 'foo'
    ```

    ```sh
    # in the SECOND screen
    node ./demo.js 'bar'
    ```

3.  You may need to watch the logs on each of the `dashd` instances to find
    which one has been chosen for the coinjoin service (the ids are
    non-deterministic / random):

    ```sh
    docker ps | grep 'dashd:' | grep '_local_[1-3]'

    docker logs --since 1m -f e04133d8696b
    ```

## Troubleshooting

There are two categories you're likely to encounter:

1. Coins / Coinbase / Block Height isn't mature. \
   For these, the solution is to generate more transactions, and try again: \
   (this functionality is documented only to work on Linux)
   ```sh
   ./bin/dash-cli-generateblocks 100
   ```
2. Disk space (or other system resources) is/are low. \
   All sorts of strange things will happen. Doing a reset may help.
   ```sh
   ~/dashmate/bin/dashmate group stop
   docker ps -aq | xargs docker stop
   ```
   ```sh
   ~/dashmate/bin/dashmate group reset
   ```
   ```sh
   ~/dashmate/bin/dashmate group start
   ```
   You may need to `stop` and `start` a second time to get everything to come
   back up - it's not entirely deterministic. That said, just one `reset` should
   do.

Example immature coinbase error:

```json
{
	"code": -26,
	"message": "bad-txns-premature-spend-of-coinbase, tried to spend coinbase at depth 10"
}
```

Low disk space (below 90% or below 4gb free) can cause seemingly random and
uncorrelatable errors, hangups, etc.

## This isn't a library (yet)

`demo.js` still has a lot of business logic that will need to be carefully
teased out and abstracted to turn this into a library.

The parsers and packers are a good chunk of it, but the networking is all in
`demo.js` for now.

The actual signing logic is in `dashtx` and the wallet logic is built from the
other `dash*` libraries, which are complete and fit for general use.
