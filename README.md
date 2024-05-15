# DashJoin.js

A working reference implementation of Coin Join that can easily be ported to any
language.

# Table of Contents

- Install
- RegTest Setup

## Prerequisites (RegTest)

You will need:

- Build Tools
- Docker
- Dashmate
- RegTest

See <https://github.com/dashhive/DashJoin.js/issues/12>.

## Install

```sh
git clone https://github.com/dashhive/DashJoin.js.git
pushd ./DashJoin.js/

npm ci --only=production
```

## How to Mature Coins Quickly

You can generate transactions and blocks (only works on Linux):

```sh
./bin/dash-cli-generateblocks 100
```
