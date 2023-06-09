#!/bin/bash
for service in local_1 local_2 local_3 local_seed; do
	dashmate restart --config="$service"
done
