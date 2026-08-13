#!/bin/bash

L1="20200101-0"
L2="20200101-1"

python add_cert.py ${L1} known int.pem valid.example.com.pem
python add_cert.py ${L1} revoked int.pem revoked.example.com.pem
python add_cert.py ${L1} revoked int.pem revoked-no-sct.example.com.pem

python add_cert.py ${L2} known int.pem valid.example.com.pem
python add_cert.py ${L2} revoked int.pem revoked.example.com.pem
python add_cert.py ${L1} revoked int.pem revoked-no-sct.example.com.pem
python add_cert.py ${L2} revoked int.pem revoked-in-delta.example.com.pem

cat > ./ct-logs.json << EOF
[{
 "LogID": "VCIlmPM9NkgFQtrs4Oa5TeFcDu6MWRTKSNdePEhOgD8=",
 "MinTimestamp": 0,
 "MaxTimestamp": 9999999999999,
 "MMD": 86400,
 "MinEntry": 0
}]
EOF

# Build the filters in each supported clubcard encoding. The bincode and tls
# encodings describe the same filter; only the on-disk serialization differs.
# The bincode files keep their original names; the tls files get a ".tls"
# suffix.
for encoding in bincode tls; do
        if [ "${encoding}" = "bincode" ]; then
                suffix=""
        else
                suffix=".${encoding}"
        fi

        rust-create-cascade --filter-type clubcard --encoding ${encoding} \
                --ct-logs-json ./ct-logs.json \
                --known ./${L1}/known/ --revoked ./${L1}/revoked \
                --outdir ./${L1}/out-${encoding}

        rust-create-cascade --filter-type clubcard --encoding ${encoding} \
                --ct-logs-json ./ct-logs.json \
                --known ./${L2}/known/ --revoked ./${L2}/revoked \
                --outdir ./${L2}/out-${encoding} \
                --prev-revset ./${L1}/out-${encoding}/revset.bin

        mv ./${L1}/out-${encoding}/filter ./${L1}-filter${suffix}
        mv ./${L2}/out-${encoding}/filter.delta ./${L2}-filter.delta${suffix}
done

rm -rf ./${L1} ./${L2} ./ct-logs.json
