#!/usr/bin/env bash

# ── Configuration ────────────────────────────────────────────
YSQLSH="/root/lotus/yugabyte-2.25.1.0/bin/ysqlsh"
DB_HOST="127.0.0.1"
DB_PORT="5433"
DB_USER="yugabyte"
DB_NAME="yugabyte"
CURIO_DATA_DIR="/mnt/data"          # from /root/.curio/storage.json
OUTPUT_DIR="/tmp/curio-retrieved"
# ─────────────────────────────────────────────────────────────

DATASET_ID="${1:?Usage: $0 <dataset_id>}"

YSQL="$YSQLSH -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -A -c"

# 1. Get the parked piece ID and metadata for this dataset
read PIECE_CID PARKED_ID RAW_SIZE PADDED_SIZE < <(
  $YSQL "
    SELECT pr.piece_cid, pr.piece_ref, pp.piece_raw_size, pp.piece_padded_size
    FROM curio.pdp_data_set_pieces dsp
    JOIN curio.pdp_piecerefs pr ON pr.id = dsp.pdp_pieceref
    JOIN curio.parked_pieces pp ON pp.id = pr.piece_ref
    WHERE dsp.data_set = $DATASET_ID
    LIMIT 1;
  " | tr '|' ' '
)

echo "Dataset      : $DATASET_ID"
echo "Piece CID    : $PIECE_CID"
echo "Parked ID    : $PARKED_ID"
echo "Raw size     : $RAW_SIZE bytes"
echo "Padded size  : $PADDED_SIZE bytes"

# 2. Locate the file on disk
PIECE_FILE="$CURIO_DATA_DIR/piece/s-t00-$PARKED_ID"

if [[ ! -f "$PIECE_FILE" ]]; then
  echo "ERROR: piece file not found at $PIECE_FILE"
  exit 1
fi

echo "Piece file   : $PIECE_FILE"

# 3. Copy out the raw data (trimmed to raw size, strips zero-padding)
mkdir -p "$OUTPUT_DIR"
OUT_FILE="$OUTPUT_DIR/dataset-${DATASET_ID}.dat"
dd if="$PIECE_FILE" of="$OUT_FILE" bs=1 count="$RAW_SIZE" 2>/dev/null

echo "Saved to     : $OUT_FILE"
echo "MD5          : $(md5sum $OUT_FILE | cut -d' ' -f1)"