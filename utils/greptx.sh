#!/bin/bash

~/bin/dash-cli -conf=/home/foobar/.dashmate/local_seed/core/dash.conf \
  -rpcwallet=psend \
  listtransactions '*' 1000 | grep -B 15 -A 5 "$1" --color=always
