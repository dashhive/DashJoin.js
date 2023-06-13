#!/bin/bash

~/bin/dash-cli -conf=/home/foobar/.dashmate/local_seed/core/dash.conf \
  -rpcwallet=luke \
  listtransactions '*' $*
