#!/bin/bash

wait_for_cluster() {
    local retries=0

    echo "Waiting for ScyllaDB cluster to be ready..."
    
    while [ $retries -lt $MAX_RETRIES ]; do
    if cqlsh "${ENDPOINT}" -e "DESCRIBE CLUSTER" 2>/dev/null; then
        echo "ScyllaDB cluster is ready!"
        return 0
    fi
    
    retries=$((retries + 1))
    echo "Attempt ${retries}/${MAX_RETRIES}:  Cluster not ready yet.  Waiting ${RETRY_INTERVAL}s..."
    sleep $RETRY_INTERVAL
    done

    echo "Timeout waiting for ScyllaDB cluster"
    exit 1
}

cqlsh "${ENDPOINT}" -u "${USER_NAME}" -p "${PASSWORD}" <<EOF
CREATE KEYSPACE IF NOT EXISTS walnuk WITH REPLICATION = { 'class' : 'SimpleStrategy', 'replication_factor' : 1 };
EOF

sleep 5
