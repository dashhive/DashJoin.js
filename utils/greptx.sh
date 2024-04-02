#!/bin/bash

dash-cli -conf="${HOME}"/.dashmate/local_seed/core/dash.conf \
  -rpcwallet=psend \
  listtransactions '*' 1000 | grep -B 15 -A 5 "$1" --color=always
