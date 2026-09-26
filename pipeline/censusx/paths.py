from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
OUT = ROOT / "data" / "out"
SPEC = ROOT / "pipeline" / "spec" / "measures.yaml"

GCP_ZIP = RAW / "2021_GCP_SA1_for_NSW_short-header.zip"
GCP_METADATA = "Metadata/Metadata_2021_GCP_DataPack_R1_R2.xlsx"
GCP_CSV_DIR = "2021 Census GCP Statistical Area 1 for NSW"
MB_ZIP = RAW / "MB_2021_AUST_SHP_GDA2020.zip"
MB_SHP = "MB_2021_AUST_GDA2020.shp"

GCCSA = "1GSYD"
