#!/bin/bash

echo 'base' > ~/.dashjoinjs/current

DB=~/bin/db

if [[ "$1" == "--force" ]]; then
  dashmate group stop
  dashmate group reset
  LOOP=yes
  while [[ "$LOOP" == "yes" ]]; do 
    dashmate group start
    if [[ $? -eq 0 ]]; then
      LOOP=no
    fi
  done

rm -rf ~/.dashjoinjs/base

echo 'base' > ~/.dashjoinjs/current

$DB --create-wallets
$DB --make-junk-user

fi

$DB --dash-for-all

$DB --grind-junk-user

LOOP=yes
GEN=no
while  [[ "$LOOP" == "yes" ]]; do
  for ID in $(seq 1 3); do
    $DB --split-utxos=user$ID
    if [[ $? -ne 0 ]]; then
      GEN=yes
    fi
  done
  if [[ "$GEN" == "yes" ]]; then
    $DB --dash-for-all
    GEN=no
  fi
done
