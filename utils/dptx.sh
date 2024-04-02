#!/bin/bash

~/bin/dash-cli -conf="${HOME}"/.dashmate/local_seed/core/dash.conf \
  -rpcwallet=psend \
  listtransactions '*' $*
