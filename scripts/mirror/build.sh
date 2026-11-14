#!/bin/bash
# Build the iKataster GURS mirror (vector tiles + per-KO files + address shards) from the GURS national
# open-data exports (Geodetska uprava Republike Slovenije, CC BY 4.0). Owner files are never extracted.
#
# usage: build.sh <work-dir> <site-dir> [--force]
#   work-dir: scratch space (~12 GB); site-dir: published tree (copied to dist/mirror on deploy).
# The new site is built next to the old one and swapped in only when everything succeeded.
# Exit 0 = rebuilt, 3 = GURS data unchanged (nothing to do), other = failure.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
W=$1; SITE=$2; FORCE=${3:-}
UA='ikataster-mirror/1'
API=https://ipi.eprostor.gov.si/jgp-service-api/display-views/groups
mkdir -p "$W"; cd "$W"

dl() { # group product name
  local url
  url=$(curl -sf -m 120 -A "$UA" "$API/$1/composite-products/$2/file?filterParam=DRZAVA&filterValue=1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["url"])')
  curl -sf -A "$UA" -L -o "$3.zip.part" "$url"
  [ "$(stat -c %s "$3.zip.part")" -gt 1000000 ] || { echo "download $3 too small"; exit 1; }
  mv "$3.zip.part" "$3.zip"
}
echo "== download $(date -Is)"
dl 121 14 stavbe; dl 122 25 parcele; dl 123 4 ko; dl 120 281 naslovi

STAMP=$(unzip -Z1 parcele.zip | grep -o '_20[0-9]\{6\}\.zip' | head -1 | tr -dc 0-9)
DATE="${STAMP:0:4}-${STAMP:4:2}-${STAMP:6:2}"
OLD=$(python3 -c "import json;print(json.load(open('$SITE/index.json'))['date'])" 2>/dev/null || echo none)
echo "GURS data $DATE, published $OLD"
if [ "$DATE" = "$OLD" ] && [ "$FORCE" != "--force" ]; then exit 3; fi

echo "== unpack $(date -Is)"
rm -rf shp gj tc tmp x; mkdir -p shp gj tc tmp
unzip -o -q parcele.zip "KN_SLO_PARCELE_SLO_parcele_${STAMP}.zip" "KN_SLO_PARCELE_SLO_stavbe_parcele_${STAMP}.zip"
mkdir -p x; unzip -o -q -d x parcele.zip 'KN_SLO_PARCELE_SLO_parcele_x_*_rabe_*.csv' 'sifranti/VRSTE_DEJANSKE_RABE.CSV' 'sifranti/VRSTE_NAMENSKE_RABE.CSV'
unzip -o -q -d x stavbe.zip 'KN_SLO_STAVBE_SLO_etaze_2*.zip' 'KN_SLO_STAVBE_SLO_etaze_x_deli_stavb_*.zip'
for z in x/*.zip KN_SLO_PARCELE_SLO_stavbe_parcele_*.zip; do unzip -o -q "$z" '*.dbf' -x '*tocka*' -d x && rm -f "$z"; done
unzip -o -q stavbe.zip "KN_SLO_STAVBE_SLO_tloris_*.zip" "KN_SLO_STAVBE_SLO_nadzemni_tloris_*.zip" "KN_SLO_STAVBE_SLO_stavbe_*.zip" \
  "KN_SLO_STAVBE_SLO_deli_stavb_*.csv" "KN_SLO_STAVBE_SLO_upravniki_*.csv" 'sifranti/*.CSV' -x "*stavbe_parcele*"
unzip -o -q ko.zip
for z in KN_SLO_PARCELE_SLO_parcele_*.zip KN_SLO_STAVBE_SLO_tloris_*.zip KN_SLO_STAVBE_SLO_nadzemni_tloris_*.zip KN_SLO_STAVBE_SLO_stavbe_*.zip KN_SLO_KAT_OBCINE_*.zip; do
  unzip -o -q "$z" -d shp && rm -f "$z"
done
( cd x; for f in *.dbf; do ogr2ogr -f CSV "${f%.dbf}.csv" "$f" 2>/dev/null; rm -f "$f"; done )
cp KN_SLO_STAVBE_SLO_deli_stavb_*.csv x/
mv KN_SLO_STAVBE_SLO_deli_stavb_*.csv KN_SLO_STAVBE_SLO_upravniki_*.csv sifranti gj/
unzip -o -q -d gj naslovi.zip

echo "== convert $(date -Is)"
( cd shp
  O=../gj; G="-t_srs EPSG:4326 -lco COORDINATE_PRECISION=7"
  ogr2ogr -f GeoJSONSeq $G -select KO_ID,NAZIV $O/ko.geojsonl KN_SLO_KAT_OBCINE_KATASTRSKE_OBCINE_poligon.shp
  ogr2ogr -f CSV -select EID_STAVBA,KO_ID,ST_STAVBE $O/stavbe.csv KN_SLO_STAVBE_SLO_STAVBE_tocka.shp
  ogr2ogr -f CSV -lco GEOMETRY=AS_XY -select EID_STAVBA,KO_ID,ST_STAVBE,STEVILO_ET,STEVILO_ST,STEVILO_PO,TIP_STAVBE,LETO_IZGRA,LETO_OBNOV,LETO_OBNO0,NOSILNA_KO,ELEKTRIKA,PLIN,VODOVOD,KANALIZACI $O/stavbe_full.csv KN_SLO_STAVBE_SLO_STAVBE_tocka.shp
  ogr2ogr -f GeoJSONSeq $G -select EID_STAVBA $O/nadzemni.geojsonl KN_SLO_STAVBE_SLO_STAVBE_NADZEMNI_TLORIS_poligon.shp
  ogr2ogr -f GeoJSONSeq $G -select EID_STAVBA $O/tloris.geojsonl KN_SLO_STAVBE_SLO_STAVBE_TLORIS_poligon.shp
  ogr2ogr -f GeoJSONSeq $G -select KO_ID,ST_PARCELE $O/parcele.geojsonl KN_SLO_PARCELE_SLO_PARCELE_poligon.shp
  ogr2ogr -f CSV -select EID_PARCEL,KO_ID,ST_PARCELE,POVRSINA,BONITETA,E_CEN,N_CEN $O/parcele_attr.csv KN_SLO_PARCELE_SLO_PARCELE_poligon.dbf
)
rm -rf shp
python3 "$HERE/prepare.py" gj tc
ln -sf "$W/tc/buildings.geojsonl" gj/buildings.geojsonl

NEW="$SITE.new"; rm -rf "$NEW"; mkdir -p "$NEW"
echo "== tiles $(date -Is)"
tippecanoe -q -e "$NEW/tiles" -t "$W/tmp" -Z8 -z14 -d13 --no-tile-compression --no-tile-size-limit --no-feature-limit --detect-shared-borders \
  -L kos:tc/kos.geojsonl -L buildings:tc/buildings.geojsonl -L parcels:tc/parcels.geojsonl \
  -n "iKataster GURS mirror" -A "Geodetska uprava Republike Slovenije"
echo "== ko files $(date -Is)"; rm -f kodata.sqlite "$SITE/../kodata.sqlite"
python3 "$HERE/kodata.py" gj "$NEW" "$DATE"
ln -sf "$W/gj/RN_SLO_NASLOVI_register_naslovov_${STAMP}.csv" x/
python3 "$HERE/extras.py" x "$NEW"
python3 "$HERE/addresses.py" gj "$NEW" "$DATE"
python3 "$HERE/managers.py" "$NEW" "$DATE"
printf '{"date":"%s","source":"Geodetska uprava Republike Slovenije, kataster nepremičnin in register naslovov, stanje %s"}\n' "$DATE" "$DATE" > "$NEW/index.json"

FILES=$(find "$NEW" -type f | wc -l)
KOS=$(ls "$NEW/ko" | wc -l)
TILES=$(find "$NEW/tiles" -name '*.pbf' | wc -l)
echo "files $FILES (ko $KOS, tiles $TILES)"
[ "$KOS" -gt 2500 ] && [ "$TILES" -gt 8000 ] && [ "$FILES" -lt 19500 ] && [ -s "$NEW/mgr/index.json" ] || { echo "sanity check failed"; exit 1; }
rm -rf "$SITE.old"; [ -d "$SITE" ] && mv "$SITE" "$SITE.old"; mv "$NEW" "$SITE"; rm -rf "$SITE.old"
rm -rf gj tc tmp x kodata.sqlite
echo "== done $DATE $(date -Is)"
