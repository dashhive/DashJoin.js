#!/bin/bash

dash-cli -conf="${HOME}"/.dashmate/local_seed/core/dash.conf \
    -rpcwallet=luke \
    listtransactions '*' $*
